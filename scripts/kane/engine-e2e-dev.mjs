#!/usr/bin/env node
/**
 * Starts Clockwork if it is not already running, waits for Vite and the API,
 * then runs the engine E2E runner. This is the one-command local/CI entry
 * point; stdout stays a single JSON result because the app logs go to a file.
 *
 * Usage:
 *   npm run kane:engine-e2e:dev
 *   node scripts/kane/engine-e2e-dev.mjs --url http://localhost:5173
 *   node scripts/kane/engine-e2e-dev.mjs --test .testmuai/tests/custom_test.md
 */
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const startUrl = argument("--url", process.env.CLOCKWORK_PUBLIC_URL || "http://localhost:5173");
const apiUrl = argument("--api", `http://localhost:${process.env.PORT || "3000"}`);
const logPath = join(ROOT, ".testmuai", "runs", "engine-e2e-dev.log");
const READY_TIMEOUT_MS = 120_000;
const RUNNER = join(ROOT, "scripts", "kane", "engine-e2e.mjs");
let devProcess = null;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function isUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function stopDev() {
  const dev = devProcess;
  devProcess = null;
  if (!dev || dev.exitCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => {
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/PID", String(dev.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.on("close", resolvePromise);
      killer.on("error", resolvePromise);
    } else {
      try {
        process.kill(-dev.pid, "SIGTERM");
      } catch {
        dev.kill("SIGTERM");
      }
      resolvePromise();
    }
  });
}

function startDev(logStream) {
  const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run dev"] : ["run", "dev"];
  const child = spawn(command, args, {
    cwd: ROOT,
    windowsHide: true,
    detached: process.platform !== "win32",
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => logStream.write(chunk));
  child.stderr.on("data", (chunk) => logStream.write(chunk));
  return child;
}

async function waitForApp(dev) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [web, api] = await Promise.all([isUp(startUrl), isUp(`${apiUrl}/api/health`)]);
    if (web && api) return true;
    if (dev.exitCode !== null) return false;
    await sleep(1000);
  }
  return false;
}

function runRunner() {
  const args = [RUNNER, "--url", startUrl];
  const test = argument("--test", null);
  const maxSteps = argument("--max-steps", null);
  const timeout = argument("--timeout", null);
  if (test) args.push("--test", test);
  if (maxSteps) args.push("--max-steps", maxSteps);
  if (timeout) args.push("--timeout", timeout);

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: "inherit", windowsHide: true });
    child.on("error", (error) => {
      process.stderr.write(`[engine-e2e-dev] Could not start the runner: ${error.message}\n`);
      resolvePromise(2);
    });
    child.on("close", (code) => resolvePromise(code ?? 2));
  });
}

async function main() {
  mkdirSync(dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "w" });

  let dev = null;
  try {
    const [webUp, apiUp] = await Promise.all([
      isUp(startUrl),
      isUp(`${apiUrl}/api/health`),
    ]);

    if (webUp && apiUp) {
      process.stderr.write(`[engine-e2e-dev] Reusing Clockwork at ${startUrl}\n`);
    } else if (webUp || apiUp) {
      process.stderr.write(
        `[engine-e2e-dev] Only one Clockwork service is running (web=${webUp}, api=${apiUp}). Stop it and retry.\n`,
      );
      process.exitCode = 2;
      return;
    } else {
      process.stderr.write(`[engine-e2e-dev] Starting Clockwork; logs: ${logPath}\n`);
      dev = startDev(logStream);
      devProcess = dev;
      const ready = await waitForApp(dev);
      if (!ready) {
        process.stderr.write(`[engine-e2e-dev] Clockwork did not become ready. See ${logPath}\n`);
        process.exitCode = 2;
        return;
      }
      process.stderr.write(`[engine-e2e-dev] Clockwork ready at ${startUrl}\n`);
    }

    process.exitCode = await runRunner();
  } catch (error) {
    process.stderr.write(
      `[engine-e2e-dev] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  } finally {
    await stopDev();
    logStream.end();
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await stopDev();
    process.exit(130);
  });
}

main();
