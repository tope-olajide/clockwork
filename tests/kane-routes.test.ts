import assert from "node:assert/strict";
import { join } from "node:path";
import test, { after, before } from "node:test";

// The route module reads its environment on import, so point it at the fixture
// CLI before loading it. The fixture only emits the documented NDJSON contract.
process.env.KANE_CLI = join(process.cwd(), "scripts", "kane", "fake-kane.mjs");
process.env.KANE_EVIDENCE_DIR = ".data/kane-route-tests";

type Routes = typeof import("../server/routes/kane");
type Repo = typeof import("../server/snapshots/repository");
let kaneRoutes: Routes["kaneRoutes"];
let repo: Repo;
const snapshotIds: string[] = [];

before(async () => {
  ({ kaneRoutes } = await import("../server/routes/kane"));
  repo = await import("../server/snapshots/repository");
});

after(() => {
  for (const id of snapshotIds) repo.deleteSnapshot(id);
});

function snapshot(projectId: string) {
  const stored = repo.createSnapshot({ id: projectId, name: "Fixture", startSceneId: "scene-a", scenes: [{ id: "scene-a" }, { id: "scene-b" }] }, [], 1);
  snapshotIds.push(stored.id);
  return stored.id;
}

const post = (path: string, body: unknown) =>
  kaneRoutes.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function drain(response: Response) {
  const events: any[] = [];
  const text = await response.text();
  for (const line of text.split("\n")) if (line.trim()) events.push(JSON.parse(line));
  return events;
}

test("/qa rejects a scene that is not in the snapshot", async () => {
  const response = await post("/qa", { snapshotId: snapshot("proj-scene"), objective: "Load it", sceneId: "nope" });
  assert.equal(response.status, 400);
  assert.equal((await response.json() as any).code, "kane-scene");
});

test("/qa forwards a valid sceneId and ends with a real run_end", async () => {
  const response = await post("/qa", { snapshotId: snapshot("proj-ok"), objective: "Load it", sceneId: "scene-b" });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("X-Kane-Run"));
  const events = await drain(response);
  const end = events.find((event) => event.type === "run_end");
  assert.equal(end?.result.status, "passed");
});

test("a second run for the same project is refused while one is active, then allowed", async () => {
  const id = snapshot("proj-busy");
  const first = await post("/qa", { snapshotId: id, objective: "Load it" });
  assert.equal(first.status, 200);
  const runId = first.headers.get("X-Kane-Run");
  assert.ok(runId);

  const qa = await post("/qa", { snapshotId: id, objective: "Load it again" });
  assert.equal(qa.status, 409);
  const qaBody = await qa.json() as any;
  assert.equal(qaBody.code, "kane-busy");
  assert.equal(qaBody.runId, runId);

  const play = await post("/ai-play", { snapshotId: id });
  assert.equal(play.status, 409);
  assert.equal((await play.json() as any).code, "kane-busy");

  await drain(first);
  const after = await post("/qa", { snapshotId: id, objective: "Load it a third time" });
  assert.equal(after.status, 200);
  await drain(after);
});

test("a different project is not blocked by an active run", async () => {
  const first = await post("/qa", { snapshotId: snapshot("proj-a"), objective: "Load it" });
  const second = await post("/qa", { snapshotId: snapshot("proj-b"), objective: "Load it" });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  await Promise.all([drain(first), drain(second)]);
});

test("the generic cancel route stops an active run and reports unknown ids", async () => {
  const first = await post("/qa", { snapshotId: snapshot("proj-cancel"), objective: "Load it" });
  const runId = first.headers.get("X-Kane-Run")!;
  const cancelled = await kaneRoutes.request(`/runs/${runId}/cancel`, { method: "POST" });
  assert.equal(cancelled.status, 200);
  const events = await drain(first);
  const end = events.find((event) => event.type === "run_end");
  assert.notEqual(end?.result?.status, "passed", "a cancelled run must never be reported as passed");

  const missing = await kaneRoutes.request("/runs/not-a-real-run/cancel", { method: "POST" });
  assert.equal(missing.status, 404);
});

const fixtureCheck = {
  title: "Coin raises score",
  steps: [{ control: "move-right", frames: 90 }],
  stepLabels: ["RUN STEP 1: MOVE RIGHT 90 FRAMES"],
  readouts: [{ id: "score", label: "SCORE", expected: "1" }, { id: "coin-count", label: "COIN COUNT", expected: "2" }],
};

test("/qa with a check opens paused Test Mode with the step buttons and judges stored values", async () => {
  process.env.KANE_FIXTURE_FINAL_STATE = JSON.stringify({ score: "1", coin_count: "2", last_error: "none" });
  try {
    const response = await post("/qa", { snapshotId: snapshot("proj-check-pass"), check: fixtureCheck });
    assert.equal(response.status, 200);
    const events = await drain(response);
    const command = events.find((event) => event.type === "stream_start")?.command ?? "";
    assert.match(command, /testMode=step/);
    assert.match(command, /steps=move-right%3A90/);
    assert.match(command, /RUN STEP 1: MOVE RIGHT 90 FRAMES/);
    const end = events.find((event) => event.type === "run_end");
    assert.equal(end?.result.status, "passed");
    assert.deepEqual(end?.result.check.outcomes.map((o: any) => [o.label, o.actual, o.passed]), [["SCORE", "1", true], ["COIN COUNT", "2", true]]);
  } finally {
    delete process.env.KANE_FIXTURE_FINAL_STATE;
  }
});

test("/qa with a check fails when Kane reads a different value even if Kane says passed", async () => {
  process.env.KANE_FIXTURE_FINAL_STATE = JSON.stringify({ score: "0", coin_count: "3", last_error: "none" });
  try {
    const response = await post("/qa", { snapshotId: snapshot("proj-check-wrong"), check: fixtureCheck });
    const end = (await drain(response)).find((event) => event.type === "run_end");
    assert.equal(end?.result.check.kaneStatus, "passed");
    assert.equal(end?.result.status, "failed");
  } finally {
    delete process.env.KANE_FIXTURE_FINAL_STATE;
  }
});

test("/qa rejects a malformed check before starting Kane", async () => {
  const response = await post("/qa", { snapshotId: snapshot("proj-check-bad"), check: { ...fixtureCheck, stepLabels: [] } });
  assert.equal(response.status, 400);
  assert.equal((await response.json() as any).code, "kane-check");
});
