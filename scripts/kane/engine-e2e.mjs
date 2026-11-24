#!/usr/bin/env node
/**
 * Runs the saved engine end-to-end Kane test and prints one compact JSON
 * result for the coding agent that invoked it.
 *
 * This is the terminal/engine-QA path, not the in-app reviewed phase path:
 * Kane drives the Clockwork editor in Chrome, creates a game from a starter,
 * edits and undoes a value, runs Play, and restarts it. Raw NDJSON, a result
 * summary and the evidence pack stay under .testmuai so the invoking agent can
 * inspect them after the run.
 *
 * Usage:
 *   node scripts/kane/engine-e2e.mjs
 *   node scripts/kane/engine-e2e.mjs --url http://localhost:5173
 *   node scripts/kane/engine-e2e.mjs --test .testmuai/tests/custom_test.md
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NAME = "engine-template-e2e";
const DEFAULT_TEST = join(ROOT, ".testmuai", "tests", `${NAME}_test.md`);
const DEFAULT_URL = "http://localhost:5173";
const DEFAULT_MAX_STEPS = 50;
const DEFAULT_TIMEOUT_SECONDS = 480;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const testArg = argument("--test", DEFAULT_TEST);
const testFile = isAbsolute(testArg) ? testArg : resolve(ROOT, testArg);
const startUrl = argument("--url", process.env.CLOCKWORK_PUBLIC_URL || DEFAULT_URL);
const maxSteps = Number(argument("--max-steps", DEFAULT_MAX_STEPS)) || DEFAULT_MAX_STEPS;
const timeoutSeconds = Number(argument("--timeout", DEFAULT_TIMEOUT_SECONDS)) || DEFAULT_TIMEOUT_SECONDS;

const runsDir = join(ROOT, ".testmuai", "runs");
const evidenceDir = join(ROOT, ".testmuai", "evidence");
const rawPath = join(runsDir, `${NAME}.ndjson`);
const stderrPath = join(runsDir, `${NAME}.stderr.log`);
const resultPath = join(runsDir, `${NAME}.result.json`);
const evidencePath = join(evidenceDir, `${NAME}.evidence`);

function resolveCli() {
  const configured = process.env.KANE_CLI?.trim();
  if (configured) {
    if (/\.(mjs|cjs|js)$/i.test(configured)) return { command: process.execPath, args: [configured] };
    return { command: configured, args: [] };
  }
  const npmRoot = process.env.APPDATA
    ? join(process.env.APPDATA, "npm", "node_modules")
    : join(process.env.HOME ?? "", ".npm-global", "lib", "node_modules");
  const packageBin = join(npmRoot, "@testmuai", "kane-cli", "bin", "kane-cli.cjs");
  if (existsSync(packageBin)) return { command: process.execPath, args: [packageBin] };
  return { command: process.platform === "win32" ? "kane-cli.cmd" : "kane-cli", args: [] };
}

function result(status, detail = {}) {
  return {
    test: NAME,
    testFile,
    startUrl,
    status,
    ...detail,
    rawPath,
    stderrPath,
    resultPath,
  };
}

function finish(payload, exitCode) {
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = exitCode;
}

function parseEvents(text) {
  let savedTest = false;
  let terminal = null;
  let testDone = null;
  let testSummary = null;
  let coveragePack = null;
  let lastInnerFinalState = {};
  let testError = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "stream_start" && event.surface === "testmd") savedTest = true;
    if (event.type === "run_end") {
      if (savedTest) {
        if (event.final_state && typeof event.final_state === "object") lastInnerFinalState = event.final_state;
      } else {
        terminal = event;
      }
      continue;
    }
    if (event.type === "test_md_summary") {
      testSummary = event;
      continue;
    }
    if (event.type === "test_md_done") {
      testDone = event;
      continue;
    }
    if (event.type === "coverage" && typeof event.pack === "string") coveragePack = event.pack;
    if (event.type === "error") testError = event;
  }

  if (testDone) {
    const counts = testSummary?.steps ?? {};
    const passed = Number(counts.passed ?? 0);
    const total = Number(counts.total ?? 0);
    return {
      status: testDone.overall_status === "passed" ? "passed" : "failed",
      summary: total > 0
        ? `Saved test ${String(testDone.overall_status)}: ${passed}/${total} steps passed (${Number(counts.replay_decisions ?? 0)} replayed, ${Number(counts.author_decisions ?? 0)} authored).`
        : `Saved test ${String(testDone.overall_status)}.`,
      durationSeconds: testDone.duration_s ?? null,
      steps: {
        passed,
        total,
        replayed: Number(counts.replay_decisions ?? 0),
        authored: Number(counts.author_decisions ?? 0),
      },
      finalState: lastInnerFinalState,
      testUrl: testDone.share_url ?? null,
      sessionId: testDone.session_id ?? null,
      evidencePack: coveragePack,
      error: testError?.message ?? null,
    };
  }

  if (terminal) {
    return {
      status: terminal.status ?? "failed",
      summary: terminal.summary ?? null,
      durationSeconds: terminal.duration ?? null,
      steps: null,
      finalState: terminal.final_state ?? lastInnerFinalState,
      testUrl: terminal.test_url ?? null,
      sessionId: terminal.session_id ?? null,
      evidencePack: coveragePack,
      error: testError?.message ?? null,
    };
  }

  return {
    status: "no_run_end",
    summary: "Kane produced no test_md_done or run_end; inspect the raw NDJSON and stderr.",
    durationSeconds: null,
    steps: null,
    finalState: lastInnerFinalState,
    testUrl: null,
    sessionId: null,
    evidencePack: coveragePack,
    error: testError?.message ?? null,
  };
}

async function main() {
  mkdirSync(runsDir, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
  if (!existsSync(testFile)) {
    finish(result("error", { summary: `Saved test not found: ${testFile}` }), 2);
    return;
  }

  const cli = resolveCli();
  const args = [
    ...cli.args,
    "testmd", "run", testFile,
    "--url", startUrl,
    "--agent",
    "--max-steps", String(maxSteps),
    "--timeout", String(timeoutSeconds),
    "--headless",
    "--no-adaptive-heal",
  ];

  let stdout = "";
  let stderr = "";
  let spawnError = null;
  let child;
  try {
    child = spawn(cli.command, args, {
      cwd: ROOT,
      windowsHide: true,
      env: { ...process.env, KANE_CLI_USER_AGENT: "clockwork", NO_UPDATE_NOTIFIER: "1" },
    });
  } catch (error) {
    finish(result("error", { summary: `Kane CLI could not start: ${error instanceof Error ? error.message : String(error)}` }), 2);
    return;
  }

  const hardKill = setTimeout(() => {
    if (!child || child.exitCode !== null) return;
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }, (timeoutSeconds + 120) * 1000);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", (error) => { spawnError = error; });
  child.on("close", (exitCode, signal) => {
    clearTimeout(hardKill);
    writeFileSync(rawPath, stdout);
    writeFileSync(stderrPath, stderr);

    if (spawnError) {
      finish(result("error", { summary: `Kane CLI could not start: ${spawnError.message}` }), 2);
      return;
    }

    const parsed = parseEvents(stdout);
    let evidenceCopied = null;
    if (parsed.evidencePack && existsSync(parsed.evidencePack)) {
      try {
        copyFileSync(parsed.evidencePack, evidencePath);
        evidenceCopied = evidencePath;
      } catch {
        evidenceCopied = null;
      }
    }

    const payload = result(parsed.status, {
      summary: parsed.summary,
      durationSeconds: parsed.durationSeconds,
      steps: parsed.steps,
      finalState: parsed.finalState,
      testUrl: parsed.testUrl,
      sessionId: parsed.sessionId,
      evidencePath: evidenceCopied,
      evidenceSource: parsed.evidencePack,
      error: parsed.error,
      exitCode,
      signal,
    });
    finish(payload, parsed.status === "passed" ? 0 : 1);
  });
}

main().catch((error) => {
  finish(result("error", { summary: error instanceof Error ? error.message : String(error) }), 2);
});
