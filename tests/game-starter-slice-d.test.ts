import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { emptyInput, type InputFrame } from "../src/engine/runtime/input";
import { Runtime } from "../src/engine/runtime/runtime";

function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...emptyInput(), ...overrides };
}

function runtimeFor(id: "platform-jumper" | "endless-runner"): Runtime {
  return new Runtime(createGameStarterDocument(id, `Test ${id}`), undefined, 73);
}

test("Platform Jumper collects cores, respawns from spikes, gates the exit, and resets", () => {
  const runtime = runtimeFor("platform-jumper");
  const player = runtime.player()!;
  const core = runtime.objects.find((object) => object.source.name === "Core 1")!;
  player.x = core.x;
  player.y = core.y;
  runtime.step(emptyInput());
  assert.equal(runtime.variables.coins, 1);
  assert.equal(core.active, false);

  const spikes = runtime.objects.find((object) => object.source.name === "Spike patch A")!;
  player.x = spikes.x;
  player.y = spikes.y;
  runtime.step(emptyInput());
  assert.equal(runtime.variables.lives, 2);
  assert.equal(player.active, true, "the player respawns while lives remain");

  const goal = runtime.objects.find((object) => object.source.tags.includes("goal"))!;
  player.x = goal.x;
  player.y = goal.y;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "running", "the exit stays locked before all cores are collected");
  runtime.variables.coins = 5;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "won");

  runtime.reset();
  assert.equal(runtime.variables.coins, 0);
  assert.equal(runtime.variables.lives, 3);
  assert.equal(runtime.status, "running");
});

test("Platform Jumper only jumps from a grounded state", () => {
  const runtime = runtimeFor("platform-jumper");
  const player = runtime.player()!;
  player.y = 300;
  player.grounded = false;
  runtime.step(frame({ jump: true, jumpPressed: true }));
  assert.ok(player.vy >= 0, "an airborne jump press should not apply upward velocity");

  player.y = 780;
  player.vy = 0;
  player.grounded = true;
  runtime.step(frame({ jump: true, jumpPressed: true }));
  assert.ok(player.vy < 0, "a grounded jump press should apply upward velocity");
});

test("Endless Runner ducking shortens and restores the collider without changing its feet position", () => {
  const runtime = runtimeFor("endless-runner");
  const player = runtime.player()!;
  const body = player.source.body!;
  const standingHeight = body.height;
  for (let index = 0; index < 3; index += 1) runtime.step(emptyInput());
  const feetY = player.y + body.height / 2;

  runtime.step(frame({ down: true }));
  assert.equal(body.height, 24);
  assert.equal(player.y + body.height / 2, feetY);

  runtime.step(emptyInput());
  assert.equal(body.height, standingHeight);
  assert.equal(player.y + body.height / 2, feetY);
});

test("Endless Runner spawner accelerates to its floor and inactive hazards are compacted", () => {
  const fast = runtimeFor("endless-runner");
  const slow = runtimeFor("endless-runner");
  const obstacleId = "pfb_runner_obstacle";

  for (const runtime of [fast, slow]) {
    const director = runtime.objects.find((object) => object.source.tags.includes("director"))!;
    const spawner = director.source.behaviors.find((behavior) =>
      behavior.type === "spawner" && behavior.params.prefabId === obstacleId,
    )!;
    spawner.params.startDelayMs = 0;
    spawner.params.intervalMs = 1000;
    spawner.params.intervalDecayPerSecond = 100;
    spawner.params.minIntervalMs = 200;
    director.behaviorTimers[spawner.id] = 490;
  }
  fast.elapsed = 5;
  slow.elapsed = 2;
  fast.step(emptyInput());
  slow.step(emptyInput());
  assert.equal(fast.objects.filter((object) => object.active && object.source.prefabId === obstacleId).length, 2);
  assert.equal(slow.objects.filter((object) => object.active && object.source.prefabId === obstacleId).length, 1);

  const cleanup = runtimeFor("endless-runner");
  cleanup.player()!.y = 2000;
  const director = cleanup.objects.find((object) => object.source.tags.includes("director"))!;
  const spawner = director.source.behaviors.find((behavior) =>
    behavior.type === "spawner" && behavior.params.prefabId === obstacleId,
  )!;
  spawner.params.startDelayMs = 0;
  spawner.params.intervalMs = 16;
  spawner.params.intervalDecayPerSecond = 0;
  spawner.params.limit = 1000;
  const prefab = cleanup.document.prefabs.find((item) => item.id === obstacleId)!;
  prefab.root.behaviors.find((behavior) => behavior.type === "mover")!.params.lifetimeMs = 80;
  for (const object of cleanup.objects.filter((item) => item.source.prefabId === obstacleId)) {
    object.source.behaviors.find((behavior) => behavior.type === "mover")!.params.lifetimeMs = 80;
  }
  for (let index = 0; index < 1800; index += 1) cleanup.step(emptyInput());
  assert.ok(cleanup.objects.length < 400, "inactive spawned hazards should be compacted");
});
