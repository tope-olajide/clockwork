import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { TEST_MODE_LIMITS, TestController } from "../src/engine/runtime/test-controller";

function controller(options: { seed?: number; maxFramesPerPhase?: number } = {}) {
  return new TestController(createGameStarterDocument("space-shooter", "Test Mode"), { seed: 7, ...options });
}

test("a test session starts at frame zero and only moves when asked", () => {
  const session = controller();
  assert.equal(session.frame, 0);
  assert.equal(session.status, "running");
  assert.equal(session.framesAdvanced, 0);
  assert.equal(session.runtime.recordedInputs.length, 0);
});

test("advance steps exactly the requested frame count", () => {
  const session = controller();
  const result = session.advance(10);
  assert.equal(result.advancedFrames, 10);
  assert.equal(result.fromFrame, 0);
  assert.equal(result.toFrame, 10);
  assert.equal(session.frame, 10);
  assert.equal(session.runtime.recordedInputs.length, 10);
});

test("per-advance and per-session frame budgets are enforced", () => {
  const session = controller();
  const huge = session.advance(10_000);
  assert.equal(huge.advancedFrames, TEST_MODE_LIMITS.maxFramesPerAdvance);
  assert.equal(huge.clamped, true);

  const short = controller({ maxFramesPerPhase: 5 });
  const partial = short.advance(8);
  assert.equal(partial.advancedFrames, 5);
  assert.equal(partial.clamped, true);
  const exhausted = short.advance(1);
  assert.equal(exhausted.advancedFrames, 0);
  assert.equal(exhausted.reason, "frame budget exhausted");
});

test("a pulse is one press edge with a deterministic release", () => {
  const session = controller();
  const receipt = session.enqueue({ controlId: "shoot", action: "jump", mode: "pulse", frames: 2 });
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.pressFrame, undefined, "a queued control is not delivered yet");

  const result = session.advance(4);
  const frames = session.runtime.recordedInputs;

  assert.equal(frames[0]?.jump, true);
  assert.equal(frames[0]?.jumpPressed, true);
  assert.equal(frames[1]?.jump, true);
  assert.equal(frames[1]?.jumpPressed, false, "a pulse must not repeat the press edge");
  assert.equal(frames[2]?.jump, false);
  assert.equal(frames[2]?.jumpReleased, true, "release must happen on a simulation frame, not on a timer");

  const stored = result.receipts.find((item) => item.controlId === "shoot");
  assert.equal(stored?.pressFrame, 1);
  assert.equal(stored?.releaseFrame, 2);
  assert.equal(session.activeControlIds().length, 0);
});

test("a queued shoot spawns a real projectile through the runtime", () => {
  const session = controller();
  // The authored shooter behavior has a 190 ms cooldown that starts from zero, so
  // the held control must outlast it; a short pulse cannot fire. See the Phase 2
  // finding on SHOOT pulses in the implementation report.
  session.enqueue({ controlId: "shoot", action: "jump", mode: "hold", frames: 15 });
  session.advance(15);
  assert.ok(session.countEvents("shoot") > 0, "the authored shooter behavior should fire while SHOOT is held");
  assert.ok(session.countTag("player-bullet") > 0, "a real projectile entity should exist");
  session.release("shoot");
  assert.equal(session.activeControlIds().length, 0);
});

test("holds persist across frames until released", () => {
  const session = controller();
  session.enqueue({ controlId: "move-right", action: "right", mode: "hold", frames: 3 });
  session.advance(2);
  assert.deepEqual(session.runtime.recordedInputs.map((frame) => frame.right), [true, true]);

  session.release("move-right");
  session.advance(3);
  assert.equal(session.runtime.recordedInputs[2]?.right, false, "release starts on the next frame");
  assert.equal(session.runtime.recordedInputs[4]?.right, false);
  assert.equal(session.activeControlIds().length, 0);
});

test("simultaneous controls share one InputFrame", () => {
  const session = controller();
  session.enqueue({ controlId: "move-left", action: "left", mode: "hold", frames: 2 });
  session.enqueue({ controlId: "shoot", action: "jump", mode: "pulse", frames: 1 });
  session.advance(1);
  const frame = session.runtime.recordedInputs[0]!;
  assert.equal(frame.left, true);
  assert.equal(frame.jump, true);
  assert.equal(frame.jumpPressed, true);
});

test("rejected inputs are reported instead of silently dropped", () => {
  const session = controller();
  const first = session.enqueue({ controlId: "shoot", action: "jump", mode: "hold" });
  assert.equal(first.accepted, true);
  const duplicate = session.enqueue({ controlId: "shoot", action: "jump", mode: "pulse" });
  assert.equal(duplicate.accepted, false);
  assert.match(duplicate.reason ?? "", /already down/);

  const released = session.enqueue({ controlId: "late", action: "action", mode: "pulse" });
  assert.equal(released.accepted, true);
  session.release("shoot");
  session.release("late");
  assert.equal(session.receipts.find((item) => item.controlId === "late")?.reason, "released before the next frame");

  session.runtime.status = "won";
  const stopped = session.enqueue({ controlId: "shoot", action: "jump", mode: "pulse" });
  assert.equal(stopped.accepted, false);
  assert.match(stopped.reason ?? "", /not running/);
  assert.equal(session.advance(3).advancedFrames, 0);
});

test("a terminal runtime stops advancing and releases held controls", () => {
  const session = controller();
  session.enqueue({ controlId: "move-right", action: "right", mode: "hold" });
  session.advance(1);
  session.runtime.status = "won";
  const result = session.advance(5);
  assert.equal(result.advancedFrames, 0);
  assert.equal(result.reason, "runtime is not running");
  assert.equal(session.activeControlIds().length, 0);
});

test("reset restores frame zero, clear receipts and the same seeded state", () => {
  const session = controller();
  session.enqueue({ controlId: "shoot", action: "jump", mode: "pulse" });
  session.advance(12);
  const before = { ...session.runtime.variables };
  assert.ok(session.receipts.length > 0);

  session.reset();
  assert.equal(session.frame, 0);
  assert.equal(session.receipts.length, 0);
  assert.equal(session.runtime.lastError, null);
  assert.equal(session.runtime.variables.score, 0);

  session.enqueue({ controlId: "shoot", action: "jump", mode: "pulse" });
  session.advance(12);
  assert.deepEqual({ ...session.runtime.variables }, before, "same document, seed and inputs must replay identically");
});
