import assert from "node:assert/strict";
import test from "node:test";
import { aiPlayArgsFromToolCall } from "../src/features/agent/kane-tool-args";

test("run_ai_play forwards goal and sceneId to the endpoint", () => {
  const body = aiPlayArgsFromToolCall(
    { goal: "Collect every coin before the timer ends", sceneId: "scene-level-2" },
    { snapshotId: "snapshot-1", projectId: "project-1" },
  );

  assert.deepEqual(body, {
    snapshotId: "snapshot-1",
    projectId: "project-1",
    seed: 1234,
    goal: "Collect every coin before the timer ends",
    sceneId: "scene-level-2",
  });
});

test("run_ai_play omits absent and non-string arguments instead of forwarding them", () => {
  const body = aiPlayArgsFromToolCall(
    { goal: "   ", sceneId: 42, maxAttempts: 2 },
    { snapshotId: "snapshot-1", projectId: undefined },
  );

  assert.deepEqual(body, { snapshotId: "snapshot-1", projectId: undefined, seed: 1234 });
});
