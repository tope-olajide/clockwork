#!/usr/bin/env node
/**
 * Browser acceptance for the three agent surfaces that had no recorded run:
 * Ask AI selection locking, Plan-mode ghost preview, and Build-mode presence.
 *
 * Runs against `npm run dev` with whatever model the env provider resolves.
 * Writes .data/agent-ui/verify.json.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const WEB = process.env.CLOCKWORK_WEB ?? "http://localhost:5173";
const API = process.env.CLOCKWORK_API ?? "http://localhost:3000";
const CHROME = process.env.CLOCKWORK_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
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
    if (result?.exceptionDetails) throw new Error(`evaluate threw: ${JSON.stringify(result.exceptionDetails).slice(0, 500)}`);
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

  async screenshot(path) {
    const shot = await this.send("Page.captureScreenshot", { format: "png" });
    mkdirSync(join(".data", "agent-ui"), { recursive: true });
    writeFileSync(path, Buffer.from(shot.data, "base64"));
  }

  async click(selector, timeoutMs = 60000) {
    await this.waitFor(`document.querySelector(${JSON.stringify(selector)})`, timeoutMs, selector);
    await this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }

  async clickText(selector, text, timeoutMs = 30000, exact = false) {
    const matches = exact
      ? `(candidate) => candidate.textContent.trim() === ${JSON.stringify(text)}`
      : `(candidate) => candidate.textContent.trim().includes(${JSON.stringify(text)})`;
    await this.waitFor(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(${matches})`,
      timeoutMs,
      `${selector} containing ${text}`,
    );
    return this.evaluate(`(function(){
      const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(${matches});
      element.click();
      return true;
    })()`);
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

const profileDir = mkdtempSync(join(tmpdir(), "clockwork-agent-ui-"));
let chrome;
let cdp;
const record = { kind: "agent-ui-live", recordedAt: new Date().toISOString(), checks: {}, consoleErrors: [], pageErrors: [] };

try {
  await waitForHttp(`${API}/api/health`, 30000, "API");
  await waitForHttp(WEB, 30000, "web");
  chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`, "--window-size=1700,950", "about:blank",
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
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`);
      if (response.ok) {
        targets = await response.json();
        if (targets.some((target) => target.type === "page")) break;
      }
    } catch { /* not listening yet */ }
    if (Date.now() - started > 20000) throw new Error("Chrome DevTools list unavailable");
    await sleep(300);
  }
  const page = targets.find((target) => target.type === "page");
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
  await cdp.waitFor(`window.__clockwork && window.__clockwork.getState`, 30000, "debug API");

  const state = await cdp.evaluate(`window.__clockwork.getState()`);
  const target = state.objects.find((object) => /player|ship|pilot/i.test(object.name)) ?? state.objects[0];
  if (!target) throw new Error("starter has no objects");
  await cdp.evaluate(`window.__clockwork.select([${JSON.stringify(target.id)}])`);
  record.project = { projectId: state.projectId, sceneId: state.sceneId, revision: state.revision, target };

  // 1. Toolbar Ask agent opens the drawer and visibly locks the selected object.
  await cdp.click('[data-testid="agent-open"]');
  await cdp.waitFor(`document.querySelector('[aria-label="Agent chat"]')`, 20000, "agent drawer");
  await cdp.waitFor(`document.querySelector('[data-testid="locked-selection"]')`, 10000, "locked selection chip");
  record.checks.askLock = await cdp.evaluate(`(function(){
    const chip = document.querySelector('[data-testid="locked-selection"]');
    const mode = Array.from(document.querySelectorAll('.chat-mode-switch [role="tab"]')).find((tab) => tab.getAttribute('aria-selected') === 'true');
    return { chip: chip.textContent.trim(), mode: mode ? mode.textContent.trim() : null, selection: window.__clockwork.getState().selection };
  })()`);
  await cdp.evaluate(`document.querySelector('[aria-label="Close agent"]').click()`);

  // 2. Ask AI from the inspector uses Ask mode and keeps the lock.
  await cdp.waitFor(`document.querySelector('[data-testid="ask-ai"]')`, 20000, "inspector Ask AI");
  await cdp.click('[data-testid="ask-ai"]');
  await cdp.waitFor(`document.querySelector('[data-testid="locked-selection"]')`, 10000, "inspector locked chip");
  record.checks.inspectorAsk = await cdp.evaluate(`(function(){
    const mode = Array.from(document.querySelectorAll('.chat-mode-switch [role="tab"]')).find((tab) => tab.getAttribute('aria-selected') === 'true');
    return { mode: mode ? mode.textContent.trim() : null, chip: document.querySelector('[data-testid="locked-selection"]').textContent.trim() };
  })()`);
  await cdp.evaluate(`document.querySelector('[aria-label="Close agent"]').click()`);

  // 3. Plan mode preview -> ghost pill -> Apply applies exactly one revision.
  await cdp.click('[data-testid="agent-open"]');
  await cdp.waitFor(`document.querySelector('[aria-label="Agent chat"]')`, 20000, "plan drawer");
  await cdp.clickText('[role="tab"]', "Plan", 20000, true);
  await cdp.evaluate(`(function(){
    const input = document.querySelector('[data-testid="agent-input"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, 'Use preview_commands to move the selected object 40 units to the right. Do not apply anything.');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await cdp.waitFor(`document.querySelector('.chat-mode-switch [role="tab"][aria-selected="true"]')?.textContent.trim() === 'Plan'`, 15000, "Plan mode selected");
  const inputValue = await cdp.evaluate(`document.querySelector('[data-testid="agent-input"]').value`);
  if (!inputValue.includes("preview_commands")) throw new Error("plan prompt was not written to the composer");
  const revisionBeforePlan = (await cdp.evaluate(`window.__clockwork.getState()`)).revision;
  await cdp.click('[data-testid="agent-send"]');
  await cdp.waitFor(
    `document.querySelector('[data-testid="plan-preview-pill"]') || document.querySelector('.chat-error-card') || document.querySelector('[data-testid="agent-presence-pill"]')`,
    150000,
    "plan preview or agent error",
  );
  record.checks.planPreview = await cdp.evaluate(`(function(){
    const pill = document.querySelector('[data-testid="plan-preview-pill"]');
    const error = document.querySelector('.chat-error-card');
    const debug = window.__clockwork.getState();
    return {
      pill: pill ? pill.textContent.trim() : null,
      ghost: debug.agentGhost ? { changed: debug.agentGhost.changedIds, deleted: debug.agentGhost.deletedIds, label: debug.agentGhost.label } : null,
      pending: debug.pendingPreview,
      error: error ? error.textContent.trim().slice(0, 300) : null,
      revision: debug.revision,
    };
  })()`);
  if (record.checks.planPreview.pill) {
    await cdp.screenshot(join(".data", "agent-ui", "plan-ghost.png"));
    await cdp.evaluate(`Array.from(document.querySelectorAll('[data-testid="pan-preview-pill"] button, [data-testid="plan-preview-pill"] button')).find((button) => button.textContent.trim() === 'Apply').click()`);
    await cdp.waitFor(`window.__clockwork.getState().revision > ${revisionBeforePlan}`, 20000, "preview applied");
    record.checks.planApply = await cdp.evaluate(`(function(){
      const debug = window.__clockwork.getState();
      return { revision: debug.revision, ghost: debug.agentGhost, pending: debug.pendingPreview, pillGone: !document.querySelector('[data-testid="plan-preview-pill"]') };
    })()`);
  }
  await cdp.evaluate(`document.querySelector('[aria-label="Close agent"]').click()`);

  // 4. Build mode applies immediately and shows presence, then clears it.
  await cdp.clickText('[data-testid="agent-open"]', "Ask agent");
  await cdp.waitFor(`document.querySelector('[aria-label="Agent chat"]')`, 20000, "build drawer");
  await cdp.clickText('[role="tab"]', "Build");
  await cdp.evaluate(`(function(){
    const input = document.querySelector('[data-testid="agent-input"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, 'Use apply_commands to move the selected object 30 units to the right.');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const revisionBeforeBuild = (await cdp.evaluate(`window.__clockwork.getState()`)).revision;
  await cdp.click('[data-testid="agent-send"]');
  await cdp.waitFor(
    `document.querySelector('[data-testid="agent-presence-pill"]') || document.querySelector('.chat-error-card') || document.querySelector('[data-testid="plan-preview-pill"]')`,
    90000,
    "presence or agent error",
  );
  record.checks.presence = await cdp.evaluate(`(function(){
    const pill = document.querySelector('[data-testid="agent-presence-pill"]');
    const debug = window.__clockwork.getState();
    return {
      pill: pill ? pill.textContent.trim() : null,
      presence: debug.agentPresence ? { ids: debug.agentPresence.objectIds, label: debug.agentPresence.label } : null,
      revision: debug.revision,
      selection: debug.selection,
      error: document.querySelector('.chat-error-card')?.textContent.trim().slice(0, 300) ?? null,
    };
  })()`);
  await cdp.screenshot(join(".data", "agent-ui", "presence.png"));
  await sleep(3200);
  record.checks.presenceCleared = await cdp.evaluate(`(function(){
    return { pillGone: !document.querySelector('[data-testid="agent-presence-pill"]'), presence: window.__clockwork.getState().agentPresence };
  })()`);
  record.checks.buildApplied = { revisionBeforeBuild, revisionAfterBuild: (await cdp.evaluate(`window.__clockwork.getState()`)).revision };

  record.consoleErrors = cdp.consoleErrors.filter((error) => !/favicon/i.test(error));
  record.pageErrors = cdp.pageErrors;
  mkdirSync(".data/agent-ui", { recursive: true });
  writeFileSync(join(".data", "agent-ui", "verify.json"), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));

  const ok =
    record.checks.askLock?.selection?.[0] === target.id &&
    record.checks.inspectorAsk?.mode === "Ask" &&
    record.checks.planPreview?.ghost?.changed?.length > 0 &&
    record.checks.planApply?.pillGone === true &&
    record.checks.presence?.presence?.ids?.length > 0 &&
    record.checks.presenceCleared?.pillGone === true &&
    record.checks.buildApplied.revisionAfterBuild > revisionBeforeBuild &&
    record.consoleErrors.length === 0 &&
    record.pageErrors.length === 0;
  if (!ok) process.exitCode = 2;
} catch (error) {
  console.error(`AGENT UI ERROR: ${error instanceof Error ? error.stack ?? error.message : error}`);
  record.error = error instanceof Error ? error.message : String(error);
  if (cdp) {
    record.consoleErrors = cdp.consoleErrors.filter((entry) => !/favicon/i.test(entry));
    record.pageErrors = cdp.pageErrors;
    try {
      record.debugAtFailure = await cdp.evaluate(`(function(){
        const state = window.__clockwork && window.__clockwork.getState ? window.__clockwork.getState() : null;
        const chat = document.querySelector('[aria-label="Agent chat"]');
        const activeMode = Array.from(document.querySelectorAll('.chat-mode-switch [role="tab"]')).find((tab) => tab.getAttribute('aria-selected') === 'true');
        return {
          agentMode: activeMode ? activeMode.textContent.trim() : state?.agentMode ?? null,
          pending: state?.pendingPreview ?? null,
          presence: state?.agentPresence ?? null,
          ghost: state?.agentGhost ? { changed: state.agentGhost.changedIds } : null,
          chat: chat ? chat.textContent.slice(0, 1200) : null,
          errorCard: document.querySelector('.chat-error-card')?.textContent.trim().slice(0, 400) ?? null,
        };
      })()`);
    } catch { /* page may be gone */ }
  }
  mkdirSync(".data/agent-ui", { recursive: true });
  writeFileSync(join(".data", "agent-ui", "verify.json"), JSON.stringify(record, null, 2));
  process.exitCode = 1;
} finally {
  try { chrome?.kill(); } catch { /* ignore */ }
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
