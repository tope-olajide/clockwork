import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { getGameTestProfile, type GameTestProfile } from "../src/engine/model/game-test-profile";
import type { ProjectDocument } from "../src/engine/model/schema";
import type { TestPlanBudget, TestPlanPhase } from "../src/engine/model/game-test-plan";
import {
  approveDraft,
  clearTestPlanDraft,
  createDraft,
  estimateDraftCost,
  isDraftStale,
  loadTestPlanDraft,
  reviseDraft,
  saveTestPlanDraft,
  type TestPlanDraft,
} from "../src/engine/model/game-test-draft";

function context(): { document: ProjectDocument; profile: GameTestProfile } {
  const document = createGameStarterDocument("space-shooter", "Draft Shooter");
  const profile = getGameTestProfile("space-shooter");
  assert.ok(profile);
  return { document, profile };
}

const phases: TestPlanPhase[] = [
  {
    id: "input-projectile",
    objectiveId: "shoot-destroys-enemy",
    purpose: "An accepted SHOOT pulse creates a projectile that destroys the target.",
    kaneObjective: "Click SHOOT, advance the frame batch, then read the AI state panel.",
    allowedControlIds: ["shoot"],
    assertions: [
      { id: "projectiles-increased", observationId: "projectiles", operator: "increased", expected: 1 },
      { id: "enemy-count-decreased", observationId: "enemies", operator: "eq", expected: 0 },
      { id: "score-increased", observationId: "score", operator: "increased", expected: 100 },
    ],
    stopWhen: ["passed", "failed", "budget-exhausted"],
  },
];

const budget: TestPlanBudget = {
  maxKanePhases: 2,
  maxKaneStepsPerPhase: 4,
  maxWallTimeSecondsPerPhase: 120,
  maxFramesPerAdvance: 300,
  maxFramesPerPhase: 1800,
};

function draftOf(): { draft: TestPlanDraft; document: ProjectDocument; profile: GameTestProfile } {
  const { document, profile } = context();
  const result = createDraft({ userGoal: "Check that shooting works.", sceneId: document.startSceneId, seed: 1234, phases, budget }, { document, profile });
  if (!result.ok) assert.fail(result.errors.join("; "));
  return { draft: result.draft, document, profile };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    size: () => map.size,
  };
}

test("a valid proposal becomes a draft pinned to the project revision and goal", () => {
  const { draft, document } = draftOf();
  assert.equal(draft.projectId, document.id);
  assert.equal(draft.sourceRevision, document.revision);
  assert.equal(draft.userGoal, "Check that shooting works.");
  assert.equal(draft.revisions.length, 1);
  assert.equal(draft.approval, undefined);
});

test("an unexpressible proposal is rejected with the exact reason", () => {
  const { document, profile } = context();
  const result = createDraft(
    {
      userGoal: "Test the teleporter.",
      sceneId: document.startSceneId,
      seed: 1234,
      phases: [{ ...phases[0]!, allowedControlIds: ["teleport"] }],
      budget,
    },
    { document, profile },
  );
  assert.equal(result.ok, false);
  assert.match((result as { errors: string[] }).errors.join("\n"), /unknown control "teleport"/);
});

test("every revision states why, and the root goal cannot be swapped", () => {
  const { draft, document, profile } = draftOf();

  const noReason = reviseDraft(draft, { phases }, "   ", { document, profile });
  assert.equal(noReason.ok, false);
  assert.match((noReason as { errors: string[] }).errors.join("\n"), /reason is required/);

  const narrowed = reviseDraft(draft, { budget: { ...budget, maxKaneStepsPerPhase: 3 } }, "Tighten the step cap.", { document, profile });
  if (!narrowed.ok) assert.fail(narrowed.errors.join("; "));
  assert.equal(narrowed.draft.userGoal, draft.userGoal);
  assert.equal(narrowed.draft.revisions.length, 2);
  assert.equal(narrowed.draft.revisions[1]?.reason, "Tighten the step cap.");

  const smuggled = reviseDraft(draft, { userGoal: "Something else" } as never, "Swap the goal.", { document, profile });
  if (!smuggled.ok) assert.fail(smuggled.errors.join("; "));
  assert.equal(smuggled.draft.userGoal, draft.userGoal, "a revision may not replace the user's goal");
});

test("editing a draft drops a previous approval", () => {
  const { draft, document, profile } = draftOf();
  const approved = approveDraft(draft, "local user", { document, profile });
  if (!approved.ok) assert.fail(approved.errors.join("; "));
  assert.equal(approved.draft.approval?.by, "local user");

  const revised = reviseDraft(approved.draft, { budget: { ...budget, maxFramesPerAdvance: 200 } }, "Reduce advance frames.", { document, profile });
  if (!revised.ok) assert.fail(revised.errors.join("; "));
  assert.equal(revised.draft.approval, undefined, "approval must not survive a content change");
});

test("a stale revision cannot be approved, and staleness is detectable", () => {
  const { draft, document, profile } = draftOf();
  const bumped = { ...document, revision: document.revision + 1 };
  assert.equal(isDraftStale(draft, bumped), true);

  const rejected = approveDraft(draft, "local user", { document: bumped, profile });
  assert.equal(rejected.ok, false);
  assert.match((rejected as { errors: string[] }).errors.join("\n"), /sourceRevision/);

  const revised = reviseDraft(draft, { phases }, "Refresh the plan.", { document: bumped, profile });
  assert.equal(revised.ok, false);
});

test("drafts persist per project and corrupt payloads are ignored", () => {
  const { draft } = draftOf();
  const storage = memoryStorage();

  saveTestPlanDraft(storage, draft);
  const loaded = loadTestPlanDraft(storage, draft.projectId);
  assert.equal(loaded?.userGoal, draft.userGoal);
  assert.equal(loaded?.phases.length, 1);

  assert.equal(loadTestPlanDraft(storage, "another-project"), null);

  storage.setItem(`clockwork:test-plan:${draft.projectId}`, "{not json");
  assert.equal(loadTestPlanDraft(storage, draft.projectId), null);

  storage.setItem(`clockwork:test-plan:${draft.projectId}`, JSON.stringify({ ...draft, version: 99 }));
  assert.equal(loadTestPlanDraft(storage, draft.projectId), null);

  saveTestPlanDraft(storage, draft);
  clearTestPlanDraft(storage, draft.projectId);
  assert.equal(loadTestPlanDraft(storage, draft.projectId), null);
});

test("the review cost estimate uses measured per-phase numbers", () => {
  const { draft } = draftOf();
  const single = estimateDraftCost(draft);
  assert.equal(single.kaneRuns, 1);
  assert.equal(single.typicalSeconds, 85);
  assert.equal(single.worstCaseSeconds, 300);

  const three = estimateDraftCost({
    ...draft,
    phases: [...draft.phases, { ...phases[0]!, id: "second" }, { ...phases[0]!, id: "third" }],
  });
  assert.equal(three.kaneRuns, 3);
  assert.equal(three.typicalSeconds, 255);
  assert.equal(three.worstCaseSeconds, 900);
});
