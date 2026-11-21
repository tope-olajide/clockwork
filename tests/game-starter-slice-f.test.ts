import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { emptyInput, type InputFrame } from "../src/engine/runtime/input";
import { Runtime } from "../src/engine/runtime/runtime";

function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...emptyInput(), ...overrides };
}

function runtimeFor(): Runtime {
  return new Runtime(createGameStarterDocument("snake", "Test Snake"), undefined, 101);
}

function stepFrames(runtime: Runtime, count: number, input: InputFrame = emptyInput()): void {
  for (let index = 0; index < count; index += 1) runtime.step(input);
}

test("Snake moves on fixed intervals, rejects reversal, and queues turns", () => {
  const runtime = runtimeFor();
  const head = runtime.player()!;
  const start = { x: head.x, y: head.y };
  stepFrames(runtime, 7);
  assert.deepEqual({ x: head.x, y: head.y }, start, "the head should wait for its grid interval");

  runtime.step(emptyInput());
  assert.equal(head.x, start.x + 32, "the initial direction is right");
  stepFrames(runtime, 8, frame({ left: true }));
  assert.equal(head.x, start.x + 64, "holding the opposite direction cannot reverse into the body");

  stepFrames(runtime, 8, frame({ down: true }));
  assert.equal(head.x, start.x + 64);
  assert.equal(head.y, start.y + 32, "a perpendicular turn is queued until the next movement tick");
});

test("Snake grows from food, relocates it off the body, reaches the score threshold, and resets", () => {
  const runtime = runtimeFor();
  const head = runtime.player()!;
  const food = runtime.objects.find((object) => object.source.tags.includes("snake-food"))!;
  runtime.step(emptyInput());
  food.x = head.x + 32;
  food.y = head.y;
  stepFrames(runtime, 7);
  assert.equal(runtime.variables.score, 10);
  assert.equal(runtime.variables.length, 4);
  const body = runtime.objects.filter((object) => object.active && object.source.tags.includes("snake-body"));
  assert.equal(body.length, 3);
  assert.ok(body.every((segment) => segment.x !== food.x || segment.y !== food.y), "relocated food cannot overlap a segment");

  runtime.variables.score = 90;
  food.x = head.x + 32;
  food.y = head.y;
  stepFrames(runtime, 8);
  assert.equal(runtime.status, "won");
  assert.equal(runtime.variables.score, 100);

  runtime.reset();
  assert.equal(runtime.variables.score, 0);
  assert.equal(runtime.variables.length, 3);
  assert.equal(runtime.status, "running");
  runtime.step(emptyInput());
  assert.equal(runtime.objects.filter((object) => object.active && object.source.tags.includes("snake-body")).length, 2);
});

test("Snake wall collision produces a real loss state", () => {
  const runtime = runtimeFor();
  const head = runtime.player()!;
  runtime.step(emptyInput());
  head.x = 80 + 19 * 32 + 16;
  head.y = 40 + 7 * 32 + 16;
  stepFrames(runtime, 7);
  assert.equal(runtime.variables.lost, true);
  assert.equal(runtime.status, "lost");
});
