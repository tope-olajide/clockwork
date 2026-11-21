import assert from "node:assert/strict";
import test from "node:test";
import type { KanePhaseResult } from "../shared/protocol/game-testing";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { getGameTestProfile } from "../src/engine/model/game-test-profile";
import { createDraft, type TestPlanDraft } from "../src/engine/model/game-test-draft";
import { buildTestReport } from "../src/engine/model/game-test-report";

function approvedDraft(): TestPlanDraft {
  const document = createGameStarterDocument("space-shooter", "Report Shooter");
  const profile = getGameTestProfile("space-shooter");
  assert.ok(profile);
  const result = createDraft(
    {
      sceneId: document.startSceneId,
      seed: 1234,
      scenarioId: "shooting-range",
      userGoal: "Verify a shot creates a projectile and destroys a Raider for score.",
      phases: [
        {
          id: "input-phase",
          objectiveId: "input-creates-projectile",
          purpose: "A SHOOT pulse is delivered and creates a projectile.",
          kaneObjective: "Click SHOOT once, advance a few frames, and read the observations.",
          allowedControlIds: ["shoot"],
          assertions: [
            { id: "shots-fired-increased", observationId: "shots-fired", operator: "increased", expected: 1 },
            { id: "projectiles-increased", observationId: "projectiles", operator: "increased", expected: 1 },
          ],
          stopWhen: ["passed", "failed"],
        },
      ],
      budget: {
        maxKanePhases: 2,
        maxKaneStepsPerPhase: 8,
        maxWallTimeSecondsPerPhase: 120,
        maxFramesPerAdvance: 60,
        maxFramesPerPhase: 600,
      },
    },
    { document, profile },
  );
  if (!result.ok) assert.fail(result.errors.join("; "));
  return result.draft;
}

function resultFor(
  draft: TestPlanDraft,
  overrides: Partial<KanePhaseResult> = {},
): KanePhaseResult {
  const phase = draft.phases[0]!;
  return {
    sessionId: "session-report-1",
    snapshotId: "snap-report-1",
    runId: "run-report-1",
    planRevision: draft.sourceRevision,
    phaseId: phase.id,
    phaseIndex: 0,
    verdict: "passed",
    failureKind: "none",
    reason: "Kane passed and every approved assertion matched the observed values.",
    summary: "passed",
    kaneStatus: "passed",
    objective: phase.kaneObjective,
    checks: phase.assertions.map((assertion) => ({
      ...assertion,
      actual: "2",
      status: "passed",
    })),
    finalState: { "shots-fired": "2", projectiles: "1", accepted_inputs: "1" },
    acceptedInputs: 1,
    steps: [],
    runtimeErrors: [],
    evidenceUrl: "https://evidence.example/run/1",
    testUrl: "https://evidence.example/run/1",
    reproducibility: {
      projectRevision: draft.sourceRevision,
      seed: draft.seed,
      scenarioId: "shooting-range",
      budget: { ...draft.budget },
      kaneCliVersion: "2.4.1",
      evidenceRef: "https://evidence.example/run/1",
    },
    durationMs: 5000,
    startedAt: "2026-11-19T00:00:00.000Z",
    completedAt: "2026-11-19T00:00:05.000Z",
    ...overrides,
  };
}

test("a fully passed plan with evidence reports every criterion as passed", () => {
  const draft = approvedDraft();
  const report = buildTestReport(draft, { [draft.phases[0]!.id]: resultFor(draft) });
  assert.equal(report.verdict, "passed");
  assert.deepEqual(report.criteria.map((criterion) => criterion.status), ["passed", "passed"]);
  assert.deepEqual(report.evidenceUrls, ["https://evidence.example/run/1"]);
  assert.match(report.reason, /All 2 criteria passed/);
});

test("a matched observation without an evidence bundle is never a pass", () => {
  const draft = approvedDraft();
  const report = buildTestReport(draft, {
    [draft.phases[0]!.id]: resultFor(draft, { evidenceUrl: undefined }),
  });
  assert.equal(report.verdict, "inconclusive");
  assert.deepEqual(report.criteria.map((criterion) => criterion.status), ["inconclusive", "inconclusive"]);
  assert.match(report.criteria[0]!.note ?? "", /no evidence bundle/);
  assert.deepEqual(report.evidenceUrls, []);
});

test("a failed assertion fails the report even when other checks matched", () => {
  const draft = approvedDraft();
  const base = resultFor(draft);
  const report = buildTestReport(draft, {
    [draft.phases[0]!.id]: {
      ...base,
      verdict: "failed",
      failureKind: "product",
      checks: [
        { ...base.checks[0]!, status: "failed", actual: "1" },
        base.checks[1]!,
      ],
    },
  });
  assert.equal(report.verdict, "failed");
  assert.equal(report.criteria[0]!.status, "failed");
  assert.equal(report.criteria[1]!.status, "inconclusive");
  assert.match(report.reason, /1 of 2 criteria failed/);
});

test("an unrun plan is inconclusive, with every criterion marked inconclusive", () => {
  const draft = approvedDraft();
  const report = buildTestReport(draft, {});
  assert.equal(report.verdict, "inconclusive");
  assert.deepEqual(report.criteria.map((criterion) => criterion.status), ["inconclusive", "inconclusive"]);
  assert.match(report.criteria[0]!.note ?? "", /has not been run/);
  assert.equal(report.phases[0]!.ran, false);
});

test("the report records plan, seed, scene, versions, budget and evidence refs", () => {
  const draft = approvedDraft();
  const report = buildTestReport(
    draft,
    { [draft.phases[0]!.id]: resultFor(draft) },
    { modelLabel: "DeepSeek V4.1", currentRevision: draft.sourceRevision },
  );
  assert.equal(report.reproducibility.planRevision, draft.revisions.length);
  assert.equal(report.reproducibility.projectRevision, draft.sourceRevision);
  assert.equal(report.reproducibility.seed, 1234);
  assert.equal(report.reproducibility.sceneId, draft.sceneId);
  assert.equal(report.reproducibility.scenarioId, "shooting-range");
  assert.equal(report.reproducibility.modelLabel, "DeepSeek V4.1");
  assert.equal(report.reproducibility.kaneCliVersion, "2.4.1");
  assert.equal(report.reproducibility.budget.maxFramesPerPhase, 600);
  assert.deepEqual(report.evidenceRefs, [
    { phaseId: draft.phases[0]!.id, runId: "run-report-1", url: "https://evidence.example/run/1" },
  ]);
  assert.match(report.assessment.inferred, /DeepSeek V4\.1/);
  assert.match(report.assessment.observed, /Kane CLI directly observed 1 of 1/);
  assert.match(report.assessment.observed, /1 evidence bundle/);
});

test("an unrun plan names every missing phase and offers a follow-up", () => {
  const draft = approvedDraft();
  const report = buildTestReport(draft, {}, { modelLabel: "Test planner" });
  assert.equal(report.verdict, "inconclusive");
  assert.deepEqual(report.evidenceRefs, []);
  assert.match(report.assessment.observed, /no phase ran/);
  assert.ok(report.followUps.some((action) => action.includes("input-phase")));
  assert.ok(report.limitations.some((limitation) => limitation.includes("No phase ran")));
  assert.ok(report.limitations.some((limitation) => limitation.includes("never ran")));
});

test("a stale plan reports that its results cannot validate the current revision", () => {
  const draft = approvedDraft();
  const report = buildTestReport(
    draft,
    { [draft.phases[0]!.id]: resultFor(draft) },
    { currentRevision: draft.sourceRevision + 2 },
  );
  assert.ok(report.limitations.some((limitation) => /cannot validate the current revision/.test(limitation)));
  assert.ok(report.followUps.some((action) => /new plan for project revision/.test(action)));
});

test("runtime errors and local paths cannot become a reviewed pass", () => {
  const draft = approvedDraft();
  const base = resultFor(draft);
  const errored = buildTestReport(draft, {
    [draft.phases[0]!.id]: {
      ...base,
      verdict: "inconclusive",
      failureKind: "evidence",
      runtimeErrors: ["C:\\Users\\tester\\.data\\run\\game.log had a rule error"],
    },
  });
  assert.equal(errored.verdict, "inconclusive");
  assert.ok(errored.limitations.some((limitation) => limitation.includes("Runtime errors were reported")));
  assert.ok(errored.limitations.every((limitation) => !limitation.includes("C:\\Users")));

  const paths = buildTestReport(draft, {
    [draft.phases[0]!.id]: {
      ...base,
      checks: base.checks.map((check) => ({ ...check, actual: "C:\\Users\\tester\\.data\\value.json" })),
    },
  });
  assert.equal(paths.criteria[0]!.actual, "[local path]");
  assert.ok(paths.limitations.some((limitation) => limitation.includes("Local evidence paths are redacted")));
});

test("a missing observation makes only that criterion inconclusive", () => {
  const draft = approvedDraft();
  const base = resultFor(draft);
  const report = buildTestReport(draft, {
    [draft.phases[0]!.id]: {
      ...base,
      checks: [base.checks[0]!, { ...base.checks[1]!, status: "missing" }],
    },
  });
  assert.equal(report.criteria[0]!.status, "passed");
  assert.equal(report.criteria[1]!.status, "inconclusive");
  assert.equal(report.verdict, "inconclusive");
});
