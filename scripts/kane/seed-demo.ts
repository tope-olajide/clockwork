/**
 * Seeds a deterministic Neon Runner snapshot for Kane development checks.
 * This is not the product path: the editor creates snapshots through the Ship
 * panel/AI Play controller. Run with `node node_modules/tsx/dist/cli.mjs scripts/kane/seed-demo.ts`.
 */
import { createProjectFromTemplate } from "../../src/engine/model/templates";

const base = process.env.CLOCKWORK_ORIGIN || "http://localhost:3000";
const document = createProjectFromTemplate("platformer", "Neon Runner");
const scene = document.scenes.find((candidate) => candidate.id === document.startSceneId) ?? document.scenes[0];
const coin = scene?.objects.find((object) => object.name === "Core B");
if (coin) {
  coin.transform.x = 1080;
  coin.transform.y = 566;
}
const widget = document.settings.ui.hud.find((item) => item.variable === "coins");
if (widget) widget.label = "COINS";

const response = await fetch(`${base}/api/snapshots`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ document, assets: [], ttlHours: 24 }),
});
const body = await response.json() as { ok?: boolean; id?: string; error?: string };
if (!response.ok || !body.id) {
  console.error(body.error || `Snapshot failed (${response.status})`);
  process.exit(1);
}
const playUrl = `${base}/s/${body.id}?ai=1&seed=1234`;
console.log(JSON.stringify({ snapshotId: body.id, playUrl }, null, 2));
