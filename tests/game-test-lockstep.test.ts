import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import type { GameStarterId } from "../src/engine/model/game-starters/catalog";
import { getGameTestProfile } from "../src/engine/model/game-test-profile";
import { TestController } from "../src/engine/runtime/test-controller";

/**
 * Lockstep coverage for every starter's control family.
 *
 * These are runtime proofs, not browser evidence: each test uses the declared
 * profile control and the deterministic TestController clock, so the same input
 * sequence always produces the same frames. Cooldown-gated actions (fire, serve)
 * are declared as holds because a 1–6 frame pulse cannot outlast their delay.
 */
function session(id: GameStarterId): TestController {
  return new TestController(createGameStarterDocument(id, `Lockstep ${id}`), { seed: 7 });
}

function control(id: GameStarterId, controlId: string) {
  const profile = getGameTestProfile(id);
  assert.ok(profile, `${id} should have a profile`);
  const found = profile.controls.find((candidate) => candidate.id === controlId);
  assert.ok(found, `${id} should declare control "${controlId}"`);
  return found;
}

function press(id: GameStarterId, controlId: string, frames: number) {
  const active = session(id);
  const declared = control(id, controlId);
  const receipt = active.enqueue({
    controlId: declared.id,
    action: declared.action,
    mode: declared.mode,
    frames,
  });
  assert.equal(receipt.accepted, true, `${id}/${controlId} should be accepted`);
  active.advance(frames);
  assert.equal(active.runtime.lastError, null, `${id}/${controlId} should not error`);
  return { session: active, receipt };
}

test("cooldown-gated fire controls are holds and produce real projectiles", () => {
  const shooters: Array<[GameStarterId, string, number]> = [
    ["space-shooter", "shoot", 13],
    ["space-invaders", "fire", 17],
    ["asteroid-field", "fire", 16],
  ];
  for (const [id, controlId, frames] of shooters) {
    assert.equal(control(id, controlId).mode, "hold", `${id}/${controlId} needs a hold to clear its cooldown`);
    const { session: active } = press(id, controlId, frames);
    assert.ok(active.countEvents("shoot") > 0, `${id} should emit a shoot event`);
    assert.ok(active.countTag("player-bullet") > 0, `${id} should create a player bullet`);
  }
});

test("held movement controls move the player in the declared direction", () => {
  const cases: Array<[GameStarterId, string, (x: number, y: number) => number, 1 | -1, string]> = [
    ["space-shooter", "move-right", (x) => x, 1, "x"],
    ["space-invaders", "move-left", (x) => x, -1, "x"],
    ["ping-pong", "move-down", (_x, y) => y, 1, "y"],
    ["brick-breaker", "move-right", (x) => x, 1, "x"],
    ["arena-survival", "move-right", (x) => x, 1, "x"],
    ["falling-objects", "move-right", (x) => x, 1, "x"],
    ["maze-escape", "move-down", (_x, y) => y, 1, "y"],
  ];
  for (const [id, controlId, read, direction, axis] of cases) {
    const active = session(id);
    const before = active.runtime.player();
    assert.ok(before, `${id} should have a player`);
    const start = read(before.x, before.y);
    active.enqueue({
      controlId: control(id, controlId).id,
      action: control(id, controlId).action,
      mode: control(id, controlId).mode,
      frames: 10,
    });
    active.advance(10);
    const after = active.runtime.player();
    assert.ok(after, `${id} should still have a player`);
    assert.equal(
      Math.sign(read(after.x, after.y) - start),
      direction,
      `${id}/${controlId} should move ${axis} by ${direction}`,
    );
  }
});

test("Asteroid Field turning is a held rotation, not a pulse", () => {
  const active = session("asteroid-field");
  const before = active.runtime.player()!.rotation;
  active.enqueue({ controlId: "turn-right", action: "right", mode: "hold", frames: 10 });
  active.advance(10);
  assert.ok(active.runtime.player()!.rotation > before);
});

test("a pulse is delivered as one press edge for flap, jump and attack", () => {
  const pulses: Array<[GameStarterId, string, string]> = [
    ["flappy-flyer", "flap", "flap"],
    ["platform-jumper", "jump", "jump"],
    ["endless-runner", "jump", "jump"],
  ];
  for (const [id, controlId, event] of pulses) {
    const { session: active } = press(id, controlId, 2);
    const receipt = active.receipts.find((candidate) => candidate.controlId === controlId);
    assert.equal(control(id, controlId).mode, "pulse");
    assert.equal(receipt?.pressFrame, 1);
    assert.equal(receipt?.releaseFrame, 2);
    assert.equal(active.runtime.recordedInputs[0]?.jumpPressed, true, `${id} press edge`);
    assert.equal(active.runtime.recordedInputs[1]?.jumpPressed, false, `${id} must not repeat the edge`);
    // Jump/flap events are emitted after the controller's ground probe advances.
    active.advance(8);
    assert.ok(active.countEvents(event) > 0, `${id} should emit a ${event} event`);
  }

  const arena = press("arena-survival", "attack", 2).session;
  assert.equal(arena.runtime.recordedInputs[0]?.actionPressed, true);
  assert.equal(arena.runtime.recordedInputs[1]?.actionPressed, false);
  assert.equal(arena.runtime.lastError, null);
});

test("Endless Runner duck is a hold that lasts exactly its planned frames", () => {
  const active = session("endless-runner");
  active.enqueue({ controlId: "duck", action: "down", mode: "hold", frames: 5 });
  active.advance(5);
  assert.deepEqual(active.runtime.recordedInputs.map((frame) => frame.down), [true, true, true, true, true]);
  assert.equal(active.runtime.recordedInputs[0]?.down, true);
  assert.equal(active.activeControlIds().length, 0, "a capped hold releases itself on the last frame");
});

test("Brick Breaker serve needs its hold to clear the serve delay", () => {
  assert.equal(control("brick-breaker", "serve").mode, "hold");
  const { session: active } = press("brick-breaker", "serve", 40);
  assert.ok(active.countEvents("serve") > 0, "the ball should launch after the serve delay");
});

test("Ping Pong serves automatically and exposes no serve control", () => {
  const profile = getGameTestProfile("ping-pong");
  assert.ok(profile);
  assert.equal(profile.controls.some((candidate) => candidate.id === "serve"), false);
  const active = session("ping-pong");
  active.advance(60);
  assert.ok(active.countEvents("serve") > 0, "the authored ball auto-serves after its delay");
});

test("Snake turns are queued pulses that move the head on the next grid step", () => {
  const active = session("snake");
  const before = active.runtime.player()!.y;
  active.enqueue({ controlId: "turn-down", action: "down", mode: "pulse" });
  const receipt = active.receipts[0];
  assert.equal(receipt?.accepted, true);
  active.advance(20);
  assert.ok(active.runtime.player()!.y > before, "the queued down turn should move the head down");
  assert.equal(active.runtime.variables.lost, false);
});

test("reset replays the same lockstep movement for a non-shooter", () => {
  const active = session("ping-pong");
  active.enqueue({ controlId: "move-down", action: "down", mode: "hold", frames: 10 });
  active.advance(10);
  const first = active.runtime.player()!.y;
  active.reset();
  active.enqueue({ controlId: "move-down", action: "down", mode: "hold", frames: 10 });
  active.advance(10);
  assert.equal(active.runtime.player()!.y, first);
});
