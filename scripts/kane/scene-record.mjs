#!/usr/bin/env node
// Scene recorder: I am the LLM. Drives the engine + Kane fixture, captures frames.
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const API_PORT = 3211;
const WEB_PORT = 5212;
const API = `http://localhost:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const CHROME = process.env.CLOCKWORK_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = join(ROOT, "docs", "archive", "video-scene");
mkdirSync(OUT, { recursive: true });

const PHASE_ID = "fire-creates-projectile";
const FIXTURE_STATE = { "shots-fired": "5", projectiles: "4", accepted_inputs: "3", frames_advanced: "45" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let apiProc = null, webProc = null, chromeProc = null;
function launch(cmd, args, env, tag) {
  const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, windowsHide: true });
  child.stdout?.on("data", (d) => process.stdout.write(`[${tag}] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[${tag}] ${d}`));
  return child;
}
async function waitFor(url, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    try { const res = await fetch(url); if (res.ok) return; } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`${label} not ready: ${url}`);
    await sleep(1000);
  }
}

class Cdp {
  constructor() { this.id = 0; this.pending = new Map(); }
  connect(url) {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(e);
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { r, j } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) j(new Error(JSON.stringify(msg.error))); else r(msg.result);
        }
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((r, j) => {
      this.pending.set(id, { r, j });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  evaluate(expr) { return this.send("Runtime.evaluate", { expression: expr, returnByValue: true }).then((x) => x.result?.value); }
  async waitFor(expr, timeoutMs, label) {
    const start = Date.now();
    for (;;) {
      try { if (await this.evaluate(`!!(${expr})`)) return; } catch {}
      if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
      await sleep(500);
    }
  }
  async click(sel) { await this.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`); }
  async shot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    const buf = Buffer.from(data, "base64");
    writeFileSync(join(OUT, name), buf);
    console.log(`FRAME ${name} ${(buf.length / 1024).toFixed(0)}kb`);
  }
}

async function main() {
  const frames = [];
  const cue = (frame, llm, caption) => { frames.push({ frame, llm, caption }); console.log(`CUE ${frame}: ${llm}`); };

  apiProc = launch("node", ["--import", "tsx", "server/index.ts"], {
    PORT: String(API_PORT),
    KANE_CLI: join(ROOT, "scripts", "kane", "fake-kane.mjs"),
    KANE_FIXTURE_FINAL_STATE: JSON.stringify(FIXTURE_STATE),
    KANE_FIXTURE_SHARE_URL: "https://example.invalid/scene-record",
    AI_MOCK: "1", KANE_TIMEOUT_SECONDS: "60",
  }, "api");
  await waitFor(`${API}/api/health`, 60000, "API");

  const tmpConfig = join(ROOT, ".data", "vite.scene.config.mjs");
  writeFileSync(tmpConfig, `import react from "@vitejs/plugin-react";\nimport tailwindcss from "@tailwindcss/vite";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  root: ${JSON.stringify(ROOT)},\n  plugins: [react(), tailwindcss()],\n  server: { port: ${WEB_PORT}, strictPort: true, proxy: { "/api": { target: "http://localhost:${API_PORT}", changeOrigin: true } } },\n});\n`);
  webProc = launch("node", [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--config", tmpConfig, "--port", String(WEB_PORT), "--strictPort"], {}, "web");
  await waitFor(WEB, 180000, "web");

  const profileDir = mkdtempSync(join(tmpdir(), "clockwork-scene-"));
  chromeProc = spawn(CHROME, ["--headless", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0", `--user-data-dir=${profileDir}`, "--window-size=1366,768", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const devtoolsPort = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("no DevTools port")), 30000);
    chromeProc.stderr.on("data", (d) => {
      const m = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(d.toString());
      if (m) { clearTimeout(timer); res(Number(m[1])); }
    });
  });
  const targets = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === "page");
  const cdp = new Cdp();
  await cdp.connect(pageTarget.webSocketDebuggerUrl);
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable");

  await cdp.send("Page.navigate", { url: `${WEB}/` });
  await cdp.waitFor(`document.querySelector('[data-testid="project-new-empty"]') || document.querySelector('[data-testid="project-new"]')`, 120000, "projects");
  await cdp.shot("01-projects.png");
  cue("01-projects.png", "I am the LLM inside Clockwork. You built a game. I know this game - and I can prove it works.", "Hook: engine + co-worker");

  const emptyBtn = await cdp.evaluate(`!!document.querySelector('[data-testid="project-new-empty"]')`);
  await cdp.click(emptyBtn ? '[data-testid="project-new-empty"]' : '[data-testid="project-new"]');
  await cdp.click('[data-testid="game-starter-space-shooter"]');
  await cdp.click('[data-testid="project-create"]');
  await cdp.waitFor(`location.pathname.match(/\\/project\\/.+\\/scene\\/.+/)`, 60000, "editor");
  await sleep(2500);
  await cdp.shot("02-editor.png");
  cue("02-editor.png", "Space Shooter. I read its document and its test profile: SHOOT is hold, 190ms cooldown, or Kane would never fire.", "Chat knows the game");

  // Build the draft in Node (valid revision), pass to page via base64 - avoids all quoting bugs
  const ids = await cdp.evaluate(`(function(){ const m = location.pathname.match(/\\/project\\/([^/]+)\\/scene\\/([^/]+)/); return { projectId: m[1], sceneId: m[2] }; })()`);
  const rev = await cdp.evaluate(`(window.__clockwork && window.__clockwork.getState) ? window.__clockwork.getState().revision : 1`);
  const draft = {
    version: 1, projectId: ids.projectId, sourceRevision: (typeof rev === "number" ? rev : 1), sceneId: ids.sceneId, seed: 1234,
    userGoal: "Prove firing creates a projectile.",
    phases: [{ id: PHASE_ID, objectiveId: "input-creates-projectile", purpose: "Prove firing creates a projectile", kaneObjective: "Hold SHOOT and advance frames, then record shots-fired and projectiles.", allowedControlIds: ["shoot"], assertions: [{ id: "shots-fired-increased", observationId: "shots-fired", operator: "gte", expected: 1 }, { id: "projectiles-increased", observationId: "projectiles", operator: "gte", expected: 1 }], stopWhen: ["passed", "failed"] }],
    budget: { maxKanePhases: 1, maxKaneStepsPerPhase: 12, maxWallTimeSecondsPerPhase: 600, maxFramesPerAdvance: 600, maxFramesPerPhase: 3600 },
    revisions: [{ revision: 1, reason: "Scene-record draft (I am the LLM).", at: new Date().toISOString() }],
  };
  const b64 = Buffer.from(JSON.stringify(draft), "utf8").toString("base64");
  await cdp.evaluate(`(function(){ const raw = atob(${JSON.stringify(b64)}); const d = JSON.parse(raw); localStorage.setItem("clockwork:test-plan:" + d.projectId, JSON.stringify(d)); return d.sourceRevision; })()`);
  await cdp.send("Page.reload");
  await cdp.waitFor(`document.querySelector('[data-testid="toolbar-ai-play"]')`, 120000, "editor reload");
  await cdp.click('[data-testid="toolbar-ai-play"]');
  await cdp.waitFor(`document.querySelector('[data-testid="test-plan-draft"]')`, 60000, "draft");
  await cdp.shot("03-draft.png");
  cue("03-draft.png", "You said: prove shooting works. I drafted a typed plan - one phase, two assertions, 45-frame budget. Nothing runs until you approve.", "propose_test_plan, approval boundary");

  await cdp.click('[data-testid="test-plan-approve"]');
  await cdp.waitFor(`document.querySelector('[data-testid="test-plan-approval"]')`, 15000, "approval");
  await cdp.shot("04-approved.png");
  cue("04-approved.png", "Approved. I snapshot your revision, freeze seed 1234, hand Kane a Test Mode URL. Time moves only when Kane presses STEP.", "snapshot + lockstep");
  await cdp.click(`[data-testid="test-plan-replay-${PHASE_ID}"]`);
  await cdp.waitFor(`document.querySelector('[data-testid="test-plan-result-${PHASE_ID}"]')?.dataset.verdict === "passed"`, 120000, "passed");
  await cdp.shot("05-passed.png");
  cue("05-passed.png", "Kane held SHOOT, stepped 45 frames: shots-fired 5, projectiles 4, accepted inputs 3. PASS - inputs delivered, frames in budget, evidence attached.", "run_kane_test_phase typed verdict");

  await cdp.click(`[data-testid="test-plan-explain-${PHASE_ID}"]`);
  await cdp.waitFor(`document.querySelector('[aria-label="Agent chat"]')`, 15000, "drawer");
  await sleep(4000);
  await cdp.shot("06-agent.png");
  cue("06-agent.png", "And the result lands back in my chat as a typed tool result - so I decide what to test next. Build it. Prove it. Ship it.", "phase continuation closes the loop");

  writeFileSync(join(OUT, "cues.json"), JSON.stringify(frames, null, 2));
  console.log(`SCENE RECORDED: ${frames.length} frames -> ${OUT}`);
}

async function shutdown() {
  try { if (chromeProc?.exitCode === null) chromeProc.kill(); } catch {}
  try { if (webProc?.exitCode === null) webProc.kill("SIGTERM"); } catch {}
  try { if (apiProc?.exitCode === null) apiProc.kill("SIGTERM"); } catch {}
  try { rmSync(join(ROOT, ".data", "vite.scene.config.mjs"), { force: true }); } catch {}
}
process.on("SIGINT", () => void shutdown().then(() => process.exit(130)));

main().then(() => shutdown().then(() => process.exit(0))).catch(async (e) => { console.error("SCENE FAILED:", e?.message ?? e); await shutdown(); process.exit(1); });
