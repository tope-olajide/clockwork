import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { emptyInput, type InputFrame } from "../src/engine/runtime/input";
import { Runtime, type RuntimeObject } from "../src/engine/runtime/runtime";

function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...emptyInput(), ...overrides };
}

function runtimeFor(id: "ping-pong" | "brick-breaker" | "flappy-flyer"): Runtime {
  return new Runtime(createGameStarterDocument(id, `Test ${id}`), undefined, 73);
}

function behaviorId(object: RuntimeObject, type: string): string {
  return object.source.behaviors.find((behavior) => behavior.type === type)!.id;
}

test("Ping Pong serves, bounces off both paddles, scores misses, and resets", () => {
  const runtime = runtimeFor("ping-pong");
  const ball = runtime.objects.find((object) => object.source.tags.includes("ball"))!;
  const player = runtime.objects.find((object) => object.source.tags.includes("player"))!;
  const ai = runtime.objects.find((object) => object.source.tags.includes("opponent"))!;
  const ballBehavior = behaviorId(ball, "ball");

  for (let index = 0; index < 60; index += 1) runtime.step(emptyInput());
  assert.ok(ball.vx > 0, "automatic serve should head toward the computer");

  ball.x = player.x + 20;
  ball.y = player.y;
  ball.vx = -380;
  ball.vy = 0;
  runtime.step(emptyInput());
  assert.ok(ball.vx > 0, "player paddle should return the ball");

  ball.x = ai.x - 20;
  ball.y = ai.y;
  ball.vx = 380;
  ball.vy = 0;
  runtime.step(emptyInput());
  assert.ok(ball.vx < 0, "computer paddle should return the ball");

  ball.x = -20;
  ball.vx = -380;
  runtime.step(emptyInput());
  assert.equal(runtime.variables.rightScore, 1);
  assert.equal(ball.behaviorTimers[`${ballBehavior}:state`], 1);
  runtime.reset();
  assert.equal(runtime.variables.rightScore, 0);
  assert.equal(runtime.status, "running");
});

test("Ping Pong paddle input is clamped and AI speed stays bounded", () => {
  const runtime = runtimeFor("ping-pong");
  const player = runtime.objects.find((object) => object.source.tags.includes("player"))!;
  const ai = runtime.objects.find((object) => object.source.tags.includes("opponent"))!;
  const oldPlayerY = player.y;
  runtime.step(frame({ down: true }));
  assert.ok(player.y > oldPlayerY && player.y <= oldPlayerY + 500 / 60);
  player.y = 639;
  runtime.step(frame({ down: true }));
  assert.ok(player.y <= 556);

  const oldAiY = ai.y;
  runtime.step(emptyInput());
  assert.ok(Math.abs(ai.y - oldAiY) <= 235 / 60 + 1e-6);
});

test("Brick Breaker damages bricks, bounces from the paddle, loses lives, wins, and resets", () => {
  const runtime = runtimeFor("brick-breaker");
  const ball = runtime.objects.find((object) => object.source.tags.includes("ball"))!;
  const paddle = runtime.objects.find((object) => object.source.tags.includes("paddle"))!;
  const brick = runtime.objects.find((object) => object.source.tags.includes("brick"))!;
  const ballBehavior = behaviorId(ball, "ball");

  ball.behaviorTimers[`${ballBehavior}:state`] = 2;
  ball.x = brick.x;
  ball.y = brick.y + 28;
  ball.vx = 0;
  ball.vy = -480;
  runtime.step(emptyInput());
  assert.ok((brick.hp ?? 0) < Number(brick.source.behaviors.find((behavior) => behavior.type === "health")!.params.max));

  ball.x = paddle.x;
  ball.y = paddle.y - 4;
  ball.vx = 0;
  ball.vy = 480;
  runtime.step(emptyInput());
  assert.ok(ball.vy < 0, "the ball should depenetrate and bounce upward from the paddle");

  ball.y = 790;
  ball.vy = 480;
  runtime.step(emptyInput());
  assert.equal(runtime.variables.lives, 2);
  assert.equal(ball.behaviorTimers[`${ballBehavior}:state`], 1);

  runtime.variables.bricks = 0;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "won");
  runtime.reset();
  assert.equal(runtime.variables.bricks, 50);
  assert.equal(runtime.variables.lives, 3);
  assert.equal(runtime.status, "running");
});

test("Flappy Flyer applies flap impulse, scores gates, loses on collisions, and resets", () => {
  const runtime = runtimeFor("flappy-flyer");
  const player = runtime.objects.find((object) => object.source.tags.includes("player"))!;
  const director = runtime.objects.find((object) => object.source.tags.includes("director"))!;
  const spawner = director.source.behaviors.find((behavior) => behavior.type === "spawner")!;
  spawner.params.startDelayMs = 0;
  spawner.params.intervalMs = 16;
  runtime.step(frame({ jumpPressed: true }));
  assert.ok(player.vy < 0, "a press edge should flap upward");

  const marker = runtime.objects.find((object) => object.active && object.source.prefabId === "pfb_flappy_gate");
  assert.ok(marker, "the director should spawn a moving gate");
  marker!.x = 291;
  runtime.step(emptyInput());
  assert.equal(runtime.variables.score, 1);

  player.y = 690;
  player.vy = 520;
  runtime.step(emptyInput());
  assert.equal(runtime.status, "lost");
  runtime.reset();
  assert.equal(runtime.variables.score, 0);
  assert.equal(runtime.status, "running");
});

test("Brick Breaker speed-up never exceeds its configured cap", () => {
  const runtime = runtimeFor("brick-breaker");
  const ball = runtime.objects.find((object) => object.source.tags.includes("ball"))!;
  const behavior = ball.source.behaviors.find((item) => item.type === "ball")!;
  const maxSpeed = Number(behavior.params.maxSpeed);
  const hitsKey = `${behavior.id}:hits`;
  ball.behaviorTimers[`${behavior.id}:state`] = 2;
  ball.behaviorTimers[hitsKey] = 3;
  const brick = runtime.objects.find((object) => object.source.tags.includes("brick"))!;
  ball.x = brick.x;
  ball.y = brick.y + 28;
  ball.vx = 0;
  ball.vy = -500;
  runtime.step(emptyInput());
  assert.ok(Math.hypot(ball.vx, ball.vy) > 500);
  assert.ok(Math.hypot(ball.vx, ball.vy) <= maxSpeed);
});

