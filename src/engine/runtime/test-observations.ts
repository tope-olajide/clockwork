import type { GameTestProfile, ProfileObservation } from "../model/game-test-profile";
import type { ProjectDocument } from "../model/schema";
import { applyScenarioToDocument, getGameTestScenario, validateScenarioSetup } from "../model/game-test-scenarios";
import { TestController } from "./test-controller";

export function statusToken(controller: TestController): string {
  if (controller.runtime.lastError) return "ERROR";
  if (controller.status === "won") return "WON";
  if (controller.status === "lost" || controller.status === "stopped") return "LOST";
  return "PAUSED";
}

export function observationValue(
  controller: TestController,
  observation: ProfileObservation,
): string | number | boolean | null {
  switch (observation.source) {
    case "status":
      return statusToken(controller);
    case "variable":
      return controller.runtime.variables[observation.key ?? ""] ?? null;
    case "tag-count":
      return controller.countTag(observation.key ?? "");
    case "event-count":
      return controller.countEvents(observation.key ?? "");
    case "player": {
      const player = controller.runtime.player();
      if (!player) return null;
      return (player as unknown as Record<string, string | number | boolean>)[observation.key ?? ""] ?? null;
    }
    default:
      return null;
  }
}

export function acceptedInputCount(controller: TestController): number {
  // A queued control is not delivered until a frame actually carries it.
  return controller.receipts.filter((receipt) => receipt.accepted && receipt.pressFrame !== undefined).length;
}

/**
 * Frame-zero observation values for the approved plan. `increased` assertions
 * compare against these; the server rejects baselines for ids the phase does not
 * assert, so only observed values are included.
 */
export function observationBaselines(
  document: ProjectDocument,
  profile: GameTestProfile,
  seed: number,
  options: { sceneId?: string; scenarioId?: string } = {},
): Record<string, string | number | boolean> {
  const sceneId = options.sceneId ?? document.startSceneId;
  let runDocument = document;
  const scenario = options.scenarioId ? getGameTestScenario(options.scenarioId) : undefined;
  if (scenario && profile.scenarioIds.includes(scenario.id) && validateScenarioSetup(scenario, document, sceneId).length === 0) {
    runDocument = applyScenarioToDocument(scenario, document, sceneId);
  }
  const controller = new TestController(runDocument, { seed, sceneId });
  const baseline: Record<string, string | number | boolean> = {};
  for (const observation of profile.observations) {
    const value = observationValue(controller, observation);
    if (value !== null) baseline[observation.id] = value;
  }
  return baseline;
}

export function observationLabels(
  profile: GameTestProfile,
  observationIds: string[],
): Record<string, string> {
  const wanted = new Set(observationIds);
  const labels: Record<string, string> = {};
  for (const observation of profile.observations) {
    if (wanted.has(observation.id)) labels[observation.id] = observation.label;
  }
  return labels;
}
