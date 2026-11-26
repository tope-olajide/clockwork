#!/usr/bin/env node
/**
 * Phase 7 smoke test: the full approved-phase flow with zero Kane credits and
 * zero LLM calls. The API runs with the deterministic `fake-kane` fixture and
 * `AI_MOCK=1`; the browser is real headless Chrome driven over raw CDP.
 *
 * Flow: create a Space Shooter starter in the UI -> open AI Testing ->
 * review the seeded draft -> approve -> replay the recorded test ->
 * typed passed result + evidence + final report -> explain in agent (mock).
 * Any console error (other than the known favicon 404) fails the run.
 *
 * Usage: npm run smoke:phase
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createGameStarterDocument } from "../../src/engine/model/game-starters/build";

const ROOT = process.cwd();
const API_PORT = 3111;
const WEB_PORT = 5112;
const API = `http://localhost:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const CHROME =
  process.env.CLOCKWORK_CHROME ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const PHASE_ID = "fire-creates-projectile";
const FIXTURE_STATE = {
  "shots-fired": "5",
  projectiles: "4",
  accepted_inputs: "3",
  frames_advanced: "45",
};
const SHARE_URL = "https://example.invalid/smoke-share";

const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "  ok" : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures.push(name);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let apiProc: ChildProcess | null = null;
let webProc: ChildProcess | null = null;
let chromeProc: ChildProcess | null = null;

function launch(cmd: string, args: string[], env: Record<string, string | undefined>, tag: string): ChildProcess {
  const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, windowsHide: true });
  child.stdout?.on("data", (d) => process.stdout.write(`[${tag}] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[${tag}] ${d}`));
  child.on("exit", (code) => console.log(`[${tag}] exited ${code}`));
  return child;
}

async function waitFor(url: string, timeoutMs: number, label: string) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    if (Date.now() - start > timeoutMs) throw new Error(`${label} not ready: ${url}`);
    await sleep(1000);
  }
}

/* ---------------- minimal CDP client ---------------- */
class Cdp {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  private listeners: Array<(ev: any) => void> = [];
  consoleErrors: string[] = [];
  pageErrors: string[] = [];

  onEvent(fn: (ev: any) => void) { this.listeners.push(fn); }

  async connect(url: string) {
    this.ws = new WebSocket(url);
    await new Promise<void>((res, rej) => {
      (this.ws as any).onopen = () => res();
      (this.ws as any).onerror = (e: any) => rej(new Error(`CDP connect failed: ${e?.message ?? e}`));
    });
    (this.ws as any).onmessage = (msg: any) => {
      const data = JSON.parse(String(msg.data));
      if (data.id !== undefined) {
        const p = this.pending.get(data.id);
        if (p) {
          this.pending.delete(data.id);
          if (data.error) p.rej(new Error(`CDP ${data.error.message}`));
          else p.res(data.result);
        }
      } else {
        if (data.method === "Runtime.consoleAPICalled" && data.params?.type === "error") {
          const text = (data.params.args ?? []).map((a: any) => a.value ?? a.description ?? "").join(" ");
          this.consoleErrors.push(text || "(empty console error)");
        }
        if (data.method === "Runtime.exceptionThrown") {
          this.pageErrors.push(data.params?.exceptionDetails?.text ?? "(page exception)");
        }
        if (data.method === "Log.entryAdded" && data.params?.entry?.level === "error") {
          this.consoleErrors.push(`log: ${data.params.entry.text ?? data.params.entry.url ?? ""}`);
        }
        for (const fn of this.listeners) fn(data);
      }
    };
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  evaluate(expression: string, awaitPromise = false): Promise<any> {
    const run = () => this.send("Runtime.evaluate", {
      expression, awaitPromise, returnByValue: true,
    }).then((r) => {
      if (r?.exceptionDetails) throw new Error(`evaluate threw: ${JSON.stringify(r.exceptionDetails).slice(0, 300)}`);
      return r?.result?.value;
    });
    // A route change or reload can swap the renderer while an evaluate is in flight;
    // Chrome answers "Inspected target navigated or closed" instead of the result.
    // That is a harness race, not a page failure, so retry on the next tick.
    const attempt = async (left: number): Promise<any> => {
      try {
        return await run();
      } catch (e) {
        const navigationRace = /navigated or closed|Execution context was destroyed|Cannot find context/i.test(
          e instanceof Error ? e.message : String(e),
        );
        if (!navigationRace || left <= 1) throw e;
        await sleep(200);
        return attempt(left - 1);
      }
    };
    return attempt(5);
  }

  async waitFor(jsCondition: string, timeoutMs: number, label: string) {
    const start = Date.now();
    for (;;) {
      const ok = await this.evaluate(`(function(){ try { return !!(${jsCondition}); } catch(e){ return false; } })()`);
      if (ok) return;
      if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
      await sleep(500);
    }
  }

  async click(selector: string, timeoutMs = 30000) {
    await this.waitFor(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`, timeoutMs, selector);
    await this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }
}

async function main() {
  /* ---- API with fixture Kane + mock agent ---- */
  apiProc = launch("node", ["--import", "tsx", "server/index.ts"], {
    PORT: String(API_PORT),
    KANE_CLI: join(ROOT, "scripts", "kane", "fake-kane.mjs"),
    KANE_FIXTURE_FINAL_STATE: JSON.stringify(FIXTURE_STATE),
    KANE_FIXTURE_SHARE_URL: SHARE_URL,
    AI_MOCK: "1",
    KANE_TIMEOUT_SECONDS: "60",
  }, "api");
  await waitFor(`${API}/api/health`, 60000, "API");
  console.log("API up; running Layer A (route guards + one-shot phase)");

  const replays = (await (await fetch(`${API}/api/kane/phase-replays`)).json()) as any;
  check("phase-replays lists the recorded replay", Array.isArray(replays?.replays) && replays.replays.some((r: any) => r.key === "space-shooter-fire"));

  const doc: any = createGameStarterDocument("space-shooter", "Smoke");
  const sceneId: string = doc.startSceneId ?? doc.scenes[0].id;
  const snapshot = (await (await fetch(`${API}/api/snapshots`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document: doc, assets: [], ttlHours: 1 }),
  })).json()) as any;
  check("snapshot created", Boolean(snapshot?.id));

  const planBase = {
    version: 1, projectId: doc.id, sourceRevision: doc.revision, sceneId, seed: 1234,
    userGoal: "Smoke: verify shooting creates projectiles.",
    phases: [{
      id: PHASE_ID, objectiveId: "input-creates-projectile",
      purpose: "Smoke: verify shooting creates projectiles",
      kaneObjective: "Hold SHOOT and advance frames, then record shots-fired and projectiles.",
      allowedControlIds: ["shoot"],
      assertions: [
        { id: "shots-fired-increased", observationId: "shots-fired", operator: "gte", expected: 1 },
        { id: "projectiles-increased", observationId: "projectiles", operator: "gte", expected: 1 },
      ],
      stopWhen: ["passed", "failed"],
    }],
    budget: { maxKanePhases: 1, maxKaneStepsPerPhase: 12, maxWallTimeSecondsPerPhase: 600, maxFramesPerAdvance: 600, maxFramesPerPhase: 3600 },
  };
  async function postPhase(body: unknown) {
    const res = await fetch(`${API}/api/kane/phase`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const text = await res.text();
    let last: any = null;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try { const ev = JSON.parse(line); if (ev.type === "phase_result") last = ev.result; } catch { /* partial */ }
    }
    return { status: res.status, result: last, raw: text };
  }
  const session = "session-0-1234-smoke";
  const oneShot = await postPhase({ sessionId: session, snapshotId: snapshot.id, phaseId: PHASE_ID, plan: planBase });
  check("one-shot fixture phase passes", oneShot.status === 200 && oneShot.result?.verdict === "passed", oneShot.result?.verdict);
  check("typed result carries inputs/frames/evidence/duration",
    oneShot.result?.acceptedInputs === 3 && oneShot.result?.framesAdvanced === 45 &&
    typeof oneShot.result?.evidenceUrl === "string" && oneShot.result?.durationMs > 0);

  const unknownKey = await postPhase({ sessionId: session, snapshotId: snapshot.id, phaseId: PHASE_ID, plan: planBase, replayTestKey: "nope" });
  check("unknown replay key is refused", unknownKey.status === 400 && /replay/i.test(unknownKey.raw));
  const mismatch = await postPhase({ sessionId: session, snapshotId: snapshot.id, phaseId: "other-phase", plan: { ...planBase, phases: [{ ...planBase.phases[0], id: "other-phase" }] }, replayTestKey: "space-shooter-fire" });
  check("wrong-phase replay key is refused", mismatch.status === 400 && /belongs to phase/i.test(mismatch.raw));

  /* ---- web (vite dev, proxied to the smoke API) ---- */
  const tmpConfig = join(ROOT, ".data", "vite.smoke.config.mjs");
  writeFileSync(tmpConfig, `import react from "@vitejs/plugin-react";\nimport tailwindcss from "@tailwindcss/vite";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  root: ${JSON.stringify(ROOT)},\n  plugins: [react(), tailwindcss()],\n  server: { port: ${WEB_PORT}, strictPort: true, proxy: { "/api": { target: "http://localhost:${API_PORT}", changeOrigin: true } } },\n});\n`);
  webProc = launch("node", [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--config", tmpConfig, "--port", String(WEB_PORT), "--strictPort"], {}, "web");
  await waitFor(WEB, 180000, "web");
  console.log("Web up; running Layer B (browser panel flow)");

  /* ---- headless Chrome over CDP ---- */
  const profileDir = mkdtempSync(join(tmpdir(), "clockwork-smoke-"));
  chromeProc = spawn(CHROME, [
    "--headless", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    "--remote-debugging-port=0", `--user-data-dir=${profileDir}`,
    "--window-size=1366,768", "about:blank",
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let devtoolsPort = 0;
  const portFound = new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(new Error("no DevTools port in chrome stderr")), 30000);
    chromeProc!.stderr!.on("data", (d: Buffer) => {
      const m = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(d.toString());
      if (m) { devtoolsPort = Number(m[1]); clearTimeout(timer); res(); }
    });
  });
  await portFound;
  const targets = (await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)).json()) as any[];
  const pageTarget = targets.find((t: any) => t.type === "page");
  if (!pageTarget) throw new Error("no page target from Chrome");
  const cdp = new Cdp();
  await cdp.connect(pageTarget.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  const badRequests: string[] = [];
  await cdp.send("Network.enable");
  cdp.onEvent((ev: any) => {
    if (ev.method === "Network.responseReceived" && (ev.params?.response?.status ?? 0) >= 400) {
      badRequests.push(`${ev.params.response.status} ${ev.params.response.url}`);
    }
  });

  await cdp.send("Page.navigate", { url: `${WEB}/` });
  await cdp.waitFor(`document.querySelector('[data-testid="project-new-empty"]') || document.querySelector('[data-testid="project-new"]')`, 120000, "projects page");
  const emptyBtn = await cdp.evaluate(`!!document.querySelector('[data-testid="project-new-empty"]')`);
  await cdp.click(emptyBtn ? '[data-testid="project-new-empty"]' : '[data-testid="project-new"]');
  await cdp.click('[data-testid="game-starter-space-shooter"]');
  await cdp.click('[data-testid="project-create"]');
  await cdp.waitFor(`location.pathname.match(/\\/project\\/.+\\/scene\\/.+/)`, 60000, "editor URL");
  const ids = (await cdp.evaluate(`(function(){ const m = location.pathname.match(/\\/project\\/([^/]+)\\/scene\\/([^/]+)/); const s = (window.__clockwork && window.__clockwork.getState) ? window.__clockwork.getState() : {}; return { projectId: m[1], sceneId: m[2], revision: s.revision }; })()`)) as any;
  check("starter project opens in editor", Boolean(ids?.projectId && ids?.sceneId) && typeof ids?.revision === "number", JSON.stringify(ids));

  const draft = {
    version: 1, projectId: ids.projectId, sourceRevision: ids.revision, sceneId: ids.sceneId, seed: 1234,
    userGoal: "Smoke: verify shooting creates projectiles.",
    phases: [{
      id: PHASE_ID, objectiveId: "input-creates-projectile",
      purpose: "Smoke: verify shooting creates projectiles",
      kaneObjective: "Hold SHOOT and advance frames, then record shots-fired and projectiles.",
      allowedControlIds: ["shoot"],
      assertions: [
        { id: "shots-fired-increased", observationId: "shots-fired", operator: "gte", expected: 1 },
        { id: "projectiles-increased", observationId: "projectiles", operator: "gte", expected: 1 },
      ],
      stopWhen: ["passed", "failed"],
    }],
    budget: { maxKanePhases: 1, maxKaneStepsPerPhase: 12, maxWallTimeSecondsPerPhase: 600, maxFramesPerAdvance: 600, maxFramesPerPhase: 3600 },
    revisions: [{ revision: 1, reason: "Smoke-seeded draft for the panel flow.", at: new Date().toISOString() }],
  };
  await cdp.evaluate(`localStorage.setItem(${JSON.stringify(`clockwork:test-plan:${ids.projectId}`)}, ${JSON.stringify(JSON.stringify(draft))})`);
  await cdp.send("Page.reload");
  await cdp.waitFor(`document.querySelector('[data-testid="toolbar-ai-play"]')`, 120000, "editor reload");
  await cdp.click('[data-testid="toolbar-ai-play"]');
  await cdp.waitFor(`document.querySelector('[data-testid="test-plan-draft"]')`, 30000, "seeded draft review");
  check("seeded draft renders for review", true);

  await cdp.click('[data-testid="test-plan-approve"]');
  await cdp.waitFor(`document.querySelector('[data-testid="test-plan-approval"]')`, 15000, "approval stamp");
  check("plan approves in the panel", true);

  await cdp.click(`[data-testid="test-plan-replay-${PHASE_ID}"]`);
  await cdp.waitFor(`document.querySelector('[data-testid="test-plan-result-${PHASE_ID}"]')?.dataset.verdict === "passed"`, 120000, "passed replay result");
  check("replay run passes in the panel", true);
  const resultMeta = (await cdp.evaluate(`(function(){ const el = document.querySelector('[data-testid="test-plan-result-${PHASE_ID}"]'); const ev = document.querySelector('[data-testid="test-plan-evidence-${PHASE_ID}"]'); const checks = Array.from(el.querySelectorAll('li[data-check-status]')).map((li) => li.dataset.checkStatus); return { verdict: el.dataset.verdict, checks, evidenceHref: ev ? ev.getAttribute('href') : null, text: el.textContent.slice(0, 400) }; })()`)) as any;
  check("result shows passed checks", resultMeta?.checks?.length === 2 && resultMeta.checks.every((s: string) => s === "passed"), JSON.stringify(resultMeta?.checks));
  check("evidence link attached", typeof resultMeta?.evidenceHref === "string" && resultMeta.evidenceHref.includes("/api/kane/runs/"), resultMeta?.evidenceHref);
  check("evidence download works", await (async () => {
    try { const r = await fetch(`${API}${resultMeta.evidenceHref}`); return r.ok; } catch { return false; }
  })());
  const reportVerdict = await cdp.evaluate(`document.querySelector('[data-testid="test-plan-report"]')?.dataset.reportVerdict ?? null`);
  check("final report renders passed", reportVerdict === "passed", String(reportVerdict));

  await cdp.click(`[data-testid="test-plan-explain-${PHASE_ID}"]`);
  await cdp.waitFor(`document.querySelector('[aria-label="Agent chat"]')`, 15000, "agent drawer");
  await cdp.waitFor(`document.querySelector('[aria-label="Agent chat"]').textContent.includes("Mock")`, 60000, "mock agent reply");
  check("explain-in-agent gets a mock reply, no credits spent", true);

  const realErrors = cdp.consoleErrors.filter((e) => !/favicon/i.test(e));
  const resources = [...new Set(badRequests)].filter((u) => !/favicon\.ico/i.test(u));
  if (badRequests.length) console.log(`  info failing requests: ${[...new Set(badRequests)].join(" | ").slice(0, 400)}`);
  check("no console/page errors", realErrors.length === 0 && cdp.pageErrors.length === 0 && resources.length === 0,
    [...realErrors, ...cdp.pageErrors, ...resources].join(" | ").slice(0, 400));

  console.log(failures.length === 0 ? "SMOKE PASSED" : `SMOKE FAILED: ${failures.join("; ")}`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

async function shutdown() {
  try { if (chromeProc && chromeProc.exitCode === null) chromeProc.kill(); } catch { /* ignore */ }
  try { if (webProc && webProc.exitCode === null) webProc.kill("SIGTERM"); } catch { /* ignore */ }
  try { if (apiProc && apiProc.exitCode === null) apiProc.kill("SIGTERM"); } catch { /* ignore */ }
  try { rmSync(join(ROOT, ".data", "vite.smoke.config.mjs"), { force: true }); } catch { /* ignore */ }
}

process.on("SIGINT", () => void shutdown().then(() => process.exit(130)));
main().catch((e) => { console.error(`SMOKE ERROR: ${e instanceof Error ? e.message : e}`); failures.push("threw"); })
  .finally(() => void shutdown().then(() => { if (failures.length) process.exitCode = 1; }));
