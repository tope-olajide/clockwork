import assert from "node:assert/strict";
import test from "node:test";
import type { AiPlayResult } from "../shared/protocol/kane";
import type { KanePhaseRequest } from "../shared/protocol/game-testing";
import {
  composePhaseObjective,
  judgePhase,
  phaseFingerprint,
  validatePhaseRequest,
} from "../server/kane/phase";
import { PhaseSessionStore } from "../server/kane/phase-session";

const document = {
  id: "project-one",
  revision: 3,
  scenes: [{ id: "main" }],
};

function request(overrides: Partial<KanePhaseRequest> = {}): KanePhaseRequest {
  return {
    sessionId: "session-3-1234-projectone",
    snapshotId: "snapshot-1",
    phaseId: "fire",
    plan: {
      version: 1,
      projectId: "project-one",
      sourceRevision: 3,
      sceneId: "main",
      seed: 1234,
      userGoal: "Verify shooting destroys an enemy and adds score.",
      phases: [
        {
          id: "fire",
          purpose: "Fire until an enemy is destroyed",
          kaneObjective: "Press shoot and advance until the score increases.",
          allowedControlIds: ["shoot"],
          assertions: [
            { id: "score-up", observationId: "score", operator: "increased", expected: 0 },
            { id: "projectiles", observationId: "projectiles", operator: "gte", expected: 1 },
          ],
          stopWhen: ["passed", "failed"],
        },
      ],
      budget: {
        maxKanePhases: 2,
        maxKaneStepsPerPhase: 6,
        maxWallTimeSecondsPerPhase: 120,
        maxFramesPerAdvance: 600,
        maxFramesPerPhase: 3600,
      },
    },
    observationLabels: { score: "Score", projectiles: "Projectiles" },
    baseline: { score: 0 },
    ...overrides,
  };
}

function result(overrides: Partial<AiPlayResult> = {}): AiPlayResult {
  return {
    runId: "run-1",
    attempt: 1,
    status: "passed",
    summary: "Kane finished.",
    objective: "",
    finalState: { score: "10", projectiles: "1", accepted_inputs: "2" },
    steps: [],
    runtimeErrors: [],
    evidenceUrl: "/api/kane/runs/run-1/evidence",
    durationMs: 1000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function judge(overrides: Partial<AiPlayResult> = {}) {
  const req = request();
  const validation = validatePhaseRequest(req, document);
  assert.equal(validation.ok, true);
  if (!validation.ok) throw new Error("unreachable");
  const phase = req.plan.phases[0]!;
  return judgePhase({
    result: result(overrides),
    request: req,
    phase,
    phaseIndex: 0,
    objective: "objective",
    startedAt: new Date().toISOString(),
    kaneCliVersion: "2.4.1",
  });
}

test("validatePhaseRequest accepts the approved plan shape", () => {
  const validation = validatePhaseRequest(request(), document);
  assert.equal(validation.ok, true);
  if (validation.ok) assert.equal(validation.phase.id, "fire");
});

test("validatePhaseRequest rejects a stale revision and unknown scenes", () => {
  const stale = validatePhaseRequest(
    request({ plan: { ...request().plan, sourceRevision: 2 } }),
    document,
  );
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.match(stale.error, /revision 2/);

  const scene = validatePhaseRequest(
    request({ plan: { ...request().plan, sceneId: "missing" } }),
    document,
  );
  assert.equal(scene.ok, false);
});

test("validatePhaseRequest rejects labels and baselines for unasserted observations", () => {
  const labels = validatePhaseRequest(request({ observationLabels: { hull: "Hull" } }), document);
  assert.equal(labels.ok, false);
  const baseline = validatePhaseRequest(request({ baseline: { score: 0, hull: 3 } }), document);
  assert.equal(baseline.ok, false);
});

test("phaseFingerprint separates approvals that differ only in assertions", () => {
  const first = request();
  const same = request();
  assert.equal(phaseFingerprint(first), phaseFingerprint(same));
  const changed = request();
  changed.plan.phases[0]!.assertions[0]!.expected = 5;
  assert.notEqual(phaseFingerprint(first), phaseFingerprint(changed));
});

test("composePhaseObjective includes the goal, controls and extraction clauses only", () => {
  const req = request();
  const objective = composePhaseObjective(req, req.plan.phases[0]!);
  assert.match(objective, /Verify shooting destroys an enemy/);
  assert.match(objective, /Use only these controls: shoot/);
  assert.match(objective, /Score as 'score'/);
  assert.match(objective, /Projectiles as 'projectiles'/);
  assert.match(objective, /accepted_inputs/);
  assert.doesNotMatch(objective, /https?:\/\//);
});

test("judgePhase passes only when Kane passes, assertions match, input was accepted and evidence exists", () => {
  const judged = judge();
  assert.equal(judged.verdict, "passed");
  assert.equal(judged.failureKind, "none");
  assert.equal(judged.acceptedInputs, 2);
  assert.deepEqual(judged.checks.map((check) => check.status), ["passed", "passed"]);
});

test("judgePhase records reproducibility without treating versions as evidence", () => {
  const judged = judge();
  assert.equal(judged.runId, "run-1");
  assert.deepEqual(judged.reproducibility, {
    projectRevision: 3,
    seed: 1234,
    budget: {
      maxKanePhases: 2,
      maxKaneStepsPerPhase: 6,
      maxWallTimeSecondsPerPhase: 120,
      maxFramesPerAdvance: 600,
      maxFramesPerPhase: 3600,
    },
    kaneCliVersion: "2.4.1",
    evidenceRef: "/api/kane/runs/run-1/evidence",
  });
});

test("judgePhase refuses a pass when the run reported runtime errors", () => {
  const judged = judge({ runtimeErrors: ["C:\\Users\\tester\\.data\\run\\rule.log"] });
  assert.equal(judged.verdict, "inconclusive");
  assert.equal(judged.failureKind, "evidence");
  assert.match(judged.reason, /runtime errors/);
  assert.deepEqual(judged.runtimeErrors, ["[local path]"]);
  assert.ok(!judged.reason.includes("C:\\Users"));
});

test("judgePhase classifies a failed assertion as a product failure", () => {
  const judged = judge({ finalState: { score: "0", projectiles: "1", accepted_inputs: "1" } });
  assert.equal(judged.verdict, "failed");
  assert.equal(judged.failureKind, "product");
  assert.match(judged.reason, /score/);
});

test("judgePhase treats a missing observation as inconclusive, not a pass", () => {
  const judged = judge({ finalState: { score: "10", accepted_inputs: "1" } });
  assert.equal(judged.verdict, "inconclusive");
  assert.equal(judged.failureKind, "observation");
});

test("judgePhase fails when no input was accepted", () => {
  const judged = judge({ finalState: { score: "10", projectiles: "1", accepted_inputs: "0" } });
  assert.equal(judged.verdict, "failed");
  assert.equal(judged.failureKind, "input");
});

test("PhaseSessionStore admits one run, replays results and enforces the phase budget", () => {
  const sessions = new PhaseSessionStore();
  const key = "project-one:session:hash";
  assert.equal(sessions.start(key, 2).ok, true);
  assert.equal(sessions.start(key, 2).ok, false);
  const judged = judge();
  sessions.finish(key, judged);
  assert.equal(sessions.getResult(key, "fire")?.verdict, "passed");
  assert.equal(sessions.completedCount(key), 1);
  assert.equal(sessions.start(key, 2).ok, true);
  sessions.finish(key, { ...judged, phaseId: "second" });
  const blocked = sessions.start(key, 2);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, "budget");
});

test("judgePhase maps cancellation, timeouts and missing evidence", () => {
  assert.equal(judge({ status: "cancelled" }).verdict, "cancelled");
  const capped = judge({ status: "cancelled", summary: "Kane run timed out after 120s without a run_end; the verdict is unknown." });
  assert.equal(capped.verdict, "inconclusive");
  assert.equal(capped.failureKind, "timeout");
  const timeout = judge({ status: "error", summary: "Kane run timed out after 120s." });
  assert.equal(timeout.verdict, "inconclusive");
  assert.equal(timeout.failureKind, "timeout");
  const error = judge({ status: "error", summary: "Kane exited without a run_end." });
  assert.equal(error.failureKind, "infrastructure");
  const evidence = judge({ evidenceUrl: undefined });
  assert.equal(evidence.verdict, "inconclusive");
  assert.equal(evidence.failureKind, "evidence");
});
