#!/usr/bin/env node
/**
 * Drives the real Clockwork chat UI over Chrome DevTools to prove the
 * chat -> verify_with_kane -> Kane CLI handshake. Nothing here is mocked: it
 * needs the dev server (npm run dev), a tool-capable model, and a signed-in
 * Kane CLI. It records what the UI showed, not what we hoped it would show.
 *
 *   chrome --remote-debugging-port=9352 --user-data-dir=<tmp> about:blank
 *   node scripts/kane/chat-proof.mjs [--port 9352] [--origin http://localhost:5173] [--only happy|negative]
 *
 * Output: .data/chat-kane-proof/{happy,negative}.json and screenshots.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const PORT = flag("port", "9352");
const ORIGIN = flag("origin", "http://localhost:5173");
const ONLY = flag("only", "");
const PROJECT = flag("project", "meadow");
const OUT = join(process.cwd(), ".data", "chat-kane-proof");
mkdirSync(OUT, { recursive: true });

const HAPPY = "Open the current scene from its start state. Do not press RESTART or retry. Click \"MOVE RIGHT\" once. Wait 3 seconds. Store the STATUS value from the AI state panel as 'status', store the LAST ERROR value as 'last_error'. Assert the stored last_error is \"none\".";
// Deliberately unsatisfiable: STATUS never reads this value. A pass here would mean the integration is a rubber stamp.
const NEGATIVE = "Open the current scene from its start state. Do not press RESTART or retry. Click \"MOVE RIGHT\" once. Wait 3 seconds. Store the STATUS value from the AI state panel as 'status'. Assert the stored status is \"ZZ-IMPOSSIBLE-4471\".";

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === "page");
if (!page) throw new Error("No Chrome page target found.");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Screenshots can stall when the Chrome window is occluded; never let one block the proof.
const shot = async (name) => {
  const r = await Promise.race([send("Page.captureScreenshot", { format: "png" }), sleep(8000).then(() => ({}))]);
  if (r.result?.data) writeFileSync(join(OUT, name), Buffer.from(r.result.data, "base64"));
};
const click = (selector) => ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.click();return true})()`);
const exists = (selector) => ev(`!!document.querySelector(${JSON.stringify(selector)})`);
const setValue = (selector, value) => ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return 'missing';
const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return el.value.length})()`);
const waitFor = async (selector, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await exists(selector)) return true; await sleep(300); }
  return false;
};
const skipTours = async () => {
  for (let i = 0; i < 4; i += 1) {
    const d = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Skip');if(!b)return false;b.click();return true})()`);
    if (!d) break;
    await sleep(400);
  }
};

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 950, deviceScaleFactor: 1, mobile: false });

const log = (m) => console.log(`[proof] ${m}`);
async function openMeadows() {
  log("navigating");
  await send("Page.navigate", { url: ORIGIN + "/?demoReset=1" });
  await waitFor('[data-testid="project-new"]', 40000);
  await sleep(1500);
  await skipTours();
  if (PROJECT === "neon") {
    await waitFor('[aria-label="Open Neon Runner"]', 30000);
    if (!(await click('[aria-label="Open Neon Runner"]'))) throw new Error("Neon Runner card not found.");
    if (!(await waitFor('[data-testid="agent-open"]', 40000))) throw new Error("Editor did not open.");
    await sleep(2500); await skipTours(); return;
  }
  if (!(await click('[data-testid="project-new"]')) && !(await click('[data-testid="project-new-empty"]'))) { await shot("debug-projects.png"); throw new Error("New project button not found."); }
  await sleep(600);
  await click('[data-testid="project-mode-template"]');
  await sleep(600);
  if (!(await click('[data-testid="game-starter-meadow-run"]'))) throw new Error("Clockwork Meadows starter card not found.");
  await sleep(300);
  await click('[data-testid="project-create"]');
  const inEditor = await waitFor('[data-testid="agent-open"]', 40000);
  if (!inEditor) throw new Error("Editor did not open.");
  await sleep(2500);
  await skipTours();
}

async function openDrawer() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await exists('[data-testid="agent-input"]')) return;
    await click('[data-testid="agent-open"]');
    await sleep(1500);
  }
  if (!(await exists('[data-testid="agent-input"]'))) throw new Error("Agent drawer did not open.");
}

async function runKane(label, objective) {
  const record = { label, objective, startedAt: new Date().toISOString(), progress: [] };
  record.buttonPresent = await exists('[data-testid="agent-kane-test"]');
  await click('[data-testid="agent-kane-test"]');
  await sleep(500);
  record.sheetOpen = await exists('[data-testid="kane-test-sheet"]');
  record.defaultObjective = await ev(`document.querySelector('[data-testid="kane-objective"]')?.value ?? null`);
  record.unavailableReason = await ev(`document.querySelector('[data-testid="kane-unavailable"]')?.innerText ?? null`);
  await setValue('[data-testid="kane-objective"]', objective);
  await sleep(300);
  await shot(`${label}-sheet.png`);
  // Earlier runs leave their cards in the chat; only count what this run adds.
  const badgesBefore = await ev(`document.querySelectorAll('[data-testid="verdict-badge"]').length`);
  record.runClicked = await click('[data-testid="kane-run"]');

  const t0 = Date.now();
  let lastStep = "";
  let verdictSeen = false;
  let idle = 0;
  for (let i = 0; i < 160; i += 1) {
    await sleep(2500);
    const snap = JSON.parse(await ev(`JSON.stringify({
      step: document.querySelector('[data-testid="kane-progress-step"]')?.innerText ?? null,
      time: document.querySelector('[data-testid="kane-progress-time"]')?.innerText ?? null,
      stop: !!document.querySelector('[data-testid="kane-progress-stop"]'),
      verdict: document.querySelectorAll('[data-testid="verdict-badge"]')[${badgesBefore}]?.innerText ?? null,
      busy: !!document.querySelector('[data-testid="agent-stop"]'),
    })`) ?? "{}");
    const elapsed = Math.round((Date.now() - t0) / 1000);
    if (snap.step && snap.step !== lastStep) {
      lastStep = snap.step;
      record.progress.push({ atSeconds: elapsed, step: snap.step, clock: snap.time, stopVisible: snap.stop });
      console.log(`[${label}] t+${elapsed}s ${snap.step} (${snap.time})`);
      if (record.progress.length === 1) await shot(`${label}-progress.png`);
    }
    if (snap.verdict) verdictSeen = true;
    if (verdictSeen && !snap.busy) idle += 1; else idle = 0;
    if (idle >= 2) break;
  }
  record.elapsedSeconds = Math.round((Date.now() - t0) / 1000);

  // Expand every Kane card so the typed tool arguments and result are captured from the UI.
  await ev(`document.querySelectorAll('.chat-tool-head').forEach((b)=>{ if(b.getAttribute('aria-expanded')==='false') b.click(); })`);
  await sleep(500);
  record.cards = await ev(`[...document.querySelectorAll('[data-testid="kane-run-card"], [data-testid="kane-run-card-error"], [data-testid="kane-run-card-canceled"]')].slice(${badgesBefore}).map(c=>c.innerText)`);
  record.verdicts = await ev(`[...document.querySelectorAll('[data-testid="verdict-badge"]')].slice(${badgesBefore}).map(e=>e.innerText)`);
  record.evidenceLinks = await ev(`[...document.querySelectorAll('[data-testid="kane-run-card"] a')].map(a=>a.getAttribute('href')).slice(-1)`);
  record.toolBodies = await ev(`[...document.querySelectorAll('.chat-tool.done .chat-tool-body pre, .chat-tool.error .chat-tool-body pre')].map(p=>p.innerText.slice(0,3500))`);
  record.reply = await ev(`(()=>{const rows=[...document.querySelectorAll('.chat-row-assistant')];return rows.length?rows[rows.length-1].innerText:null})()`);
  await shot(`${label}-result.png`);
  record.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, `${label}.json`), JSON.stringify(record, null, 2));
  console.log(`[${label}] verdicts=${JSON.stringify(record.verdicts)} elapsed=${record.elapsedSeconds}s`);
  return record;
}

await openMeadows(); log("project open");
await openDrawer(); log("drawer open");
await ev(`[...document.querySelectorAll('.chat-mode-switch [role=tab]')].find((b)=>b.textContent.trim()==='Build')?.click()`);

if (ONLY !== "negative") await runKane("happy", HAPPY);
if (ONLY !== "happy") {
  await sleep(1500);
  await runKane("negative", NEGATIVE);
}
ws.close();
