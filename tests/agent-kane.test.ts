import assert from "node:assert/strict";
import test from "node:test";
import { KANE_TOOL_DEFINITIONS, toolDefinitionsForRequest } from "../shared/ai-tools";
import { KANE_POLICY, buildSystemPrompt } from "../server/ai/system-prompt";
import { KANE_OBJECTIVE_MAX, verifyArgsFromToolCall } from "../src/features/agent/kane-tool-args";
import { changeAffectsGameplay, kaneCheckRequestMessage } from "../src/features/agent/verification-offer";
import type { ChangeSetSummary } from "../src/engine/ai/executor";

const names = (tools: Array<{ function: { name: string } }>) => tools.map((tool) => tool.function.name);

test("Kane tools are exposed only when allowKane is set", () => {
  const base = { toolsEnabled: true, visionEnabled: true, allowWrites: true };
  const without = names(toolDefinitionsForRequest(base));
  const withKane = names(toolDefinitionsForRequest({ ...base, allowKane: true }));
  for (const tool of KANE_TOOL_DEFINITIONS) {
    assert.ok(!without.includes(tool.function.name));
    assert.ok(withKane.includes(tool.function.name));
  }
  assert.deepEqual(withKane.filter((name) => !names(KANE_TOOL_DEFINITIONS).includes(name)), without);
});

test("the Kane tool schema exposes no url, command or path argument", () => {
  for (const tool of KANE_TOOL_DEFINITIONS) {
    const keys = Object.keys((tool.function.parameters as any).properties ?? {});
    for (const forbidden of ["url", "command", "args", "env", "path"]) assert.ok(!keys.includes(forbidden), `${tool.function.name} exposes ${forbidden}`);
  }
});

test("every mode's system prompt carries the Kane policy", () => {
  for (const mode of ["ask", "build", "plan"] as const) {
    const prompt = buildSystemPrompt(mode);
    assert.ok(prompt.includes(KANE_POLICY));
    assert.match(prompt, /verify_with_kane/);
    assert.match(prompt, /status is "passed"/);
  }
});

test("verify_with_kane forwards objective and sceneId and drops everything else", () => {
  const body = verifyArgsFromToolCall(
    { objective: "  Load the level  ", sceneId: "scene-2", url: "http://evil.example", command: "rm -rf /" },
    { snapshotId: "snapshot-1" },
  );
  assert.deepEqual(body, { snapshotId: "snapshot-1", objective: "Load the level", seed: 1234, sceneId: "scene-2" });
});

test("verify_with_kane bounds the objective and defaults a missing one", () => {
  const long = verifyArgsFromToolCall({ objective: "x".repeat(5_000) }, { snapshotId: "s" });
  assert.equal(long.objective.length, KANE_OBJECTIVE_MAX);
  const empty = verifyArgsFromToolCall({ objective: "   ", sceneId: 7 }, { snapshotId: "s" });
  assert.ok(empty.objective.length > 0);
  assert.ok(!("sceneId" in empty));
});

function change(partial: Partial<ChangeSetSummary["changes"][number]>): ChangeSetSummary {
  return {
    transactionId: "t",
    label: "l",
    revision: 1,
    undoable: true,
    changes: [{ entityId: "e", entityKind: "object", entityName: "n", op: "update", fields: [], ...partial }],
  };
}

test("renames and colour edits do not trigger a verification offer", () => {
  assert.equal(changeAffectsGameplay(change({ fields: [{ path: "name", before: "a", after: "b" }] })), false);
  assert.equal(changeAffectsGameplay(change({ fields: [{ path: "visual.tint", before: 1, after: 2 }] })), false);
  assert.equal(changeAffectsGameplay(change({ entityKind: "asset", op: "create" })), false);
  assert.equal(changeAffectsGameplay(null), false);
});

test("behaviour, physics, rule and structural edits trigger a verification offer", () => {
  assert.equal(changeAffectsGameplay(change({ fields: [{ path: "behaviors[0].speed", before: 1, after: 2 }] })), true);
  assert.equal(changeAffectsGameplay(change({ fields: [{ path: "body.type", before: "static", after: "dynamic" }] })), true);
  assert.equal(changeAffectsGameplay(change({ entityKind: "rule", op: "create" })), true);
  assert.equal(changeAffectsGameplay(change({ op: "delete" })), true);
  assert.equal(changeAffectsGameplay(change({ fields: [{ path: "name", before: "a", after: "b" }, { path: "transform.x", before: 0, after: 9 }] })), true);
});

test("the Ask-agent request names the tool and is bounded", () => {
  const message = kaneCheckRequestMessage("Collect the coin");
  assert.match(message, /verify_with_kane/);
  assert.match(message, /Collect the coin/);
  assert.ok(kaneCheckRequestMessage("y".repeat(3_000)).length < 900);
});