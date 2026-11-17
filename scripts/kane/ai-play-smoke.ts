/**
 * End-to-end AI Play smoke with real Kane. It uses a tiny one-coin scene so the
 * fail -> deterministic repair -> pass loop completes in a few minutes, then
 * writes both run summaries to .data/ai-play-smoke.json.
 *
 * Usage: node --import tsx scripts/kane/ai-play-smoke.ts
 */
import { writeFileSync } from "node:fs";
import { createProjectFromTemplate } from "../../src/engine/model/templates";
import { repairAiPlayFailure } from "../../src/engine/ai/ai-play-repair";
import type { AiPlayResult } from "../../shared/protocol/kane";

const origin = process.env.CLOCKWORK_ORIGIN || "http://localhost:3000";
const document = createProjectFromTemplate("platformer", "AI Play Smoke");
const scene = document.scenes.find((candidate) => candidate.id === document.startSceneId) ?? document.scenes[0]!;
const keep = new Set(["Sky gradient", "Ground", "Player", "Core A", "Relay", "Hint"]);
scene.objects = scene.objects.filter((object) => keep.has(object.name));
const player = scene.objects.find((object) => object.name === "Player")!;
player.transform.x = 180;
player.transform.y = 790;
const coin = scene.objects.find((object) => object.name === "Core A")!;
coin.transform.x = 260;
// Inside the ground collider: the first Kane run must fail to collect it.
coin.transform.y = 860;
const relay = scene.objects.find((object) => object.name === "Relay")!;
relay.transform.x = 520;
relay.transform.y = 760;
const widget = document.settings.ui.hud.find((item) => item.variable === "coins");
if (widget) widget.label = "COINS";
const winRule = scene.rules.find((rule) => /win/i.test(rule.name));
const coinCondition = winRule?.when.find((condition) => condition.kind === "variable" && condition.name === "coins");
if (coinCondition) coinCondition.value = 1;
if (winRule) {
  // The template jumps to a second scene; this fixture has one scene and only
  // needs the won flag so STATUS becomes WON in place.
  winRule.do = winRule.do.filter((action) => action.kind !== "go-scene");
}

async function snapshot(doc: typeof document) {
  const response = await fetch(`${origin}/api/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document: doc, assets: [], ttlHours: 2 }),
  });
  const body = await response.json() as { id?: string; error?: string };
  if (!response.ok || !body.id) throw new Error(body.error || `Snapshot failed (${response.status})`);
  return body.id;
}

async function play(snapshotId: string, attempt: number): Promise<AiPlayResult> {
  const response = await fetch(`${origin}/api/kane/ai-play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshotId, projectId: document.id, attempt, seed: 1234 }),
  });
  if (!response.ok) throw new Error(`AI Play ${response.status}: ${await response.text()}`);
  const text = await response.text();
  const events = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const end = events.findLast((event) => event.type === "run_end");
  if (!end) {
    const error = events.find((event) => event.type === "error");
    throw new Error(error?.message || "AI Play stream ended without run_end");
  }
  return end.result as AiPlayResult;
}

const firstSnapshot = await snapshot(document);
console.error(`[ai-play-smoke] attempt 1 snapshot ${firstSnapshot}`);
const first = await play(firstSnapshot, 1);
if (first.status !== "failed") {
  throw new Error(`Expected attempt 1 to fail with the embedded coin, got ${first.status}: ${first.summary}`);
}

const repair = repairAiPlayFailure(document, first);
if (!repair) throw new Error("The deterministic repair found no embedded coin.");
const targetScene = document.scenes.find((candidate) => candidate.id === repair.sceneId)!;
const target = targetScene.objects.find((object) => object.id === repair.objectId)!;
target.transform = repair.command.args.patch.transform;

const secondSnapshot = await snapshot(document);
console.error(`[ai-play-smoke] repair "${repair.summary}", attempt 2 snapshot ${secondSnapshot}`);
const second = await play(secondSnapshot, 2);
if (second.status !== "passed") {
  throw new Error(`Expected attempt 2 to pass after repair, got ${second.status}: ${second.summary}`);
}

const report = {
  status: "passed",
  repair: repair.summary,
  attempt1: { status: first.status, coins: first.finalState.coins, summary: first.summary, evidencePath: first.evidencePath },
  attempt2: { status: second.status, coins: second.finalState.coins, summary: second.summary, evidencePath: second.evidencePath },
};
writeFileSync(".data/ai-play-smoke.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
