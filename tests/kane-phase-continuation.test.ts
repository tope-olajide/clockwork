import assert from "node:assert/strict";
import test from "node:test";
import type { KanePhaseResult } from "../shared/protocol/game-testing";
import {
  buildPhaseContinuation,
  continuationChatMessage,
  phaseCardView,
  phaseResultPayload,
} from "../src/features/agent/phase-continuation";

function sampleResult(): KanePhaseResult {
  return {
    sessionId: "sess_1",
    snapshotId: "snap_1",
    runId: "run_1",
    planRevision: 1,
    phaseId: "shoot-destroys-raider",
    phaseIndex: 0,
    verdict: "inconclusive",
    failureKind: "observation",
    reason: "shots-fired had no accepted observation value.",
    summary: "Kane passed but the read used the wrong key.",
    kaneStatus: "passed",
    objective: "objective text",
    checks: [
      { id: "c1", observationId: "targets-destroyed", operator: "gte", expected: 1, actual: "1", status: "passed" },
      { id: "c2", observationId: "shots-fired", operator: "gte", expected: 1, status: "missing" },
    ],
    finalState: { SCORE: "100" },
    acceptedInputs: 1,
    framesAdvanced: 150,
    steps: [{ step: 8, status: "done", remark: "ok" }],
    runtimeErrors: [],
    evidenceUrl: "https://example.test/evidence",
    testUrl: "https://example.test/run",
    durationMs: 96000,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:36.000Z",
  };
}

test("the continuation payload preserves the stored verdict without transformation", () => {
  const payload = phaseResultPayload(sampleResult());
  assert.equal(payload.phaseId, "shoot-destroys-raider");
  assert.equal(payload.verdict, "inconclusive");
  assert.equal(payload.failureKind, "observation");
  assert.deepEqual(payload.checks, sampleResult().checks);
  assert.equal(payload.acceptedInputs, 1);
  assert.equal(payload.framesAdvanced, 150);
  assert.equal(payload.evidenceUrl, "https://example.test/evidence");
});

test("a panel-started phase becomes a typed tool continuation, never a user message", () => {
  const continuation = buildPhaseContinuation(sampleResult(), 7, "call_1");
  assert.equal(continuation.toolName, "run_kane_test_phase");
  assert.deepEqual(continuation.toolArgs, { phaseId: "shoot-destroys-raider", source: "test-plan-panel" });
  assert.equal(continuation.toolResult.ok, true);
  assert.equal(continuation.toolResult.revision, 7);
  assert.equal((continuation.toolResult.data as { verdict: string }).verdict, "inconclusive");

  const chat = continuationChatMessage(continuation, "msg_1");
  assert.equal(chat.role, "tool");
  assert.equal(chat.toolCallId, "call_1");
  assert.equal(chat.toolName, "run_kane_test_phase");
  assert.deepEqual(JSON.parse(chat.content), continuation.toolResult);
});

test("the rich phase card renders every required field", () => {
  const view = phaseCardView(phaseResultPayload(sampleResult()) as unknown as Record<string, unknown>);
  assert.ok(view);
  assert.equal(view.phaseId, "shoot-destroys-raider");
  assert.equal(view.verdictLabel, "INCONCLUSIVE");
  assert.equal(view.verdictTone, "muted");
  assert.equal(view.failureLabel, "observation");
  assert.match(view.reason, /shots-fired/);
  assert.equal(view.checks.length, 2);
  assert.match(view.checks[0]!.text, /targets-destroyed/);
  assert.match(view.checks[1]!.text, /observed none/);
  assert.equal(view.inputsLabel, "1");
  assert.equal(view.framesLabel, "150");
  assert.equal(view.durationLabel, "96.0s");
  assert.equal(view.evidenceUrl, "https://example.test/evidence");
});

test("verdict tones match the panel verdict display", () => {
  assert.equal(phaseCardView({ phaseId: "p", verdict: "passed" })?.verdictTone, "success");
  assert.equal(phaseCardView({ phaseId: "p", verdict: "failed" })?.verdictTone, "danger");
  assert.equal(phaseCardView({ phaseId: "p", verdict: "cancelled" })?.verdictTone, "muted");
});

test("null inputs and frames render as unknown, never as zero", () => {
  const view = phaseCardView({ phaseId: "p", verdict: "failed", acceptedInputs: null, framesAdvanced: null });
  assert.ok(view);
  assert.equal(view.inputsLabel, "unknown");
  assert.equal(view.framesLabel, "unknown");
});

test("non-phase payloads produce no card", () => {
  assert.equal(phaseCardView(null), null);
  assert.equal(phaseCardView({ status: "passed" }), null);
});
