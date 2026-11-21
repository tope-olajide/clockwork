import type { GameTestProfile } from "../../engine/model/game-test-profile";
import type { ProjectDocument } from "../../engine/model/schema";
import {
  isDraftStale,
  phaseSessionId,
  planForPhase,
  type TestPlanDraft,
} from "../../engine/model/game-test-draft";
import { collectProjectAssets, createSnapshot } from "../../engine/io/snapshot";
import {
  streamKanePhase,
  type KanePhaseStreamHandlers,
} from "../../engine/ai/kane-api";
import {
  observationBaselines,
  observationLabels,
} from "../../engine/runtime/test-observations";
import type { KanePhaseRequest, KanePhaseResult } from "@shared/protocol/game-testing";

export interface RunApprovedPhaseInput {
  draft: TestPlanDraft;
  document: ProjectDocument;
  profile: GameTestProfile;
  phaseId: string;
  handlers?: KanePhaseStreamHandlers;
  onSnapshot?: (snapshotId: string) => void;
}

/**
 * Runs exactly one phase of an approved plan. The browser sends ids, bounds and
 * frame-zero baselines only: the server composes the objective and the URL.
 */
export async function runApprovedPhase(input: RunApprovedPhaseInput): Promise<KanePhaseResult> {
  const { draft, document, profile, phaseId, handlers = {} } = input;
  if (!draft.approval) throw new Error("The plan is not approved, so no Kane phase may run.");
  if (isDraftStale(draft, document)) {
    throw new Error(
      `The approved plan targets revision ${draft.sourceRevision}, but the project is at ${document.revision}. Re-approve before running.`,
    );
  }
  const phase = draft.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) throw new Error(`Phase "${phaseId}" is not part of the approved plan.`);

  const assets = await collectProjectAssets(document);
  const snapshot = await createSnapshot(document, { assets, ttlHours: 1 });
  input.onSnapshot?.(snapshot.id);

  const plan = planForPhase(draft);
  const observationIds = [...new Set(phase.assertions.map((assertion) => assertion.observationId))];
  const baseline: Record<string, string | number | boolean> = {};
  if (phase.assertions.some((assertion) => assertion.operator === "increased")) {
    const values = observationBaselines(document, profile, draft.seed);
    for (const observationId of observationIds) {
      if (values[observationId] !== undefined) baseline[observationId] = values[observationId];
    }
  }

  const request: KanePhaseRequest = {
    sessionId: phaseSessionId(draft),
    snapshotId: snapshot.id,
    phaseId,
    plan,
    observationLabels: observationLabels(profile, observationIds),
    ...(Object.keys(baseline).length ? { baseline } : {}),
  };
  return streamKanePhase(request, handlers);
}
