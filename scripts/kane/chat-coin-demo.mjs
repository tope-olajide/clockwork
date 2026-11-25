#!/usr/bin/env node
/**
 * The coin demo, end to end through the real chat UI:
 *   1. import the coin-free platformer (scripts/kane/fixtures/coin-demo-start.clockwork.json)
 *   2. message 1: the agent adds coins, a score and a HUD widget
 *   3. message 2: the agent tests it with Kane (simulator first, then one Kane run)
 * Records every tool call, the verdict, the per-readout table and the replies.
 * Never retries; the per-message Kane budget is enforced by the app.
 *
 *   node scripts/kane/chat-coin-demo.mjs [--port 9352]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const PORT = argv.includes("--port") ? argv[argv.indexOf("--port") + 1] : "9352";
const ORIGIN = "http://localhost:5173";
const OUT = join(process.cwd(), ".data", "chat-kane-proof", "coin-demo");
const FIXTURE = resolve("scripts/kane/fixtures/coin-demo-start.clockwork.json");
mkdirSync(OUT, { recursive: true });

const MESSAGES = [
  "Add collectible coins along the player's path. When the player touches a coin, it should disappear and the score should increase by one. Display the score in the HUD.",
  "Test the coin collection mechanic with Kane. Verify that collecting a coin increases the score and that the coin disappears.",
];

const log = (text) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? null : r.result?.result?.value; };
const click = (sel) => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return false;el.click();return true})()`);
const exists = (sel) => ev(`!!document.querySelector(${JSON.stringify(sel)})`);
const waitFor = async (sel, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await exists(sel)) return true; await sleep(300); } return false; };
const skipTours = async () => { for (let i = 0; i < 4; i += 1) { if (!(await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Skip');if(!b)return false;b.click();return true})()`))) break; await sleep(400); } };
const shot = async (name) => { const r = await Promise.race([send("Page.captureScreenshot", { format: "png" }), sleep(8000).then(() => ({}))]); if (r.result?.data) writeFileSync(join(OUT, name), Buffer.from(r.result.data, "base64")); };

await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
await send("Page.navigate", { url: `${ORIGIN}/` });
if (!(await waitFor('[data-testid="project-new"], [data-testid="project-new-empty"]', 120000))) throw new Error("Projects page did not load.");
await sleep(1000); await skipTours();
if (!(await click('[data-testid="project-new"]'))) await click('[data-testid="project-new-empty"]');
await sleep(600);
await click('[data-testid="project-mode-import"]');
await sleep(600);
const { result: { root } } = await send("DOM.getDocument", { depth: -1 });
const { result: { nodeId } } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"][accept*="json"]' });
await send("DOM.setFileInputFiles", { nodeId, files: [FIXTURE] });
await sleep(800);
await click('[data-testid="project-create"]');
if (!(await waitFor('[data-testid="agent-open"]', 60000))) throw new Error("Editor did not open after import.");
await sleep(2500); await skipTours();
for (let i = 0; i < 4 && !(await exists('[data-testid="agent-input"]')); i += 1) { await click('[data-testid="agent-open"]'); await sleep(1500); }
// The project's previous conversation is restored on open; start clean.
await click('[aria-label="New chat"]');
await sleep(800);
await ev(`[...document.querySelectorAll('.chat-mode-switch [role=tab]')].find((b)=>b.textContent.trim()==='Build')?.click()`);
await sleep(500);
log(`imported coin-free platformer: ${await ev("location.pathname")}; objects=${await ev("document.querySelector('.chat-context-meta')?.innerText")}`);

const turns = [];
for (const [index, text] of MESSAGES.entries()) {
  const before = await ev(`document.querySelectorAll('.chat-tool').length`);
  await ev(`(()=>{const el=document.querySelector('[data-testid="agent-input"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(300);
  await click('[data-testid="agent-send"]');
  const t0 = Date.now();
  log(`[msg ${index + 1}] sent`);
  let last = ""; let idle = 0;
  while (Date.now() - t0 < 600_000) {
    await sleep(2000);
    const s = JSON.parse(await ev(`JSON.stringify({
      busy: !!document.querySelector('[data-testid="agent-stop"]'),
      tools: [...document.querySelectorAll('.chat-tool')].slice(${before}).map(t=>t.querySelector('.chat-tool-label')?.innerText+':'+t.querySelector('.chat-tool-status')?.innerText).join(' | '),
      step: document.querySelector('[data-testid="kane-progress-step"]')?.innerText ?? null,
    })`) ?? "{}");
    const line = `${s.tools} ${s.step ?? ""}`;
    if (line !== last) { last = line; log(`[msg ${index + 1}] t+${Math.round((Date.now() - t0) / 1000)}s ${line}`); }
    if (!s.busy) idle += 1; else idle = 0;
    if (idle >= 3) break;
  }
  await ev(`[...document.querySelectorAll('.chat-tool')].slice(${before}).forEach(t=>{const h=t.querySelector('.chat-tool-head');if(h&&h.getAttribute('aria-expanded')==='false')h.click()})`);
  await sleep(400);
  const record = JSON.parse(await ev(`JSON.stringify({
    tools: [...document.querySelectorAll('.chat-tool')].slice(${before}).map(t=>({ name: t.querySelector('.chat-tool-label')?.innerText, status: t.querySelector('.chat-tool-status')?.innerText, bodies: [...t.querySelectorAll('.chat-tool-body pre')].map(p=>p.innerText) })),
    reply: (()=>{const rows=[...document.querySelectorAll('.chat-row-assistant')];return rows.length?rows[rows.length-1].innerText:null})(),
  })`) ?? "{}");
  const tools = (record.tools ?? []).map((tool) => {
    let args = null; let result = null;
    try { args = JSON.parse(tool.bodies[0]); } catch { args = tool.bodies[0] ?? null; }
    try { result = JSON.parse(tool.bodies[1]); } catch { result = tool.bodies[1] ?? null; }
    return { name: tool.name, status: tool.status, args, result };
  });
  await shot(`msg-${index + 1}.png`);
  turns.push({ message: text, wallSeconds: Math.round((Date.now() - t0) / 1000), tools, reply: record.reply });
  log(`[msg ${index + 1}] done in ${turns.at(-1).wallSeconds}s, ${tools.length} tool calls`);
}

const kaneCalls = turns[1].tools.filter((tool) => tool.name === "Verifying with Kane");
const runIds = kaneCalls.map((tool) => tool.result?.data?.kane?.runId).filter(Boolean);
const server = runIds.map((runId) => {
  const dir = join(process.cwd(), ".data", "ai-play", runId);
  const read = (file) => (existsSync(join(dir, file)) ? JSON.parse(readFileSync(join(dir, file), "utf8")) : null);
  return { runId, result: read("result.json"), lifecycle: read("lifecycle.json"), check: read("check.json"), evidence: existsSync(join(dir, "evidence.evidence")) };
});
writeFileSync(join(OUT, "demo.json"), JSON.stringify({ turns, server }, null, 2));
log(`Kane tool calls: ${kaneCalls.length}; statuses: ${kaneCalls.map((tool) => `${tool.result?.data?.stage}:${tool.result?.data?.status ?? tool.result?.error}`).join(", ")}`);
ws.close();
process.exit(0);
