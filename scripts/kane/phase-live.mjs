#!/usr/bin/env node
/**
 * Live approved-phase acceptance for the AI Testing panel.
 *
 * Runs against a normal `npm run dev` stack (web 5173, API 3000) and the real
 * signed-in Kane CLI. The planning model is not required: a valid draft is
 * seeded for review, then approved and run through the actual panel controls.
 *
 * Flow: create Space Shooter -> seed draft -> reload -> open AI Play ->
 * approve plan -> Run phase (authored, no replay key) -> typed result ->
 * final report -> download evidence. Writes .data/phase-live/panel-run.json.
 */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const WEB = process.env.CLOCKWORK_WEB ?? "http://localhost:5173";
const API = process.env.CLOCKWORK_API ?? "http://localhost:3000";
const CHROME = process.env.CLOCKWORK_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PHASE_ID = "fire-creates-projectile";
const REPLAY = process.argv.includes("--replay");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  ws;
  id = 0;
  pending = new Map();
  consoleErrors = [];
  pageErrors = [];

  async connect(url) {
    this.ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = (event) => reject(new Error(`CDP connect failed: ${event?.message ?? event}`));
    });
    this.ws.onmessage = (message) => {
      const data = JSON.parse(String(message.data));
      if (data.id !== undefined) {
        const pending = this.pending.get(data.id);
        if (!pending) return;
        this.pending.delete(data.id);
        if (data.error) pending.reject(new Error(`CDP ${data.error.message}`));
        else pending.resolve(data.result);
        return;
      }
      if (data.method === "Runtime.consoleAPICalled" && data.params?.type === "error") {
        const text = (data.params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" ");
        this.consoleErrors.push(text || "(empty console error)");
      }
      if (data.method === "Runtime.exceptionThrown") {
        this.pageErrors.push(data.params?.exceptionDetails?.text ?? "(page exception)");
      }
    };
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result?.exceptionDetails) throw new Error(`evaluate threw: ${JSON.stringify(result.exceptionDetails).slice(0, 400)}`);
    return result?.result?.value;
  }

  async waitFor(condition, timeoutMs, label) {
    const start = Date.now();
    for (;;) {
      if (await this.evaluate(`(function(){ try { return !!(${condition}); } catch (error) { return false; } })()`)) return;
      if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
      await sleep(700);
    }
  }

  async click(selector, timeoutMs = 60000) {
    await this.waitFor(
      `document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`,
      timeoutMs,
      selector,
    );
    await this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }
}

async function waitForHttp(url, timeoutMs, label) {
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not up */ }
    if (Date.now() - started > timeoutMs) throw new Error(`${label} not ready: ${url}`);
    await sleep(1000);
  }
}

const profileDir = mkdtempSync(join(tmpdir(), "clockwork-phase-live-"));
let chrome;
let cdp;
try {
  await waitForHttp(`${API}/api/health`, 30000, "API");
  await waitForHttp(WEB, 30000, "web");
  const status = await (await fetch(`${API}/api/kane/status`)).json();
  if (!status?.status?.installed || !status?.status?.authenticated) {
    throw new Error(`Kane not usable: ${JSON.stringify(status?.status)}`);
  }
  console.log(`kane ${status.status.version} · ${status.status.user} · ${status.status.credits} credits`);

  chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`, "--window-size=1366,768", "about:blank",
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });

  let devtoolsPort = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no DevTools port from Chrome")), 30000);
    chrome.stderr.on("data", (chunk) => {
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(chunk.toString());
      if (match) { devtoolsPort = Number(match[1]); clearTimeout(timer); resolve(); }
    });
  });
  let targets = [];
  const devtoolsStarted = Date.now();
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`);
      if (response.ok) {
        targets = await response.json();
        if (targets.some((target) => target.type === "page")) break;
      }
    } catch { /* Chrome is not listening yet */ }
    if (Date.now() - devtoolsStarted > 20000) throw new Error(`Chrome DevTools list unavailable on ${devtoolsPort}`);
    await sleep(300);
  }
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("no page target from Chrome");
  cdp = new Cdp();
  await cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  await cdp.send("Page.navigate", { url: `${WEB}/` });
  await cdp.waitFor(
    `document.querySelector('[data-testid="project-new-empty"]') || document.querySelector('[data-testid="project-new"]')`,
    120000,
    "projects page",
  );
  const emptyButton = await cdp.evaluate(`!!document.querySelector('[data-testid="project-new-empty"]')`);
  await cdp.click(emptyButton ? '[data-testid="project-new-empty"]' : '[data-testid="project-new"]');
  await cdp.click('[data-testid="game-starter-space-shooter"]');
  await cdp.click('[data-testid="project-create"]');
  await cdp.waitFor(`location.pathname.match(/\\/project\\/.+\\/scene\\/.+/)`, 90000, "editor URL");

  const ids = await cdp.evaluate(`(function(){
    const match = location.pathname.match(/\\/project\\/([^/]+)\\/scene\\/([^/]+)/);
    const state = window.__clockwork && window.__clockwork.getState ? window.__clockwork.getState() : {};
    return { projectId: match[1], sceneId: match[2], revision: state.revision };
  })()`);
  console.log(`project ${ids.projectId} · scene ${ids.sceneId} · revision ${ids.revision}`);

  const draft = {
    version: 1,
    projectId: ids.projectId,
    sourceRevision: ids.revision,
    sceneId: ids.sceneId,
    seed: 1234,
    userGoal: "Verify that an accepted SHOOT hold creates a projectile without claiming a hit.",
    phases: [{
      id: PHASE_ID,
      objectiveId: "input-creates-projectile",
      purpose: "Shooting inputs create a projectile",
      kaneObjective: "In Clockwork Test Mode, turn SHOOT on, set ADVANCE to 45, click STEP once, wait for the frame counter to settle, then record SHOTS FIRED, PROJECTILES, accepted inputs and frames advanced. Stay within the frame budget; do not reload or press other gameplay controls.",
      allowedControlIds: ["shoot"],
      assertions: [
        { id: "shots-fired-increased", observationId: "shots-fired", operator: "gte", expected: 1 },
        { id: "projectiles-increased", observationId: "projectiles", operator: "gte", expected: 1 },
      ],
      stopWhen: ["passed", "failed"],
    }],
    budget: {
      maxKanePhases: 1,
      maxKaneStepsPerPhase: 12,
      maxWallTimeSecondsPerPhase: 600,
      maxFramesPerAdvance: 600,
      maxFramesPerPhase: 3600,
    },
    revisions: [{ revision: 1, reason: "Live acceptance draft for the approved-phase panel flow.", at: new Date().toISOString() }],
  };

  await cdp.evaluate(`localStorage.setItem(${JSON.stringify(`clockwork:test-plan:${ids.projectId}`)}, ${JSON.stringify(JSON.stringify(draft))})`);
  await cdp.send("Page.reload");
  await cdp.waitFor(`document.querySelector('[data-testid="toolbar-ai-play"]')`, 90000, "editor reload");

  await cdp.click('[data-testid="toolbar-ai-play"]');
  await cdp.waitFor(`document.querySelector('[data-testid="test-plan-draft"]')`, 30000, "draft review");
  const review = await cdp.evaluate(`(function(){
    const panel = document.querySelector('[data-testid="test-plan-panel"]');
    const approve = document.querySelector('[data-testid="test-plan-approve"]');
    return { approvalBefore: Boolean(document.querySelector('[data-testid="test-plan-approval"]')), approveDisabled: approve ? approve.disabled : null, text: panel.textContent.slice(0, 600) };
  })()`);
  console.log("draft rendered for review");

  await cdp.click('[data-testid="test-plan-approve"]');
  await cdp.waitFor(`document.querySelector('[data-testid="test-plan-approval"]')`, 20000, "approval stamp");
  const approval = await cdp.evaluate(`document.querySelector('[data-testid="test-plan-approval"]').textContent.trim()`);
  console.log(`approved: ${approval}`);

  const startedAt = new Date().toISOString();
  const runSelector = REPLAY
    ? `[data-testid="test-plan-replay-${PHASE_ID}"]`
    : `[data-testid="test-plan-run-${PHASE_ID}"]`;
  await cdp.click(runSelector, 30000);
  console.log(`${REPLAY ? "replay" : "authored"} phase started; waiting for Kane (bounded by the 600 s phase budget)`);

  await cdp.waitFor(
    `document.querySelector('[data-testid="test-plan-result-${PHASE_ID}"]') || document.querySelector('[data-testid="test-plan-phase-error"]')`,
    620000,
    "phase result",
  );

  const result = await cdp.evaluate(`(function(){
    const element = document.querySelector('[data-testid="test-plan-result-${PHASE_ID}"]');
    const phaseError = document.querySelector('[data-testid="test-plan-phase-error"]');
    const report = document.querySelector('[data-testid="test-plan-report"]');
    const evidence = document.querySelector('[data-testid="test-plan-evidence-${PHASE_ID}"]');
    return {
      verdict: element ? element.dataset.verdict : null,
      checks: element ? Array.from(element.querySelectorAll('li[data-check-status]')).map((item) => ({ status: item.dataset.checkStatus, text: item.textContent.trim() })) : [],
      text: element ? element.textContent.slice(0, 1200) : null,
      evidenceHref: evidence ? evidence.getAttribute('href') : null,
      reportVerdict: report ? report.dataset.reportVerdict : null,
      reportCriteria: report ? Array.from(report.querySelectorAll('li[data-status]')).map((item) => ({ status: item.dataset.status, text: item.textContent.trim().slice(0, 300) })) : [],
      reportText: report ? report.textContent.slice(0, 1600) : null,
      phaseError: phaseError ? phaseError.textContent.trim() : null,
      approval: document.querySelector('[data-testid="test-plan-approval"]')?.textContent.trim() ?? null,
    };
  })()`);

  let evidence = { status: null, bytes: 0, error: null };
  if (result.evidenceHref) {
    try {
      const response = await fetch(`${API}${result.evidenceHref}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      evidence = { status: response.status, bytes: buffer.byteLength, error: null };
    } catch (error) {
      evidence = { status: null, bytes: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }

  let screenshot = null;
  if (result.verdict === "passed") {
    await cdp.evaluate(`(function(){
      for (const button of document.querySelectorAll('button')) {
        if (button.textContent.trim() === 'Skip') button.click();
      }
      const element = document.querySelector('[data-testid="test-plan-result-${PHASE_ID}"]') ?? document.querySelector('[data-testid="test-plan-panel"]');
      if (element) element.scrollIntoView({ block: 'center', inline: 'nearest' });
      return true;
    })()`);
    await sleep(800);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    mkdirSync(join(".data", "phase-live"), { recursive: true });
    const shotPath = join(".data", "phase-live", "panel-result.png");
    writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    mkdirSync(join("docs", "screenshots"), { recursive: true });
    const docsPath = join("docs", "screenshots", "approved-phase-passed.png");
    copyFileSync(shotPath, docsPath);
    screenshot = { path: docsPath, bytes: Buffer.byteLength(shot.data, "base64") };
    console.log(`screenshot: ${docsPath}`);
  }

  const consoleErrors = cdp.consoleErrors.filter((error) => !/favicon/i.test(error));
  const record = {
    kind: "approved-phase-panel-live",
    recordedAt: new Date().toISOString(),
    startedAt,
    finishedAt: new Date().toISOString(),
    environment: {
      web: WEB,
      api: API,
      kane: status.status.version,
      user: status.status.user,
      startingCredits: status.status.credits,
      planningModel: "mock (env); deterministic draft seeded by this harness so the panel approval path is exercised",
    },
    project: ids,
    mode: REPLAY ? "replay" : "authored",
    review,
    approval,
    result,
    evidence,
    screenshot,
    consoleErrors,
    pageErrors: cdp.pageErrors,
  };
  mkdirSync(".data/phase-live", { recursive: true });
  writeFileSync(join(".data", "phase-live", "panel-run.json"), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));
  if (result.verdict !== "passed") process.exitCode = 2;
  if (!evidence.status || evidence.bytes === 0) process.exitCode = 2;
  if (consoleErrors.length || cdp.pageErrors.length) process.exitCode = 2;
} catch (error) {
  console.error(`PHASE LIVE ERROR: ${error instanceof Error ? error.stack ?? error.message : error}`);
  if (cdp) console.error(JSON.stringify({ consoleErrors: cdp.consoleErrors, pageErrors: cdp.pageErrors }));
  process.exitCode = 1;
} finally {
  try { chrome?.kill(); } catch { /* ignore */ }
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
