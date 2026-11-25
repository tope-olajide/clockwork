import type { GameTestProfile, ProfileControl, ProfileObservation } from "./game-test-profile";
import type { ProjectDocument } from "./schema";

/**
 * A Test Mode profile built from the project itself, used when the template has
 * no hand-written profile (Blank, Platformer, imported, agent-built games).
 *
 * Controls relabel the six real logical actions; they feed the same
 * InputManager path as normal play. Readouts only observe state the runtime
 * already has: status, player position, every variable, tag counts and event
 * counts. Nothing here can change gameplay.
 */

const CONTROLS: ProfileControl[] = [
  { id: "move-left", label: "MOVE LEFT", action: "left", mode: "hold", description: "Holds the left action for the step's frames." },
  { id: "move-right", label: "MOVE RIGHT", action: "right", mode: "hold", description: "Holds the right action for the step's frames." },
  { id: "move-up", label: "MOVE UP", action: "up", mode: "hold", description: "Holds the up action for the step's frames." },
  { id: "move-down", label: "MOVE DOWN", action: "down", mode: "hold", description: "Holds the down action for the step's frames." },
  { id: "jump", label: "JUMP", action: "jump", mode: "pulse", description: "Presses jump once, then the game runs the step's frames." },
  { id: "action", label: "ACTION", action: "action", mode: "pulse", description: "Presses action once, then the game runs the step's frames." },
];

const EVENT_READOUTS: Array<{ key: string; label: string }> = [
  { key: "collect", label: "COLLECTED" },
  { key: "death", label: "DESTROYED" },
  { key: "damage", label: "DAMAGE EVENTS" },
  { key: "shoot", label: "SHOTS FIRED" },
];

const MAX_VARIABLES = 10;
const MAX_TAGS = 6;
const RESERVED_IDS = new Set(["status", "player-x", "player-y"]);

/** Labels end up inside Kane's objective text, so keep them to a safe alphabet. */
export function safeLabel(text: string, fallback: string): string {
  const clean = text.toUpperCase().replace(/[^A-Z0-9 _-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 28);
  return clean || fallback;
}

function slug(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function documentTags(document: ProjectDocument): string[] {
  const tags = new Set<string>();
  for (const scene of document.scenes) for (const object of scene.objects) for (const tag of object.tags) tags.add(tag);
  for (const prefab of document.prefabs) {
    for (const object of [prefab.root, ...prefab.objects]) for (const tag of object.tags) tags.add(tag);
  }
  tags.delete("player");
  return [...tags].sort();
}

export function deriveGameTestProfile(document: ProjectDocument): GameTestProfile {
  const used = new Set<string>(RESERVED_IDS);
  const unique = (base: string, fallback: string) => {
    let id = slug(base) || fallback;
    if (!/^[a-z0-9]/.test(id)) id = `${fallback}-${id}`;
    let candidate = id;
    for (let n = 2; used.has(candidate); n += 1) candidate = `${id}-${n}`;
    used.add(candidate);
    return candidate;
  };

  const observations: ProfileObservation[] = [
    { id: "status", label: "STATUS", source: "status" },
    { id: "player-x", label: "PLAYER X", source: "player", key: "x" },
    { id: "player-y", label: "PLAYER Y", source: "player", key: "y" },
  ];
  const labels = new Set(observations.map((observation) => observation.label));
  const uniqueLabel = (label: string) => {
    let candidate = label;
    for (let n = 2; labels.has(candidate); n += 1) candidate = `${label} ${n}`;
    labels.add(candidate);
    return candidate;
  };

  const hud = document.settings.ui.hud;
  for (const variable of document.variables.slice(0, MAX_VARIABLES)) {
    const widget = hud.find((item) => item.variable === variable.name);
    observations.push({
      id: unique(variable.name, "var"),
      label: uniqueLabel(safeLabel(widget?.label ?? variable.name, "VARIABLE")),
      source: "variable",
      key: variable.name,
    });
  }
  for (const tag of documentTags(document).slice(0, MAX_TAGS)) {
    observations.push({
      id: unique(`${tag}-count`, "tag"),
      label: uniqueLabel(`${safeLabel(tag, "TAG")} COUNT`),
      source: "tag-count",
      key: tag,
    });
  }
  for (const event of EVENT_READOUTS) {
    observations.push({ id: unique(`${event.key}-events`, "events"), label: uniqueLabel(event.label), source: "event-count", key: event.key });
  }

  return {
    version: 1,
    controls: CONTROLS,
    observations: observations.slice(0, 24),
    objectives: [
      {
        id: "custom-check",
        title: "Custom check",
        description: "A bounded check composed from the controls and readouts above.",
        assertionIds: ["status"],
      },
    ],
    scenarioIds: [],
  };
}
