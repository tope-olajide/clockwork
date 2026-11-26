#!/usr/bin/env node
/**
 * Turns local Kane run artifacts (`.testmuai/runs/`) into small, sanitized
 * summaries under `docs/evidence/runs/`.
 *
 * The raw artifacts are large, contain machine-specific absolute paths and
 * sometimes external dashboard links, so they stay untracked. This script
 * keeps only what a reviewer needs to check a documented claim: verdict,
 * summary, final state, step count, duration, run/session id and CLI version.
 *
 * Usage: node scripts/kane/export-evidence.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const RUNS_DIR = ".testmuai/runs";
const OUT_DIR = "docs/evidence/runs";

// Only runs cited by the docs are exported. Old exploratory attempts stay local
// so the bundle reads as the claim-to-artifact index it is, not a run dump.
const OBJECTIVES = [
  "engine-template-e2e",
  "k1-editor-smoke",
  "k2-agent-double-jump",
  "k3a",
  "k3b-undo-redo",
  "k4-terminal2",
  "k5-attempt2",
  "negative-control-attempt1",
  "negative-control-attempt2",
  "space-shooter-restart",
];

const DROP_KEYS = new Set([
  "evidencePath",
  "evidenceSource",
  "evidenceUrl",
  "rawPath",
  "stderrPath",
  "resultPath",
  "testFile",
  "testUrl",
  "pid",
]);

const SENSITIVE_KEY = /credit|balance|cost|price|api[_-]?key|token|secret|email/i;

function redact(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => redact(v)).filter((v) => v !== undefined);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (DROP_KEYS.has(k)) continue;
      const r = redact(v, k);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  if (typeof value === "string") {
    return value
      .replace(/C:\\Users\\[^\\]+\\(Documents\\GitHub\\)?clockwork\\?/gi, "<repo>/")
      .replace(/C:\\Users\\[^\\]+\\/gi, "<home>/")
      .replace(/https?:\/\/[^\s"]*lambdatest\.com[^\s"]*/gi, "<external-test-manager-url>")
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
  }
  return value;
}

function readNdjson(file) {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function summarize(name) {
  const ndjsonPath = join(RUNS_DIR, `${name}.ndjson`);
  let events;
  try {
    events = readNdjson(ndjsonPath);
  } catch {
    return null;
  }
  const start = events.find((e) => e.type === "stream_start");
  const recording = events.find((e) => e.type === "recording_state");
  const end = [...events].reverse().find((e) => e.type === "run_end");
  const error = [...events].reverse().find((e) => e.type === "error" || e.type === "run_error");
  const timestamps = events.map((e) => Date.parse(e.ts)).filter((t) => Number.isFinite(t));
  const durationSeconds = timestamps.length
    ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 1000)
    : undefined;

  let result = null;
  try {
    result = JSON.parse(readFileSync(join(RUNS_DIR, `${name}.result.json`), "utf8"));
  } catch {
    // Not every objective run writes a separate result file.
  }

  const summary = {
    objective: name,
    status: end?.status ?? result?.status ?? (error ? "error" : "unknown"),
    ranAt: start?.ts,
    // Runner-reported duration where one exists; otherwise the wall-clock span
    // across the NDJSON stream, which includes CLI startup.
    durationSeconds: result?.durationSeconds,
    wallClockSeconds: durationSeconds,
    cliVersion: start?.cli_version,
    sessionId: recording?.session_id ?? result?.sessionId ?? result?.runId,
    resultCode: result?.resultCode,
    reasonCode: result?.reasonCode,
    summary: end?.summary ?? result?.summary,
    oneLiner: end?.one_liner,
    finalState: redact(end?.final_state ?? result?.finalState),
    steps: result?.steps,
    runtimeErrors: result?.runtimeErrors,
    error: error ? redact(error.message ?? error) : undefined,
  };

  for (const key of Object.keys(summary)) {
    if (summary[key] === undefined || summary[key] === null) delete summary[key];
  }
  return summary;
}

mkdirSync(OUT_DIR, { recursive: true });
const available = new Set(
  readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith(".ndjson"))
    .map((f) => f.replace(/\.ndjson$/, "")),
);
const names = OBJECTIVES.filter((name) => available.has(name));

const written = [];
for (const name of names) {
  const summary = summarize(name);
  if (!summary) continue;
  const redacted = redact(summary);
  writeFileSync(join(OUT_DIR, `${name}.json`), `${JSON.stringify(redacted, null, 2)}\n`);
  written.push(`${name}: ${redacted.status}`);
}
console.log(written.join("\n"));
console.log(`\nWrote ${written.length} summaries to ${OUT_DIR}`);
