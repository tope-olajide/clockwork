import type { BehaviorType } from "./schema";

export interface BehaviorParamSpec {
  key: string;
  label: string;
  type: "number" | "boolean" | "string";
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface BehaviorSpec {
  type: BehaviorType;
  label: string;
  description: string;
  params: BehaviorParamSpec[];
}

export const BEHAVIOR_CATALOG: BehaviorSpec[] = [
  {
    type: "platformer-controller",
    label: "Platformer controller",
    description: "Move left/right and jump. Requires a dynamic body.",
    params: [
      { key: "speed", label: "Speed", type: "number", default: 240 },
      { key: "jump", label: "Jump", type: "number", default: 580 },
      { key: "maxAirJumps", label: "Air jumps", type: "number", default: 0, min: 0 },
    ],
  },
  {
    type: "top-down-controller",
    label: "Top-down controller",
    description: "Move in four directions.",
    params: [{ key: "speed", label: "Speed", type: "number", default: 220 }],
  },
  {
    type: "patrol",
    label: "Patrol",
    description: "Move back and forth from spawn.",
    params: [
      { key: "distance", label: "Distance", type: "number", default: 120 },
      { key: "speed", label: "Speed", type: "number", default: 60 },
      { key: "axis", label: "Axis (x/y)", type: "string", default: "x" },
    ],
  },
  {
    type: "follow",
    label: "Follow",
    description: "Move toward a tag or object.",
    params: [
      { key: "targetTag", label: "Target tag", type: "string", default: "player" },
      { key: "speed", label: "Speed", type: "number", default: 80 },
    ],
  },
  {
    type: "collectible",
    label: "Collectible",
    description: "Collected by the player; can update a variable and play SFX.",
    params: [
      { key: "variable", label: "Variable", type: "string", default: "coins" },
      { key: "amount", label: "Amount", type: "number", default: 1 },
      { key: "destroyOnCollect", label: "Destroy on collect", type: "boolean", default: true },
      { key: "sfxAssetId", label: "SFX asset id", type: "string", default: "" },
    ],
  },
  {
    type: "hazard",
    label: "Hazard",
    description: "Respawns the player on contact.",
    params: [
      { key: "respawn", label: "Respawn player", type: "boolean", default: true },
      { key: "damage", label: "Damage", type: "number", default: 1 },
    ],
  },
  {
    type: "checkpoint",
    label: "Checkpoint",
    description: "Stores the player respawn point.",
    params: [],
  },
  {
    type: "camera-follow",
    label: "Camera follow",
    description: "Camera tracks this object.",
    params: [
      { key: "damping", label: "Damping", type: "number", default: 0.12, min: 0, max: 1, step: 0.01 },
      { key: "offsetX", label: "Offset X", type: "number", default: 0 },
      { key: "offsetY", label: "Offset Y", type: "number", default: 0 },
    ],
  },
  {
    type: "spawner",
    label: "Spawner",
    description: "Timer-driven spawning hook for rules/systems.",
    params: [
      { key: "prefabId", label: "Prefab id", type: "string", default: "" },
      { key: "intervalMs", label: "Interval (ms)", type: "number", default: 1000 },
    ],
  },
  {
    type: "timer",
    label: "Timer",
    description: "Emits timer events on an interval.",
    params: [
      { key: "durationMs", label: "Duration (ms)", type: "number", default: 1000 },
      { key: "repeat", label: "Repeat", type: "boolean", default: true },
    ],
  },
  {
    type: "variable-set",
    label: "Variable set",
    description: "Parameter holder for variable-driven behavior.",
    params: [
      { key: "variable", label: "Variable", type: "string", default: "" },
      { key: "value", label: "Value", type: "string", default: "" },
    ],
  },
  {
    type: "health",
    label: "Health",
    description: "Tracks health points for an object.",
    params: [{ key: "max", label: "Max health", type: "number", default: 3 }],
  },
];

export function behaviorSpec(type: BehaviorType): BehaviorSpec {
  return BEHAVIOR_CATALOG.find((spec) => spec.type === type) ?? {
    type,
    label: type,
    description: "Behavior",
    params: [],
  };
}
