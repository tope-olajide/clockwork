import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AiPlayRequest, AiPlayResult, KaneCliStatus, KaneQaRequest } from "../../shared/protocol/kane";
import { KANE_PHASE_LIMITS } from "../../shared/protocol/game-testing";

import { env } from "../env";
import { getSnapshot } from "../snapshots/repository";
import { buildAiPlayObjective, buildPlayerQaObjective } from "../kane/objectives";
import { startKaneRun } from "../kane/runner";
import { composePhaseObjective, judgePhase, phaseFingerprint, validatePhaseRequest } from "../kane/phase";
import { redactAiPlayResult } from "../../shared/protocol/redaction";
import { PhaseSessionStore } from "../kane/phase-session";
import { listReplayTests, resolveReplayTest } from "../kane/replay-tests";
import { kaneCreditsExhausted, parseKaneCreditBalance } from "../kane/credits";
import {
  KANE_CHECK_LIMITS,
  composeCheckObjective,
  encodeCheckSteps,
  judgeCheck,
  validateCheckRequest,
  type KaneCheckRequest,
} from "../../shared/kane-check";

export const kaneRoutes = new Hono();

const activeRuns = new Map<string, { cancel: () => void; key: string }>();
const activeByProject = new Map<string, string>();
const phaseSessions = new PhaseSessionStore();
let statusCache: { at: number; value: KaneCliStatus } | null = null;

function kaneCliEntry(): { command: string; args: string[] } {
  const configured = env.kaneCli?.trim();
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

function execKane(extra: string[], timeout = 20_000): Promise<string> {
  const cli = kaneCliEntry();
  return new Promise((resolve, reject) => {
    execFile(cli.command, [...cli.args, ...extra], {
      timeout,
      windowsHide: true,
      env: { ...process.env, KANE_CLI_USER_AGENT: "clockwork", NO_UPDATE_NOTIFIER: "1" },
    }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) reject(error);
      else resolve(String(stdout || stderr));
    });
  });
}

async function readStatus(force = false): Promise<KaneCliStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < 20_000) return statusCache.value;
  const base: KaneCliStatus = {
    enabled: true,
    qaEnabled: true,
    aiPlayEnabled: true,
    installed: false,
    authenticated: false,
    evidenceDir: env.kaneEvidenceDir,
  };
  try {
    const version = (await execKane(["--version"])).trim().split(/\s+/)[0];
    base.installed = Boolean(version);
    base.version = version;
  } catch {
    base.reason = "Kane CLI is not installed or not on PATH.";
    statusCache = { at: Date.now(), value: base };
    return base;
  }
  try {
    const who = await execKane(["whoami"]);
    base.authenticated = /Authenticated/i.test(who) && !/Not authenticated|Not logged in/i.test(who);
    const user = who.match(/User\s+([^\s]+)/i);
    if (user?.[1]) base.user = user[1];
    if (!base.authenticated) base.reason = "Kane CLI is not signed in.";
  } catch {
    base.reason = "Kane CLI could not verify the signed-in account.";
  }
  if (base.authenticated) {
    try {
      const balance = await execKane(["balance"]);
      base.credits = parseKaneCreditBalance(balance);
      if (kaneCreditsExhausted(base.credits)) {
        base.reason = "Kane credits are exhausted. Add credits to your Kane account, then retry.";
      }
    } catch {
      // Balance is best-effort; a failed lookup must not hide an installed, signed-in CLI.
    }
  }
  statusCache = { at: Date.now(), value: base };
  return base;
}

function creditsExhausted(c: any, status: KaneCliStatus) {
  if (!kaneCreditsExhausted(status.credits)) return null;
  return c.json({
    ok: false,
    error: "Kane credits are exhausted. Add credits to your Kane account, then retry.",
    code: "kane-credits",
  }, 402);
}

function playerOrigin(c: any): string {
  if (env.publicUrl) return env.publicUrl.replace(/\/$/, "");
  if (env.nodeEnv !== "production") return "http://localhost:5173";
  return new URL(c.req.url).origin;
}

function startStream(
  c: any,
  run: ReturnType<typeof startKaneRun>,
  key: string,
  finalize: (result: AiPlayResult) => AiPlayResult = (result) => result,
) {
  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-cache");
  c.header("X-Kane-Run", run.runId);
  activeRuns.set(run.runId, { cancel: run.cancel, key });
  activeByProject.set(key, run.runId);
  return streamText(c, async (stream) => {
    try {
      for await (const event of run.events) {
        const safeEvent = event.type === "run_end"
          ? { ...event, result: redactAiPlayResult(finalize(event.result)) }
          : event;
        await stream.write(JSON.stringify(safeEvent) + "\n");
        if (event.type === "run_end" || event.type === "error") {
          // The runner still closes and writes evidence after run_end; the stream
          // can end here because the result is final.
        }
      }
    } finally {
      activeRuns.delete(run.runId);
      if (activeByProject.get(key) === run.runId) activeByProject.delete(key);
    }
  });
}

kaneRoutes.get("/status", async (c) => c.json({ ok: true, status: await readStatus(c.req.query("refresh") === "1") }));

kaneRoutes.get("/runs/:runId", (c) => {
  const runId = c.req.param("runId");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(runId)) return c.json({ ok: false, error: "Invalid run id." }, 400);
  const path = join(process.cwd(), env.kaneEvidenceDir, runId, "result.json");
  if (!existsSync(path)) return c.json({ ok: false, error: "Run not found." }, 404);
  // The stored result keeps its raw local evidence path for server logs; the API
  // response is always the redacted form.
  return c.json({ ok: true, result: redactAiPlayResult(JSON.parse(readFileSync(path, "utf8"))) });
});

kaneRoutes.get("/runs/:runId/evidence", (c) => {
  const runId = c.req.param("runId");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(runId)) return c.json({ ok: false, error: "Invalid run id." }, 400);
  const path = join(process.cwd(), env.kaneEvidenceDir, runId, "evidence.evidence");
  if (!existsSync(path)) return c.json({ ok: false, error: "Evidence not found for this run." }, 404);
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Disposition", `attachment; filename="kane-${runId}.evidence"`);
  return c.body(new Uint8Array(readFileSync(path)));
});

kaneRoutes.post("/qa", async (c) => {
  const status = await readStatus();
  if (!status.installed) return c.json({ ok: false, error: status.reason ?? "Kane CLI is not installed.", code: "kane-missing" }, 503);
  if (!status.authenticated) return c.json({ ok: false, error: "Kane CLI is not signed in.", code: "kane-auth" }, 401);
  const noCredits = creditsExhausted(c, status);
  if (noCredits) return noCredits;
  let body: KaneQaRequest;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "Invalid JSON body." }, 400); }
  // A structured check replaces free text: the server writes the objective and
  // judges the stored values, so the model can neither phrase nor grade it.
  let check: KaneCheckRequest | undefined;
  if (body.check !== undefined) {
    const validated = validateCheckRequest(body.check);
    if (!validated.ok) return c.json({ ok: false, error: `Invalid check: ${validated.error}`, code: "kane-check" }, 400);
    check = validated.check;
  }
  const objective = check ? composeCheckObjective(check) : String(body.objective ?? "").trim();
  if (!objective) return c.json({ ok: false, error: "An objective is required." }, 400);
  if (objective.length > 2_000) return c.json({ ok: false, error: "Kane objectives must be under 2,000 characters." }, 400);
  const snapshotId = String(body.snapshotId ?? "");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(snapshotId)) return c.json({ ok: false, error: "Engine QA must run against a snapshot." }, 400);
  const stored = getSnapshot(snapshotId);
  if (!stored) return c.json({ ok: false, error: "Snapshot not found or expired." }, 404);
  const qaDocument = stored.payload.document as any;
  let qaSceneId: string | undefined;
  if (typeof body.sceneId === "string" && body.sceneId.trim()) {
    qaSceneId = body.sceneId.trim();
    const scenes: Array<{ id?: unknown }> = Array.isArray(qaDocument.scenes) ? qaDocument.scenes : [];
    if (!scenes.some((scene) => scene.id === qaSceneId)) {
      return c.json({ ok: false, error: `Scene not found in this project: ${qaSceneId}`, code: "kane-scene" }, 400);
    }
  }
  const projectId = String(qaDocument.id ?? snapshotId);
  // One Kane run per project: QA, AI Play and chat verification share this key.
  const activeRunId = activeByProject.get(projectId);
  if (activeRunId) {
    return c.json({ ok: false, error: "Kane is already running for this project.", code: "kane-busy", runId: activeRunId }, 409);
  }
  const origin = playerOrigin(c);
  const seed = Number(body.seed) || 1234;
  const params = new URLSearchParams({ ai: "1", seed: String(seed) });
  if (qaSceneId) params.set("scene", qaSceneId);
  if (check) {
    // Paused, frame-stepped Test Mode with one button per planned step.
    params.set("testMode", "step");
    params.set("maxAdvance", String(KANE_CHECK_LIMITS.maxFramesPerStep));
    params.set("maxFrames", String(KANE_CHECK_LIMITS.maxTotalFrames));
    if (check.steps.length) params.set("steps", encodeCheckSteps(check.steps));
  }
  const run = startKaneRun({
    objective,
    url: `${origin}/s/${encodeURIComponent(snapshotId)}?${params.toString()}`,
    projectId,
    snapshotId,
    headless: env.kaneHeadless,
    timeoutSeconds: env.kaneTimeoutSeconds,
    // A check is a handful of clicks and reads; a low cap stops Kane wandering.
    maxSteps: check ? Math.min(env.kaneMaxSteps, 6 + check.steps.length * 2 + check.readouts.length * 2) : env.kaneMaxSteps,
    bugDetection: check ? "off" : "continue",
    evidenceRoot: env.kaneEvidenceDir,
  });
  const finalize = check
    ? (result: AiPlayResult): AiPlayResult => {
      const judged = judgeCheck(result, check);
      const final = { ...result, status: judged.status, check: { kaneStatus: result.status, reason: judged.reason, outcomes: judged.outcomes } };
      try {
        const dir = join(process.cwd(), env.kaneEvidenceDir, result.runId);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "check.json"), JSON.stringify({ check, judged, kaneStatus: result.status }, null, 2));
      } catch {
        // The verdict is already in the stream; the audit copy is best-effort.
      }
      return final;
    }
    : undefined;
  return startStream(c, run, projectId, finalize);
});

kaneRoutes.post("/ai-play", async (c) => {
  const status = await readStatus();
  if (!status.installed) return c.json({ ok: false, error: status.reason ?? "Kane CLI is not installed.", code: "kane-missing" }, 503);
  if (!status.authenticated) return c.json({ ok: false, error: "Kane CLI is not signed in.", code: "kane-auth" }, 401);
  const noCredits = creditsExhausted(c, status);
  if (noCredits) return noCredits;
  let body: AiPlayRequest;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "Invalid JSON body." }, 400); }
  const snapshotId = String(body.snapshotId ?? "");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(snapshotId)) return c.json({ ok: false, error: "AI Play requires a snapshot id." }, 400);
  const stored = getSnapshot(snapshotId);
  if (!stored) return c.json({ ok: false, error: "Snapshot not found or expired." }, 404);
  const projectId = String(stored.payload.document.id ?? body.projectId ?? "");
  if (activeByProject.has(projectId)) return c.json({ ok: false, error: "AI Play is already running for this project.", code: "kane-busy" }, 409);
  const document = stored.payload.document as any;
  const objective = buildAiPlayObjective({
    document,
    sceneId: typeof body.sceneId === "string" && body.sceneId.trim()
      ? body.sceneId
      : typeof document.startSceneId === "string"
        ? document.startSceneId
        : undefined,
    goal: body.goal,
    seed: Number(body.seed) || 1234,
  });
  const origin = playerOrigin(c);
  const seed = Number(body.seed) || 1234;
  const run = startKaneRun({
    objective,
    // When a saved `_test.md` is configured, Kane replays its recordings
    // instead of re-authoring a plan on every attempt.
    savedTest: env.kaneAiPlayTest,
    url: `${origin}/s/${encodeURIComponent(snapshotId)}?ai=1&seed=${seed}`,
    projectId,
    snapshotId,
    attempt: Math.max(1, Math.min(2, Number(body.attempt) || 1)),
    headless: env.kaneHeadless,
    // Kane spends ~30s on startup plus ~10-15s per step before the closing
    // assertion. A 50s cap killed runs that were already on track (a known-good
    // full run took 68s), so the cap leaves room for startup plus the objective.
    timeoutSeconds: Math.min(env.kaneTimeoutSeconds, 140),
    maxSteps: Math.min(env.kaneMaxSteps, 8),
    bugDetection: "off",
    evidenceRoot: env.kaneEvidenceDir,
  });
  return startStream(c, run, projectId);
});

function phaseKey(projectId: string, sessionId: string): string {
  return `${projectId}:${sessionId}`;
}

kaneRoutes.get("/phase-replays", (c) => c.json({ ok: true, replays: listReplayTests() }));

kaneRoutes.post("/phase", async (c) => {
  const status = await readStatus();
  if (!status.installed) return c.json({ ok: false, error: status.reason ?? "Kane CLI is not installed.", code: "kane-missing" }, 503);
  if (!status.authenticated) return c.json({ ok: false, error: "Kane CLI is not signed in.", code: "kane-auth" }, 401);
  const noCredits = creditsExhausted(c, status);
  if (noCredits) return noCredits;
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "Invalid JSON body." }, 400); }
  const snapshotId = typeof (body as any)?.snapshotId === "string" ? (body as any).snapshotId : "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(snapshotId)) return c.json({ ok: false, error: "A phase requires a snapshot id." }, 400);
  const stored = getSnapshot(snapshotId);
  if (!stored) return c.json({ ok: false, error: "Snapshot not found or expired." }, 404);

  const document = stored.payload.document as any;
  const validation = validatePhaseRequest(body, {
    id: String(document.id ?? ""),
    revision: Number(document.revision ?? 0),
    scenes: Array.isArray(document.scenes) ? document.scenes : [],
  });
  if (!validation.ok) return c.json({ ok: false, error: validation.error }, 400);
  const { request, phase, phaseIndex } = validation;

  // A replay runs the recorded `_test.md` for exactly the phase it was
  // authored for, with healing disabled: a replay failure stays a failure and
  // never silently re-authors. Anything else needs a fresh authored run.
  let savedTest: string | undefined;
  if (request.replayTestKey) {
    const resolved = resolveReplayTest(request.replayTestKey);
    if (!resolved.ok) return c.json({ ok: false, error: resolved.error, code: "kane-replay-missing" }, 400);
    if (resolved.entry.phaseId !== request.phaseId) {
      return c.json({ ok: false, error: `Recorded replay "${resolved.entry.key}" belongs to phase "${resolved.entry.phaseId}", not "${request.phaseId}". Run the authored phase first, then save it as a replay.`, code: "kane-replay-mismatch" }, 400);
    }
    savedTest = resolved.file;
  }

  // The budget/idempotency key is derived server-side from the plan content, so
  // changing the client-supplied sessionId cannot reset the paid phase budget.
  const key = phaseKey(String(document.id ?? ""), phaseFingerprint(request));
  const previous = phaseSessions.getResult(key, phase.id);
  if (previous) {
    c.header("Content-Type", "application/x-ndjson; charset=utf-8");
    c.header("Cache-Control", "no-cache");
    return streamText(c, async (stream) => {
      await stream.write(JSON.stringify({ type: "phase_result", result: previous, replay: true }) + "\n");
    });
  }
  const start = phaseSessions.start(key, request.plan.budget.maxKanePhases);
  if (!start.ok) {
    return start.reason === "running"
      ? c.json({ ok: false, error: "A phase is already running for this approved plan.", code: "kane-busy" }, 409)
      : c.json({
        ok: false,
        error: `This approved session has used all ${request.plan.budget.maxKanePhases} Kane phase${request.plan.budget.maxKanePhases === 1 ? "" : "s"}. Draft and approve a new plan to continue.`,
        code: "kane-budget",
      }, 409);
  }

  const objective = composePhaseObjective(request, phase);
  const origin = playerOrigin(c);
  const params = new URLSearchParams({
    ai: "1",
    testMode: "step",
    seed: String(request.plan.seed),
    maxAdvance: String(request.plan.budget.maxFramesPerAdvance),
    maxFrames: String(request.plan.budget.maxFramesPerPhase),
  });
  params.set("scene", request.plan.sceneId);
  if (request.plan.scenarioId) params.set("scenario", request.plan.scenarioId);
  const url = `${origin}/s/${encodeURIComponent(snapshotId)}?${params.toString()}`;
  const startedAt = new Date().toISOString();
  // The approved plan carries its own wall-time budget. The env
  // KANE_TIMEOUT_SECONDS default (180s) used to cap it, so a 300s-approved
  // phase was killed at 185s even when Kane had already emitted a passing
  // run_end. The plan is the user-approved bound; keep the shared hard ceiling.
  const timeoutSeconds = Math.min(
    request.plan.budget.maxWallTimeSecondsPerPhase,
    KANE_PHASE_LIMITS.maxWallTimeSecondsPerPhase,
  );
  let run: ReturnType<typeof startKaneRun>;
  try {
    run = startKaneRun({
      objective,
      ...(savedTest ? { savedTest } : {}),
      url,
      projectId: String(document.id ?? ""),
      snapshotId,
      headless: env.kaneHeadless,
      timeoutSeconds,
      maxSteps: Math.min(env.kaneMaxSteps, request.plan.budget.maxKaneStepsPerPhase, KANE_PHASE_LIMITS.maxStepsPerPhase),
      bugDetection: "off",
      evidenceRoot: env.kaneEvidenceDir,
    });
  } catch (error) {
    phaseSessions.abandon(key);
    return c.json({ ok: false, error: error instanceof Error ? error.message : "Kane could not start." }, 500);
  }
  activeRuns.set(run.runId, { cancel: run.cancel, key });
  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-cache");
  c.header("X-Kane-Run", run.runId);

  return streamText(c, async (stream) => {
    let finalResult: AiPlayResult | null = null;
    try {
      for await (const event of run.events) {
        if (event.type === "run_end") {
          finalResult = event.result;
          // Local evidence directories stay on the server; clients get the safe URL.
          const safeResult = redactAiPlayResult(event.result);
          await stream.write(JSON.stringify({ type: "run_end", result: safeResult }) + "\n");
          continue;
        }
        await stream.write(JSON.stringify(event) + "\n");
      }
    } finally {
      activeRuns.delete(run.runId);
      phaseSessions.abandon(key);
    }
    if (!finalResult) {
      finalResult = {
        runId: run.runId,
        snapshotId,
        attempt: 1,
        status: "error",
        summary: "Kane stream ended without a final result.",
        objective,
        finalState: {},
        steps: [],
        runtimeErrors: [],
        durationMs: Date.now() - Date.parse(startedAt),
        createdAt: startedAt,
      };
    }
    const result = judgePhase({
      result: finalResult,
      request,
      phase,
      phaseIndex,
      objective,
      startedAt,
      ...(status.version ? { kaneCliVersion: status.version } : {}),
    });
    phaseSessions.finish(key, result);
    await stream.write(JSON.stringify({ type: "phase_result", result }) + "\n");
  });
});

kaneRoutes.get("/ai-play/objective/:snapshotId", (c) => {
  const stored = getSnapshot(c.req.param("snapshotId"));
  if (!stored) return c.json({ ok: false, error: "Snapshot not found or expired." }, 404);
  const document = stored.payload.document as any;
  return c.json({
    ok: true,
    objective: buildAiPlayObjective({ document }),
    qaObjective: buildPlayerQaObjective(document),
  });
});

function cancelRun(c: any) {
  const runId = c.req.param("runId");
  const run = activeRuns.get(runId);
  if (!run) return c.json({ ok: false, error: "Run is no longer active." }, 404);
  run.cancel();
  return c.json({ ok: true, cancelled: runId });
}

kaneRoutes.post("/ai-play/:runId/cancel", cancelRun);
// Generic alias so chat verification does not depend on an AI-Play-named route.
kaneRoutes.post("/runs/:runId/cancel", cancelRun);
