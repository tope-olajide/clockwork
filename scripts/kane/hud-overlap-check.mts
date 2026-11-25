/**
 * Layout regression check for every HUD Kane clicks or reads.
 *
 * For every template x every snapshot-player mode x two viewport sizes, it
 * opens the real page in Chrome and fails if:
 *   1. any button or input is covered (hit-tested at its centre and 4 inset
 *      points: the element under each point must be the control itself), or
 *   2. any two HUD panels intersect (AI/Test readouts, control groups, the
 *      game's own HUD widgets, the "Made with Clockwork" badge, the
 *      PAUSED/Restart pill).
 *
 * Needs the dev server (npm run dev) and Chrome with remote debugging:
 *   chrome --remote-debugging-port=9352 --user-data-dir=<tmp> about:blank
 *   npm run test:hud            # or: node --import tsx scripts/kane/hud-overlap-check.mts
 * Exits 1 with a list of every collision; writes .data/hud-overlap/report.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_ORIGINS, type TemplateOrigin } from "../../src/engine/model/schema";
import { createProjectFromTemplate } from "../../src/engine/model/templates";
import { gameTestProfileForDocument } from "../../src/engine/model/game-test-profile";
import { encodeCheckSteps } from "../../shared/kane-check";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1]! : fallback);
const PORT = flag("port", "9352");
const ORIGIN = flag("origin", "http://localhost:5173");
const ONLY = flag("only", "");
const OUT = join(process.cwd(), ".data", "hud-overlap");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1024, height: 640 },
];

type Mode = "realtime" | "test-manual" | "test-check";

const templates = (TEMPLATE_ORIGINS as readonly TemplateOrigin[])
  .filter((origin) => origin !== "brief" && origin !== "import")
  .filter((origin) => !ONLY || ONLY.split(",").includes(origin));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json() as Array<{ type: string; webSocketDebuggerUrl: string }>;
const target = list.find((entry) => entry.type === "page");
if (!target) throw new Error(`No Chrome page on port ${PORT}.`);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));
let id = 0;
const pending = new Map<number, (value: any) => void>();
ws.onmessage = (event) => { const message = JSON.parse(String(event.data)); pending.get(message.id)?.(message); pending.delete(message.id); };
const send = (method: string, params: object = {}) => new Promise<any>((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ev = async (expression: string) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send("Page.enable");
await send("Runtime.enable");

/** Runs in the page: returns every collision as text. */
const MEASURE = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const name = (el) => (el.getAttribute("data-testid") || el.getAttribute("aria-label") || el.className || el.tagName).toString().slice(0, 60);
  const problems = [];
  const hud = document.querySelector('[data-testid="ai-play-hud"], [data-testid="test-mode-hud"]');
  if (!hud) return JSON.stringify({ problems: ["no AI/Test HUD rendered"], controls: 0, panels: 0 });
  const controls = [...document.querySelectorAll('.snapshot-player button, .snapshot-player input, .snapshot-player a.snapshot-badge')].filter(visible);
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) { problems.push("off-screen: " + name(el)); continue; }
    // Centre plus the midpoints of each edge, inset so they stay inside rounded
    // shapes (corner points fall outside a pill and report false "covered").
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    const ix = Math.min(r.height / 2, r.width / 4); const iy = Math.min(3, r.height / 4);
    const points = [[cx, cy], [r.left + ix, cy], [r.right - ix, cy], [cx, r.top + iy], [cx, r.bottom - iy]];
    for (const [x, y] of points) {
      const top = document.elementFromPoint(x, y);
      if (top !== el && !el.contains(top)) { problems.push("covered: " + name(el) + " by " + (top ? name(top) : "nothing")); break; }
    }
  }
  const panels = [...document.querySelectorAll('.ai-hud-readout, .ai-hud-controls, .play-hud-widget, .snapshot-badge, .snapshot-controls, .play-message')]
    .filter(visible)
    .filter((el) => !el.parentElement || !el.parentElement.closest('.ai-hud-readout, .ai-hud-controls'));
  for (let i = 0; i < panels.length; i += 1) {
    for (let j = i + 1; j < panels.length; j += 1) {
      const a = panels[i].getBoundingClientRect(); const b = panels[j].getBoundingClientRect();
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 1 && overlapY > 1) problems.push("panels overlap: " + name(panels[i]) + " x " + name(panels[j]));
    }
  }
  return JSON.stringify({ problems, controls: controls.length, panels: panels.length });
})()`;

interface Row { template: string; mode: Mode; viewport: string; controls: number; panels: number; problems: string[] }
const rows: Row[] = [];

for (const template of templates) {
  const document = createProjectFromTemplate(template as Exclude<TemplateOrigin, "brief" | "import">, `HUD ${template}`);
  const profile = gameTestProfileForDocument(document);
  const created = await (await fetch(`${ORIGIN}/api/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document, assets: [], ttlHours: 1 }),
  })).json() as { id: string };
  const hold = profile.controls.find((control) => control.mode === "hold") ?? profile.controls[0]!;
  const press = profile.controls.find((control) => control.mode === "pulse");
  const steps = encodeCheckSteps([
    { control: hold.id, frames: 60 },
    ...(press ? [{ control: press.id, frames: 30 }] : []),
    { control: "wait", frames: 30 },
  ]);
  const urls: Record<Mode, string> = {
    realtime: `${ORIGIN}/s/${created.id}?ai=1&seed=1234`,
    "test-manual": `${ORIGIN}/s/${created.id}?ai=1&seed=1234&testMode=step`,
    "test-check": `${ORIGIN}/s/${created.id}?ai=1&seed=1234&testMode=step&steps=${encodeURIComponent(steps)}`,
  };
  for (const mode of Object.keys(urls) as Mode[]) {
    await send("Emulation.setDeviceMetricsOverride", { ...VIEWPORTS[0], deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: urls[mode] });
    for (let i = 0; i < 60 && !(await ev(`!!document.querySelector('[data-testid="ai-play-hud"], [data-testid="test-mode-hud"]')`)); i += 1) await sleep(250);
    for (const viewport of VIEWPORTS) {
      await send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await sleep(350);
      const measured = JSON.parse((await ev(MEASURE)) ?? '{"problems":["measure failed"],"controls":0,"panels":0}');
      const row: Row = { template, mode, viewport: `${viewport.width}x${viewport.height}`, ...measured };
      rows.push(row);
      console.log(`${row.problems.length ? "FAIL" : "ok  "} ${template.padEnd(16)} ${mode.padEnd(12)} ${row.viewport}  controls=${row.controls} panels=${row.panels}${row.problems.length ? `\n       ${row.problems.join("\n       ")}` : ""}`);
    }
  }
}

writeFileSync(join(OUT, "report.json"), JSON.stringify(rows, null, 2));
const failed = rows.filter((row) => row.problems.length);
console.log(`\n${rows.length - failed.length}/${rows.length} layouts clean.`);
ws.close();
process.exit(failed.length ? 1 : 0);
