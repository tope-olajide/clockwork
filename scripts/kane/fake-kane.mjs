#!/usr/bin/env node
/**
 * Deterministic Kane stand-in for route/parser tests. It only produces the
 * documented NDJSON contract; it is never used for product acceptance.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("0.0.0-fixture\n");
  process.exit(0);
}
if (args[0] === "whoami") {
  process.stdout.write("✓ Authenticated\nUser fixture-kane\n");
  process.exit(0);
}
const result = process.env.KANE_FIXTURE_RESULT === "failed" ? "failed" : "passed";
const exitCode = Number(process.env.KANE_FIXTURE_EXIT ?? (result === "passed" ? 0 : 1));
const finalState = JSON.parse(process.env.KANE_FIXTURE_FINAL_STATE || JSON.stringify({ status: result === "passed" ? "WON" : "PLAYING", coins: result === "passed" ? "3" : "2", last_error: "none" }));
const session = join(tmpdir(), `clockwork-fake-kane-${process.pid}`);
mkdirSync(join(session, "evidence"), { recursive: true });
writeFileSync(join(session, "evidence", "fixture.evidence"), "fake evidence pack\n");
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

emit({ type: "stream_start", cli_version: "fixture", surface: "run", pid: process.pid, v: 1, ts: new Date().toISOString() });
emit({ step: 1, status: "running", remark: "Opened the snapshot player" });
await sleep(80);
emit({ step: 1, status: "done", remark: "Opened the snapshot player" });
emit({ step: 2, status: "running", remark: "Clicked MOVE RIGHT" });
await sleep(80);
emit({ step: 2, status: "done", remark: "Clicked MOVE RIGHT; the toggle is ON" });
emit({ step: 3, status: "running", remark: "Jumped toward the relay" });
await sleep(80);
emit({ step: 3, status: result === "passed" ? "done" : "failed", remark: result === "passed" ? "Reached the relay and collected all coins" : "Reached the relay but collected only 2 of 3 coins" });
emit({
  type: "run_end",
  status: result,
  summary: result === "passed" ? "Kane collected all coins and reached the relay." : "Kane reached the goal but the all-coins assertion failed.",
  one_liner: result === "passed" ? "Neon Runner verified" : "Neon Runner failed the coin assertion",
  reason: result === "passed" ? "Objective completed" : "Assertion failed: coins expected 3",
  duration: 1.2,
  credits_consumed: 0,
  final_state: finalState,
  session_dir: session,
  test_url: "http://localhost/fixture/test",
});
process.exit(exitCode);
