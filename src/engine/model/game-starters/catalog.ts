import type { TemplateOrigin } from "../schema";

export const GAME_STARTER_IDS = [
  "space-shooter",
  "space-invaders",
  "asteroid-field",
  "ping-pong",
  "brick-breaker",
  "flappy-flyer",
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
];

export function isGameStarterId(value: string): value is GameStarterId {
  return (GAME_STARTER_IDS as readonly string[]).includes(value);
}

/** New starters use primitive art, so the starter sprite upgrade must not run. */
export function isGameStarterOrigin(origin: TemplateOrigin): origin is GameStarterId {
  return isGameStarterId(origin);
}
