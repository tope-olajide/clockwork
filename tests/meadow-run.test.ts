import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { PLATFORMER_ASSETS } from "../src/engine/assets/starter-manifest";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { MEADOW_GROUND_TOP, MEADOW_SPIKE_SINK } from "../src/engine/model/game-starters/meadow-run";
import { collisionRect, visualRect } from "../src/engine/model/placement";
import { ruleReferenceIssues } from "../src/engine/model/references";
import { emptyInput } from "../src/engine/runtime/input";
import { Runtime } from "../src/engine/runtime/runtime";

function meadow() {
  return createGameStarterDocument("meadow-run", "Meadow Test");
}

/** Starting lives come from the template so tuning them does not break tests. */
const START_LIVES = Number(meadow().variables.find((variable) => variable.name === "lives")!.initial);
function runtime() {
  return new Runtime(meadow(), undefined, 1234);
}

function tagged(objects: ReturnType<typeof meadow>["scenes"][number]["objects"], tag: string) {
  return objects.filter((object) => object.tags.includes(tag));
}

test("Meadow Run is a long, populated stage with every art file available", () => {
  const document = meadow();
  const scene = document.scenes[0]!;
  const objects = scene.objects;

  assert.equal(scene.size.w, 18_400);
  assert.equal(tagged(objects, "meadow-ground").length, 10);
  assert.equal(tagged(objects, "meadow-platform").length, 56);
  // 58 since the first fire moved under the ledge at 3080-3230 (its shard is skipped).
  assert.equal(tagged(objects, "shard").length, 58);
  assert.equal(tagged(objects, "enemy").length, 19);
  assert.equal(tagged(objects, "checkpoint").length, 5);
  assert.equal(tagged(objects, "spike").length, 10);
  assert.equal(tagged(objects, "fire").length, 4);
  assert.equal(tagged(objects, "rock").length, 4);
  assert.equal(tagged(objects, "goal").length, 1);

  const grounds = tagged(objects, "meadow-ground")
    .map((object) => ({
      left: object.transform.x - (object.body?.width ?? 0) / 2,
      right: object.transform.x + (object.body?.width ?? 0) / 2,
    }))
    .sort((a, b) => a.left - b.left);
  for (let index = 1; index < grounds.length; index += 1) {
    const gap = grounds[index]!.left - grounds[index - 1]!.right;
    assert.ok(gap > 0 && gap <= 270, `gap ${index} should be jumpable, got ${gap}`);
  }

  const specs = new Map(PLATFORMER_ASSETS.map((asset) => [asset.id, asset]));
  for (const assetId of new Set(scene.objects.flatMap((object) => (object.visual?.kind === "sprite" ? [object.visual.assetId] : [])))) {
    assert.ok(specs.has(assetId), `${assetId} should have a platformer asset spec`);
  }
  for (const file of ["hero-atlas.png", "sky.jpg", "mountain.png", "forests.png", "ground.png", "spike.png", "stone.png", "campfire.png", "checkpoint-flag.png", "flying_twin_headed_dragon-blue.png", "cover.png"]) {
    assert.ok(existsSync(new URL(`../public/platformer/${file}`, import.meta.url)), `${file} should be served`);
  }

  for (const rule of scene.rules) {
    assert.deepEqual(ruleReferenceIssues(document, scene, rule), [], rule.name);
  }
});

test("ground art, colliders and characters share one surface line", () => {
  const scene = meadow().scenes[0]!;
  const surfaces = scene.objects.filter(
    (object) => object.tags.includes("meadow-ground") || object.tags.includes("meadow-platform"),
  );
  assert.ok(surfaces.length > 60);
  for (const object of surfaces) {
    const art = visualRect(object);
    const body = collisionRect(object);
    // The cropped art starts at the top of the grass tufts; the walkable surface
    // is the grass line 28px lower.
    assert.ok(Math.abs(body.top - (art.top + 28)) < 0.01, `${object.name} surface should meet the grass line`);
    if (object.tags.includes("meadow-platform")) {
      // Floating ledges are solid slabs under the surface, not full-depth columns,
      // so the trail beneath them stays walkable and jumpable.
      assert.ok(body.height > 10 && body.height < art.height, `${object.name} should have a solid slab body`);
    } else {
      assert.ok(Math.abs(body.bottom - art.bottom) < 0.01, `${object.name} collider should match the art bottom`);
    }
  }

  const ground = tagged(scene.objects, "meadow-ground")[0]!;
  assert.ok(Math.abs(collisionRect(ground).top - MEADOW_GROUND_TOP) < 0.01);

  const player = scene.objects.find((object) => object.tags.includes("player"))!;
  assert.ok(Math.abs(collisionRect(player).bottom - MEADOW_GROUND_TOP) < 0.01, "Marlow's feet start on the ground");
  assert.ok(Math.abs(visualRect(player).bottom - MEADOW_GROUND_TOP) < 0.01, "Marlow's art starts on the ground");

  for (const object of [...tagged(scene.objects, "spike"), ...tagged(scene.objects, "fire"), ...tagged(scene.objects, "rock"), ...tagged(scene.objects, "checkpoint")]) {
    const expected = object.tags.includes("spike") ? MEADOW_GROUND_TOP + MEADOW_SPIKE_SINK : MEADOW_GROUND_TOP;
    assert.ok(Math.abs(visualRect(object).bottom - expected) < 0.01, `${object.name} should rest on the ground`);
  }
});

test("spike colliders match the artwork and hurt from the side and the top", () => {
  const scene = meadow().scenes[0]!;
  for (const spike of tagged(scene.objects, "spike")) {
    const art = visualRect(spike);
    const body = collisionRect(spike);
    assert.ok(body.left >= art.left - 1 && body.right <= art.right + 1, `${spike.name} collider should stay inside the art`);
    assert.ok(body.top >= art.top - 1 && body.bottom <= art.bottom + 1, `${spike.name} collider should stay inside the art`);
    assert.equal(spike.body?.type, "none", "spikes are hazards, not solids");
    assert.ok(body.width / art.width > 0.85, `${spike.name} collider should cover the spike cluster`);
  }

  const spike = tagged(scene.objects, "spike")[0]!;
  const spikeBody = collisionRect(spike);

  // Walking into the side.
  const side = runtime();
  const sidePlayer = side.player()!;
  sidePlayer.x = spikeBody.left - 30;
  sidePlayer.y = MEADOW_GROUND_TOP - 61;
  side.step(emptyInput());
  sidePlayer.x = spikeBody.left + 6;
  side.step(emptyInput());
  assert.equal(side.variables.lives, START_LIVES - 1, "touching the side of a spike costs a life");

  // Landing on the tips.
  const top = runtime();
  const topPlayer = top.player()!;
  topPlayer.x = spike.transform.x;
  topPlayer.y = spikeBody.top - 80;
  topPlayer.vy = 500;
  let hurt = false;
  for (let frame = 0; frame < 30 && !hurt; frame += 1) {
    top.step(emptyInput());
    hurt = Number(top.variables.lives) < START_LIVES;
  }
  assert.ok(hurt, "landing on the spike tips costs a life");
});

test("fire is a hazard, never a checkpoint", () => {
  const scene = meadow().scenes[0]!;
  const fire = tagged(scene.objects, "fire")[0]!;
  assert.ok(fire.tags.includes("hazard"));
  assert.equal(fire.behaviors.some((behavior) => behavior.type === "checkpoint"), false);

  const game = runtime();
  const player = game.player()!;
  player.x = fire.transform.x;
  player.y = MEADOW_GROUND_TOP - 61;
  game.step(emptyInput());

  assert.equal(game.variables.lives, START_LIVES - 1, "touching fire costs a life");
  assert.equal(game.checkpoint.x, player.spawnX, "fire must not move the respawn point");
  assert.ok(game.events.some((event) => event.type === "respawn"));
});

test("rocks are solid obstacles that can be jumped onto", () => {
  const scene = meadow().scenes[0]!;
  const rock = tagged(scene.objects, "rock")[0]!;
  const rockBody = collisionRect(rock);
  assert.equal(rock.body?.type, "static");

  const game = runtime();
  const player = game.player()!;
  player.x = rockBody.left - 80;
  player.y = MEADOW_GROUND_TOP - 61;
  for (let frame = 0; frame < 90; frame += 1) {
    const input = emptyInput();
    input.right = true;
    game.step(input);
  }
  assert.ok(player.x < rockBody.left + 6, `the rock should block Marlow, ended at ${player.x}`);
  assert.equal(game.variables.lives, START_LIVES, "being blocked by a rock is not damage");

  // Dropping onto it lands on the rock's top surface.
  player.x = rock.transform.x;
  player.y = rockBody.top - 90;
  player.vy = 300;
  for (let frame = 0; frame < 30; frame += 1) game.step(emptyInput());
  assert.ok(player.grounded, "Marlow should land on the boulder");
  assert.ok(Math.abs(collisionRect(player.source, player.x, player.y).bottom - rockBody.top) < 2);
});

test("the trail flag activates, raises its pennant and becomes the respawn point", () => {
  const game = runtime();
  const flag = game.scene.objects.filter((object) => object.tags.includes("checkpoint"))[0]!;
  assert.equal(flag.visual?.kind === "sprite" ? flag.visual.frame : undefined, 0);
  const player = game.player()!;
  player.x = flag.transform.x;
  player.y = MEADOW_GROUND_TOP - 61;
  game.step(emptyInput());

  const runtimeFlag = game.objects.find((object) => object.source.id === flag.id)!;
  assert.equal(runtimeFlag.source.visual?.kind === "sprite" ? runtimeFlag.source.visual.frame : undefined, 1);
  assert.ok(runtimeFlag.source.tags.includes("checkpoint-active"));
  assert.equal(game.checkpoint.x, flag.transform.x);
  assert.ok(Math.abs(game.checkpoint.y - (MEADOW_GROUND_TOP - 61)) < 1);
  assert.ok(game.events.some((event) => event.type === "checkpoint"));

  // Fall into the pit: back to the flag, standing on the ground.
  player.x = 1900;
  player.y = 1060;
  player.hp = 1;
  player.invulnMs = 0;
  game.step(emptyInput());
  assert.equal(game.variables.lives, START_LIVES - 1);
  assert.ok(Math.abs(player.x - flag.transform.x) < 2);
  assert.ok(Math.abs(collisionRect(player.source, player.x, player.y).bottom - MEADOW_GROUND_TOP) < 1.5);
});

test("holding jump produces a higher arc than tapping it", () => {
  const full = runtime();
  const short = runtime();
  let fullApex = full.player()!.y;
  let shortApex = short.player()!.y;

  for (let frame = 0; frame < 120; frame += 1) {
    const held = emptyInput();
    held.jumpPressed = frame === 0;
    held.jump = frame < 90;
    full.step(held);
    fullApex = Math.min(fullApex, full.player()!.y);

    const tapped = emptyInput();
    tapped.jumpPressed = frame === 0;
    tapped.jump = frame < 6;
    tapped.jumpReleased = frame === 6;
    short.step(tapped);
    shortApex = Math.min(shortApex, short.player()!.y);
  }

  assert.ok(fullApex < shortApex - 40, `full ${fullApex} should clear more height than tap ${shortApex}`);
});

test("stomping a dragon defeats it, scores, and bounces the player", () => {
  const game = runtime();
  const player = game.player()!;
  const dragon = game.objects.find((object) => object.source.name === "Bramble dragon 1")!;
  player.x = dragon.x;
  player.y = dragon.y - 100;
  player.vy = 350;
  player.grounded = false;

  for (let frame = 0; frame < 20 && dragon.active; frame += 1) game.step(emptyInput());

  assert.equal(dragon.active, false);
  assert.equal(game.variables.score, 50);
  assert.ok(player.vy < 0);
  assert.ok(game.events.some((event) => event.type === "stomp"));
});

test("shards update score and the collected count", () => {
  const game = runtime();
  const shard = game.objects.find((object) => object.source.tags.includes("shard"))!;
  const player = game.player()!;
  player.x = shard.x;
  player.y = shard.y;
  game.step(emptyInput());

  assert.equal(shard.active, false);
  assert.equal(game.variables.score, 10);
  assert.equal(game.variables.shards, 1);
});

test("moving platforms carry the player and the summit ends the run", () => {
  const game = runtime();
  const player = game.player()!;
  const platform = game.objects.find((object) => object.source.name === "Drifting root A")!;
  const platformTop = collisionRect(platform.source, platform.x, platform.y).top;
  player.x = platform.x;
  player.y = platformTop - 61;
  player.vx = 0;
  player.vy = 0;
  for (let frame = 0; frame < 4; frame += 1) game.step(emptyInput());
  assert.ok(player.grounded, "the player should stand on the moving ledge");
  const start = player.x;
  for (let frame = 0; frame < 40; frame += 1) game.step(emptyInput());
  assert.ok(player.x > start + 20, "the player should move with the platform");

  const goal = game.objects.find((object) => object.source.tags.includes("goal"))!;
  player.x = goal.x;
  player.y = MEADOW_GROUND_TOP - 60;
  player.vy = 0;
  game.step(emptyInput());

  assert.equal(game.variables.won, true);
  assert.equal(game.status, "won");
  assert.ok(Number(game.variables.score) >= 100, "the summit awards its completion bonus");
});

test("render interpolation keeps motion smooth between fixed steps", () => {
  const game = runtime();
  const player = game.player()!;
  const startX = player.x;

  const idle = game.renderScene(0.5);
  const idlePlayer = idle.objects.find((object) => object.tags.includes("player"))!;
  assert.ok(Math.abs(idlePlayer.transform.x - startX) < 0.001, "a still object interpolates to itself");

  const input = emptyInput();
  input.right = true;
  const viewBefore = game.cameraView(0.5);
  for (let frame = 0; frame < 30; frame += 1) game.step(input);

  assert.ok(player.x > startX + 40);
  // alpha 0 shows the previous step, alpha 1 the current step: both bracket the
  // drawn position, and neither is the un-interpolated next value.
  const previous = game.renderScene(0).objects.find((object) => object.tags.includes("player"))!;
  const current = game.renderScene(1).objects.find((object) => object.tags.includes("player"))!;
  assert.ok(previous.transform.x < current.transform.x);
  const view = game.cameraView(0.5);
  assert.ok(view.x >= Math.min(viewBefore.x + 1, game.camera.x - 1), "camera is interpolated, not snapped");
});

test("losing every life ends the stage", () => {
  const game = runtime();
  game.variables.lives = 0;
  game.step(emptyInput());
  assert.equal(game.variables.lost, true);
  assert.equal(game.status, "lost");
});
