import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { emptyInput, type InputFrame } from "../src/engine/runtime/input";
import { FIXED_DT, Runtime } from "../src/engine/runtime/runtime";

function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...emptyInput(), ...overrides };
}

function shooterRuntime(): Runtime {
  return new Runtime(createGameStarterDocument("space-shooter", "Runtime Shooter"), undefined, 99);
}

test("player moves, fires, and spawns enemies", () => {
  const runtime = shooterRuntime();
  assert.equal(runtime.status, "running");
  assert.equal(runtime.variables.health, 3);
  assert.equal(runtime.variables.timeLeft, 60);

  const startX = runtime.player()!.x;
  for (let index = 0; index < 40; index += 1) runtime.step(frame({ right: true }));
  assert.ok(runtime.player()!.x > startX + 100, "player should move right");

  for (let index = 0; index < 20; index += 1) runtime.step(frame({ jump: true }));
  assert.ok(
    runtime.objects.some((object) => object.active && object.source.tags.includes("player-bullet")),
    "holding fire should spawn bullets",
  );

  for (let index = 0; index < 140; index += 1) runtime.step(emptyInput());
  assert.ok(
    runtime.objects.some((object) => object.active && object.source.prefabId === "pfb_shooter_asteroid"),
    "the spawner should create asteroids",
  );
  assert.ok(runtime.objects.length < 200, "runtime-spawned objects stay bounded");
});

test("a one-frame jump press fires without requiring Space to remain held", () => {
  const runtime = shooterRuntime();
  for (let index = 0; index < 12; index += 1) runtime.step(emptyInput());

  runtime.step(frame({ jumpPressed: true }));

  assert.ok(
    runtime.objects.some((object) => object.active && object.source.tags.includes("player-bullet")),
    "a captured jump press should trigger the shooter even when jump is not held",
  );
});

test("damage, loss, reset and win follow the authored rules", () => {
  const runtime = shooterRuntime();
  runtime.variables.health = 0;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "lost");

  runtime.reset();
  assert.equal(runtime.status, "running");
  assert.equal(runtime.variables.health, 3);
  assert.equal(runtime.variables.score, 0);
  assert.equal(runtime.variables.timeLeft, 60);
  assert.equal(runtime.frame, 0);

  runtime.elapsed = 60;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "won");
});

test("a projectile damages and scores a spawned enemy", () => {
  const runtime = shooterRuntime();
  const scene = runtime.scene;
  const player = runtime.player()!;
  const prefab = runtime.document.prefabs.find((candidate) => candidate.id === "pfb_shooter_enemy")!;
  const enemy = structuredClone(prefab.root);
  enemy.id = "test_enemy";
  enemy.layerId = scene.layers[1]!.id;
  enemy.transform.x = player.x;
  enemy.transform.y = player.y - 100;
  enemy.behaviors = enemy.behaviors.filter((behavior) => behavior.type !== "shooter");
  const enemyObject = {
    ...structuredClone(runtime.objects[0]!),
    source: enemy,
    x: enemy.transform.x,
    y: enemy.transform.y,
    behaviorTimers: {},
    hp: 2,
    invulnMs: 0,
    active: true,
  };
  runtime.objects.push(enemyObject);

  for (let index = 0; index < 30; index += 1) runtime.step(frame({ jump: true }));
  assert.equal(enemyObject.active, false, "two bullets should destroy the enemy");
  assert.equal(runtime.variables.score, 100);
  assert.ok(runtime.objects.some((object) => object.active && object.source.tags.includes("fx")));
});

test("fixed timing stays deterministic for the same seed", () => {
  const a = shooterRuntime();
  const b = shooterRuntime();
  for (let index = 0; index < 300; index += 1) {
    const input = frame({ right: index % 50 < 20, left: index % 50 >= 40, jump: index % 30 < 6 });
    a.step(input);
    b.step(input);
  }
  assert.equal(a.frame, b.frame);
  assert.equal(a.variables.score, b.variables.score);
  assert.equal(a.variables.health, b.variables.health);
  assert.equal(a.objects.filter((object) => object.active).length, b.objects.filter((object) => object.active).length);
  assert.ok(Math.abs(a.elapsed - b.elapsed) < FIXED_DT / 2);
});
