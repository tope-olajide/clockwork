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
  unit?: string;
  help?: string;
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
      { key: "speed", label: "Speed", type: "number", default: 240, unit: "px/s", help: "Horizontal movement speed." },
      { key: "jump", label: "Jump", type: "number", default: 580, unit: "px/s", help: "Initial jump velocity." },
      { key: "maxAirJumps", label: "Air jumps", type: "number", default: 0, min: 0, step: 1, help: "Extra jumps while airborne." },
      { key: "coyoteMs", label: "Coyote time", type: "number", default: 120, min: 0, step: 10, unit: "ms", help: "Grace period after leaving ground." },
      { key: "bufferMs", label: "Jump buffer", type: "number", default: 100, min: 0, step: 10, unit: "ms", help: "Queues jump input before landing." },
    ],
  },
  {
    type: "top-down-controller",
    label: "Top-down controller",
    description: "Move in four directions.",
    params: [{ key: "speed", label: "Speed", type: "number", default: 220, unit: "px/s", help: "Movement speed." }],
  },
  {
    type: "patrol",
    label: "Patrol",
    description: "Move back and forth from spawn.",
    params: [
      { key: "distance", label: "Distance", type: "number", default: 120, unit: "px", help: "Travel distance from start." },
      { key: "speed", label: "Speed", type: "number", default: 60, unit: "px/s", help: "Patrol speed." },
      { key: "axis", label: "Axis", type: "string", default: "x", help: "Use x or y." },
    ],
  },
  {
    type: "follow",
    label: "Follow",
    description: "Move toward a tag or object.",
    params: [
      { key: "targetTag", label: "Target tag", type: "string", default: "player", help: "Tag to follow." },
      { key: "speed", label: "Speed", type: "number", default: 80, unit: "px/s", help: "Follow speed." },
    ],
  },
  {
    type: "collectible",
    label: "Collectible",
    description: "Collected by the player; can update a variable and play SFX.",
    params: [
      { key: "variable", label: "Variable", type: "string", default: "coins", help: "Variable name to change." },
      { key: "amount", label: "Amount", type: "number", default: 1, help: "Amount added on collect." },
      { key: "destroyOnCollect", label: "Destroy on collect", type: "boolean", default: true, help: "Remove object after collection." },
      { key: "sfxAssetId", label: "SFX asset id", type: "string", default: "", help: "Optional audio asset id." },
    ],
  },
  {
    type: "hazard",
    label: "Hazard",
    description: "Respawns the player on contact.",
    params: [
      { key: "respawn", label: "Respawn player", type: "boolean", default: true, help: "Send player to checkpoint/spawn." },
      { key: "damage", label: "Damage", type: "number", default: 1, help: "Damage amount hook." },
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
      { key: "damping", label: "Damping", type: "number", default: 0.12, min: 0, max: 1, step: 0.01, help: "Smoothing factor (0-1)." },
      { key: "offsetX", label: "Offset X", type: "number", default: 0, unit: "px", help: "Camera offset X." },
      { key: "offsetY", label: "Offset Y", type: "number", default: 0, unit: "px", help: "Camera offset Y." },
    ],
  },
  {
    type: "spawner",
    label: "Spawner",
    description: "Timer-driven spawning hook for rules/systems.",
    params: [
      { key: "prefabId", label: "Prefab id", type: "string", default: "", help: "Prefab to spawn." },
      { key: "intervalMs", label: "Interval", type: "number", default: 1000, unit: "ms", help: "Spawn interval." },
    ],
  },
  {
    type: "timer",
    label: "Timer",
    description: "Emits timer events on an interval.",
    params: [
      { key: "durationMs", label: "Duration", type: "number", default: 1000, unit: "ms", help: "Timer duration." },
      { key: "repeat", label: "Repeat", type: "boolean", default: true, help: "Restart after firing." },
    ],
  },
  {
    type: "variable-set",
    label: "Variable set",
    description: "Parameter holder for variable-driven behavior.",
    params: [
      { key: "variable", label: "Variable", type: "string", default: "", help: "Variable name." },
      { key: "value", label: "Value", type: "string", default: "", help: "Value to set." },
    ],
  },
  {
    type: "health",
    label: "Health",
    description: "Tracks health points for an object.",
    params: [{ key: "max", label: "Max health", type: "number", default: 3, help: "Maximum health points." }],
  },
];

export function behaviorSpec(type: BehaviorType): BehaviorSpec {
  return (
    BEHAVIOR_CATALOG.find((spec) => spec.type === type) ?? {
      type,
      label: type,
      description: "Behavior",
      params: [],
    }
  );
}
