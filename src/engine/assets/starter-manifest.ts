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
