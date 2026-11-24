import type { ProjectDocument } from "./schema";
import type { GameTestProfile } from "./game-test-profile";
import {
  validateTestPlan,
  type TestPlan,
  type TestPlanBudget,
  type TestPlanPhase,
} from "./game-test-plan";
import type { PlanForPhase } from "@shared/protocol/game-testing";

/**
 * A draft plan is what the built-in model proposes and the user reviews. It is not
 * executable: it has no snapshot, no session and no approval until a person says so.
 * `userGoal` is the immutable root instruction — revisions may narrow phases, never
 * silently replace what the user asked for.
 */
export const TEST_PLAN_DRAFT_VERSION = 1 as const;

export interface TestPlanRevision {
  revision: number;
  reason: string;
  at: string;
}

export interface TestPlanDraft {
  version: typeof TEST_PLAN_DRAFT_VERSION;
  projectId: string;
  sourceRevision: number;
  sceneId: string;
  seed: number;
  scenarioId?: string;
  userGoal: string;
  phases: TestPlanPhase[];
  budget: TestPlanBudget;
  revisions: TestPlanRevision[];
  approval?: { by: string; at: string };
}

export interface DraftInput {
  sceneId: string;
  seed: number;
  scenarioId?: string;
  userGoal: string;
  phases: TestPlanPhase[];
  budget: TestPlanBudget;
}

export interface DraftContext {
  document: ProjectDocument;
  profile: GameTestProfile;
  now?: () => Date;
}

export type DraftValidation =
  | { ok: true; draft: TestPlanDraft }
  | { ok: false; errors: string[] };

function timestamp(context: DraftContext): string {
  return (context.now?.() ?? new Date()).toISOString();
}

function toPlan(draft: TestPlanDraft): TestPlan {
  return {
    version: 1,
    // Drafts are validated before a snapshot or session exists. The validator only
    // checks these fields for shape, so explicit placeholders keep the contract
    // honest instead of weakening the schema.
    sessionId: "draft-session",
    snapshotId: "draft-snapshot",
    projectId: draft.projectId,
    sourceRevision: draft.sourceRevision,
    sceneId: draft.sceneId,
    seed: draft.seed,
    scenarioId: draft.scenarioId,
    userGoal: draft.userGoal,
    phases: draft.phases,
    budget: draft.budget,
  };
}

export function validateDraft(draft: TestPlanDraft, context: DraftContext): string[] {
  const result = validateTestPlan(toPlan(draft), { document: context.document, profile: context.profile });
  return result.ok ? [] : result.errors;
}

/** Builds the first draft revision from model-authored phases. */
export function createDraft(input: DraftInput, context: DraftContext): DraftValidation {
  const draft: TestPlanDraft = {
    version: TEST_PLAN_DRAFT_VERSION,
    projectId: context.document.id,
    sourceRevision: context.document.revision,
    sceneId: input.sceneId,
    seed: input.seed,
    scenarioId: input.scenarioId,
    userGoal: input.userGoal,
    phases: input.phases,
    budget: input.budget,
    revisions: [{ revision: 1, reason: "Initial plan proposed by the planning model.", at: timestamp(context) }],
  };
  const errors = validateDraft(draft, context);
  if (errors.length) return { ok: false, errors };
  return { ok: true, draft };
}

/**
 * Applies a reviewed change. Every revision states why it exists, the root goal is
 * immutable, and any prior approval is dropped because the content changed.
 */
export function reviseDraft(
  draft: TestPlanDraft,
  patch: Partial<Pick<DraftInput, "sceneId" | "seed" | "scenarioId" | "phases" | "budget">>,
  reason: string,
  context: DraftContext,
): DraftValidation {
  const why = reason.trim();
  if (!why) return { ok: false, errors: ["revisions[new]: a reason is required for every plan change"] };
  if (isDraftStale(draft, context.document)) {
    return {
      ok: false,
      errors: [`sourceRevision: draft targets revision ${draft.sourceRevision} but the project is at ${context.document.revision}`],
    };
  }

  const next: TestPlanDraft = {
    ...draft,
    ...patch,
    userGoal: draft.userGoal,
    revisions: [
      ...draft.revisions,
      { revision: draft.revisions.length + 1, reason: why, at: timestamp(context) },
    ],
  };
  delete next.approval;

  const errors = validateDraft(next, context);
  if (errors.length) return { ok: false, errors };
  return { ok: true, draft: next };
}

export function isDraftStale(draft: TestPlanDraft, document: ProjectDocument): boolean {
  return draft.projectId !== document.id || draft.sourceRevision !== document.revision;
}

/**
 * Cost estimate shown before approval. The per-phase numbers come from measured
 * Kane runs: fast phases finish near 85 s, but a full input-plus-read phase with
 * Kane's per-step latency needs up to the 600 s ceiling, which also covers a
 * slow planning phase before the first step, so the worst case uses that
 * ceiling instead of the old 140 s AI Play cap.
 */
export const KANE_PHASE_ESTIMATE = {
  typicalSeconds: 85,
  hardCapSeconds: 600,
} as const;

export function estimateDraftCost(draft: TestPlanDraft) {
  const phases = draft.phases.length;
  return {
    phases,
    kaneRuns: phases,
    typicalSeconds: phases * KANE_PHASE_ESTIMATE.typicalSeconds,
    worstCaseSeconds: phases * KANE_PHASE_ESTIMATE.hardCapSeconds,
    framesPerPhase: draft.budget.maxFramesPerPhase,
  };
}

export type DraftApproval =
  | { ok: true; draft: TestPlanDraft }
  | { ok: false; errors: string[] };

/** Records explicit human approval. This never starts a Kane run by itself. */
export function approveDraft(draft: TestPlanDraft, approver: string, context: DraftContext): DraftApproval {
  const who = approver.trim();
  if (!who) return { ok: false, errors: ["approval: an approving identity is required"] };
  if (isDraftStale(draft, context.document)) {
    return {
      ok: false,
      errors: [`sourceRevision: draft targets revision ${draft.sourceRevision} but the project is at ${context.document.revision}`],
    };
  }
  const errors = validateDraft(draft, context);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    draft: { ...draft, approval: { by: who, at: timestamp(context) } },
  };
}

/**
 * Stable per-session id for phase execution. The same approved draft always maps
 * to the same id, so a retried phase is idempotent instead of a second paid run.
 */
export function phaseSessionId(draft: TestPlanDraft): string {
  return `session-${draft.sourceRevision}-${draft.seed}-${draft.projectId}`
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 64);
}

/** The executable slice of an approved draft. Approval is checked by the caller. */
export function planForPhase(draft: TestPlanDraft): PlanForPhase {
  return {
    version: 1,
    projectId: draft.projectId,
    sourceRevision: draft.sourceRevision,
    sceneId: draft.sceneId,
    seed: draft.seed,
    ...(draft.scenarioId ? { scenarioId: draft.scenarioId } : {}),
    userGoal: draft.userGoal,
    phases: draft.phases.map((phase) => ({
      id: phase.id,
      ...(phase.objectiveId ? { objectiveId: phase.objectiveId } : {}),
      purpose: phase.purpose,
      kaneObjective: phase.kaneObjective,
      allowedControlIds: phase.allowedControlIds,
      assertions: phase.assertions.map((assertion) => ({
        id: assertion.id,
        observationId: assertion.observationId,
        operator: assertion.operator,
        expected: assertion.expected,
      })),
      stopWhen: phase.stopWhen,
    })),
    budget: { ...draft.budget },
  };
}

const KEY_PREFIX = "clockwork:test-plan:";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function saveTestPlanDraft(storage: DraftStorage, draft: TestPlanDraft): void {
  storage.setItem(`${KEY_PREFIX}${draft.projectId}`, JSON.stringify(draft));
}

export function loadTestPlanDraft(storage: DraftStorage, projectId: string): TestPlanDraft | null {
  const raw = storage.getItem(`${KEY_PREFIX}${projectId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TestPlanDraft;
    if (parsed?.version !== TEST_PLAN_DRAFT_VERSION) return null;
    if (parsed.projectId !== projectId || !Array.isArray(parsed.phases) || !Array.isArray(parsed.revisions)) return null;
    if (typeof parsed.userGoal !== "string" || typeof parsed.sourceRevision !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearTestPlanDraft(storage: DraftStorage, projectId: string): void {
  storage.removeItem(`${KEY_PREFIX}${projectId}`);
}
