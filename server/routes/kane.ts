import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AiPlayRequest, KaneCliStatus, KaneQaRequest } from "../../shared/protocol/kane";
import { env } from "../env";
import { getSnapshot } from "../snapshots/repository";
import { buildAiPlayObjective, buildPlayerQaObjective } from "../kane/objectives";
import { startKaneRun } from "../kane/runner";

export const kaneRoutes = new Hono();

const activeRuns = new Map<string, { cancel: () => void; key: string }>();
const activeByProject = new Map<string, string>();
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

function execKane(extra: string[], timeout = 8_000): Promise<string> {
  const cli = kaneCliEntry();
  return new Promise((resolve, reject) => {
    execFile(cli.command, [...cli.args, ...extra], {
      timeout,
      windowsHide: true,
      env: { ...process.env, KANE_CLI_USER_AGENT: "clockwork" },
    }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) reject(error);
      else resolve(String(stdout || stderr));
    });
  });
}

async function readStatus(force = false): Promise<KaneCliStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < 20_000) return statusCache.value;
  const base: KaneCliStatus = {
    enabled: env.kaneEnabled,
    qaEnabled: env.kaneEnabled,
    aiPlayEnabled: env.kaneAiPlayEnabled,
    installed: false,
    authenticated: false,
    evidenceDir: env.kaneEvidenceDir,
  };
  if (!env.kaneEnabled && !env.kaneAiPlayEnabled) {
    statusCache = { at: Date.now(), value: base };
    return base;
  }
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
  statusCache = { at: Date.now(), value: base };
  return base;
}

function playerOrigin(c: any): string {
  if (env.publicUrl) return env.publicUrl.replace(/\/$/, "");
  if (env.nodeEnv !== "production") return "http://localhost:5173";
  return new URL(c.req.url).origin;
}

function startStream(c: any, run: ReturnType<typeof startKaneRun>, key: string) {
  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-cache");
  c.header("X-Kane-Run", run.runId);
  activeRuns.set(run.runId, { cancel: run.cancel, key });
  activeByProject.set(key, run.runId);
  return streamText(c, async (stream) => {
    try {
      for await (const event of run.events) {
        await stream.write(JSON.stringify(event) + "\n");
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
  return c.json({ ok: true, result: JSON.parse(readFileSync(path, "utf8")) });
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
  if (!env.kaneEnabled) return c.json({ ok: false, error: "Kane engine QA is disabled. Set KANE_ENABLED=1.", code: "kane-disabled" }, 404);
  if (!status.installed) return c.json({ ok: false, error: status.reason ?? "Kane CLI is not installed.", code: "kane-missing" }, 503);
  if (!status.authenticated) return c.json({ ok: false, error: "Kane CLI is not signed in.", code: "kane-auth" }, 401);
  let body: KaneQaRequest;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "Invalid JSON body." }, 400); }
  const objective = String(body.objective ?? "").trim();
  if (!objective) return c.json({ ok: false, error: "An objective is required." }, 400);
  if (objective.length > 1_000) return c.json({ ok: false, error: "Kane objectives must be under 1,000 characters." }, 400);
  const snapshotId = String(body.snapshotId ?? "");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(snapshotId)) return c.json({ ok: false, error: "Engine QA must run against a snapshot." }, 400);
  const stored = getSnapshot(snapshotId);
  if (!stored) return c.json({ ok: false, error: "Snapshot not found or expired." }, 404);
  const origin = playerOrigin(c);
  const seed = Number(body.seed) || 1234;
  const run = startKaneRun({
    objective,
    url: `${origin}/s/${encodeURIComponent(snapshotId)}?ai=1&seed=${seed}`,
    projectId: String(stored.payload.document.id ?? ""),
    snapshotId,
    headless: env.kaneHeadless,
    timeoutSeconds: env.kaneTimeoutSeconds,
    maxSteps: env.kaneMaxSteps,
    bugDetection: "continue",
    evidenceRoot: env.kaneEvidenceDir,
  });
  return startStream(c, run, `qa:${stored.payload.document.id ?? snapshotId}`);
});

kaneRoutes.post("/ai-play", async (c) => {
  if (!env.kaneEnabled || !env.kaneAiPlayEnabled) {
    return c.json({ ok: false, error: "AI Play is disabled. Set KANE_ENABLED=1 and KANE_AI_PLAY_ENABLED=1.", code: "kane-disabled" }, 404);
  }
  const status = await readStatus();
  if (!status.installed) return c.json({ ok: false, error: status.reason ?? "Kane CLI is not installed.", code: "kane-missing" }, 503);
  if (!status.authenticated) return c.json({ ok: false, error: "Kane CLI is not signed in.", code: "kane-auth" }, 401);
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
    sceneId: typeof document.startSceneId === "string" ? document.startSceneId : undefined,
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

kaneRoutes.post("/ai-play/:runId/cancel", (c) => {
  const runId = c.req.param("runId");
  const run = activeRuns.get(runId);
  if (!run) return c.json({ ok: false, error: "Run is no longer active." }, 404);
  run.cancel();
  return c.json({ ok: true, cancelled: runId });
});
