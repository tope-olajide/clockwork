import { create } from "zustand";
import {
  clearTestPlanDraft,
  loadTestPlanDraft,
  phaseSessionId,
  saveTestPlanDraft,
  type TestPlanDraft,
} from "../../engine/model/game-test-draft";
import type { GameTestProfile } from "../../engine/model/game-test-profile";
import type { ProjectDocument } from "../../engine/model/schema";
import { cancelAiPlay } from "../../engine/ai/kane-api";
import type { KanePhaseResult } from "@shared/protocol/game-testing";
import { runApprovedPhase } from "./phase-runner";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const RUNS_PREFIX = "clockwork:test-plan-runs:";

function draftFingerprint(draft: TestPlanDraft): string {
  const raw = JSON.stringify({
    goal: draft.userGoal,
    seed: draft.seed,
    revision: draft.sourceRevision,
    scenes: draft.sceneId,
    phases: draft.phases,
  });
  let hash = 5381;
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash * 33) ^ raw.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function runsKey(draft: TestPlanDraft): string {
  return `${RUNS_PREFIX}${draft.projectId}:${phaseSessionId(draft)}:${draftFingerprint(draft)}`;
}

function loadPhaseResults(draft: TestPlanDraft): Record<string, KanePhaseResult> {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(runsKey(draft));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, KanePhaseResult>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePhaseResults(draft: TestPlanDraft, results: Record<string, KanePhaseResult>): void {
  const store = storage();
  if (!store) return;
  try { store.setItem(runsKey(draft), JSON.stringify(results)); } catch { /* storage may be full */ }
}

interface TestPlanState {
  draft: TestPlanDraft | null;
  errors: string[];
  notice: string | null;
  phaseResults: Record<string, KanePhaseResult>;
  runningPhaseId: string | null;
  phaseRunId: string | null;
  cancelling: boolean;
  phaseError: string | null;
  hydrate: (projectId: string, currentRevision?: number) => void;
  setProposal: (draft: TestPlanDraft | null, errors?: string[]) => void;
  setDraft: (draft: TestPlanDraft | null) => void;
  setNotice: (notice: string | null) => void;
  recordPhaseResult: (draft: TestPlanDraft, result: KanePhaseResult) => void;
  runPhase: (input: { draft: TestPlanDraft; document: ProjectDocument; profile: GameTestProfile; phaseId: string; replayTestKey?: string }) => Promise<KanePhaseResult | null>;
  cancelPhase: () => Promise<void>;
  clear: () => void;
}

/**
 * Shared review state for a proposed test plan. The agent tool writes a draft here;
 * the AI Play panel reads it, so planning never depends on chat scrollback. The
 * draft is persisted per project so a reload does not lose an unapproved review.
 */
export const useTestPlanStore = create<TestPlanState>((set, get) => ({
  draft: null,
  errors: [],
  notice: null,
  phaseResults: {},
  runningPhaseId: null,
  phaseRunId: null,
  cancelling: false,
  phaseError: null,

  hydrate: (projectId, currentRevision) => {
    const store = storage();
    const draft = store ? loadTestPlanDraft(store, projectId) : null;
    const phaseResults = draft ? loadPhaseResults(draft) : {};
    const saved = Object.keys(phaseResults).length;
    // A reload resumes only results that belong to this exact plan fingerprint.
    // A revision change is reported instead of silently reusing old evidence.
    const notice = !draft || saved === 0
      ? null
      : currentRevision !== undefined && currentRevision !== draft.sourceRevision
        ? `Loaded ${saved} saved phase result(s) from revision ${draft.sourceRevision}, but the project is at revision ${currentRevision}. Re-plan before running.`
        : `Resumed ${saved} saved phase result(s). Re-running a completed phase replays the saved result instead of starting another Kane run.`;
    set({
      draft,
      errors: [],
      notice,
      phaseResults,
      runningPhaseId: null,
      phaseRunId: null,
      cancelling: false,
      phaseError: null,
    });
  },

  setProposal: (draft, errors = []) => {
    const store = storage();
    if (draft && store) {
      try { saveTestPlanDraft(store, draft); } catch { /* storage may be full or blocked */ }
    }
    set({ draft, errors, notice: null, phaseResults: draft ? loadPhaseResults(draft) : {} });
  },

  recordPhaseResult: (draft, result) => {
    const phaseResults = { ...get().phaseResults, [result.phaseId]: result };
    savePhaseResults(draft, phaseResults);
    set({ phaseResults });
  },

  runPhase: async ({ draft, document, profile, phaseId, replayTestKey }) => {
    if (get().runningPhaseId) {
      set({ phaseError: "Another phase is already running." });
      return null;
    }
    set({ runningPhaseId: phaseId, phaseRunId: null, cancelling: false, phaseError: null, notice: null });
    try {
      const result = await runApprovedPhase({
        draft,
        document,
        profile,
        phaseId,
        ...(replayTestKey ? { replayTestKey } : {}),
        handlers: { onRunId: (runId) => set({ phaseRunId: runId }) },
      });
      get().recordPhaseResult(draft, result);
      return result;
    } catch (error) {
      set({ phaseError: error instanceof Error ? error.message : "The phase could not run." });
      return null;
    } finally {
      set({ runningPhaseId: null, phaseRunId: null, cancelling: false });
    }
  },

  cancelPhase: async () => {
    const runId = get().phaseRunId;
    if (!runId) {
      set({ phaseError: "The run has not reported its id yet; try stopping again in a moment." });
      return;
    }
    if (get().cancelling) return;
    set({ cancelling: true, phaseError: null });
    try {
      await cancelAiPlay(runId);
    } catch (error) {
      set({ cancelling: false, phaseError: error instanceof Error ? error.message : "The run could not be stopped." });
    }
  },

  setDraft: (draft) => {
    const store = storage();
    if (draft && store) {
      try { saveTestPlanDraft(store, draft); } catch { /* storage may be full or blocked */ }
    }
    set({ draft, errors: [] });
  },

  setNotice: (notice) => set({ notice }),

  clear: () => {
    const projectId = get().draft?.projectId;
    const store = storage();
    if (projectId && store) {
      try { clearTestPlanDraft(store, projectId); } catch { /* ignore */ }
    }
    set({ draft: null, errors: [], notice: null, phaseResults: {}, phaseError: null, runningPhaseId: null, phaseRunId: null, cancelling: false });
  },
}));
