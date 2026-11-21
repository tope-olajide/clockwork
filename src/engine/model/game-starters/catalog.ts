import type { TemplateOrigin } from "../schema";

export const GAME_STARTER_IDS = [
  "space-shooter",
  "space-invaders",
  "asteroid-field",
  "ping-pong",
  "brick-breaker",
  "flappy-flyer",
  "platform-jumper",
  "endless-runner",
  "arena-survival",
  "falling-objects",
  "maze-escape",
  "snake",
] as const;

export type GameStarterId = (typeof GAME_STARTER_IDS)[number];

export interface GameStarterSpec {
  id: GameStarterId;
  name: string;
  category: "Shooter" | "Arcade" | "Platformer" | "Sports" | "Puzzle" | "Survival";
  blurb: string;
  mechanics: string;
  accent: string;
}

export const GAME_STARTERS: GameStarterSpec[] = [
  {
    id: "space-shooter",
    name: "Space Shooter",
    category: "Shooter",
    blurb: "Defend the lane for sixty seconds. Enemies and asteroids keep coming.",
    mechanics: "Move with A/D, fire with Space. Health, score, timer, spawning and explosions.",
    accent: "#79e6ff",
  },
  {
    id: "space-invaders",
    name: "Space Invaders",
    category: "Shooter",
    blurb: "Clear a descending alien formation before it breaches your shields.",
    mechanics: "A/D move, Space fire. Formation waves, destructible barriers and three ships.",
    accent: "#75f0c1",
  },
  {
    id: "asteroid-field",
    name: "Asteroid Field",
    category: "Shooter",
    blurb: "Pilot through drifting rocks and split the field into shards.",
    mechanics: "A/D turn, W thrust, E or click fire. Momentum, wraparound and three ships.",
    accent: "#78e8ff",
  },
  {
    id: "ping-pong",
    name: "Ping Pong",
    category: "Sports",
    blurb: "Outplay the computer and reach five points first.",
    mechanics: "W / S move, Space serves. Angle shots off the paddles and walls.",
    accent: "#ff9f74",
  },
  {
    id: "brick-breaker",
    name: "Brick Breaker",
    category: "Arcade",
    blurb: "Clear the brick wall before you run out of ships.",
    mechanics: "A / D move, Space serves. Bricks have health; the ball speeds up.",
    accent: "#ff7d9a",
  },
  {
    id: "flappy-flyer",
    name: "Flappy Flyer",
    category: "Arcade",
    blurb: "Flap through moving gates and survive as long as you can.",
    mechanics: "Space or click to flap. Pass each gate to score; one collision ends the run.",
    accent: "#ffd47c",
  },
  {
    id: "platform-jumper",
    name: "Platform Jumper",
    category: "Platformer",
    blurb: "Collect five cores, dodge spikes, and reach the relay.",
    mechanics: "A / D move, Space jump. Five collectibles, lives, hazards and a moving platform.",
    accent: "#a9b4ff",
  },
  {
    id: "endless-runner",
    name: "Endless Runner",
    category: "Arcade",
    blurb: "Jump or duck through an accelerating obstacle stream.",
    mechanics: "Space jump, Down duck. Pass obstacles and collect bonus cores.",
    accent: "#ff856f",
  },
  {
    id: "arena-survival",
    name: "Arena Survival",
    category: "Survival",
    blurb: "Hold the arena against relentless chasers for sixty seconds.",
    mechanics: "WASD move, E or click attack. Defeat enemies, protect your hull and survive.",
    accent: "#8fe3c0",
  },
  {
    id: "falling-objects",
    name: "Falling Objects",
    category: "Survival",
    blurb: "Dodge a meteor storm, catch bonus stars, and last one minute.",
    mechanics: "A / D move along the catch lane. Three lives, falling hazards and a timer.",
    accent: "#f4c56a",
  },
  {
    id: "maze-escape",
    name: "Maze Escape",
    category: "Puzzle",
    blurb: "Collect fifteen dots, unlock the gate, and evade the warden.",
    mechanics: "WASD move. Grid-aware pursuit, maze walls, collectibles and gated exit.",
    accent: "#a9b4ff",
  },
  {
    id: "snake",
    name: "Snake",
    category: "Puzzle",
    blurb: "Grow to one hundred points without hitting a wall or yourself.",
    mechanics: "WASD or arrows turn. Fixed-step grid movement, food relocation, growth and self-collision.",
    accent: "#8fe3c0",
  },
];

export function isGameStarterId(value: string): value is GameStarterId {
  return (GAME_STARTER_IDS as readonly string[]).includes(value);
}

/** New starters use primitive art, so the starter sprite upgrade must not run. */
export function isGameStarterOrigin(origin: TemplateOrigin): origin is GameStarterId {
  return isGameStarterId(origin);
}
