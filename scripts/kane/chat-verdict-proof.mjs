#!/usr/bin/env node
/**
 * Controlled chat -> verify_with_kane -> Kane CLI proof. Sends two chat
 * messages through the real Clockwork chat UI, each asking the agent to run one
 * verbatim objective, and records what the UI and the server produced.
 *
 *   Test A: assert STATUS is "PLAYING"            -> expected PASSED
 *   Test B: assert STATUS is "ZZ-IMPOSSIBLE-4471" -> expected FAILED
 *
 * Needs: npm run dev, a tool-capable model, a signed-in Kane CLI, and Chrome
 * started with --remote-debugging-port. Each test is one real Kane run; the
 * script never retries.
 *
 *   node scripts/kane/chat-verdict-proof.mjs [--port 9352] [--only A|B]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const PORT = flag("port", "9352");
const ORIGIN = flag("origin", "http://localhost:5173");
const ONLY = flag("only", "");
const OUT = join(process.cwd(), ".data", "chat-kane-proof", "verdicts");
mkdirSync(OUT, { recursive: true });

const TESTS = [
  { id: "A", expected: "passed", objective: "Open the game from its start state. Do not press RESTART or retry. Store the STATUS value from the AI state panel as 'status'. Assert the stored status is \"PLAYING\"." },
  { id: "B", expected: "failed", objective: "Open the game from its start state. Do not press RESTART or retry. Store the STATUS value from the AI state panel as 'status'. Assert the stored status is \"ZZ-IMPOSSIBLE-4471\"." },
].filter((test) => !ONLY || test.id === ONLY);

const message = (objective) => `Verify with Kane. Call verify_with_kane once with only the objective field set to exactly this text, unchanged:\n\n${objective}`;

const log = (text) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  if (r.result?.exceptionDetails) return null;
  return r.result?.result?.value;
};
const click = (sel) => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return false;el.click();return true})()`);
const exists = (sel) => ev(`!!document.querySelector(${JSON.stringify(sel)})`);
const waitFor = async (sel, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await exists(sel)) return true; await sleep(300); } return false; };
const skipTours = async () => { for (let i = 0; i < 4; i += 1) { if (!(await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Skip');if(!b)return false;b.click();return true})()`))) break; await sleep(400); } };

await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: `${ORIGIN}/?demoReset=1` });
if (!(await waitFor('[aria-label="Open Neon Runner"]', 120000))) throw new Error("Projects page did not load.");
await sleep(1000); await skipTours();
await click('[aria-label="Open Neon Runner"]');
if (!(await waitFor('[data-testid="agent-open"]', 40000))) throw new Error("Editor did not open.");
await sleep(2500); await skipTours();
for (let i = 0; i < 4 && !(await exists('[data-testid="agent-input"]')); i += 1) { await click('[data-testid="agent-open"]'); await sleep(1500); }
await ev(`[...document.querySelectorAll('.chat-mode-switch [role=tab]')].find((b)=>b.textContent.trim()==='Build')?.click()`);
await sleep(500);
log("chat open (Build mode)");

const summary = [];
for (const test of TESTS) {
  const before = await ev(`document.querySelectorAll('.chat-tool').length`);
  await ev(`(()=>{const el=document.querySelector('[data-testid="agent-input"]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(el,${JSON.stringify(message(test.objective))});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(300);
  await click('[data-testid="agent-send"]');
  const t0 = Date.now();
  log(`[${test.id}] sent`);
  const progress = [];
  let last = "";
  let idle = 0;
  while (Date.now() - t0 < 420_000) {
    await sleep(2000);
    const s = JSON.parse(await ev(`JSON.stringify({
      busy: !!document.querySelector('[data-testid="agent-stop"]'),
      tools: [...document.querySelectorAll('.chat-tool')].slice(${before}).map(t=>({label:t.querySelector('.chat-tool-label')?.innerText, status:t.querySelector('.chat-tool-status')?.innerText})),
      step: document.querySelector('[data-testid="kane-progress-step"]')?.innerText ?? null,
    })`) ?? "{}");
    if (s.step && s.step !== last) { last = s.step; progress.push({ atS: Math.round((Date.now() - t0) / 1000), step: s.step }); log(`[${test.id}] t+${progress.at(-1).atS}s ${s.step}`); }
    if (!s.busy && (s.tools?.length ?? 0) > 0) idle += 1; else idle = 0;
    if (idle >= 2) break;
  }
  await ev(`[...document.querySelectorAll('.chat-tool')].slice(${before}).forEach(t=>{const h=t.querySelector('.chat-tool-head');if(h&&h.getAttribute('aria-expanded')==='false')h.click()})`);
  await sleep(400);
  const record = JSON.parse(await ev(`JSON.stringify({
    toolNames: [...document.querySelectorAll('.chat-tool')].slice(${before}).map(t=>t.querySelector('.chat-tool-label')?.innerText),
    bodies: [...document.querySelectorAll('.chat-tool')].slice(${before}).map(t=>[...t.querySelectorAll('.chat-tool-body pre')].map(p=>p.innerText)),
    verdicts: [...document.querySelectorAll('.chat-tool')].slice(${before}).map(t=>t.querySelector('[data-testid="verdict-badge"]')?.innerText ?? null),
    reply: (()=>{const rows=[...document.querySelectorAll('.chat-row-assistant')];return rows.length?rows[rows.length-1].innerText:null})(),
  })`) ?? "{}");
  let toolArgs = null; let toolResult = null;
  try { toolArgs = JSON.parse(record.bodies?.[0]?.[0] ?? "null"); toolResult = JSON.parse(record.bodies?.[0]?.[1] ?? "null"); } catch { /* recorded raw below */ }
  const runId = toolResult?.data?.runId ?? null;
  const dir = runId ? join(process.cwd(), ".data", "ai-play", runId) : null;
  const read = (file) => (dir && existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : null);
  const out = {
    test: test.id,
    expected: test.expected,
    wallSeconds: Math.round((Date.now() - t0) / 1000),
    toolNames: record.toolNames,
    objectiveSentVerbatim: toolArgs?.objective === test.objective,
    toolArgs,
    verdict: toolResult?.data?.status ?? null,
    uiVerdict: record.verdicts?.[0] ?? null,
    toolResult: toolResult?.data ?? toolResult,
    progress,
    reply: record.reply,
    server: {
      result: read("result.json") ? JSON.parse(read("result.json")) : null,
      lifecycle: read("lifecycle.json") ? JSON.parse(read("lifecycle.json")) : null,
      rawRunEnd: (read("raw.ndjson") ?? "").split("\n").filter((line) => line.includes('"type":"run_end"')).map((line) => JSON.parse(line)).map(({ type, status, reason, duration, final_state }) => ({ type, status, reason, duration, final_state }))[0] ?? null,
      evidence: dir ? existsSync(join(dir, "evidence.evidence")) : false,
    },
  };
  writeFileSync(join(OUT, `test-${test.id}.json`), JSON.stringify(out, null, 2));
  log(`[${test.id}] verdict=${out.verdict} ui=${out.uiVerdict} expected=${test.expected} wall=${out.wallSeconds}s runId=${runId}`);
  summary.push({ test: test.id, expected: test.expected, verdict: out.verdict, wallSeconds: out.wallSeconds, runId });
}
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
ws.close();
process.exit(0);
