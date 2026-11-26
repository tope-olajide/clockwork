import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { AiPlayResult } from "../shared/protocol/kane";
import { startKaneRun, toResult } from "../server/kane/runner";

const fakeKane = join(process.cwd(), "scripts", "kane", "fake-kane.mjs");
const evidenceRoot = ".data/kane-runner-tests";

async function runFake(env: Record<string, string>, extra: Partial<Parameters<typeof startKaneRun>[0]> = {}): Promise<AiPlayResult> {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  try {
    const run = startKaneRun({
      objective: "Runner fixture objective",
      url: "http://localhost:3000/s/fixture?ai=1&seed=1234",
      evidenceRoot,
      ...extra,
    });
    for await (const event of run.events) {
      if (event.type === "run_end") return event.result;
    }
    throw new Error("Runner fixture never emitted run_end.");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

process.env.KANE_CLI = fakeKane;

test("a complete run_end is reported as passed with its evidence", async () => {
  const result = await runFake({ KANE_FIXTURE_RESULT: "passed" });

  assert.equal(result.status, "passed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.finalState.status, "WON");
  assert.equal(result.finalState.coins, "3");
  assert.ok(result.steps.length >= 3, "every fixture step should be recorded");
  assert.equal(result.steps.at(-1)?.status, "done");
  assert.equal(result.summary, "Kane collected all coins and reached the relay.");
  assert.ok(result.evidencePath && existsSync(result.evidencePath), "evidence pack should be copied locally");
  assert.ok(result.evidenceUrl, "a copied evidence pack should be served");
});

test("a failed run_end is reported as failed, not error", async () => {
  const result = await runFake({ KANE_FIXTURE_RESULT: "failed" });

  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 1);
  assert.equal(result.finalState.coins, "2");
  assert.match(result.summary, /all-coins assertion failed/);
  assert.ok(result.runtimeErrors.length > 0, "the failed step should surface as a runtime error");
});

test("a missing run_end is an error even when the CLI exits 2", async () => {
  const result = await runFake({ KANE_FIXTURE_NO_RUN_END: "1", KANE_FIXTURE_EXIT: "2" });

  assert.equal(result.status, "error");
  assert.equal(result.exitCode, 2);
  assert.match(result.summary, /without a run_end; the verdict is unknown/);
  assert.equal(result.finalState.status, undefined);
});

test("a missing run_end with exit 0 is never passed", async () => {
  const result = await runFake({ KANE_FIXTURE_NO_RUN_END: "1", KANE_FIXTURE_EXIT: "0" });

  assert.notEqual(result.status, "passed");
  assert.equal(result.status, "error");
  assert.equal(result.exitCode, 0);
  assert.match(result.summary, /without a run_end; the verdict is unknown/);
});

test("a timeout overrides a passing-looking terminal event", () => {
  const result = toResult({
    runId: "fixture-run",
    objective: "Runner fixture objective",
    event: { status: "passed", summary: "Objective completed.", final_state: { status: "WON" } },
    steps: [],
    exitCode: 0,
    hasRunEnd: false,
    timedOut: true,
    cancelled: false,
    elapsedMs: 180_000,
  });

  assert.equal(result.status, "cancelled");
  assert.match(result.summary, /timed out after 180s without a run_end; the verdict is unknown/);
});

test("an exit code alone never yields a verdict without a run_end", () => {
  const base = {
    runId: "fixture-run",
    objective: "Runner fixture objective",
    event: {},
    steps: [],
    timedOut: false,
    cancelled: false,
  };

  assert.equal(toResult({ ...base, exitCode: 0, hasRunEnd: false }).status, "error");
  assert.equal(toResult({ ...base, exitCode: 1, hasRunEnd: false }).status, "failed");
  assert.equal(toResult({ ...base, exitCode: 0, hasRunEnd: true }).status, "passed");
});

test("a verdict that arrives before the process exits survives the cleanup kill", async () => {
  // The captured failure: Kane emitted run_end, then kept running (upload,
  // browser teardown) until Clockwork killed it and discarded the verdict.
  const started = Date.now();
  const result = await runFake({ KANE_FIXTURE_RESULT: "passed", KANE_FIXTURE_LINGER_MS: "5000" }, { exitGraceMs: 300 });

  assert.equal(result.status, "passed");
  assert.equal(result.reasonCode, "Objective completed");
  assert.doesNotMatch(result.summary, /without a run_end/);
  assert.ok(Date.now() - started < 4000, "the lingering process should be stopped after the grace period");
  const lifecycle = JSON.parse(readFileSync(join(evidenceRoot, result.runId, "lifecycle.json"), "utf8"));
  assert.equal(lifecycle.killedAfterVerdict, true);
  assert.equal(lifecycle.timedOut, false);
  assert.ok(lifecycle.verdictAtMs !== null && lifecycle.verdictAtMs < lifecycle.exitedAtMs);
});

test("a wall-clock timeout that fires after the verdict does not override it", async () => {
  // 30 s Kane budget minus 26 s allowance = a 4 s wall budget that expires while
  // the fixture is still lingering after its run_end. The margin has to clear the
  // fixture's own startup on a loaded machine; at 0.6 s the verdict sometimes
  // arrives after the budget and the run is reported as cancelled instead.
  const result = await runFake(
    { KANE_FIXTURE_RESULT: "failed", KANE_FIXTURE_LINGER_MS: "8000" },
    { timeoutSeconds: 30, startupAllowanceSeconds: -26, exitGraceMs: 10_000 },
  );

  assert.equal(result.status, "failed");
  assert.match(result.summary, /all-coins assertion failed/);
});

test("a run with no verdict still times out as cancelled", async () => {
  const result = await runFake(
    { KANE_FIXTURE_NO_RUN_END: "1", KANE_FIXTURE_EXIT: "0" },
    { timeoutSeconds: 30, startupAllowanceSeconds: -29.98 },
  );
  assert.notEqual(result.status, "passed");
});