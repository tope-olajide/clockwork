import type { ProjectDocument, TemplateOrigin } from "./schema";

/**
 * A scenario is a code-registered derived setup for a test run. It is allowed to
 * add prefab instances at fixed positions so a criterion is reachable at all —
 * nothing else. It deliberately cannot write variables, health, score, status or
 * transforms of existing objects, so a scenario can never manufacture an outcome
 * that the runtime did not produce.
 */
export interface ScenarioSpawn {
  prefabId: string;
  count: number;
  x: number;
  y: number;
}

export interface GameTestScenario {
  id: string;
  templateOrigin: TemplateOrigin;
  label: string;
  description: string;
  spawns: ScenarioSpawn[];
}

export const GAME_TEST_SCENARIOS: GameTestScenario[] = [
  {
    id: "shooting-range",
    templateOrigin: "space-shooter",
    label: "Shooting range",
    description: "Places one Raider high in the lane and no asteroids, so a single shot has a real target within reach.",
    spawns: [{ prefabId: "pfb_shooter_enemy", count: 1, x: 640, y: 150 }],
  },
];

export function getGameTestScenario(id: string): GameTestScenario | undefined {
  return GAME_TEST_SCENARIOS.find((scenario) => scenario.id === id);
}

/**
 * Returns a copy of the document with the scenario's prefab instances placed in
 * the run's start scene, so frame zero already contains the derived setup.
 *
 * Applying to the document rather than the live runtime keeps `reset()` exact:
 * a restart rebuilds the same scenario from the same snapshot. Existing objects
 * are only copied, never moved or edited, and invalid setups are left untouched
 * (validation reports them separately).
 */
export function applyScenarioToDocument(
  scenario: GameTestScenario,
  document: ProjectDocument,
  sceneId: string,
): ProjectDocument {
  if (scenario.spawns.length === 0) return document;
  if (validateScenarioSetup(scenario, document, sceneId).length > 0) return document;
  const next = structuredClone(document);
  const scene = next.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) return document;

  for (const [spawnIndex, spawn] of scenario.spawns.entries()) {
    const prefab = next.prefabs.find((candidate) => candidate.id === spawn.prefabId);
    if (!prefab) continue;
    const sources = [prefab.root, ...prefab.objects];
    for (let copy = 0; copy < spawn.count; copy += 1) {
      const instanceId = `pinst_scenario_${scenario.id}_${spawnIndex}_${copy}`;
      const dx = spawn.x - prefab.root.transform.x;
      const dy = spawn.y - prefab.root.transform.y;
      const ids = new Map<string, string>();
      const created = sources.map((source, position) => {
        const clone = structuredClone(source);
        clone.id = `obj_scenario_${scenario.id}_${spawnIndex}_${copy}_${position}`;
        ids.set(source.id, clone.id);
        clone.transform = { ...clone.transform, x: clone.transform.x + dx, y: clone.transform.y + dy };
        clone.prefabId = prefab.id;
        clone.prefabInstanceId = instanceId;
        clone.prefabSlot = source.id === prefab.root.id ? "root" : `obj:${prefab.objects.indexOf(source)}`;
        return clone;
      });
      for (const clone of created) {
        if (clone.parentId) clone.parentId = ids.get(clone.parentId) ?? clone.parentId;
        scene.objects.push(clone);
      }
    }
  }
  return next;
}

/**
 * Validates a scenario's setup against a real document: every spawned prefab must
 * exist, counts and positions are bounded, and every instance must land inside
 * the scene the run starts in.
 */
export function validateScenarioSetup(
  scenario: GameTestScenario,
  document: ProjectDocument,
  sceneId: string,
): string[] {
  const errors: string[] = [];
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) return [`scenario "${scenario.id}": scene ${sceneId} does not exist`];

  for (const [index, spawn] of scenario.spawns.entries()) {
    const path = `scenario "${scenario.id}".spawns[${index}]`;
    if (!document.prefabs.some((prefab) => prefab.id === spawn.prefabId)) {
      errors.push(`${path}: prefab "${spawn.prefabId}" does not exist in this project`);
    }
    if (!Number.isInteger(spawn.count) || spawn.count < 1 || spawn.count > 8) {
      errors.push(`${path}: count must be an integer between 1 and 8`);
    }
    if (spawn.x < 0 || spawn.x > scene.size.w || spawn.y < 0 || spawn.y > scene.size.h) {
      errors.push(`${path}: spawn point (${spawn.x}, ${spawn.y}) is outside scene bounds ${scene.size.w}x${scene.size.h}`);
    }
  }
  return errors;
}
