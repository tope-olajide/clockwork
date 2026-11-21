import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AiPlayResult, KaneEvent, KaneFinalState, KaneStep } from "../../shared/protocol/kane";
import { parseNdjsonLine, stepFromEvent, testMdStepFromEvent } from "./ndjson";

export interface KaneRunOptions {
  objective: string;
  /** Path to a saved `_test.md`; when set the run replays its recordings. */
  savedTest?: string;
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

export function toResult(input: {
  runId: string;
  objective: string;
  projectId?: string;
  snapshotId?: string;
  attempt?: number;
  event: Record<string, unknown>;
  steps: KaneStep[];
  exitCode: number | null;
  /** True only when a `run_end` (or a synthesized saved-test verdict) arrived. */
  hasRunEnd: boolean;
  timedOut: boolean;
  cancelled: boolean;
  elapsedMs?: number;
  localEvidence?: string;
  evidenceUrl?: string;
}): AiPlayResult {
  const rawStatus = input.event.status;
  const reason = typeof input.event.reason === "string" ? input.event.reason : "";
  const finalStatus = input.event.final_state && typeof input.event.final_state === "object"
    ? String((input.event.final_state as Record<string, unknown>).status ?? "")
    : "";
  // Without a `run_end` there is no verdict to read. An exit code alone is not
  // evidence of success: a CLI that dies after its last step, crashes in its
  // reporter, or is killed by a non-timeout signal can still exit 0. Only a
  // terminal event may yield "passed"; otherwise the verdict is unknown.
  const status = input.cancelled || input.timedOut
    ? "cancelled"
    : rawStatus === "passed" || rawStatus === "failed"
      ? rawStatus
      : input.hasRunEnd && (reason === "Objective completed" || finalStatus === "WON")
        ? "passed"
        : input.hasRunEnd && input.exitCode === 0
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
    summary: input.timedOut
      ? `Kane run timed out after ${Math.round((input.elapsedMs ?? 0) / 1000)}s without a run_end; the verdict is unknown.`
      : !input.hasRunEnd && status !== "failed" && status !== "cancelled"
        ? `Kane exited (code ${input.exitCode ?? "unknown"}) without a run_end; the verdict is unknown.`
        : typeof input.event.summary === "string" && input.event.summary.trim()
        ? input.event.summary
        : status === "failed"
          ? "Kane could not reach the goal."
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
    durationMs: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : (input.elapsedMs ?? 0),
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
  const savedTest = options.savedTest?.trim() || undefined;
  const args = savedTest
    ? [
      ...cli.args,
      "testmd", "run", savedTest,
      "--url", options.url,
      "--agent",
      "--max-steps", String(maxSteps),
      "--timeout", String(timeoutSeconds),
      // A replay failure must fail fast: adaptive healing re-authors steps and
      // burns the authoring cost this path exists to avoid.
      "--no-adaptive-heal",
      // NOTE: no --push. It commits recordings via the lock API, but that
      // endpoint rejects this environment's credentials (exit 2, no run),
      // so it would break every replay run. Recordings are produced by the
      // documented `run --name` flow and committed beside the _test.md file.
    ]
    : [
      ...cli.args,
      "run",
      options.objective,
      "--url", options.url,
      "--agent",
      "--mode", "testing",
      "--max-steps", String(maxSteps),
      "--timeout", String(timeoutSeconds),
      "--assertion-mode", "dom",
      // The objective ends in an explicit assertion; the synthesized cp_final
      // checkpoint would add another agent step to every run.
      "--final-validation", "off",
      "--skip-code-validation",
      "--bug-detection", options.bugDetection ?? "off",
    ];
  if (options.headless) args.push("--headless");

  const runDir = join(process.cwd(), options.evidenceRoot ?? ".data/ai-play", runId);
  mkdirSync(runDir, { recursive: true });

  const queue: KaneEvent[] = [];
  let waiters: Array<(value: IteratorResult<KaneEvent>) => void> = [];
  let done = false;
  let cancelled = false;
  const runStartedAt = Date.now();
  let timedOut = false;
  let child: ChildProcessWithoutNullStreams | null = null;
  let terminalEvent: Record<string, unknown> | null = null;
  let savedTestSurface = false;
  let savedTestSession: string | undefined;
  let savedTestPack: string | undefined;
  let savedTestSummary: Record<string, unknown> | null = null;
  const savedTestHeadings = new Map<number, string>();
  let lastInnerFinalState: Record<string, unknown> | undefined;
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

  push({ type: "stream_start", runId, command: [cli.command, ...args].join(" ") });

  const pending = new Promise<void>((resolve) => {
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
        if (!savedTestSurface && event.type === "stream_start" && event.surface === "testmd") {
          savedTestSurface = true;
        }
        if (event.type === "run_end") {
          // In a saved-test stream `run_end` closes one step, not the file.
          if (savedTestSurface) {
            if (event.final_state && typeof event.final_state === "object") {
              lastInnerFinalState = event.final_state as Record<string, unknown>;
            }
            continue;
          }
          terminalEvent = event;
          continue;
        }
        if (event.type === "test_md_summary") {
          savedTestSummary = event;
          continue;
        }
        if (event.type === "coverage" && typeof event.pack === "string") {
          savedTestPack = event.pack;
          continue;
        }
        if (event.type === "test_md_done") {
          const counts = (savedTestSummary?.steps ?? {}) as Record<string, unknown>;
          const passed = Number(counts.passed ?? 0);
          const total = Number(counts.total ?? 0);
          terminalEvent = {
            type: "run_end",
            status: event.overall_status === "passed" ? "passed" : "failed",
            summary: total > 0
              ? `Saved test ${String(event.overall_status)}: ${passed}/${total} steps passed (${Number(counts.replay_decisions ?? 0)} replayed, ${Number(counts.author_decisions ?? 0)} authored).`
              : undefined,
            duration: event.duration_s,
            final_state: lastInnerFinalState ?? {},
            session_id: event.session_id,
            // The file-level event carries the Test Manager link as
            // `share_url`; map it so replay results keep the same
            // evidence/test references as authored runs.
            ...(typeof event.share_url === "string" ? { test_url: event.share_url } : {}),
          };
          savedTestSession = typeof event.session_id === "string" ? event.session_id : undefined;
          continue;
        }
        const mdStep = savedTestSurface ? testMdStepFromEvent(event) : null;
        if (mdStep) {
          // `test_md_step_end` may omit the heading; keep the one from its start.
          if (event.type === "test_md_step_start" && event.heading) {
            savedTestHeadings.set(Number(mdStep.step), String(event.heading));
          }
          const withHeading = { ...mdStep, remark: savedTestHeadings.get(Number(mdStep.step)) ?? mdStep.remark };
          steps.push(withHeading);
          push({ type: "step", ...withHeading });
          continue;
        }
        const step = savedTestSurface ? null : stepFromEvent(event);
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

      const sessionDir = typeof terminalEvent?.session_dir === "string"
        ? terminalEvent.session_dir
        : savedTestSession
          ? join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".testmuai", "kaneai", "sessions", savedTestSession)
          : undefined;
      const sourceEvidence = savedTestPack ?? evidencePack(sessionDir);
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
        hasRunEnd: terminalEvent !== null,
        timedOut,
        cancelled,
        elapsedMs: Date.now() - runStartedAt,
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
