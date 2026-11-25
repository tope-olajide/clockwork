import type { AnimationClip } from "../model/schema";

export interface StarterAssetSpec {
  id: string;
  url: string;
  name: string;
  kind: "image" | "audio";
  mime: string;
  width?: number;
  height?: number;
  slices?: { x: number; y: number; w: number; h: number }[];
  animations?: AnimationClip[];
  tags?: string[];
}

const sheetSlices = Array.from({ length: 8 }, (_, index) => ({
  x: (index % 4) * 128,
  y: Math.floor(index / 4) * 128,
  w: 128,
  h: 128,
}));

const playerClips: AnimationClip[] = [
  { id: "starter-idle", name: "Idle", frameIndices: [0, 1], fps: 4, loop: true },
  { id: "starter-run", name: "Run", frameIndices: [2, 3, 4, 5], fps: 12, loop: true },
  { id: "starter-jump", name: "Jump", frameIndices: [6], fps: 1, loop: false },
];

/**
 * Stable starter asset ids. Templates refer to these ids through
 * `applyStarterVisuals`, so they must never change.
 */
export const STARTER_ASSETS: StarterAssetSpec[] = [
  {
    id: "asset_starter_player_sheet",
    url: "/starter/player-sheet.svg",
    name: "Player sheet",
    kind: "image",
    mime: "image/svg+xml",
    width: 512,
    height: 256,
    slices: sheetSlices,
    animations: playerClips,
  },
  { id: "asset_starter_drone", url: "/starter/drone.svg", name: "Drone", kind: "image", mime: "image/svg+xml", width: 96, height: 64 },
  { id: "asset_starter_coin", url: "/starter/coin.svg", name: "Coin", kind: "image", mime: "image/svg+xml", width: 48, height: 48 },
  { id: "asset_starter_flag", url: "/starter/flag.svg", name: "Relay flag", kind: "image", mime: "image/svg+xml", width: 64, height: 96 },
  { id: "asset_starter_hazard", url: "/starter/spark.svg", name: "Spark hazard", kind: "image", mime: "image/svg+xml", width: 96, height: 48 },
  { id: "asset_starter_ground", url: "/starter/ground.svg", name: "Ground", kind: "image", mime: "image/svg+xml", width: 2048, height: 100 },
  { id: "asset_starter_platform", url: "/starter/platform.svg", name: "Platform", kind: "image", mime: "image/svg+xml", width: 256, height: 32 },
  { id: "asset_starter_sky", url: "/starter/sky.svg", name: "Dusk sky", kind: "image", mime: "image/svg+xml", width: 2048, height: 1024 },
  { id: "asset_starter_moon", url: "/starter/moon.svg", name: "Moon", kind: "image", mime: "image/svg+xml", width: 128, height: 128 },
  { id: "asset_starter_hill_far", url: "/starter/hill-far.svg", name: "Far hills", kind: "image", mime: "image/svg+xml", width: 2048, height: 512 },
  { id: "asset_starter_hill_mid", url: "/starter/hill-mid.svg", name: "Mid hills", kind: "image", mime: "image/svg+xml", width: 2048, height: 512 },
  { id: "asset_starter_hill_near", url: "/starter/hill-near.svg", name: "Near hills", kind: "image", mime: "image/svg+xml", width: 2048, height: 512 },
  { id: "asset_starter_panel", url: "/starter/panel.svg", name: "UI panel", kind: "image", mime: "image/svg+xml", width: 256, height: 128 },
  { id: "asset_starter_coin_sfx", url: "/starter/audio/coin.wav", name: "Coin chime", kind: "audio", mime: "audio/wav" },
  { id: "asset_starter_jump_sfx", url: "/starter/audio/jump.wav", name: "Jump", kind: "audio", mime: "audio/wav" },
  { id: "asset_starter_click_sfx", url: "/starter/audio/click.wav", name: "UI click", kind: "audio", mime: "audio/wav" },
];

const heroSlices = Array.from({ length: 23 }, (_, index) => ({
  x: (index % 8) * 200,
  y: Math.floor(index / 8) * 235,
  w: 200,
  h: 235,
}));

const heroClips: AnimationClip[] = [
  { id: "meadow-idle", name: "Idle", frameIndices: [0, 1, 2, 3, 4, 5], fps: 8, loop: true },
  { id: "meadow-run", name: "Run", frameIndices: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15], fps: 13, loop: true },
  { id: "meadow-jump", name: "Jump", frameIndices: [16, 17, 18, 19, 20, 21, 22], fps: 10, loop: false },
  { id: "meadow-fall", name: "Fall", frameIndices: [22], fps: 1, loop: true },
];

const dragonSlices = Array.from({ length: 12 }, (_, index) => ({
  x: (index % 3) * 144,
  y: Math.floor(index / 3) * 128,
  w: 144,
  h: 128,
}));

const campfireSlices = Array.from({ length: 5 }, (_, index) => ({
  x: index * 64,
  y: 0,
  w: 64,
  h: 64,
}));

const platformerSfx = STARTER_ASSETS.filter((asset) => asset.kind === "audio");

/** Original art pack for the Clockwork Meadows platformer starter. */
export const PLATFORMER_ASSETS: StarterAssetSpec[] = [
  {
    id: "asset_meadow_hero",
    url: "/platformer/hero-atlas.png",
    name: "Meadow hero atlas",
    kind: "image",
    mime: "image/png",
    width: 1600,
    height: 705,
    slices: heroSlices,
    animations: heroClips,
    tags: ["platformer", "hero"],
  },
  {
    id: "asset_meadow_sky",
    url: "/platformer/sky.jpg",
    name: "Meadow sky",
    kind: "image",
    mime: "image/jpeg",
    width: 2064,
    height: 512,
    tags: ["platformer", "background"],
  },
  {
    id: "asset_meadow_mountain",
    url: "/platformer/mountain.png",
    name: "Meadow mountains",
    kind: "image",
    mime: "image/png",
    width: 2064,
    height: 512,
    tags: ["platformer", "background"],
  },
  {
    id: "asset_meadow_forest",
    url: "/platformer/forests.png",
    name: "Meadow forest",
    kind: "image",
    mime: "image/png",
    width: 2064,
    height: 512,
    tags: ["platformer", "background"],
  },
  {
    id: "asset_meadow_ground",
    url: "/platformer/ground.png",
    name: "Meadow ground",
    kind: "image",
    mime: "image/png",
    width: 2928,
    height: 352,
    tags: ["platformer", "ground"],
  },
  {
    id: "asset_meadow_spike",
    url: "/platformer/spike.png",
    name: "Stone spikes",
    kind: "image",
    mime: "image/png",
    width: 410,
    height: 371,
    tags: ["platformer", "hazard"],
  },
  {
    id: "asset_meadow_stone",
    url: "/platformer/stone.png",
    name: "Mossy boulder",
    kind: "image",
    mime: "image/png",
    width: 847,
    height: 768,
    tags: ["platformer", "decoration"],
  },
  {
    id: "asset_meadow_dragon",
    url: "/platformer/flying_twin_headed_dragon-blue.png",
    name: "Twin-headed dragon",
    kind: "image",
    mime: "image/png",
    width: 432,
    height: 512,
    slices: dragonSlices,
    animations: [
      { id: "dragon-fly", name: "Fly", frameIndices: [0, 1, 2], fps: 8, loop: true },
      { id: "dragon-walk", name: "Walk", frameIndices: [9, 10, 11], fps: 7, loop: true },
    ],
    tags: ["platformer", "enemy"],
  },
  {
    id: "asset_meadow_checkpoint",
    url: "/platformer/checkpoint-flag.png",
    name: "Trail checkpoint flag",
    kind: "image",
    mime: "image/png",
    width: 160,
    height: 120,
    // Frame 0: lowered (inactive). Frame 1: raised (activated).
    slices: [
      { x: 0, y: 0, w: 80, h: 120 },
      { x: 80, y: 0, w: 80, h: 120 },
    ],
    tags: ["platformer", "checkpoint"],
  },
  {
    id: "asset_meadow_campfire",
    url: "/platformer/campfire.png",
    name: "Campfire",
    kind: "image",
    mime: "image/png",
    width: 320,
    height: 64,
    slices: campfireSlices,
    animations: [{ id: "campfire-burn", name: "Burn", frameIndices: [0, 1, 2, 3, 4], fps: 10, loop: true }],
    tags: ["platformer", "checkpoint"],
  },
  ...platformerSfx,
];

export const PLATFORMER_ASSET_IDS = {
  hero: "asset_meadow_hero",
  sky: "asset_meadow_sky",
  mountain: "asset_meadow_mountain",
  forest: "asset_meadow_forest",
  ground: "asset_meadow_ground",
  spike: "asset_meadow_spike",
  stone: "asset_meadow_stone",
  dragon: "asset_meadow_dragon",
  campfire: "asset_meadow_campfire",
  checkpointFlag: "asset_meadow_checkpoint",
} as const;

export const STARTER_ASSET_IDS = {
  player: "asset_starter_player_sheet",
  drone: "asset_starter_drone",
  coin: "asset_starter_coin",
  flag: "asset_starter_flag",
  hazard: "asset_starter_hazard",
  ground: "asset_starter_ground",
  platform: "asset_starter_platform",
  sky: "asset_starter_sky",
  moon: "asset_starter_moon",
  hillFar: "asset_starter_hill_far",
  hillMid: "asset_starter_hill_mid",
  hillNear: "asset_starter_hill_near",
  panel: "asset_starter_panel",
  coinSfx: "asset_starter_coin_sfx",
  jumpSfx: "asset_starter_jump_sfx",
  clickSfx: "asset_starter_click_sfx",
} as const;
