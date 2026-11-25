import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import { GAME_STARTER_IDS } from "../src/engine/model/game-starters/catalog";
import { INPUT_ACTIONS, projectDocumentSchema } from "../src/engine/model/schema";
import {
  gameTestProfileForDocument,
  gameTestProfileSchema,
  getGameTestProfile,
  validateGameTestProfile,
  type GameTestProfile,
} from "../src/engine/model/game-test-profile";
import {
  applyScenarioToDocument,
  getGameTestScenario,
  validateScenarioSetup,
} from "../src/engine/model/game-test-scenarios";

/**
 * Starters that deliberately have no built-in profile. Their Test Mode is
 * derived from the project, so readouts for variables and tags added later
 * (for example a score and coins) appear automatically.
 */
const DERIVED_PROFILE_STARTERS = new Set<string>(["meadow-sandbox"]);

function shooterDocument() {
  return createGameStarterDocument("space-shooter", "Profile Shooter");
}

function shooterProfile(): GameTestProfile {
  const profile = getGameTestProfile("space-shooter");
  assert.ok(profile, "space-shooter should have a registered profile");
  return structuredClone(profile);
}

test("the space shooter profile is valid against a real starter document", () => {
  const result = validateGameTestProfile(shooterProfile(), { document: shooterDocument() });
  if (!result.ok) assert.fail(result.errors.join("; "));
  assert.equal(result.profile.version, 1);
});

test("profiles are resolved by templateOrigin and are not part of the document", () => {
  const document = shooterDocument();
  assert.equal(getGameTestProfile("blank"), undefined);
  assert.equal(gameTestProfileForDocument(document)?.version, 1);
  assert.equal(gameTestProfileForDocument(createGameStarterDocument("snake", "Snake"))?.version, 1);

  const parsed = projectDocumentSchema.parse(document);
  assert.equal("gameTest" in parsed, false, "profiles must never be persisted into the document");
  assert.equal(parsed.schemaVersion, 1);
});

test("every starter has a built-in profile that validates against its own document", () => {
  for (const id of GAME_STARTER_IDS) {
    const document = createGameStarterDocument(id, `Profile ${id}`);
    if (DERIVED_PROFILE_STARTERS.has(id)) {
      assert.equal(getGameTestProfile(id), undefined, `${id} must use the derived profile`);
    }
    const profile = DERIVED_PROFILE_STARTERS.has(id) ? gameTestProfileForDocument(document) : getGameTestProfile(id);
    assert.ok(profile, `${id} should have a registered profile`);
    const result = validateGameTestProfile(profile, { document });
    if (!result.ok) assert.fail(`${id}: ${result.errors.join("; ")}`);
    assert.ok(profile.controls.length > 0, `${id} needs at least one control`);
    assert.ok(profile.objectives.length > 0, `${id} needs at least one objective`);
  }
});

test("every control maps to an existing logical action with a unique label", () => {
  for (const id of GAME_STARTER_IDS) {
    const profile = gameTestProfileForDocument(createGameStarterDocument(id, "Controls"));
    assert.ok(profile);
    for (const control of profile.controls) {
      assert.ok((INPUT_ACTIONS as readonly string[]).includes(control.action), `${id}/${control.id} uses an unknown action`);
      assert.ok(control.label.length > 0);
    }
    assert.equal(new Set(profile.controls.map((control) => control.label)).size, profile.controls.length, `${id} repeats a label`);
    assert.equal(new Set(profile.controls.map((control) => control.action)).size, profile.controls.length, `${id} maps an action twice`);
  }
});

test("profiles exist only for registered game starters", () => {
  for (const origin of ["blank", "brief", "import", "platformer", "topdown", "puzzle"] as const) {
    assert.equal(getGameTestProfile(origin), undefined, `${origin} must stay profile-less`);
  }
});

test("an observation naming a missing variable or tag is rejected", () => {
  const document = shooterDocument();
  const missingVariable = shooterProfile();
  const observation = missingVariable.observations.find((candidate) => candidate.source === "variable");
  assert.ok(observation);
  observation.key = "ghostScore";
  const variableResult = validateGameTestProfile(missingVariable, { document });
  assert.equal(variableResult.ok, false);
  assert.match(variableResult.errors[0] ?? "", /ghostScore/);

  const missingTag = shooterProfile();
  const tagObservation = missingTag.observations.find((candidate) => candidate.source === "tag-count");
  assert.ok(tagObservation);
  tagObservation.key = "ghost-tag";
  const tagResult = validateGameTestProfile(missingTag, { document });
  assert.equal(tagResult.ok, false);
  assert.match(tagResult.errors[0] ?? "", /ghost-tag/);
});

test("profiles cannot invent actions, duplicate ids or observe status with a key", () => {
  const unknownAction = structuredClone(shooterProfile()) as unknown as Record<string, unknown>;
  (unknownAction.controls as Array<Record<string, unknown>>)[0]!.action = "teleport";
  assert.equal(gameTestProfileSchema.safeParse(unknownAction).success, false);

  const duplicateControl = shooterProfile();
  duplicateControl.controls.push({ ...duplicateControl.controls[0]! });
  assert.equal(gameTestProfileSchema.safeParse(duplicateControl).success, false);

  const duplicateAction = shooterProfile();
  duplicateAction.controls.push({ ...duplicateAction.controls[0]!, id: "move-left-again", label: "LEFT AGAIN" });
  assert.equal(gameTestProfileSchema.safeParse(duplicateAction).success, false);

  const statusWithKey = shooterProfile();
  statusWithKey.observations.push({ id: "status-key", label: "STATUS", source: "status", key: "status" });
  assert.equal(gameTestProfileSchema.safeParse(statusWithKey).success, false);

  const hiddenSource = shooterProfile();
  hiddenSource.observations.push({ id: "js", label: "JS", source: "eval" } as never);
  assert.equal(gameTestProfileSchema.safeParse(hiddenSource).success, false);
});

test("scenario ids must be registered and belong to the template", () => {
  const unknownScenario = shooterProfile();
  unknownScenario.scenarioIds = ["no-such-scenario"];
  const unknownResult = validateGameTestProfile(unknownScenario, { document: shooterDocument() });
  assert.equal(unknownResult.ok, false);
  assert.match(unknownResult.errors[0] ?? "", /not a registered scenario/);

  const foreignScenario = shooterProfile();
  foreignScenario.scenarioIds = ["shooting-range"];
  const foreignResult = validateGameTestProfile(foreignScenario, {
    document: createGameStarterDocument("space-invaders", "Invaders"),
  });
  assert.equal(foreignResult.ok, false);
  assert.match(foreignResult.errors[0] ?? "", /belongs to template/);

  const scenario = getGameTestScenario("shooting-range");
  assert.ok(scenario);
  const document = shooterDocument();
  assert.deepEqual(validateScenarioSetup(scenario, document, document.startSceneId), []);
});

test("a scenario setup cannot reference a missing prefab or leave scene bounds", () => {
  const document = shooterDocument();
  const scenario = getGameTestScenario("shooting-range");
  assert.ok(scenario);

  const missingPrefab = { ...scenario, spawns: [{ prefabId: "pfb_ghost", count: 1, x: 10, y: 10 }] };
  assert.match(validateScenarioSetup(missingPrefab, document, document.startSceneId)[0] ?? "", /does not exist/);

  const offscreen = { ...scenario, spawns: [{ prefabId: "pfb_shooter_enemy", count: 1, x: 999_999, y: 10 }] };
  assert.match(validateScenarioSetup(offscreen, document, document.startSceneId)[0] ?? "", /outside scene bounds/);

  const noScene = validateScenarioSetup(scenario, document, "scene-missing");
  assert.match(noScene[0] ?? "", /does not exist/);
});

test("applying a scenario copies its prefab into the start scene without editing the source", () => {
  const document = shooterDocument();
  const scenario = getGameTestScenario("shooting-range");
  assert.ok(scenario);
  const sceneId = document.startSceneId;
  const originalScene = document.scenes.find((scene) => scene.id === sceneId);
  const prefab = document.prefabs.find((candidate) => candidate.id === "pfb_shooter_enemy");
  assert.ok(originalScene && prefab);

  const applied = applyScenarioToDocument(scenario, document, sceneId);
  const scene = applied.scenes.find((candidate) => candidate.id === sceneId);
  assert.ok(scene);
  assert.equal(scene.objects.length, originalScene.objects.length + prefab.objects.length + 1);
  assert.equal(document.scenes.find((candidate) => candidate.id === sceneId)?.objects.length, originalScene.objects.length);

  const instance = scene.objects.filter((object) => object.prefabInstanceId?.startsWith("pinst_scenario_shooting-range_") === true);
  assert.equal(instance.length, prefab.objects.length + 1);
  const root = instance.find((object) => object.prefabSlot === "root");
  assert.ok(root);
  assert.equal(root.transform.x, 640);
  assert.equal(root.transform.y, 150);

  const invalid = applyScenarioToDocument(
    { ...scenario, spawns: [{ prefabId: "pfb_ghost", count: 1, x: 10, y: 10 }] },
    document,
    sceneId,
  );
  assert.equal(invalid, document, "an invalid setup must leave the document untouched");
});
