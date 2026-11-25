/**
 * Free browser check of the structured Test Mode path, no Kane: uploads a
 * coin-demo snapshot (with coins, as the agent would build it), opens the exact
 * URL the server gives Kane, clicks RUN STEP like Kane would, and reads the
 * OBSERVATIONS panel.
 *
 *   node --import tsx scripts/kane/test-mode-browser-check.mts [--port 9352]
 */
import { coinDemoStartDocument } from "./coin-demo-start";
import { encodeCheckSteps } from "../../shared/kane-check";

const PORT = process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : "9352";
const ORIGIN = "http://localhost:5173";

const doc = coinDemoStartDocument("Coin Demo (browser check)");
const scene = doc.scenes.find((candidate) => candidate.id === doc.startSceneId)!;
const player = scene.objects.find((object) => object.tags.includes("player"))!;
doc.variables.push({ id: "var_score", name: "score", type: "number", initial: 0, description: "Coins collected." });
doc.settings.ui.hud.push({ id: "hud_score", variable: "score", label: "SCORE", corner: "top-left", style: "text", visible: true });
for (const [index, x] of [330, 900, 1300].entries()) {
  scene.objects.push({
    id: `obj_coin_${index}`, name: `Coin ${index + 1}`, layerId: player.layerId,
    transform: { x, y: player.transform.y + 80, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    visual: { kind: "rect", width: 24, height: 24, color: "#ffd166" },
    behaviors: [{ id: `beh_${index}`, type: "collectible", enabled: true, params: { variable: "score", amount: 1 } }],
    properties: {}, tags: ["coin"],
  } as any);
}

const created = await (await fetch(`${ORIGIN}/api/snapshots`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ document: doc, assets: [], ttlHours: 1 }),
})).json() as { id: string };
const params = new URLSearchParams({ ai: "1", seed: "1234", testMode: "step", maxAdvance: "600", maxFrames: "3600", steps: encodeCheckSteps([{ control: "move-right", frames: 120 }]) });
const url = `${ORIGIN}/s/${created.id}?${params.toString()}`;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json() as Array<{ type: string; webSocketDebuggerUrl: string }>;
const ws = new WebSocket(list.find((target) => target.type === "page")!.webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));
let id = 0; const pending = new Map<number, (value: any) => void>();
ws.onmessage = (event) => { const message = JSON.parse(String(event.data)); pending.get(message.id)?.(message); pending.delete(message.id); };
const send = (method: string, params: object = {}) => new Promise<any>((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression: string) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const read = () => ev(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('[data-testid=test-observations] dl > div')].map(d=>[d.querySelector('dt').innerText, d.querySelector('dd').innerText])))`);

await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
for (let i = 0; i < 120 && !(await ev(`!!document.querySelector('[data-testid=test-run-step-1]')`)); i += 1) await sleep(500);
const label = await ev(`document.querySelector('[data-testid=test-run-step-1]')?.innerText ?? null`);
const cover = await ev(`(()=>{const b=document.querySelector('[data-testid=test-run-step-1]');const r=b.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return JSON.stringify({rect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)],viewport:[innerWidth,innerHeight],topElement:top?(top.tagName+'.'+top.className+' '+(top.getAttribute('data-testid')||'')):null,isButton:top===b||b.contains(top)})})()`);
const shotBefore: any = await Promise.race([send("Page.captureScreenshot", { format: "png" }), sleep(6000).then(() => ({}))]);
if (shotBefore.result?.data) (await import("node:fs")).writeFileSync(".data/chat-kane-proof/test-mode-before.png", Buffer.from(shotBefore.result.data, "base64"));
const before = JSON.parse(await read() ?? "{}");
await ev(`document.querySelector('[data-testid=test-run-step-1]').click()`);
const midX = []; for (let i = 0; i < 6; i += 1) { await sleep(250); midX.push(await ev(`document.querySelector('[data-testid=test-observation-player-x]')?.innerText`)); }
await sleep(2500);
const stepStatus = await ev(`document.querySelector('[data-testid=test-step-status]')?.innerText`);
const after = JSON.parse(await read() ?? "{}");
const status = await ev(`document.querySelector('[data-testid=test-hud-status]')?.innerText`);
const lastError = await ev(`document.querySelector('[data-testid=test-hud-last-error]')?.innerText`);
const afterButton = await ev(`(()=>{const b=document.querySelector('[data-testid=test-run-step-1]');return JSON.stringify({text:b.innerText,disabled:b.disabled,state:b.dataset.stepState})})()`);
console.log(JSON.stringify({ url, label, cover: JSON.parse(cover), afterButton: JSON.parse(afterButton), midX, stepStatus, before: { SCORE: before.SCORE, COIN: before["COIN COUNT"] }, after: { SCORE: after.SCORE, COIN: after["COIN COUNT"], X: after["PLAYER X"] }, status, lastError }, null, 2));
ws.close();
process.exit(0);
