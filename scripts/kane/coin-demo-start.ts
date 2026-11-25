/**
 * Starting state for the coin demo: the Platformer template with every coin,
 * the coin counter, its HUD widget and the coin win rule removed. The player
 * can still run and jump; there is nothing to collect and no score.
 *
 *   node --import tsx scripts/kane/coin-demo-start.ts   # writes the import file
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createProjectFromTemplate } from "../../src/engine/model/templates";
import type { ProjectDocument } from "../../src/engine/model/schema";
import { buildTransferFile } from "../../src/engine/persistence/transfer";

export function coinDemoStartDocument(name = "Coin Demo"): ProjectDocument {
  const document = createProjectFromTemplate("platformer", name);
  const isCoin = (object: { tags: string[]; behaviors: Array<{ type: string }> }) =>
    object.tags.includes("coin") || object.behaviors.some((behavior) => behavior.type === "collectible");
  for (const scene of document.scenes) {
    scene.objects = scene.objects.filter((object) => !isCoin(object));
    scene.rules = scene.rules.filter((rule) => !JSON.stringify(rule).includes('"coins"'));
  }
  document.prefabs = document.prefabs.filter((prefab) => !isCoin(prefab.root));
  document.variables = document.variables.filter((variable) => variable.name !== "coins");
  document.settings.ui.hud = document.settings.ui.hud.filter((widget) => widget.variable !== "coins");
  return document;
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/kane/coin-demo-start.ts");
if (invokedDirectly) {
  const out = join(process.cwd(), "scripts", "kane", "fixtures", "coin-demo-start.clockwork.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(buildTransferFile(coinDemoStartDocument()), null, 2));
  console.log(out);
}
