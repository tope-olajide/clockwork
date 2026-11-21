import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import type { GameObject } from "../src/engine/model/schema";
import { emptyInput, type InputFrame } from "../src/engine/runtime/input";
import { Runtime, type RuntimeObject } from "../src/engine/runtime/runtime";

function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...emptyInput(), ...overrides };
}

function runtimeFor(id: "space-invaders" | "asteroid-field"): Runtime {
  return new Runtime(createGameStarterDocument(id, `Test ${id}`), undefined, 321);
}

function runtimeObject(runtime: Runtime, source: GameObject, x: number, y: number): RuntimeObject {
  return {
    ...structuredClone(runtime.objects[0]!),
    source: structuredClone(source),
    x,
    y,
    spawnX: x,
    spawnY: y,
    behaviorTimers: {},
    hp: source.behaviors.find((behavior) => behavior.type === "health")?.params.max as number | undefined,
    invulnMs: 0,
    active: true,
  };
}

test("Space Invaders formation reverses, drops, and loses on breach", () => {
  const runtime = runtimeFor("space-invaders");
  const invaders = runtime.objects.filter((object) => object.source.tags.includes("invader"));
  const firstY = invaders[0]!.y;
  const firstX = invaders[0]!.x;
  for (let index = 0; index < 600; index += 1) runtime.step(emptyInput());
  assert.ok(invaders[0]!.y > firstY, "the formation should drop at its edge");
  assert.ok(invaders[0]!.x < firstX, "the formation should reverse and travel back");
  assert.equal(runtime.variables.breached, false);

  invaders[0]!.y = 610;
  runtime.step(emptyInput());
  assert.equal(runtime.variables.breached, true);
  assert.equal(runtime.status, "lost");
});

test("Space Invaders director speed edits change formation movement and enemies can win", () => {
  const slow = runtimeFor("space-invaders");
  const fast = runtimeFor("space-invaders");
  const slowInvader = slow.objects.find((object) => object.source.tags.includes("invader"))!;
  const fastInvader = fast.objects.find((object) => object.source.tags.includes("invader"))!;
  const director = fast.objects.find((object) => object.source.tags.includes("director"))!;
  director.source.behaviors.find((behavior) => behavior.type === "formation")!.params.speed = 300;
  for (let index = 0; index < 30; index += 1) {
    slow.step(emptyInput());
    fast.step(emptyInput());
  }
  assert.ok(fastInvader.x > slowInvader.x + 100);

  fast.variables.enemies = 0;
  fast.step(emptyInput());
  assert.equal(fast.status, "won");
});

test("Space Invaders enemies fire within the live formation", () => {
  const runtime = runtimeFor("space-invaders");
  for (let index = 0; index < 360; index += 1) runtime.step(emptyInput());
  assert.ok(runtime.objects.some((object) => object.active && object.source.tags.includes("enemy-bullet")));
});

test("Space Invaders ships respawn until the last life, then reset cleanly", () => {
  const runtime = runtimeFor("space-invaders");
  const player = runtime.player()!;
  const enemy = runtime.objects.find((object) => object.source.tags.includes("invader"))!;
  player.x = enemy.x;
  player.y = enemy.y;
  runtime.step(emptyInput());
  assert.equal(runtime.variables.lives, 2);
  assert.equal(player.active, true);

  player.invulnMs = 0;
  runtime.variables.lives = 1;
  player.x = enemy.x;
  player.y = enemy.y;
  runtime.step(emptyInput());
  assert.equal(runtime.variables.lives, 0);
  assert.equal(runtime.status, "lost");
  assert.equal(player.active, false);

  runtime.reset();
  assert.equal(runtime.variables.lives, 3);
  assert.equal(runtime.variables.enemies, 24);
  assert.equal(runtime.status, "running");
});

test("Asteroid Field steers with thrust and splits large rocks into shards", () => {
  const runtime = runtimeFor("asteroid-field");
  const player = runtime.player()!;
  const start = { x: player.x, y: player.y };
  for (let index = 0; index < 30; index += 1) runtime.step(frame({ right: true, jump: true }));
  assert.ok(player.rotation > 90);
  assert.notDeepEqual({ x: player.x, y: player.y }, start);

  player.rotation = 45;
  for (let index = 0; index < 20; index += 1) runtime.step(frame({ action: true }));
  const aimedBullet = runtime.objects.find((object) => object.active && object.source.tags.includes("player-bullet"));
  assert.ok(aimedBullet);
  assert.ok(Math.abs(aimedBullet.vx) > 0 && Math.abs(aimedBullet.vy) > 0, "aimed shots follow the ship heading");

  const large = runtime.objects.find((object) => object.source.tags.includes("large-asteroid"))!;
  large.source.behaviors.find((behavior) => behavior.type === "health")!.params.deathSpawnCount = 3;
  const bulletPrefab = runtime.document.prefabs.find((prefab) => prefab.id === "pfb_asteroid_bullet")!;
  const bullet = structuredClone(bulletPrefab.root);
  bullet.behaviors[0]!.params.speed = 0;
  runtime.objects.push(runtimeObject(runtime, bullet, large.x, large.y));
  runtime.step(emptyInput());

  assert.equal(large.active, false);
  assert.equal(
    runtime.objects.filter((object) => object.active && object.source.prefabId === "pfb_asteroid_shard").length,
    3,
  );
  assert.equal(runtime.variables.asteroids, 8, "death-spawn count edits affect both the fragments and live count");
});

test("Asteroid Field win, loss, and reset use runtime rules", () => {
  const runtime = runtimeFor("asteroid-field");
  runtime.variables.asteroids = 0;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "won");

  runtime.reset();
  assert.equal(runtime.variables.asteroids, 6);
  assert.equal(runtime.variables.lives, 3);
  assert.equal(runtime.status, "running");

  runtime.variables.lives = 0;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "lost");
});
