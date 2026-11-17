import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AiPlayResult, KaneEvent, KaneFinalState, KaneStep } from "../../shared/protocol/kane";
import { parseNdjsonLine, stepFromEvent } from "./ndjson";

export interface KaneRunOptions {
  objective: string;
  url: string;
  projectId?: string;
  snapshotId?: string;
  attempt?: number;
  timeoutSeconds?: number;
  maxSteps?: number;
  headless?: boolean;
  bugDetection?: "off" | "continue" | "stop";
  evidenceRoot?: string;
  runId?: string;
}

interface ResolvedCli {
  command: string;
  args: string[];
}

function existing(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function resolveCli(): ResolvedCli {
  if (process.env.NODE_ENV === "test" && !process.env.KANE_CLI) {
    return { command: process.execPath, args: [join(process.cwd(), "scripts", "kane", "fake-kane.mjs")] };
  }

  const configured = process.env.KANE_CLI?.trim();
  if (configured) {
    if (/\.(mjs|cjs|js)$/i.test(configured)) return { command: process.execPath, args: [configured] };
    return { command: configured, args: [] };
  }

  const npmRoot = process.env.APPDATA
    ? join(process.env.APPDATA, "npm", "node_modules")
    : join(process.env.HOME ?? "", ".npm-global", "lib", "node_modules");
  const packageBin = join(npmRoot, "@testmuai", "kane-cli", "bin", "kane-cli.cjs");
  if (existing(packageBin)) return { command: process.execPath, args: [packageBin] };

  const sibling = join(process.execPath, "..", "node_modules", "@testmuai", "kane-cli", "bin", "kane-cli.cjs");
  if (existing(sibling)) return { command: process.execPath, args: [sibling] };

  return { command: process.platform === "win32" ? "kane-cli.cmd" : "kane-cli", args: [] };
}

function killTree(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null) return;
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else if (child.pid) {
      process.kill(-child.pid, "SIGTERM");
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    try { child.kill("SIGTERM"); } catch { /* already gone */ }
  }
}

function evidencePack(sessionDir: string | undefined): string | undefined {
  if (!sessionDir) return undefined;
  const evidenceDir = join(sessionDir, "evidence");
  try {
    const files = readdirSync(evidenceDir).filter((file) => file.endsWith(".evidence")).sort();
    const latest = files[files.length - 1];
    return latest ? join(evidenceDir, latest) : undefined;
  } catch {
    return undefined;
  }
}

function toResult(input: {
  runId: string;
  objective: string;
  projectId?: string;
  snapshotId?: string;
  attempt?: number;
  event: Record<string, unknown>;
  steps: KaneStep[];
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  localEvidence?: string;
  evidenceUrl?: string;
}): AiPlayResult {
  const rawStatus = input.event.status;
  const status = input.cancelled || input.timedOut
    ? "cancelled"
    : rawStatus === "passed" || rawStatus === "failed"
      ? rawStatus
      : input.exitCode === 0
        ? "passed"
        : input.exitCode === 1
          ? "failed"
          : "error";

  const finalState = (input.event.final_state && typeof input.event.final_state === "object")
    ? Object.fromEntries(Object.entries(input.event.final_state as Record<string, unknown>).map(([key, value]) => [key, String(value)])) satisfies KaneFinalState
    : {};

  const durationSeconds = Number(input.event.duration);
  const errors = input.steps.filter((step) => step.status === "failed").map((step) => step.remark);
  const sessionDir = typeof input.event.session_dir === "string" ? input.event.session_dir : undefined;
  const resultCode = input.event.result_code as number | string | undefined;

  return {
    runId: input.runId,
    projectId: input.projectId,
    snapshotId: input.snapshotId,
    attempt: input.attempt ?? 1,
    status,
    resultCode,
    reasonCode: typeof input.event.reason === "string" ? input.event.reason : undefined,
    summary: typeof input.event.summary === "string" && input.event.summary.trim()
      ? input.event.summary
      : status === "failed"
        ? (input.timedOut ? "Kane run timed out." : "Kane could not reach the goal.")
        : status === "cancelled"
          ? "Kane run cancelled."
          : status === "error"
            ? "Kane could not start or finish the run."
            : "Kane passed the objective.",
    objective: input.objective,
    finalState,
    steps: input.steps,
    runtimeErrors: errors,
    evidencePath: input.localEvidence ?? (sessionDir ? evidencePack(sessionDir) : undefined),
    evidenceUrl: input.evidenceUrl,
    testUrl: typeof input.event.test_url === "string" ? input.event.test_url : undefined,
    durationMs: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : 0,
    exitCode: input.exitCode ?? undefined,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Starts a Kane CLI run and exposes a bounded async event stream. The NDJSON
 * stream is parsed line-by-line; raw lines are persisted before any evidence is
 * summarized. `run_end` is emitted only after the process exits, so a caller can
 * never mistake a progress step for a verdict.
 */
export function startKaneRun(options: KaneRunOptions): {
  runId: string;
  events: AsyncIterable<KaneEvent>;
  cancel: () => void;
} {
  const runId = options.runId ?? randomUUID();
  const cli = resolveCli();
  const timeoutSeconds = Math.max(30, Math.min(900, options.timeoutSeconds ?? 180));
  const maxSteps = Math.max(1, Math.min(100, options.maxSteps ?? 40));
  const args = [
    ...cli.args,
    "run",
    options.objective,
    "--url", options.url,
    "--agent",
    "--mode", "testing",
    "--max-steps", String(maxSteps),
    "--timeout", String(timeoutSeconds),
    "--assertion-mode", "dom",
    "--final-validation", "on",
    "--bug-detection", options.bugDetection ?? "off",
  ];
  if (options.headless) args.push("--headless");

  const runDir = join(process.cwd(), options.evidenceRoot ?? ".data/ai-play", runId);
  mkdirSync(runDir, { recursive: true });

  const queue: KaneEvent[] = [];
  let waiters: Array<(value: IteratorResult<KaneEvent>) => void> = [];
  let done = false;
  let cancelled = false;
  let timedOut = false;
  let child: ChildProcessWithoutNullStreams | null = null;
  let terminalEvent: Record<string, unknown> | null = null;
  const steps: KaneStep[] = [];
  const rawLines: string[] = [];

  function push(event: KaneEvent) {
    if (done) return;
    const waiter = waiters.shift();
    if (waiter) waiter({ value: event, done: false });
    else queue.push(event);
  }

  function finish() {
    if (done) return;
    done = true;
    while (waiters.length) waiters.shift()!({ value: undefined, done: true });
  }

  push({ type: "stream_start", runId, command: [cli.command, ...cli.args, "run"].join(" ") });

  const pending = new Promise<void>((resolve) => {
    const started = Date.now();
    let buffer = "";
    let stderr = "";

    const timer = setTimeout(() => {
      timedOut = true;
      push({ type: "error", code: "timeout", message: `Kane run timed out after ${timeoutSeconds}s.` });
      if (child) killTree(child);
    }, timeoutSeconds * 1000 + 5_000);

    try {
      child = spawn(cli.command, args, {
        cwd: process.cwd(),
        env: { ...process.env, KANE_CLI_USER_AGENT: "clockwork" },
        windowsHide: true,
        detached: process.platform !== "win32",
      });
    } catch (error) {
      clearTimeout(timer);
      const message = error instanceof Error ? error.message : "Kane CLI could not start.";
      push({ type: "error", code: "kane-missing", message });
      finish();
      resolve();
      return;
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line.trim()) continue;
        rawLines.push(line);
        const parsed = parseNdjsonLine(line);
        if (!parsed) continue;
        const event = parsed.raw as Record<string, unknown>;
        if (event.type === "run_end") {
          terminalEvent = event;
          continue;
        }
        const step = stepFromEvent(event);
        if (step) {
          steps.push(step);
          push({ type: "step", ...step });
          continue;
        }
        if (event.type === "warning") {
          push({ type: "warning", message: String(event.message ?? "Kane warning"), code: typeof event.code === "string" ? event.code : undefined });
          continue;
        }
        if (event.type === "error") {
          push({ type: "error", message: String(event.message ?? "Kane error"), code: typeof event.code === "string" ? event.code : undefined });
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });

    child.on("error", (error) => {
      push({ type: "error", code: "kane-missing", message: error.message });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (buffer.trim()) {
        rawLines.push(buffer.trim());
        const parsed = parseNdjsonLine(buffer);
        if (parsed) {
          const event = parsed.raw as Record<string, unknown>;
          if (event.type === "run_end") terminalEvent = event;
          const step = stepFromEvent(event);
          if (step) {
            steps.push(step);
            push({ type: "step", ...step });
          }
        }
      }

      writeFileSync(join(runDir, "raw.ndjson"), rawLines.join("\n") + (rawLines.length ? "\n" : ""));
      if (stderr) writeFileSync(join(runDir, "stderr.log"), stderr);

      if (!terminalEvent && !timedOut && !cancelled && code === 2) {
        push({ type: "error", code: "kane-auth", message: "Kane CLI could not start (auth, URL or Chrome). Run kane-cli whoami and try again." });
      } else if (!terminalEvent && code === 3) {
        push({ type: "error", code: "timeout", message: "Kane run was cancelled or timed out." });
      }

      const sessionDir = typeof terminalEvent?.session_dir === "string" ? terminalEvent.session_dir : undefined;
      const sourceEvidence = evidencePack(sessionDir);
      let localEvidence: string | undefined;
      if (sourceEvidence) {
        localEvidence = join(runDir, "evidence.evidence");
        try {
          copyFileSync(sourceEvidence, localEvidence);
        } catch {
          localEvidence = undefined;
        }
      }

      const result = toResult({
        runId,
        objective: options.objective,
        projectId: options.projectId,
        snapshotId: options.snapshotId,
        attempt: options.attempt,
        event: terminalEvent ?? {},
        steps,
        exitCode: code,
        timedOut,
        cancelled,
        localEvidence,
        evidenceUrl: localEvidence ? `/api/kane/runs/${encodeURIComponent(runId)}/evidence` : undefined,
      });
      if (timedOut) result.status = "cancelled";
      if (cancelled) result.status = "cancelled";
      writeFileSync(join(runDir, "result.json"), JSON.stringify(result, null, 2));
      writeFileSync(join(runDir, "evidence-path.txt"), localEvidence ?? sourceEvidence ?? "");
      push({ type: "run_end", result });
      finish();
      resolve();
    });
  });

  void pending;

  async function* iterate(): AsyncGenerator<KaneEvent> {
    while (true) {
      if (queue.length) {
        yield queue.shift()!;
        continue;
      }
      if (done) return;
      const next = await new Promise<IteratorResult<KaneEvent>>((resolve) => waiters.push(resolve));
      if (next.done) return;
      yield next.value;
    }
  }

  return {
    runId,
    events: iterate(),
    cancel: () => {
      cancelled = true;
      if (child) killTree(child);
    },
  };
}

export function evidenceFilename(runId: string): string {
  return basename(join(process.cwd(), ".data/ai-play", runId, "evidence.evidence"));
}
