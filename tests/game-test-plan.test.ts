import assert from "node:assert/strict";
import test from "node:test";
import { createGameStarterDocument } from "../src/engine/model/game-starters/build";
import type { ProjectDocument } from "../src/engine/model/schema";
import { getGameTestProfile, type GameTestProfile } from "../src/engine/model/game-test-profile";
import { validateTestPlan, type TestPlan } from "../src/engine/model/game-test-plan";

function context(): { document: ProjectDocument; profile: GameTestProfile } {
  const document = createGameStarterDocument("space-shooter", "Plan Shooter");
  const profile = getGameTestProfile("space-shooter");
  assert.ok(profile);
  return { document, profile };
}

function validPlan(document: ProjectDocument): TestPlan {
  return {
    version: 1,
    sessionId: "session-fixture",
    projectId: document.id,
    sourceRevision: document.revision,
    snapshotId: "snapshot-fixture",
    sceneId: document.startSceneId,
    seed: 1234,
    userGoal: "Check that shooting works and enemies can be destroyed.",
    scenarioId: "shooting-range",
    phases: [
      {
        id: "input-projectile",
        objectiveId: "shoot-destroys-enemy",
        purpose: "An accepted SHOOT pulse creates a projectile that destroys the target.",
        kaneObjective: "Click SHOOT once, advance the frame batch, then read the AI state panel.",
        allowedControlIds: ["shoot", "move-right"],
        assertions: [
          { id: "projectiles-increased", observationId: "projectiles", operator: "increased", expected: 1 },
          { id: "enemy-count-decreased", observationId: "enemies", operator: "eq", expected: 0 },
          { id: "score-increased", observationId: "score", operator: "increased", expected: 100 },
        ],
        stopWhen: ["passed", "failed", "budget-exhausted"],
      },
    ],
    budget: {
      maxKanePhases: 2,
      maxKaneStepsPerPhase: 4,
      maxWallTimeSecondsPerPhase: 120,
      maxFramesPerAdvance: 300,
      maxFramesPerPhase: 1800,
    },
  };
}

test("a bounded plan that only uses profile controls and observations is accepted", () => {
  const { document, profile } = context();
  const result = validateTestPlan(validPlan(document), { document, profile });
  if (!result.ok) assert.fail(result.errors.join("; "));
  assert.equal(result.plan.phases.length, 1);
});

test("controls and observations outside the profile are rejected explicitly", () => {
  const { document, profile } = context();

  const unknownControl = validPlan(document);
  unknownControl.phases[0]!.allowedControlIds = ["teleport"];
  const controlResult = validateTestPlan(unknownControl, { document, profile });
  assert.equal(controlResult.ok, false);
  assert.match((controlResult as { errors: string[] }).errors.join("\n"), /unknown control "teleport"/);

  const unknownObservation = validPlan(document);
  unknownObservation.phases[0]!.assertions[0]!.observationId = "memory-address";
  const observationResult = validateTestPlan(unknownObservation, { document, profile });
  assert.equal(observationResult.ok, false);
  assert.match((observationResult as { errors: string[] }).errors.join("\n"), /unknown observation "memory-address"/);
});

test("a plan over the hard budget is rejected", () => {
  const { document, profile } = context();

  const tooManyPhases = validPlan(document);
  tooManyPhases.budget.maxKanePhases = 4;
  assert.equal(validateTestPlan(tooManyPhases, { document, profile }).ok, false);

  const phasesOverBudget = validPlan(document);
  phasesOverBudget.budget.maxKanePhases = 1;
  phasesOverBudget.phases = [phasesOverBudget.phases[0]!, { ...phasesOverBudget.phases[0]!, id: "second-phase" }];
  const result = validateTestPlan(phasesOverBudget, { document, profile });
  assert.equal(result.ok, false);
  assert.match((result as { errors: string[] }).errors.join("\n"), /maxKanePhases/);

  const framesOverAdvance = validPlan(document);
  framesOverAdvance.budget.maxFramesPerAdvance = 600;
  framesOverAdvance.budget.maxFramesPerPhase = 120;
  assert.equal(validateTestPlan(framesOverAdvance, { document, profile }).ok, false);

  const stepsAtCap = validPlan(document);
  stepsAtCap.budget.maxKaneStepsPerPhase = 12;
  assert.equal(validateTestPlan(stepsAtCap, { document, profile }).ok, true);

  const stepsOverCap = validPlan(document);
  stepsOverCap.budget.maxKaneStepsPerPhase = 13;
  assert.equal(validateTestPlan(stepsOverCap, { document, profile }).ok, false);

  const wallAtCap = validPlan(document);
  wallAtCap.budget.maxWallTimeSecondsPerPhase = 600;
  assert.equal(validateTestPlan(wallAtCap, { document, profile }).ok, true);

  const wallOverCap = validPlan(document);
  wallOverCap.budget.maxWallTimeSecondsPerPhase = 601;
  assert.equal(validateTestPlan(wallOverCap, { document, profile }).ok, false);
});

test("stale plans, missing scenes and foreign projects are rejected", () => {
  const { document, profile } = context();

  const stale = validPlan(document);
  stale.sourceRevision = document.revision + 1;
  const staleResult = validateTestPlan(stale, { document, profile });
  assert.equal(staleResult.ok, false);
  assert.match((staleResult as { errors: string[] }).errors.join("\n"), /revision/);

  const missingScene = validPlan(document);
  missingScene.sceneId = "scene-missing";
  assert.equal(validateTestPlan(missingScene, { document, profile }).ok, false);

  const foreign = validPlan(document);
  foreign.projectId = "another-project";
  assert.equal(validateTestPlan(foreign, { document, profile }).ok, false);
});

test("unregistered scenarios, URLs and code are rejected", () => {
  const { document, profile } = context();

  const unknownScenario = validPlan(document);
  unknownScenario.scenarioId = "god-mode";
  const scenarioResult = validateTestPlan(unknownScenario, { document, profile });
  assert.equal(scenarioResult.ok, false);
  assert.match((scenarioResult as { errors: string[] }).errors.join("\n"), /not allowed by profile/);

  const url = validPlan(document);
  url.phases[0]!.kaneObjective = "Open https://evil.example and click SHOOT.";
  assert.equal(validateTestPlan(url, { document, profile }).ok, false);

  const script = validPlan(document);
  script.userGoal = "Run javascript:alert(1) until the score rises.";
  assert.equal(validateTestPlan(script, { document, profile }).ok, false);
});

test("assertion semantics are checked per operator and objective", () => {
  const { document, profile } = context();

  const wrongIncrease = validPlan(document);
  wrongIncrease.phases[0]!.assertions[0]!.expected = "some";
  assert.equal(validateTestPlan(wrongIncrease, { document, profile }).ok, false);

  const negativeIncrease = validPlan(document);
  negativeIncrease.phases[0]!.assertions[0]!.expected = 0;
  assert.equal(validateTestPlan(negativeIncrease, { document, profile }).ok, false);

  const textCompared = validPlan(document);
  textCompared.phases[0]!.assertions[0] = {
    id: "projectiles-increased",
    observationId: "status",
    operator: "gt",
    expected: 1,
  };
  const textResult = validateTestPlan(textCompared, { document, profile });
  assert.equal(textResult.ok, false);
  assert.match((textResult as { errors: string[] }).errors.join("\n"), /needs a numeric observation/);

  const skippedCriterion = validPlan(document);
  skippedCriterion.phases[0]!.assertions = skippedCriterion.phases[0]!.assertions.filter(
    (assertion) => assertion.id !== "score-increased",
  );
  const coverageResult = validateTestPlan(skippedCriterion, { document, profile });
  assert.equal(coverageResult.ok, false);
  assert.match((coverageResult as { errors: string[] }).errors.join("\n"), /requires assertion "score-increased"/);
});

test("unknown plan fields and duplicate ids are rejected", () => {
  const { document, profile } = context();

  const extraField = { ...validPlan(document), executeScript: "score = 999" };
  assert.equal(validateTestPlan(extraField, { document, profile }).ok, false);

  const duplicatePhase = validPlan(document);
  duplicatePhase.phases.push({ ...duplicatePhase.phases[0]!, assertions: duplicatePhase.phases[0]!.assertions.map((assertion) => ({ ...assertion, id: `${assertion.id}-b` })) });
  assert.equal(validateTestPlan(duplicatePhase, { document, profile }).ok, false);

  const duplicateAssertion = validPlan(document);
  duplicateAssertion.phases[0]!.assertions.push({ ...duplicateAssertion.phases[0]!.assertions[0]! });
  const duplicateResult = validateTestPlan(duplicateAssertion, { document, profile });
  assert.equal(duplicateResult.ok, false);
  assert.match((duplicateResult as { errors: string[] }).errors.join("\n"), /duplicate assertion id/);
});
