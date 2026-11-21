import assert from "node:assert/strict";
import test from "node:test";
import type { AiPlayResult } from "../shared/protocol/kane";
import { redactAiPlayResult, redactLocalPaths } from "../shared/protocol/redaction";

test("redactLocalPaths removes Windows and POSIX home, temp and evidence paths", () => {
  assert.equal(
    redactLocalPaths("saved C:\\Users\\tester\\.data\\ai-play\\run\\evidence.evidence"),
    "saved [local path]",
  );
  assert.equal(
    redactLocalPaths("raw /home/tester/clockwork/.data/run.json failed"),
    "raw [local path] failed",
  );
  assert.equal(
    redactLocalPaths("see /var/folders/xy/run.log for details"),
    "see [local path] for details",
  );
});

test("redactLocalPaths preserves safe API and evidence URLs", () => {
  const text = "evidence /api/kane/runs/run-1/evidence and https://evidence.example/run-1";
  assert.equal(redactLocalPaths(text), text);
});

test("redactAiPlayResult drops the local evidence path and redacts all displayed text", () => {
  const result: AiPlayResult = {
    runId: "run-1",
    attempt: 1,
    status: "passed",
    summary: "Wrote C:\\Users\\tester\\.data\\ai-play\\run-1\\result.json",
    objective: "Store the value.",
    finalState: { note: "/tmp/clockwork/state.json" },
    steps: [{ step: 1, status: "done", remark: "Opened C:\\Users\\tester\\game.log" }],
    runtimeErrors: ["/home/tester/clockwork/error.log"],
    evidencePath: "C:\\Users\\tester\\.data\\ai-play\\run-1\\evidence.evidence",
    evidenceUrl: "/api/kane/runs/run-1/evidence",
    durationMs: 1000,
    createdAt: "2026-11-19T00:00:00.000Z",
  };
  const safe = redactAiPlayResult(result);
  assert.equal(safe.evidencePath, undefined);
  assert.equal(safe.summary, "Wrote [local path]");
  assert.equal(safe.finalState.note, "[local path]");
  assert.equal(safe.steps[0]!.remark, "Opened [local path]");
  assert.deepEqual(safe.runtimeErrors, ["[local path]"]);
  assert.equal(safe.evidenceUrl, "/api/kane/runs/run-1/evidence");
  assert.equal(result.evidencePath, "C:\\Users\\tester\\.data\\ai-play\\run-1\\evidence.evidence");
});
