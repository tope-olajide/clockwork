import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import type { KanePhaseRequest } from "../shared/protocol/game-testing";
import { listReplayTests, resolveReplayTest } from "../server/kane/replay-tests";
import { phaseFingerprint, validatePhaseRequest } from "../server/kane/phase";
import { startKaneRun } from "../server/kane/runner";

const fakeKane = join(process.cwd(), "scripts", "kane", "fake-kane.mjs");
const evidenceRoot = ".data/kane-replay-tests";

function baseRequest(overrides: Partial<KanePhaseRequest> = {}): KanePhaseRequest {
  return {
    sessionId: "session-3-1234-projectone",
    snapshotId: "snapshot-1",
    phaseId: "fire-creates-projectile",
    plan: {
      version: 1,
      projectId: "project-one",
      sourceRevision: 3,
      sceneId: "main",
      seed: 1234,
      userGoal: "Verify shooting creates projectiles.",
      phases: [
        {
          id: "fire-creates-projectile",
          purpose: "Fire and read the projectile counters",
          kaneObjective: "Hold shoot and advance frames, then record the counters.",
          allowedControlIds: ["shoot"],
          assertions: [
            { id: "shots", observationId: "shots-fired", operator: "gte", expected: 1 },
          ],
          stopWhen: ["passed", "failed"],
        },
      ],
      budget: {
        maxKanePhases: 2,
        maxKaneStepsPerPhase: 6,
        maxWallTimeSecondsPerPhase: 120,
        maxFramesPerAdvance: 600,
        maxFramesPerPhase: 3600,
      },
    },
    ...overrides,
  };
}

const document = { id: "project-one", revision: 3, scenes: [{ id: "main" }] };

test("unknown replay keys are rejected, never resolved to a path", () => {
  for (const key of ["no-such-replay", "../kane/runner", "", 42, null]) {
    const resolved = resolveReplayTest(key);
    assert.equal(resolved.ok, false);
    assert.match(resolved.error, /No recorded replay|Unknown replay test/);
  }
});

test("the registry lists only keys, phase ids and labels", () => {
  for (const entry of listReplayTests()) {
    assert.equal(typeof entry.key, "string");
    assert.equal(typeof entry.phaseId, "string");
    assert.equal(typeof entry.label, "string");
    assert.equal("testFile" in entry, false);
    assert.equal("file" in entry, false);
  }
  assert.ok(listReplayTests().some((entry) => entry.key === "space-shooter-fire"));
});

test("a registered replay resolves inside the project to a _test.md file", () => {
  const resolved = resolveReplayTest("space-shooter-fire");
  assert.equal(resolved.ok, true);
  if (!resolved.ok) throw new Error("unreachable");
  assert.match(resolved.file, /space-shooter-fire_test\.md$/);
  assert.equal(resolved.entry.phaseId, "fire-creates-projectile");
});

test("a replay key changes the request fingerprint and validates", () => {
  const plain = baseRequest();
  const replay = baseRequest({ replayTestKey: "space-shooter-fire" });
  assert.notEqual(phaseFingerprint(replay), phaseFingerprint(plain));
  assert.equal(validatePhaseRequest(plain, document).ok, true);
  assert.equal(validatePhaseRequest(replay, document).ok, true);
  assert.equal(validatePhaseRequest(baseRequest({ replayTestKey: "Nope!" }), document).ok, false);
});

test("a saved-test run uses testmd with healing disabled", async () => {
  const previous = process.env.KANE_CLI;
  process.env.KANE_CLI = fakeKane;
  try {
    const run = startKaneRun({
      objective: "Replay fixture objective",
      savedTest: join(process.cwd(), "scripts", "kane", "tests", "phases", "space-shooter-fire_test.md"),
      url: "http://localhost:3000/s/fixture?ai=1&seed=1234",
      evidenceRoot,
    });
    let command = "";
    for await (const event of run.events) {
      if (event.type === "stream_start") command = (event as { command?: string }).command ?? "";
      if (event.type === "run_end") {
        assert.match(command, /testmd run/);
        assert.match(command, /--no-adaptive-heal/);
        assert.ok(!/--push/.test(command), "push needs lock-API credentials this environment lacks");
        assert.equal(event.result.status, "passed");
        assert.match(event.result.summary, /2 replayed, 0 authored/);
        return;
      }
    }
    throw new Error("Replay fixture never emitted run_end.");
  } finally {
    if (previous === undefined) delete process.env.KANE_CLI;
    else process.env.KANE_CLI = previous;
  }
});

test("a replay keeps the Test Manager link from share_url", async () => {
  const previousCli = process.env.KANE_CLI;
  const previousShare = process.env.KANE_FIXTURE_SHARE_URL;
  process.env.KANE_CLI = fakeKane;
  process.env.KANE_FIXTURE_SHARE_URL = "https://test-manager.example/runs/abc";
  try {
    const run = startKaneRun({
      objective: "Replay fixture objective",
      savedTest: join(process.cwd(), "scripts", "kane", "tests", "phases", "space-shooter-fire_test.md"),
      url: "http://localhost:3000/s/fixture?ai=1&seed=1234",
      evidenceRoot,
    });
    for await (const event of run.events) {
      if (event.type === "run_end") {
        assert.equal(event.result.testUrl, "https://test-manager.example/runs/abc");
        assert.ok(event.result.evidenceUrl, "the evidence pack stays attached on replay");
        return;
      }
    }
    throw new Error("Replay fixture never emitted run_end.");
  } finally {
    if (previousCli === undefined) delete process.env.KANE_CLI;
    else process.env.KANE_CLI = previousCli;
    if (previousShare === undefined) delete process.env.KANE_FIXTURE_SHARE_URL;
    else process.env.KANE_FIXTURE_SHARE_URL = previousShare;
  }
});
