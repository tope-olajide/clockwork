import test from "node:test";
import assert from "node:assert/strict";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { previewCommands, applyCommandsInStore } from "../src/engine/ai/executor";
import { useEngineStore } from "../src/engine/store/engine-store";

// Build once: starter templates mutate module-level prefab roots, and an Immer
// preview freezes the document it returns.
const document = createGameStarterDocument("space-shooter", "Change set");
const scene = document.scenes[0]!;
const object = scene.objects[0]!;
const command = {
  type: "object.updateTransform",
  args: { sceneId: scene.id, objectId: object.id, transform: { ...object.transform, x: object.transform.x + 40 } },
};

test("a nested object transform preview resolves the real object id", () => {
  const result = previewCommands(document, {
    summary: "Move the player",
    expectedRevision: document.revision,
    commands: [command],
  });

  assert.equal(result.ok, true, result.message ?? "");
  assert.deepEqual(result.changedIds, [object.id]);
  const change = result.changeSet?.changes.find((candidate) => candidate.entityKind === "object");
  assert.equal(change?.entityId, object.id);
  assert.equal(change?.entityName, object.name);
  assert.ok((change?.fields.length ?? 0) >= 1);
});

test("applying the same batch reports the object id for presence", () => {
  useEngineStore.setState({
    document,
    activeSceneId: scene.id,
    selection: [object.id],
    history: [],
    future: [],
    revision: document.revision,
  } as never);

  const applied = applyCommandsInStore(
    useEngineStore.getState().dispatch as never,
    () => useEngineStore.getState().document,
    {
      summary: "Move the player",
      expectedRevision: document.revision,
      commands: [command],
    },
    "test-change-set",
  );

  assert.equal(applied.ok, true, applied.message ?? "");
  assert.ok(applied.changedIds?.includes(object.id));
  const change = applied.changeSet?.changes.find((candidate) => candidate.entityKind === "object");
  assert.equal(change?.entityId, object.id);
});
