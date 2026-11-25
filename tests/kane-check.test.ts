import assert from "node:assert/strict";
import test from "node:test";
import { nanoid } from "nanoid";
import { coinDemoStartDocument } from "../scripts/kane/coin-demo-start";
import type { ProjectDocument } from "../src/engine/model/schema";
import { gameTestProfileForDocument, getGameTestProfile, validateGameTestProfile } from "../src/engine/model/game-test-profile";
import { createProjectFromTemplate } from "../src/engine/model/templates";
import { TestController } from "../src/engine/runtime/test-controller";
import { observationValue } from "../src/engine/runtime/test-observations";
import { compileCheck, parseCheckSpec, rehearseCheck, runCheckStep, type CheckSpec } from "../src/engine/runtime/kane-check-runner";
import { KaneTurnBudget, runKaneCheck, smokeCheckArgs } from "../src/features/agent/kane-check-session";
import { composeCheckObjective, decodeCheckSteps, encodeCheckSteps, judgeCheck, validateCheckRequest } from "../shared/kane-check";
import type { AiPlayResult } from "../shared/protocol/kane";

/** What the agent builds for "add collectible coins … score in the HUD". */
function withCoins(document: ProjectDocument, xs: number[]): ProjectDocument {
  const next = structuredClone(document);
  const scene = next.scenes.find((candidate) => candidate.id === next.startSceneId)!;
  const player = scene.objects.find((object) => object.tags.includes("player"))!;
  next.variables.push({ id: "var_score", name: "score", type: "number", initial: 0, description: "Coins collected." });
  next.settings.ui.hud.push({ id: "hud_score", variable: "score", label: "SCORE", corner: "top-left", style: "text", visible: true });
  for (const [index, x] of xs.entries()) {
    scene.objects.push({
      id: `obj_coin_${index}_${nanoid(4)}`,
      name: `Coin ${index + 1}`,
      layerId: player.layerId,
      transform: { x, y: player.transform.y + 80, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      visual: { kind: "rect", width: 24, height: 24, color: "#ffd166" },
      behaviors: [{ id: `beh_${index}`, type: "collectible", enabled: true, params: { variable: "score", amount: 1 } }],
      properties: {},
      tags: ["coin"],
    } as any);
  }
  return next;
}

const coinCheck: Record<string, unknown> = {
  title: "Collecting a coin raises the score and removes the coin",
  steps: [{ control: "move-right", frames: 90 }],
  expect: [
    { readout: "score", equals: 1 },
    { readout: "coin-count", changed: true },
    { readout: "collect-events", equals: 1 },
  ],
};

function fakeKane(finalState: Record<string, string>, status: AiPlayResult["status"] = "passed") {
  const calls: unknown[] = [];
  const run = async (check: any): Promise<AiPlayResult> => {
    calls.push(check);
    const result: AiPlayResult = {
      runId: "run-1", attempt: 1, status, summary: "fixture", objective: composeCheckObjective(check),
      finalState, steps: [], runtimeErrors: [], durationMs: 1000, createdAt: new Date().toISOString(),
    };
    const judged = judgeCheck(result, check);
    return { ...result, status: judged.status, check: { kaneStatus: status, reason: judged.reason, outcomes: judged.outcomes } };
  };
  return { calls, run };
}

test("every project gets a Test Mode profile; hand-written profiles still win", () => {
  for (const doc of [createProjectFromTemplate("platformer", "P"), createProjectFromTemplate("blank", "B"), coinDemoStartDocument()]) {
    const profile = gameTestProfileForDocument(doc);
    const result = validateGameTestProfile(profile, { document: doc });
    assert.ok(result.ok, JSON.stringify(result));
    assert.ok(profile.controls.some((control) => control.id === "move-right"));
  }
  const shooter = createProjectFromTemplate("space-shooter", "S");
  assert.deepEqual(gameTestProfileForDocument(shooter), getGameTestProfile("space-shooter"));
});

test("the coin-demo start has no coins or score, and the agent's coins show up as readouts", () => {
  const start = coinDemoStartDocument();
  const startIds = gameTestProfileForDocument(start).observations.map((observation) => observation.id);
  assert.ok(!startIds.includes("score") && !startIds.includes("coin-count"));
  const built = gameTestProfileForDocument(withCoins(start, [330, 420, 900]));
  const score = built.observations.find((observation) => observation.id === "score");
  assert.equal(score?.label, "SCORE");
  assert.ok(built.observations.some((observation) => observation.id === "coin-count" && observation.label === "COIN COUNT"));
});

test("the simulator collects a coin in the player's path through real inputs", () => {
  const doc = withCoins(coinDemoStartDocument(), [330, 900, 1300]);
  const profile = gameTestProfileForDocument(doc);
  const parsed = parseCheckSpec(coinCheck, profile);
  assert.ok(parsed.ok, JSON.stringify(parsed));
  const rehearsal = rehearseCheck(doc, profile, (parsed as { spec: CheckSpec }).spec);
  assert.equal(rehearsal.passed, true, JSON.stringify(rehearsal.expectations));
  assert.equal(rehearsal.readouts.score, "1");
  assert.equal(rehearsal.readouts["coin-count"], "2");
  assert.ok(rehearsal.acceptedInputs >= 1);
});

test("the simulator reports, rather than hides, a coin the player cannot reach", () => {
  const doc = withCoins(coinDemoStartDocument(), [2000]);
  const profile = gameTestProfileForDocument(doc);
  const spec = (parseCheckSpec(coinCheck, profile) as { spec: CheckSpec }).spec;
  const rehearsal = rehearseCheck(doc, profile, spec);
  assert.equal(rehearsal.passed, false);
  assert.equal(rehearsal.expectations.find((e) => e.readout === "score")?.after, "0");
});

test("the RUN STEP button path and the rehearsal produce identical readouts", () => {
  const doc = withCoins(coinDemoStartDocument(), [330, 900]);
  const profile = gameTestProfileForDocument(doc);
  const spec = (parseCheckSpec(coinCheck, profile) as { spec: CheckSpec }).spec;
  const rehearsal = rehearseCheck(doc, profile, spec);
  // What TestModeHud does when Kane clicks the decoded RUN STEP buttons.
  const controller = new TestController(doc, { seed: 1234, sceneId: doc.startSceneId });
  for (const step of decodeCheckSteps(encodeCheckSteps(spec.steps))) runCheckStep(controller, profile, step);
  const browser = Object.fromEntries(profile.observations.map((o) => [o.id, String(observationValue(controller, o) ?? "none")]));
  assert.deepEqual(browser, rehearsal.readouts);
});

test("invalid checks are rejected with the valid ids and never reach Kane", async () => {
  const doc = withCoins(coinDemoStartDocument(), [330]);
  const kane = fakeKane({});
  const outcome = await runKaneCheck({ steps: [{ control: "walk", frames: 90 }], expect: [{ readout: "points", equals: 1 }] }, {
    document: doc, profile: gameTestProfileForDocument(doc), budget: new KaneTurnBudget(), runKane: kane.run,
  });
  assert.equal(outcome.ok, false);
  assert.match((outcome as { error: string }).error, /move-right/);
  assert.match((outcome as { error: string }).error, /score/);
  assert.equal(kane.calls.length, 0);
});

test("a simulator failure stops before Kane and says what to fix", async () => {
  const doc = withCoins(coinDemoStartDocument(), [2000]);
  const kane = fakeKane({});
  const outcome = await runKaneCheck(coinCheck, { document: doc, profile: gameTestProfileForDocument(doc), budget: new KaneTurnBudget(), runKane: kane.run });
  assert.ok(outcome.ok);
  assert.equal(outcome.payload.stage, "simulator");
  assert.equal(outcome.payload.status, "failed");
  assert.match(outcome.payload.nextStep, /Kane was not run/);
  assert.equal(kane.calls.length, 0);
});

test("a simulator pass runs Kane once with the simulator's exact values, and Clockwork judges them", async () => {
  const doc = withCoins(coinDemoStartDocument(), [330, 900, 1300]);
  const kane = fakeKane({ score: "1", coin_count: "2", collect_events: "1", last_error: "none" });
  const budget = new KaneTurnBudget();
  const deps = { document: doc, profile: gameTestProfileForDocument(doc), budget, runKane: kane.run };
  const outcome = await runKaneCheck(coinCheck, deps);
  assert.ok(outcome.ok);
  assert.equal(outcome.payload.status, "passed");
  assert.equal(kane.calls.length, 1);
  const sent = kane.calls[0] as any;
  assert.deepEqual(sent.readouts.map((r: any) => [r.label, r.expected]), [["SCORE", "1"], ["COIN COUNT", "2"], ["COLLECTED", "1"]]);
  assert.deepEqual(sent.stepLabels, ["RUN STEP 1: MOVE RIGHT 90 FRAMES"]);
  assert.ok(outcome.payload.checks.every((row) => row.browser === row.simulator));

  // An identical check at the same revision is answered from cache.
  const again = await runKaneCheck(coinCheck, deps);
  assert.ok(again.ok && again.payload.repeat);
  assert.equal(kane.calls.length, 1);
});

test("Kane reading a different value is a failure, and the budget stops a third run", async () => {
  const doc = withCoins(coinDemoStartDocument(), [330, 900, 1300]);
  const budget = new KaneTurnBudget();
  const wrong = fakeKane({ score: "0", coin_count: "3", collect_events: "0", last_error: "none" });
  const deps = { document: doc, profile: gameTestProfileForDocument(doc), budget, runKane: wrong.run };
  const first = await runKaneCheck(coinCheck, deps);
  assert.ok(first.ok && first.payload.status === "failed");
  await runKaneCheck({ ...coinCheck, title: "b", steps: [{ control: "move-right", frames: 91 }] }, deps);
  const third = await runKaneCheck({ ...coinCheck, steps: [{ control: "move-right", frames: 92 }] }, deps);
  assert.equal(third.ok, false);
  assert.equal((third as { code: string }).code, "kane-budget");
  assert.equal(wrong.calls.length, 2);
});

test("Kane is never called when it is unavailable", async () => {
  const doc = withCoins(coinDemoStartDocument(), [330]);
  const kane = fakeKane({});
  const outcome = await runKaneCheck(coinCheck, { document: doc, profile: gameTestProfileForDocument(doc), budget: new KaneTurnBudget(), kaneUnavailable: "Kane CLI is not signed in.", runKane: kane.run });
  assert.equal(outcome.ok, false);
  assert.equal(kane.calls.length, 0);
});

test("judging: a Kane pass without stored values is not a pass", () => {
  const doc = withCoins(coinDemoStartDocument(), [330]);
  const profile = gameTestProfileForDocument(doc);
  const spec = (parseCheckSpec(coinCheck, profile) as { spec: CheckSpec }).spec;
  const check = compileCheck(profile, spec, rehearseCheck(doc, profile, spec));
  const base = { runId: "r", attempt: 1, summary: "", objective: "", steps: [], runtimeErrors: [], durationMs: 1, createdAt: "" };
  assert.equal(judgeCheck({ ...base, status: "passed", finalState: {} }, check).status, "error");
  assert.equal(judgeCheck({ ...base, status: "failed", finalState: { score: "1" } }, check).status, "failed");
  assert.equal(judgeCheck({ ...base, status: "passed", finalState: { score: "1", coin_count: "0", collect_events: "1" } }, check).status, "passed");
  assert.ok(validateCheckRequest(check).ok);
  assert.equal(validateCheckRequest({ ...check, stepLabels: ["bad label"] }).ok, false);
});

test("the smoke check is valid for any project and passes in the simulator", () => {
  for (const doc of [coinDemoStartDocument(), createProjectFromTemplate("topdown", "T")]) {
    const profile = gameTestProfileForDocument(doc);
    const parsed = parseCheckSpec(smokeCheckArgs(profile), profile);
    assert.ok(parsed.ok, JSON.stringify(parsed));
    assert.equal(rehearseCheck(doc, profile, (parsed as { spec: CheckSpec }).spec).passed, true);
  }
});

test("a collectible wired to the wrong variable is diagnosed before Kane", async () => {
  const doc = withCoins(coinDemoStartDocument(), [330]);
  const scene = doc.scenes.find((candidate) => candidate.id === doc.startSceneId)!;
  for (const object of scene.objects) for (const behavior of object.behaviors) if (behavior.type === "collectible") behavior.params = {};
  const kane = fakeKane({});
  const outcome = await runKaneCheck(coinCheck, { document: doc, profile: gameTestProfileForDocument(doc), budget: new KaneTurnBudget(), runKane: kane.run });
  assert.ok(outcome.ok);
  assert.equal(outcome.payload.stage, "simulator");
  assert.match(outcome.payload.nextStep, /params\.variable/);
  assert.equal(kane.calls.length, 0);
});

test("tool arguments sent as JSON strings are parsed", async () => {
  const { normalizeToolArgs } = await import("../src/features/agent/useAgentSession");
  assert.deepEqual(normalizeToolArgs({ commands: "[{\"type\":\"variable.add\"}]", summary: "x" }), { commands: [{ type: "variable.add" }], summary: "x" });
  assert.deepEqual(normalizeToolArgs("{\"a\":1}"), { a: 1 });
  assert.deepEqual(normalizeToolArgs({ objective: "[draft] verify it" }), { objective: "[draft] verify it" });
});

test("regression (run 0d752cad): Kane storing COLLECTED as 'collected' is still judged", () => {
  // The exact final_state the live run returned; the old id-based key looked
  // for "collect_events" and reported a value Kane had read as missing.
  const check = {
    title: "Coin collection raises score and removes coin",
    steps: [{ control: "move-right", frames: 90 }],
    stepLabels: ["RUN STEP 1: MOVE RIGHT 90 FRAMES"],
    readouts: [
      { id: "score", label: "SCORE", expected: "2" },
      { id: "coin-count", label: "COIN COUNT", expected: "6" },
      { id: "collect-events", label: "COLLECTED", expected: "2" },
    ],
  };
  const finalState = { check_status: "ALL 1 STEP DONE", score: "2", coin_count: "6", collected: "2", last_error: "none" };
  const base = { runId: "0d752cad", attempt: 1, summary: "", objective: "", steps: [], runtimeErrors: [], durationMs: 1, createdAt: "" };
  const judged = judgeCheck({ ...base, status: "passed", finalState }, check);
  assert.equal(judged.status, "passed", judged.reason);
  assert.match(composeCheckObjective(check), /next to "COLLECTED" in the OBSERVATIONS panel as 'collected'/);
  // A wrong value under the label key is still a failure.
  assert.equal(judgeCheck({ ...base, status: "passed", finalState: { ...finalState, collected: "1" } }, check).status, "failed");
});
