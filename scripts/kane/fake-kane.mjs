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

// Models the "CLI could not start" path: exit 2 with no terminal run_end, which
// is what an auth/URL/Chrome failure looks like on the wire.
if (process.env.KANE_FIXTURE_NO_RUN_END === "1") {
  emit({ type: "stream_start", cli_version: "fixture", surface: "run", pid: process.pid, v: 1, ts: new Date().toISOString() });
  emit({ step: 1, status: "running", remark: "Opening the snapshot player" });
  await sleep(60);
  emit({ step: 1, status: "failed", remark: "Could not open the browser target" });
  process.stderr.write("Error: could not start Chrome for this run.\n");
  process.exit(Number(process.env.KANE_FIXTURE_EXIT ?? 2));
}
// Models the real CLI lingering after its verdict (upload, browser teardown).
const lingerAfterVerdict = async () => {
  const ms = Number(process.env.KANE_FIXTURE_LINGER_MS ?? 0);
  if (ms > 0) await sleep(ms);
};

if (args[0] === "testmd") {
  const summary = { overall_status: result, duration_s: 1.1, steps: { total: 2, passed: result === "passed" ? 2 : 1, failed: result === "passed" ? 0 : 1, skipped: 0, replay_decisions: 2, author_decisions: 0 } };
  emit({ type: "stream_start", cli_version: "fixture", surface: "testmd", pid: process.pid, v: 1, ts: new Date().toISOString() });
  emit({ type: "test_md_step_start", step_index: 1, heading: "Wait for the AI Play HUD" });
  await sleep(50);
  emit({ type: "test_md_step_end", step_index: 1, status: "passed", duration_s: 0.2 });
  emit({ type: "test_md_step_start", step_index: 2, heading: "Move right through the level" });
  await sleep(50);
  emit({ type: "run_end", status: result, duration: 0.4, final_state: finalState });
  emit({ type: "test_md_step_end", step_index: 2, status: result, duration_s: 0.4 });
  emit({ type: "test_md_summary", ...summary });
  emit({ type: "coverage", status: "written", pack: join(session, "evidence", "fixture.evidence") });
  emit({ type: "test_md_done", overall_status: result, duration_s: 1.1, session_id: "fixture-session", ...(process.env.KANE_FIXTURE_SHARE_URL ? { share_url: process.env.KANE_FIXTURE_SHARE_URL } : {}) });
  process.exit(exitCode);
}

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
await lingerAfterVerdict();
process.exit(exitCode);
