/**
 * Independent negative control for the AI Play closed loop.
 *
 * The seeded bug (a coin embedded in the ground) fails because a collectible
 * cannot be touched. This control proves the loop is not tuned to that one
 * shape: it builds the compact one-coin scene and makes the goal
 * *unsatisfiable* by raising the win threshold to two coins while only one
 * exists. Attempt 1 must fail on the assertion (the coin is collected, the
 * status never becomes WON); attempt 2 must pass after the threshold is
 * restored.
 *
 * A first version of this control used the full Neon Runner route, whose
 * six-jump objective exceeded the 145 s AI Play ceiling and was cancelled
 * instead of failing on the assertion. The compact scene makes the failure
 * land where the control needs it, in about a minute per run.
 *
 * The repair here is applied deterministically, not by a model turn: this
 * control validates Kane's failure signal and the post-fix replay, while the
 * agent-diagnosis half of the loop is covered by the K5 fail -> fix -> pass run.
 *
 * Usage: node --import tsx scripts/kane/negative-control.ts
 * Writes .data/negative-control.json and archives both raw streams under
 * .testmuai/runs/ (both ignored by git).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createProjectFromTemplate } from "../../src/engine/model/templates";
import type { AiPlayResult } from "../../shared/protocol/kane";

const origin = process.env.CLOCKWORK_ORIGIN || "http://localhost:3000";
const document = createProjectFromTemplate("platformer", "Neon Runner Negative Control");
const scene = document.scenes.find((candidate) => candidate.id === document.startSceneId) ?? document.scenes[0]!;

// Compact fixture: one reachable coin, the goal, and the HUD the objective reads.
const keep = new Set(["Sky gradient", "Ground", "Player", "Core A", "Relay", "Hint"]);
scene.objects = scene.objects.filter((object) => keep.has(object.name));
const player = scene.objects.find((object) => object.name === "Player")!;
player.transform.x = 180;
player.transform.y = 790;
const coin = scene.objects.find((object) => object.name === "Core A")!;
// Reachable: on the ground, one short run to the right.
coin.transform.x = 300;
coin.transform.y = 790;
const relay = scene.objects.find((object) => object.name === "Relay")!;
relay.transform.x = 520;
relay.transform.y = 760;
const widget = document.settings.ui.hud.find((item) => item.variable === "coins");
if (widget) widget.label = "COINS";

const winRule = scene.rules.find((rule) =>
  rule.when.some((condition) => condition.kind === "variable" && condition.name === "coins"),
);
const coinCondition = winRule?.when.find((condition) => condition.kind === "variable" && condition.name === "coins");
if (!winRule || !coinCondition) throw new Error("Neon Runner template no longer has a coin win rule.");
// One scene only: the won flag must become WON in place, not by changing scene.
winRule.do = winRule.do.filter((action) => action.kind !== "go-scene");
coinCondition.value = 1;

const coinTotal = scene.objects.filter((object) =>
  object.tags.includes("coin") || object.behaviors.some((behavior) => behavior.type === "collectible"),
).length;
if (coinTotal !== 1) throw new Error(`Expected 1 coin in the fixture, found ${coinTotal}.`);

/** The defect: the win rule demands one more coin than the scene contains. */
const originalThreshold = coinCondition.value;
coinCondition.value = coinTotal + 1;
console.error(`[negative-control] win rule "${winRule.name}": coins >= ${String(originalThreshold)} -> coins >= ${String(coinCondition.value)}`);

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

async function play(snapshotId: string, attempt: number): Promise<{ result: AiPlayResult; raw: string }> {
  const response = await fetch(`${origin}/api/kane/ai-play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshotId, projectId: document.id, attempt, seed: 1234 }),
  });
  if (!response.ok) throw new Error(`AI Play ${response.status}: ${await response.text()}`);
  const raw = await response.text();
  const events = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const end = events.findLast((event) => event.type === "run_end");
  if (!end) {
    const error = events.find((event) => event.type === "error");
    throw new Error(error?.message || "AI Play stream ended without run_end");
  }
  return { result: end.result as AiPlayResult, raw };
}

function archive(name: string, payload: string | object) {
  mkdirSync(".testmuai/runs", { recursive: true });
  writeFileSync(
    `.testmuai/runs/${name}`,
    typeof payload === "string" ? payload : `${JSON.stringify(payload, null, 2)}\n`,
  );
}

const firstSnapshot = await snapshot(document);
console.error(`[negative-control] attempt 1 snapshot ${firstSnapshot}`);
const first = await play(firstSnapshot, 1);
archive("negative-control-attempt1.ndjson", first.raw);
archive("negative-control-attempt1.result.json", first.result);
console.error(`[negative-control] attempt 1: ${first.result.status} status=${String(first.result.finalState.status ?? "?")} coins=${String(first.result.finalState.coins ?? "?")}`);
if (first.result.status !== "failed") {
  throw new Error(`Expected attempt 1 to fail on the unsatisfiable win rule, got ${first.result.status}: ${first.result.summary}`);
}

/** The fix: restore the win threshold to the number of coins the scene contains. */
coinCondition.value = originalThreshold;
console.error(`[negative-control] repair: win rule restored to coins >= ${String(originalThreshold)}`);

const secondSnapshot = await snapshot(document);
console.error(`[negative-control] attempt 2 snapshot ${secondSnapshot}`);
const second = await play(secondSnapshot, 2);
archive("negative-control-attempt2.ndjson", second.raw);
archive("negative-control-attempt2.result.json", second.result);
console.error(`[negative-control] attempt 2: ${second.result.status} status=${String(second.result.finalState.status ?? "?")} coins=${String(second.result.finalState.coins ?? "?")}`);
if (second.result.status !== "passed") {
  throw new Error(`Expected attempt 2 to pass after the repair, got ${second.result.status}: ${second.result.summary}`);
}

const report = {
  status: "passed",
  defect: `win rule "${winRule.name}" required ${coinTotal + 1} coins in a ${coinTotal}-coin scene`,
  repair: `restored the win rule to coins >= ${String(originalThreshold)}`,
  repairAppliedBy: "deterministic script (agent diagnosis covered by K5)",
  snapshot1: firstSnapshot,
  snapshot2: secondSnapshot,
  attempt1: {
    runId: first.result.runId,
    status: first.result.status,
    finalState: first.result.finalState,
    summary: first.result.summary,
    evidencePath: first.result.evidencePath,
    durationMs: first.result.durationMs,
  },
  attempt2: {
    runId: second.result.runId,
    status: second.result.status,
    finalState: second.result.finalState,
    summary: second.result.summary,
    evidencePath: second.result.evidencePath,
    durationMs: second.result.durationMs,
  },
};
writeFileSync(".data/negative-control.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
