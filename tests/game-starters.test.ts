import assert from "node:assert/strict";
import test from "node:test";
import { BEHAVIOR_CATALOG } from "../src/engine/model/behavior-catalog";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { GAME_STARTERS, GAME_STARTER_IDS } from "../src/engine/model/game-starters/catalog";
import { previewDataUrl } from "../src/engine/model/game-starters/preview";
import { projectDocumentSchema } from "../src/engine/model/schema";

test("catalog lists every starter exactly once", () => {
  assert.deepEqual(
    GAME_STARTERS.map((starter) => starter.id),
    [...GAME_STARTER_IDS],
  );
  for (const starter of GAME_STARTERS) {
    assert.ok(starter.name);
    assert.ok(starter.category);
    assert.ok(starter.blurb);
    assert.ok(starter.mechanics);
    assert.match(starter.accent, /^#[0-9a-f]{6}$/i);
  }
});

test("every starter is a valid primitive-only document", () => {
  for (const id of GAME_STARTER_IDS) {
    const parsed = projectDocumentSchema.parse(createGameStarterDocument(id, `Test ${id}`));
    assert.equal(parsed.templateOrigin, id);
    assert.ok(parsed.scenes.some((scene) => scene.id === parsed.startSceneId));
    const expectedGravity = {
      "space-shooter": 0,
      "space-invaders": 0,
      "asteroid-field": 0,
      "ping-pong": 0,
      "brick-breaker": 0,
      "flappy-flyer": 720,
      "platform-jumper": 980,
      "endless-runner": 1200,
    } as const;
    assert.equal(parsed.settings.gravity.y, expectedGravity[id]);

    for (const scene of parsed.scenes) {
      for (const object of scene.objects) {
        assert.notEqual(object.visual?.kind, "sprite");
        assert.notEqual(object.visual?.kind, "tilemap");
      }
    }
    for (const prefab of parsed.prefabs) {
      assert.notEqual(prefab.root.visual?.kind, "sprite");
      for (const object of prefab.objects) assert.notEqual(object.visual?.kind, "sprite");
    }

    const behaviorTypes = new Set(BEHAVIOR_CATALOG.map((spec) => spec.type));
    const allObjects = [
      ...parsed.scenes.flatMap((scene) => scene.objects),
      ...parsed.prefabs.flatMap((prefab) => [prefab.root, ...prefab.objects]),
    ];
    for (const object of allObjects) {
      for (const behavior of object.behaviors) assert.ok(behaviorTypes.has(behavior.type), behavior.type);
    }

    const variables = new Set(parsed.variables.map((variable) => variable.name));
    for (const widget of parsed.settings.ui.hud) assert.ok(variables.has(widget.variable), widget.variable);
  }
});

test("preview art comes from the real document", () => {
  const document = createGameStarterDocument("space-shooter", "Preview");
  const preview = previewDataUrl(document);
  assert.match(preview, /^data:image\/svg\+xml/);
  assert.match(decodeURIComponent(preview), /<polygon/);
});

test("document build is deterministic in object and prefab counts", () => {
  for (const id of GAME_STARTER_IDS) {
    const a = createGameStarterDocument(id, "A");
    const b = createGameStarterDocument(id, "B");
    assert.equal(a.scenes[0]?.objects.length, b.scenes[0]?.objects.length, id);
    assert.equal(a.prefabs.length, b.prefabs.length, id);
    assert.equal(a.scenes[0]?.rules.length, b.scenes[0]?.rules.length, id);
  }
});
