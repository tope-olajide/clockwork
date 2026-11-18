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
    params: [
      { key: "speed", label: "Speed", type: "number", default: 220, unit: "px/s", help: "Movement speed." },
      { key: "lockAxis", label: "Lock axis", type: "string", default: "none", help: "none, x, or y." },
    ],
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
    description: "Move toward a tag or object, optionally navigating a cell grid around tagged walls.",
    params: [
      { key: "targetTag", label: "Target tag", type: "string", default: "player", help: "Tag to follow." },
      { key: "speed", label: "Speed", type: "number", default: 80, unit: "px/s", help: "Follow speed." },
      { key: "cellSize", label: "Navigation cell size", type: "number", default: 0, min: 0, unit: "px", help: "Set greater than zero to follow a grid path around walls." },
      { key: "wallTags", label: "Wall tags", type: "string", default: "wall", help: "Comma-separated blocking tags for grid navigation." },
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
    description: "Spawns a prefab on an interval inside a rectangular area.",
    params: [
      { key: "prefabId", label: "Prefab id", type: "string", default: "", help: "Prefab to spawn." },
      { key: "intervalMs", label: "Interval", type: "number", default: 1000, unit: "ms", help: "Spawn interval." },
      { key: "startDelayMs", label: "Start delay", type: "number", default: 0, unit: "ms", help: "Wait before the first spawn." },
      { key: "minX", label: "Min X", type: "number", default: 0, unit: "px" },
      { key: "maxX", label: "Max X", type: "number", default: 1280, unit: "px" },
      { key: "minY", label: "Min Y", type: "number", default: 0, unit: "px" },
      { key: "maxY", label: "Max Y", type: "number", default: 0, unit: "px" },
      { key: "intervalDecayPerSecond", label: "Interval decay", type: "number", default: 0, min: 0, unit: "ms/s", help: "Reduce the interval over elapsed time." },
      { key: "minIntervalMs", label: "Minimum interval", type: "number", default: 250, min: 16, unit: "ms" },
      { key: "limit", label: "Live limit", type: "number", default: 20, min: 1, step: 1, help: "Cap on simultaneous objects from this prefab." },
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
    description: "Tracks health, takes damage from bullets or tags, scores on death, and can spawn an explosion.",
    params: [
      { key: "max", label: "Max health", type: "number", default: 3, min: 1, help: "Maximum health points." },
      { key: "variable", label: "Variable", type: "string", default: "", help: "Optional variable mirroring current health." },
      { key: "invulnMs", label: "Invulnerability", type: "number", default: 0, min: 0, unit: "ms", help: "Grace period after taking a hit." },
      { key: "damageTags", label: "Damage tags", type: "string", default: "", help: "Comma-separated tags that damage this object on contact." },
      { key: "contactDamage", label: "Contact damage", type: "number", default: 1, min: 0 },
      { key: "scoreVariable", label: "Score variable", type: "string", default: "", help: "Variable increased when this object dies." },
      { key: "scoreOnDeath", label: "Score on death", type: "number", default: 0 },
      { key: "deathVariable", label: "Death variable", type: "string", default: "", help: "Optional variable changed on death; spawned death-prefab children are added to this count." },
      { key: "deathAmount", label: "Death amount", type: "number", default: -1, help: "Amount removed or added when this object dies." },
      { key: "respawnOnHit", label: "Respawn on hit", type: "boolean", default: false, help: "Restore this object at its spawn point while its death variable remains above zero." },
      { key: "deathPrefabId", label: "Death prefab", type: "string", default: "", help: "Optional explosion prefab spawned at the object." },
      { key: "deathSpawnCount", label: "Death spawn count", type: "number", default: 1, min: 1, step: 1 },
      { key: "spawnSpread", label: "Death spread", type: "number", default: 0, min: 0, unit: "px" },
    ],
  },
  {
    type: "shooter",
    label: "Shooter",
    description: "Fires a projectile prefab on a cooldown.",
    params: [
      { key: "prefabId", label: "Bullet prefab", type: "string", default: "", help: "Prefab fired by this object." },
      { key: "trigger", label: "Trigger", type: "string", default: "jump", help: "jump, action, any, or auto." },
      { key: "cooldownMs", label: "Cooldown", type: "number", default: 250, min: 16, unit: "ms" },
      { key: "speed", label: "Bullet speed", type: "number", default: 640, unit: "px/s" },
      { key: "direction", label: "Direction", type: "string", default: "up", help: "up, down, left, or right." },
      { key: "offsetX", label: "Offset X", type: "number", default: 0, unit: "px" },
      { key: "offsetY", label: "Offset Y", type: "number", default: 0, unit: "px" },
      { key: "maxAlive", label: "Max alive", type: "number", default: 0, min: 0, step: 1, help: "0 means unlimited." },
      { key: "chance", label: "Auto chance", type: "number", default: 1, min: 0, max: 1, step: 0.05, help: "Chance per attempt when trigger is auto." },
    ],
  },
  {
    type: "projectile",
    label: "Projectile",
    description: "Moves in a straight line, damages tagged health targets and expires.",
    params: [
      { key: "speed", label: "Speed", type: "number", default: 640, unit: "px/s", help: "Used when no velocity was set by a shooter." },
      { key: "direction", label: "Direction", type: "string", default: "up" },
      { key: "lifetimeMs", label: "Lifetime", type: "number", default: 1400, min: 0, unit: "ms" },
      { key: "targetTags", label: "Target tags", type: "string", default: "", help: "Comma-separated tags this projectile can damage." },
      { key: "damage", label: "Damage", type: "number", default: 1, min: 1 },
      { key: "destroyOnHit", label: "Destroy on hit", type: "boolean", default: true },
    ],
  },
  {
    type: "mover",
    label: "Mover",
    description: "Moves an object at a constant velocity, with optional wrap, lifetime and pass scoring.",
    params: [
      { key: "vx", label: "Velocity X", type: "number", default: 0, unit: "px/s" },
      { key: "vy", label: "Velocity Y", type: "number", default: 0, unit: "px/s" },
      { key: "spin", label: "Spin", type: "number", default: 0, unit: "deg/s" },
      { key: "wrap", label: "Wrap", type: "boolean", default: false },
      { key: "destroyOffscreen", label: "Destroy offscreen", type: "boolean", default: true },
      { key: "lifetimeMs", label: "Lifetime", type: "number", default: 0, min: 0, unit: "ms", help: "0 means no lifetime limit." },
      { key: "passX", label: "Pass line X", type: "number", default: 0, min: 0, unit: "px", help: "Unused when pass variable is empty." },
      { key: "passVariable", label: "Pass variable", type: "string", default: "", help: "Scored when the object crosses pass line X." },
      { key: "passAmount", label: "Pass amount", type: "number", default: 1 },
    ],
  },
  {
    type: "countdown",
    label: "Countdown",
    description: "Writes remaining seconds into a variable.",
    params: [
      { key: "durationMs", label: "Duration", type: "number", default: 60000, min: 0, unit: "ms" },
      { key: "variable", label: "Variable", type: "string", default: "timeLeft" },
    ],
  },
  {
    type: "formation",
    label: "Formation",
    description: "Move a group of tagged objects side to side, descending at each edge.",
    params: [
      { key: "groupId", label: "Group id", type: "string", default: "invaders" },
      { key: "groupTag", label: "Group tag", type: "string", default: "invader", help: "All active objects with this tag move as one formation." },
      { key: "speed", label: "Speed", type: "number", default: 70, unit: "px/s" },
      { key: "dropDistance", label: "Edge drop", type: "number", default: 24, unit: "px" },
      { key: "edgeMargin", label: "Edge margin", type: "number", default: 40, unit: "px" },
      { key: "breachY", label: "Breach Y", type: "number", default: 580, unit: "px" },
      { key: "breachVariable", label: "Breach variable", type: "string", default: "breached" },
    ],
  },
  {
    type: "rotate-thrust",
    label: "Rotate and thrust",
    description: "Steer a ship and accelerate in the direction it faces.",
    params: [
      { key: "turnSpeed", label: "Turn speed", type: "number", default: 210, unit: "deg/s" },
      { key: "thrust", label: "Thrust", type: "number", default: 360, unit: "px/s²" },
      { key: "drag", label: "Drag", type: "number", default: 0.35, min: 0, unit: "1/s" },
      { key: "maxSpeed", label: "Max speed", type: "number", default: 420, unit: "px/s" },
      { key: "wrap", label: "Wrap at edges", type: "boolean", default: true },
    ],
  },
  {
    type: "ball",
    label: "Arcade ball",
    description: "Serves, sweeps and bounces from paddles and solid bodies, scores misses, and damages tagged targets.",
    params: [
      { key: "speed", label: "Serve speed", type: "number", default: 390, min: 1, unit: "px/s" },
      { key: "serveDirection", label: "Serve direction", type: "string", default: "up", help: "up, down, left, or right." },
      { key: "serveTrigger", label: "Serve trigger", type: "string", default: "jump", help: "jump, action, any, or auto." },
      { key: "serveDelayMs", label: "Serve delay", type: "number", default: 350, min: 0, unit: "ms" },
      { key: "attachToTag", label: "Attach while ready", type: "string", default: "", help: "Optional tag to follow before serving." },
      { key: "offsetX", label: "Attach offset X", type: "number", default: 0, unit: "px" },
      { key: "offsetY", label: "Attach offset Y", type: "number", default: 0, unit: "px" },
      { key: "paddleTag", label: "Paddle tag", type: "string", default: "paddle" },
      { key: "bounceAngle", label: "Bounce angle", type: "number", default: 58, min: 0, max: 80, unit: "deg" },
      { key: "speedUpEvery", label: "Speed up every hits", type: "number", default: 0, min: 0, step: 1 },
      { key: "speedUpBy", label: "Speed up amount", type: "number", default: 0, min: 0, unit: "px/s" },
      { key: "maxSpeed", label: "Maximum speed", type: "number", default: 620, min: 1, unit: "px/s" },
      { key: "targetTags", label: "Damage tags", type: "string", default: "", help: "Comma-separated health targets; empty targets any health object except paddles." },
      { key: "damage", label: "Damage", type: "number", default: 1, min: 1 },
      { key: "missLeftVariable", label: "Miss left variable", type: "string", default: "" },
      { key: "missRightVariable", label: "Miss right variable", type: "string", default: "" },
      { key: "missBottomVariable", label: "Miss bottom variable", type: "string", default: "" },
      { key: "missAmount", label: "Miss amount", type: "number", default: 1 },
    ],
  },
  {
    type: "paddle",
    label: "Paddle",
    description: "Move a paddle along one axis and keep it inside a configured range.",
    params: [
      { key: "axis", label: "Axis", type: "string", default: "x", help: "x or y." },
      { key: "speed", label: "Speed", type: "number", default: 480, min: 0, unit: "px/s" },
      { key: "min", label: "Minimum position", type: "number", default: 0, unit: "px" },
      { key: "max", label: "Maximum position", type: "number", default: 1280, unit: "px" },
    ],
  },
  {
    type: "ai-paddle",
    label: "AI paddle",
    description: "Track a tagged target with a reaction delay, aim error and speed limit.",
    params: [
      { key: "targetTag", label: "Target tag", type: "string", default: "ball" },
      { key: "axis", label: "Axis", type: "string", default: "y", help: "x or y." },
      { key: "speed", label: "Speed", type: "number", default: 240, min: 0, unit: "px/s" },
      { key: "error", label: "Aim error", type: "number", default: 36, min: 0, unit: "px" },
      { key: "reactionMs", label: "Reaction time", type: "number", default: 220, min: 0, unit: "ms" },
      { key: "min", label: "Minimum position", type: "number", default: 0, unit: "px" },
      { key: "max", label: "Maximum position", type: "number", default: 720, unit: "px" },
    ],
  },
  {
    type: "flap",
    label: "Flap",
    description: "Apply a jump impulse, gravity and collision/loss checks for a one-button flyer.",
    params: [
      { key: "trigger", label: "Flap trigger", type: "string", default: "jump", help: "jump, action, or any." },
      { key: "impulse", label: "Flap impulse", type: "number", default: 320, min: 0, unit: "px/s" },
      { key: "gravityScale", label: "Gravity scale", type: "number", default: 1, min: 0, step: 0.1 },
      { key: "maxFallSpeed", label: "Maximum fall speed", type: "number", default: 560, min: 0, unit: "px/s" },
      { key: "lockX", label: "Lock horizontal position", type: "boolean", default: true },
      { key: "ceiling", label: "Ceiling", type: "number", default: 0, min: 0, unit: "px" },
      { key: "floor", label: "Floor", type: "number", default: 720, min: 0, unit: "px" },
      { key: "loseVariable", label: "Loss variable", type: "string", default: "lost" },
      { key: "hazardTags", label: "Hazard tags", type: "string", default: "hazard,pipe,ground" },
    ],
  },
  {
    type: "duck",
    label: "Duck",
    description: "Shorten a moving character's collider and visual while the configured action is held.",
    params: [
      { key: "trigger", label: "Duck trigger", type: "string", default: "down", help: "down, action, or jump." },
      { key: "bodyHeight", label: "Duck collider height", type: "number", default: 24, min: 1, unit: "px" },
      { key: "visualScaleY", label: "Duck visual scale Y", type: "number", default: 0.65, min: 0.1, max: 1, step: 0.05 },
    ],
  },
  {
    type: "melee",
    label: "Melee",
    description: "Damage the nearest matching target in range on an action press.",
    params: [
      { key: "trigger", label: "Attack trigger", type: "string", default: "action", help: "action, jump, or any." },
      { key: "cooldownMs", label: "Cooldown", type: "number", default: 450, min: 0, unit: "ms" },
      { key: "range", label: "Range", type: "number", default: 64, min: 1, unit: "px" },
      { key: "damage", label: "Damage", type: "number", default: 1, min: 0 },
      { key: "targetTags", label: "Target tags", type: "string", default: "enemy", help: "Comma-separated target tags." },
    ],
  },
  {
    type: "exit-gate",
    label: "Exit gate",
    description: "Open a solid gate when a numeric variable reaches its threshold.",
    params: [
      { key: "variable", label: "Progress variable", type: "string", default: "dots" },
      { key: "required", label: "Required value", type: "number", default: 15, min: 0 },
      { key: "openVariable", label: "Open variable", type: "string", default: "exitOpen" },
      { key: "openColor", label: "Open colour", type: "string", default: "#8fe3c0" },
    ],
  },
  {
    type: "snake",
    label: "Snake",
    description: "Move on a fixed grid, grow on food, and lose on walls or self contact.",
    params: [
      { key: "cols", label: "Columns", type: "number", default: 20, min: 2, step: 1 },
      { key: "rows", label: "Rows", type: "number", default: 15, min: 2, step: 1 },
      { key: "cellSize", label: "Cell size", type: "number", default: 32, min: 4, unit: "px" },
      { key: "originX", label: "Grid origin X", type: "number", default: 0, unit: "px" },
      { key: "originY", label: "Grid origin Y", type: "number", default: 0, unit: "px" },
      { key: "stepMs", label: "Move interval", type: "number", default: 120, min: 16, unit: "ms" },
      { key: "initialLength", label: "Starting length", type: "number", default: 3, min: 1, step: 1 },
      { key: "bodyPrefabId", label: "Body prefab id", type: "string", default: "" },
      { key: "foodTag", label: "Food tag", type: "string", default: "snake-food" },
      { key: "wallTags", label: "Wall tags", type: "string", default: "wall" },
      { key: "scoreVariable", label: "Score variable", type: "string", default: "score" },
      { key: "scorePerFood", label: "Score per food", type: "number", default: 10, min: 1 },
      { key: "lengthVariable", label: "Length variable", type: "string", default: "length" },
      { key: "winScore", label: "Win score", type: "number", default: 100, min: 1 },
      { key: "winVariable", label: "Win variable", type: "string", default: "won" },
      { key: "lostVariable", label: "Lost variable", type: "string", default: "lost" },
      { key: "loseOnWall", label: "Lose on wall", type: "boolean", default: true },
      { key: "loseOnSelf", label: "Lose on self", type: "boolean", default: true },
    ],
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
