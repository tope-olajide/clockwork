import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { emptyInput, type InputFrame } from "../src/engine/runtime/input";
import { Runtime } from "../src/engine/runtime/runtime";

function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...emptyInput(), ...overrides };
}

function runtimeFor(id: "arena-survival" | "falling-objects" | "maze-escape"): Runtime {
  return new Runtime(createGameStarterDocument(id, `Test ${id}`), undefined, 23);
}

test("Arena Survival melee damages nearby chasers, scores kills, and the timer wins", () => {
  const runtime = runtimeFor("arena-survival");
  const player = runtime.player()!;
  const enemy = runtime.objects.find((object) => object.source.tags.includes("enemy"))!;
  const melee = player.source.behaviors.find((behavior) => behavior.type === "melee")!;
  player.x = enemy.x;
  player.y = enemy.y;

  runtime.step(frame({ action: true, actionPressed: true }));
  assert.equal(enemy.hp, 1);
  player.behaviorTimers[melee.id] = 0;
  runtime.step(frame({ action: true, actionPressed: true }));
  assert.equal(enemy.active, false);
  assert.equal(runtime.variables.score, 10);

  const director = runtime.objects.find((object) => object.source.tags.includes("director"))!;
  director.source.behaviors.find((behavior) => behavior.type === "countdown")!.params.durationMs = 0;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "won");
  runtime.reset();
  assert.equal(runtime.variables.score, 0);
  assert.equal(runtime.variables.lives, 3);
});

test("Falling Objects constrains movement to the lane, damages on meteor contact, and wins on time", () => {
  const runtime = runtimeFor("falling-objects");
  const player = runtime.player()!;
  const fixedY = player.y;
  const oldX = player.x;
  runtime.step(frame({ right: true }));
  assert.ok(player.x > oldX);
  assert.equal(player.y, fixedY);

  const hazard = runtime.objects.find((object) => object.source.tags.includes("falling-hazard"))!;
  hazard.x = player.x;
  hazard.y = player.y;
  runtime.step(emptyInput());
  assert.equal(runtime.variables.lives, 2);
  assert.equal(player.active, true);

  const director = runtime.objects.find((object) => object.source.tags.includes("director"))!;
  director.source.behaviors.find((behavior) => behavior.type === "countdown")!.params.durationMs = 0;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "won");
});

test("Maze Escape routes the warden around walls and opens the exit only after fifteen dots", () => {
  const runtime = runtimeFor("maze-escape");
  const player = runtime.player()!;
  const enemy = runtime.objects.find((object) => object.source.tags.includes("maze-enemy"))!;
  const wallCellX = 5;
  const cellSize = 48;
  enemy.x = 4 * cellSize + cellSize / 2;
  enemy.y = 3 * cellSize + cellSize / 2;
  player.x = 6 * cellSize + cellSize / 2;
  player.y = 3 * cellSize + cellSize / 2;
  runtime.step(emptyInput());
  assert.ok(enemy.y > 3 * cellSize + cellSize / 2, "the warden should turn toward the opening instead of crossing the wall");
  assert.notEqual(Math.floor(enemy.x / cellSize), wallCellX);

  const exit = runtime.objects.find((object) => object.source.tags.includes("goal"))!;
  assert.equal(exit.source.body?.type, "static");
  runtime.variables.dots = 15;
  runtime.step(emptyInput());
  assert.equal(runtime.variables.exitOpen, true);
  assert.equal(exit.source.body?.type, "none");

  player.x = exit.x;
  player.y = exit.y;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "won");
  runtime.reset();
  assert.equal(runtime.variables.dots, 0);
  assert.equal(runtime.variables.exitOpen, false);
});
