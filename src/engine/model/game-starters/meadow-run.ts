import {
  circle,
  makeBehavior,
  makeBody,
  makeDocument,
  makeLayer,
  makeObject,
  makeScene,
  makeSettings,
  makeShape,
  newId,
  polygonShape,
  rectShape,
  triangleShape,
} from "../factory";
import type { GameObject, ProjectDocument } from "../schema";
import { bodyFromArt, placeOnGround, placeSurfaceAt, visualRect } from "../placement";
import { PLATFORMER_ASSET_IDS as ART } from "../../assets/starter-manifest";

export const MEADOW_LEVEL_WIDTH = 18_400;
export const MEADOW_LEVEL_HEIGHT = 1_200;
export const MEADOW_GROUND_TOP = 820;

export const MEADOW_SKY = "#6db9e6";
const SKY = MEADOW_SKY;
export const MEADOW_MINT = "#8fe3c0";
const MINT = MEADOW_MINT;
const GOLD = "#ffd86b";

/*
 * Meadow art dimensions.
 *
 * ground.png is 2928x352 with transparent padding above the grass (visible art
 * starts at y=90) and grass tufts that overhang the walkable line by 28px. The
 * old ground object stretched the whole 352px texture onto its collider, so the
 * visible grass sat 118px below the surface the player actually stood on. Every
 * object placed "on the ground" therefore looked like it floated. These values
 * crop the art to its content and keep an explicit surface inset so the walkable
 * line is exactly where the grass line is drawn.
 */
const GROUND_ART = { x: 0, y: 90, w: 2928, h: 262 };
const LEDGE_ART = { x: 0, y: 90, w: 2928, h: 132 };
const GROUND_SURFACE_INSET = 28;
const LEDGE_SURFACE_INSET = 28;
/** Thickness of a floating ledge's solid body, measured down from its surface. */
const LEDGE_COLLIDER_DEPTH = 30;
/** How far a spike mound is sunk into the turf so its base is hidden. */
export const MEADOW_SPIKE_SINK = 12;

/** [left, surfaceTop, width] — tops are walkable surfaces, not centres. */
const PLATFORMS: Array<[number, number, number]> = [
  // Opening meadow: two low turf steps, then the first real floating ledges.
  [460, 756, 150],
  [780, 690, 150],
  [1080, 606, 160],
  [1370, 660, 155],
  // First ridge.
  [2480, 520, 180],
  [2790, 578, 160],
  [3080, 520, 150],
  [3370, 588, 160],
  [3660, 652, 170],
  [3960, 574, 160],
  [4240, 520, 150],
  // Hollow crossing.
  [4770, 660, 170],
  [5060, 574, 160],
  [5350, 518, 150],
  [5640, 586, 160],
  [5910, 650, 150],
  // Bramble rise.
  [6360, 660, 180],
  [6650, 586, 160],
  [6940, 524, 150],
  [7230, 590, 160],
  [7510, 656, 170],
  [7760, 584, 140],
  // Ridge two.
  [8190, 660, 170],
  [8470, 574, 160],
  [8750, 518, 150],
  [9030, 586, 160],
  [9310, 652, 150],
  // High pass.
  [9810, 656, 180],
  [10100, 582, 160],
  [10390, 518, 150],
  [10670, 520, 150],
  [10950, 590, 160],
  // Drifting roots.
  [11370, 660, 170],
  [11660, 574, 160],
  [11940, 516, 150],
  [12230, 584, 160],
  // Long ridge.
  [12810, 660, 180],
  [13100, 586, 160],
  [13390, 512, 150],
  [13680, 586, 160],
  [13970, 660, 170],
  [14250, 584, 150],
  // Last climb.
  [14890, 660, 160],
  [15180, 576, 150],
  [15470, 512, 140],
  // Summit approach.
  [16010, 660, 170],
  [16300, 582, 160],
  [16590, 518, 150],
  [16880, 582, 160],
  [17170, 660, 160],
  [17450, 584, 150],
  // Final gap and summit shelf.
  [17740, 736, 120],
  [18030, 660, 200],
];

const GROUND_SPANS: Array<[number, number]> = [
  [0, 1800],
  [2050, 4400],
  [4660, 5900],
  [6150, 7800],
  [8070, 9400],
  [9650, 11000],
  [11240, 14500],
  [14770, 15600],
  [15870, 17650],
  [17920, 18400],
];

/** Ground obstacles sit in the gaps between ledges so nothing is buried. */
const SPIKES = [2340, 5000, 5545, 7135, 8940, 10580, 13120, 13585, 15130, 16500];
const FIRES = [3200, 7450, 11610, 12320];
const ROCKS: Array<[number, number]> = [
  [3895, 0.85],
  [6860, 0.9],
  [14220, 0.85],
  [17440, 0.95],
];
const CHECKPOINTS = [2160, 6700, 9720, 12690, 15920];

const GROUND_DRAGONS: Array<[number, number]> = [
  [2820, 120],
  [3520, 170],
  [7420, 180],
  [8420, 150],
  [10250, 160],
  [12150, 100],
  [13820, 150],
  [15240, 140],
  [16720, 130],
];

const FLYING_DRAGONS: Array<[number, number, number]> = [
  [1560, 420, 200],
  [2960, 390, 220],
  [4550, 430, 240],
  [6980, 380, 220],
  [8560, 400, 200],
  [10520, 360, 220],
  [12580, 420, 200],
  [13720, 380, 220],
  [15580, 410, 200],
  [16820, 390, 200],
];

export function tiledSprite(
  name: string,
  layerId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  assetId: string,
  tileOffsetX = 0,
  tags: string[] = ["background"],
): GameObject {
  return makeObject({
    name,
    layerId,
    x,
    y,
    width,
    height,
    color: SKY,
    visual: {
      kind: "sprite",
      assetId,
      width,
      height,
      repeatX: true,
      tileOffsetX,
    },
    tags,
  });
}

export function groundSegment(layerId: string, left: number, right: number): GameObject {
  const width = right - left;
  const object = makeObject({
    name: `Meadow floor ${Math.round(left)}–${Math.round(right)}`,
    layerId,
    x: left + width / 2,
    y: 0,
    width,
    height: GROUND_ART.h,
    color: "#4f3524",
    visual: {
      kind: "sprite",
      assetId: ART.ground,
      width,
      height: GROUND_ART.h,
      repeatX: true,
      tileOffsetX: -left,
      sourceRect: GROUND_ART,
    },
    tags: ["ground", "meadow-ground"],
  });
  bodyFromArt(object, { surfaceInset: GROUND_SURFACE_INSET });
  placeSurfaceAt(object, MEADOW_GROUND_TOP);
  return object;
}

/**
 * A floating grass ledge. The art is the top slice of the ground texture, which
 * gives it a real grass cap, soil strata and pebbles instead of the squashed
 * dark line the old full-texture stretch produced. The collider spans from the
 * grass line to the bottom of the art, so the visible ledge and the surface the
 * player lands on are the same height.
 */
export function grassPlatform(
  layerId: string,
  index: number,
  left: number,
  top: number,
  width: number,
): GameObject {
  const object = makeObject({
    name: `Grass ledge ${index + 1}`,
    layerId,
    x: left + width / 2,
    y: 0,
    width,
    height: LEDGE_ART.h,
    color: "#5e9f4f",
    visual: {
      kind: "sprite",
      assetId: ART.ground,
      width,
      height: LEDGE_ART.h,
      repeatX: true,
      tileOffsetX: -left,
      sourceRect: LEDGE_ART,
    },
    tags: ["ground", "platform", "meadow-platform"],
  });
  // Solid sides: the player can land on the ledge, but cannot walk or fall
  // through its edges. One-way bodies skipped horizontal collisions entirely,
  // which let Marlow slide into the middle of a floating platform. The solid
  // part is a slab under the grass line, not the whole 132px of art, so the
  // ledges do not become low ceilings over the trail below them.
  bodyFromArt(object, { surfaceInset: LEDGE_SURFACE_INSET, depth: LEDGE_COLLIDER_DEPTH });
  placeSurfaceAt(object, top);
  return object;
}

function movingPlatform(
  layerId: string,
  name: string,
  left: number,
  top: number,
  width: number,
  distance: number,
): GameObject {
  const object = makeObject({
    name,
    layerId,
    x: left + width / 2,
    y: 0,
    width,
    height: LEDGE_ART.h,
    color: MINT,
    visual: {
      kind: "sprite",
      assetId: ART.ground,
      width,
      height: LEDGE_ART.h,
      repeatX: true,
      tileOffsetX: -left,
      sourceRect: LEDGE_ART,
      tint: MINT,
    },
    behaviors: [makeBehavior("patrol", { distance, speed: 42, axis: "x" })],
    tags: ["ground", "platform", "moving-platform", "meadow-platform"],
  });
  bodyFromArt(object, { type: "kinematic", surfaceInset: LEDGE_SURFACE_INSET, depth: LEDGE_COLLIDER_DEPTH });
  placeSurfaceAt(object, top);
  return object;
}

/**
 * Spikes are hazard geometry only: no solid body, and a footprint that matches
 * the visible spike cluster (104x87 art, 100x82 collider) instead of the old
 * 70x38 box buried near the bottom of the sprite. Touching the side or landing
 * on the tips both overlap the collider.
 */
function spikeHazard(layerId: string, x: number, index: number): GameObject {
  const object = makeObject({
    name: `Stone spikes ${index + 1}`,
    layerId,
    x,
    y: 0,
    width: 104,
    height: 87,
    color: "#6c7c83",
    visual: {
      kind: "sprite",
      assetId: ART.spike,
      width: 104,
      height: 87,
      sourceRect: { x: 50, y: 54, w: 344, h: 289 },
    },
    body: makeBody(100, 82, "none"),
    tags: ["spike", "hazard", "meadow-hazard"],
  });
  // The mound is sunk slightly into the turf so only the blades and a rim of
  // dirt show; the ground art is drawn over the buried base.
  placeOnGround(object, MEADOW_GROUND_TOP, -MEADOW_SPIKE_SINK);
  return object;
}

/** Fire is a hazard, not a checkpoint. It burns on contact and cannot be stood on. */
function campfireHazard(layerId: string, x: number, index: number): GameObject {
  const object = makeObject({
    name: `Trail fire ${index + 1}`,
    layerId,
    x,
    y: 0,
    width: 84,
    height: 84,
    color: "#ffb45c",
    visual: {
      kind: "sprite",
      assetId: ART.campfire,
      frame: 0,
      width: 84,
      height: 84,
    },
    body: makeBody(48, 62, "none", { offsetY: 4 }),
    tags: ["hazard", "fire", "meadow-hazard"],
  });
  placeOnGround(object, MEADOW_GROUND_TOP);
  return object;
}

/**
 * A trail flag checkpoint. Frame 0 is the lowered grey pennant; reaching it
 * swaps to frame 1 (raised mint pennant), and the runtime remembers the flag
 * base as the respawn point.
 */
function checkpoint(layerId: string, x: number, index: number): GameObject {
  const object = makeObject({
    name: `Trail flag ${index + 1}`,
    layerId,
    x,
    y: 0,
    width: 80,
    height: 120,
    color: "#8fe3c0",
    visual: {
      kind: "sprite",
      assetId: ART.checkpointFlag,
      frame: 0,
      width: 80,
      height: 120,
    },
    behaviors: [
      makeBehavior("checkpoint", {
        message: `Trail flag ${index + 1} raised`,
        activeFrame: 1,
        sfxAssetId: "asset_starter_coin_sfx",
      }),
    ],
    tags: ["checkpoint", "meadow-checkpoint"],
  });
  placeOnGround(object, MEADOW_GROUND_TOP);
  return object;
}

function shard(layerId: string, x: number, y: number, index: number): GameObject {
  return makeObject({
    name: `Sun shard ${index + 1}`,
    layerId,
    x,
    y,
    width: 28,
    height: 34,
    color: GOLD,
    visual: makeShape(28, 34, [
      circle(34, "#ffe8a0"),
      polygonShape(
        24,
        30,
        GOLD,
        [
          { x: 0, y: -1 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
        ],
        { stroke: "#fff8d8", strokeWidth: 2 },
      ),
      rectShape(3, 12, "#fff8d8", { x: -1 }),
    ]),
    behaviors: [
      makeBehavior("collectible", {
        variable: "score",
        amount: 10,
        countVariable: "shards",
        countAmount: 1,
        sfxAssetId: "asset_starter_coin_sfx",
      }),
    ],
    tags: ["shard", "coin", "collectible"],
  });
}

/**
 * Ground dragons use the walk frames of the dragon atlas. Those frames carry
 * ~24% transparent padding below the feet, so the object is lifted by exactly
 * the scaled content offset: the body stays on the ground while the visible
 * feet touch it.
 */
function groundDragon(layerId: string, x: number, distance: number, index: number): GameObject {
  const width = 92;
  const height = 82;
  const walkFrameBottom = 97 / 128; // content bottom in walk frames 9–11
  return makeObject({
    name: `Bramble dragon ${index + 1}`,
    layerId,
    x,
    y: MEADOW_GROUND_TOP - height * (walkFrameBottom - 0.5) - 6,
    width,
    height,
    color: "#264e84",
    visual: {
      kind: "sprite",
      assetId: ART.dragon,
      frame: 9,
      width,
      height,
    },
    bodyType: "dynamic",
    body: makeBody(54, 54, "dynamic", { offsetY: -6 }),
    behaviors: [
      makeBehavior("patrol", { distance, speed: 55, axis: "x" }),
      makeBehavior("health", { max: 1, invulnMs: 0 }),
      makeBehavior("stompable", { bounce: 450, scoreVariable: "score", scoreAmount: 50, sfxAssetId: "asset_starter_jump_sfx" }),
    ],
    animations: { idle: "dragon-walk" },
    tags: ["enemy", "dragon", "ground-enemy"],
  });
}

function flyingDragon(layerId: string, x: number, y: number, distance: number, index: number): GameObject {
  return makeObject({
    name: `Sky dragon ${index + 1}`,
    layerId,
    x,
    y,
    width: 104,
    height: 92,
    color: "#264e84",
    visual: {
      kind: "sprite",
      assetId: ART.dragon,
      frame: 0,
      width: 104,
      height: 92,
    },
    body: makeBody(76, 60, "none"),
    behaviors: [
      makeBehavior("patrol", { distance, speed: 65, axis: "x" }),
      makeBehavior("health", { max: 1, invulnMs: 0 }),
      makeBehavior("stompable", { bounce: 500, scoreVariable: "score", scoreAmount: 75, sfxAssetId: "asset_starter_jump_sfx" }),
    ],
    animations: { idle: "dragon-fly" },
    tags: ["enemy", "dragon", "flying-enemy"],
  });
}

/**
 * A mossy boulder is a solid obstacle: the player has to jump it. The body is
 * fitted to the visible rock (slightly narrower so grazing the art edge is
 * forgiving) and its bottom rests on the ground.
 */
function boulder(layerId: string, x: number, index: number, scale = 1): GameObject {
  const artWidth = Math.round(150 * scale);
  const artHeight = Math.round(108 * scale);
  const object = makeObject({
    name: `Mossy boulder ${index + 1}`,
    layerId,
    x,
    y: 0,
    width: artWidth,
    height: artHeight,
    color: "#60766d",
    visual: {
      kind: "sprite",
      assetId: ART.stone,
      width: artWidth,
      height: artHeight,
      sourceRect: { x: 4, y: 93, w: 839, h: 605 },
    },
    tags: ["rock", "obstacle", "meadow-decoration"],
  });
  bodyFromArt(object, { widthRatio: 0.82, heightRatio: 0.94 });
  placeOnGround(object, MEADOW_GROUND_TOP);
  return object;
}

/** A wooden trail sign plus the lettering painted on it. */
function sign(layerId: string, x: number, text: string, size = 16): GameObject[] {
  const textWidth = Math.max(150, text.length * size * 0.56);
  const boardWidth = textWidth + 34;
  const boardHeight = size * 1.3 + 22;
  const totalHeight = boardHeight + 32;
  const board = makeObject({
    name: `Sign board: ${text}`,
    layerId,
    x,
    y: 0,
    width: boardWidth,
    height: totalHeight,
    color: "#f7ffe9",
    visual: makeShape(boardWidth, totalHeight, [
      // Post first so the board hides its top edge.
      rectShape(8, 36, "#8a5c34", { y: totalHeight / 2 - 18, stroke: "#4a2f17", strokeWidth: 2 }),
      // Board with a chunky painted frame.
      rectShape(boardWidth, boardHeight, "#d7b684", { y: -totalHeight / 2 + boardHeight / 2, stroke: "#4a2f17", strokeWidth: 3 }),
      rectShape(boardWidth - 10, boardHeight - 10, "#f3dfbd", { y: -totalHeight / 2 + boardHeight / 2 }),
      rectShape(boardWidth - 22, boardHeight - 22, "#fdf3dd", { y: -totalHeight / 2 + boardHeight / 2 }),
    ]),
    tags: ["sign", "ui"],
  });
  placeOnGround(board, MEADOW_GROUND_TOP);
  const lettering = makeObject({
    name: `Sign text: ${text}`,
    layerId,
    x,
    y: board.transform.y - totalHeight / 2 + boardHeight / 2,
    width: textWidth,
    height: boardHeight,
    color: "#4a2f17",
    visual: {
      kind: "text",
      text,
      style: { font: "inter", size, color: "#4a2f17", align: "center" },
    },
    tags: ["sign", "ui"],
  });
  return [board, lettering];
}

function noticeText(layerId: string, x: number, text: string, size: number, color: string): GameObject {
  const width = Math.max(140, text.length * size * 0.62);
  return makeObject({
    name: `Note: ${text}`,
    layerId,
    x,
    y: 0,
    width,
    height: size * 1.3,
    color,
    visual: {
      kind: "text",
      text,
      style: { font: "inter", size, color, align: "center" },
    },
    tags: ["sign", "ui"],
  });
}

export function flowerPatch(layerId: string, x: number, index: number): GameObject[] {
  const petals = ["#ffd86b", "#ff9fb0", "#fff3c4", "#c4a6ff"];
  const objects: GameObject[] = [];
  for (let i = 0; i < 3; i += 1) {
    const dx = (i - 1) * 16 + (index % 2 === 0 ? 4 : -4);
    const stemHeight = 20 + ((index + i) % 3) * 6;
    objects.push(
      makeObject({
        name: `Wildflower ${index + 1}-${i + 1}`,
        layerId,
        x: x + dx,
        y: 0,
        width: 16,
        height: stemHeight + 12,
        color: petals[(index + i) % petals.length]!,
        visual: makeShape(16, stemHeight + 12, [
          rectShape(3, stemHeight, "#4f8a35", { y: 6 }),
          circle(6, "#6fbf3f", { x: -3, y: 8 }),
          circle(6, "#6fbf3f", { x: 3, y: 10 }),
          circle(12, petals[(index + i) % petals.length]!, { y: -6, stroke: "#7a5a1f", strokeWidth: 1 }),
          circle(4, "#fff6c8", { y: -6 }),
        ]),
        tags: ["decoration", "meadow-decoration", "flower"],
      }),
    );
  }
  for (const object of objects) placeOnGround(object, MEADOW_GROUND_TOP);
  return objects;
}

export function grassTuft(layerId: string, x: number, index: number): GameObject {
  const object = makeObject({
    name: `Grass tuft ${index + 1}`,
    layerId,
    x,
    y: 0,
    width: 28,
    height: 26,
    color: "#5fae3c",
    visual: makeShape(28, 26, [
      triangleShape(10, 26, "#5fae3c", { x: -8, y: 0 }),
      triangleShape(12, 20, "#77c94c", { x: 2, y: 3 }),
      triangleShape(8, 16, "#4f9a34", { x: 10, y: 5 }),
    ]),
    tags: ["decoration", "meadow-decoration"],
  });
  placeOnGround(object, MEADOW_GROUND_TOP);
  return object;
}

/** Hanging roots under a floating ledge add depth without new art. */
export function ledgeRoots(layerId: string, left: number, top: number, width: number, index: number): GameObject {
  const object = makeObject({
    name: `Ledge roots ${index + 1}`,
    layerId,
    x: left + width / 2,
    y: 0,
    width: Math.max(40, width * 0.55),
    height: 42,
    color: "#6b4728",
    visual: makeShape(Math.max(40, width * 0.55), 42, [
      polygonShape(
        Math.max(40, width * 0.55),
        42,
        "#5d3b22",
        [
          { x: -1, y: -1 },
          { x: 1, y: -1 },
          { x: 1, y: 0.2 },
          { x: 0.55, y: 0.35 },
          { x: 0.62, y: 1 },
          { x: 0.42, y: 1 },
          { x: 0.3, y: 0.35 },
          { x: -0.3, y: 0.4 },
          { x: -0.36, y: 0.95 },
          { x: -0.54, y: 0.95 },
          { x: -0.5, y: 0.3 },
          { x: -1, y: 0.2 },
        ],
        { stroke: "#3f2a18", strokeWidth: 2 },
      ),
    ]),
    tags: ["decoration", "meadow-decoration"],
  });
  placeOnGround(object, top + LEDGE_ART.h);
  return object;
}

function summitCairn(layerId: string): GameObject {
  const object = makeObject({
    name: "Summit cairn",
    layerId,
    x: 18240,
    y: 0,
    width: 104,
    height: 148,
    color: "#9aa39d",
    visual: makeShape(104, 148, [
      circle(96, "#3f6b57", { y: 62 }),
      circle(78, "#8d9791", { y: 40, stroke: "#3f4741", strokeWidth: 2 }),
      circle(58, "#a8b2ab", { y: 10, stroke: "#3f4741", strokeWidth: 2 }),
      circle(40, "#bcc6bf", { y: -12, stroke: "#3f4741", strokeWidth: 2 }),
      // golden summit ring
      circle(46, "#ffd86b", { y: -50, stroke: "#8a6a1e", strokeWidth: 3 }),
      circle(30, "#fff3c4", { y: -50 }),
      polygonShape(
        20,
        24,
        "#ffd86b",
        [
          { x: 0, y: -1 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
        ],
        { y: -50 },
      ),
    ]),
    tags: ["goal", "finish", "summit"],
  });
  placeOnGround(object, MEADOW_GROUND_TOP);
  return object;
}

function finishArchitecture(layerId: string): GameObject[] {
  const objects: GameObject[] = [];
  const flagpole = makeObject({
    name: "Summit flagpole",
    layerId,
    x: 18310,
    y: 0,
    width: 8,
    height: 300,
    color: "#f8f1dc",
    visual: makeShape(8, 300, [rectShape(8, 300, "#f8f1dc", { stroke: "#6b5b3f", strokeWidth: 2 })]),
    tags: ["decoration", "finish"],
  });
  placeOnGround(flagpole, MEADOW_GROUND_TOP);
  objects.push(flagpole);
  objects.push(
    makeObject({
      name: "Summit banner",
      layerId,
      x: 18355,
      y: flagpole.transform.y - 116,
      width: 96,
      height: 58,
      color: "#1f7a5a",
      visual: makeShape(96, 58, [
        rectShape(96, 58, "#1f7a5a", { stroke: "#f8f1dc", strokeWidth: 3 }),
        triangleShape(22, 18, "#f8f1dc", { x: 18 }),
      ]),
      tags: ["decoration", "finish"],
    }),
    makeObject({
      name: "Summit pennant",
      layerId,
      x: 18355,
      y: flagpole.transform.y - 165,
      width: 34,
      height: 24,
      color: "#ffd86b",
      visual: makeShape(34, 24, [triangleShape(34, 24, "#ffd86b")]),
      tags: ["decoration", "finish"],
    }),
  );
  objects.push(noticeText(layerId, 18120, "SUMMIT CAMP", 30, "#f8f1dc"));
  return objects;
}

/** Ground gaps are where the meadow asks for a jump, so reward one shard each. */
function gapShards(): Array<[number, number]> {
  const shards: Array<[number, number]> = [];
  for (let index = 1; index < GROUND_SPANS.length; index += 1) {
    const previous = GROUND_SPANS[index - 1]!;
    const next = GROUND_SPANS[index]!;
    const left = previous[1];
    const right = next[0];
    if (right - left <= 0) continue;
    shards.push([(left + right) / 2, MEADOW_GROUND_TOP - 130]);
  }
  return shards;
}

function nearObstacle(x: number, obstacles: number[], radius = 70): boolean {
  return obstacles.some((obstacle) => Math.abs(obstacle - x) < radius);
}

/**
 * Marlow, the meadow hero: sprite, animations, platformer controls and the
 * ground-aware camera. Templates add their own behaviors (health, etc.).
 */
export function meadowHero(layerId: string, extraBehaviors: GameObject["behaviors"] = []): GameObject {
  const player = makeObject({
    name: "Marlow",
    layerId,
    x: 240,
    y: 0,
    width: 104,
    height: 122,
    color: "#c48a63",
    visual: {
      kind: "sprite",
      assetId: ART.hero,
      frame: 0,
      width: 104,
      height: 122,
    },
    bodyType: "dynamic",
    body: makeBody(52, 120, "dynamic", { offsetY: 1 }),
    behaviors: [
      makeBehavior("platformer-controller", {
        speed: 340,
        accel: 2400,
        decel: 3000,
        jump: 860,
        jumpCut: 0.52,
        maxFallSpeed: 1350,
        maxAirJumps: 0,
        coyoteMs: 110,
        bufferMs: 135,
      }),
      makeBehavior("camera-follow", {
        damping: 0.16,
        deadzoneX: 150,
        // A tall deadzone (190) plus a 1000-tall world left the camera pinned
        // at the bottom clamp, so it never followed Marlow down into a pit.
        deadzoneY: 70,
        offsetY: -60,
        // On high ledges the camera used to rise until the ground sat at the
        // very bottom edge, hiding pits, fires and spikes below. Keep 220px of
        // view under the grass line so the landing spot is always visible.
        floorY: MEADOW_GROUND_TOP,
        floorMargin: 220,
        clampToWorld: true,
      }),
      ...extraBehaviors,
    ],
    animations: {
      idle: "meadow-idle",
      run: "meadow-run",
      jump: "meadow-jump",
      fall: "meadow-fall",
    },
    tags: ["player"],
  });
  // Feet on the ground, not hovering: the body (and art) bottom is the surface.
  placeOnGround(player, MEADOW_GROUND_TOP);
  return player;
}

export function meadowRunTemplate(name: string): ProjectDocument {
  const sky = makeLayer("Sky", 0, { parallax: { x: 0, y: 1 } });
  const mountains = makeLayer("Mountains", 1, { parallax: { x: 0.2, y: 1 } });
  const forest = makeLayer("Forest", 2, { parallax: { x: 0.5, y: 1 } });
  const play = makeLayer("Meadow and actors", 3);

  const backgrounds = [
    tiledSprite("Endless meadow sky", sky.id, MEADOW_LEVEL_WIDTH / 2, 256, MEADOW_LEVEL_WIDTH, 512, ART.sky, 0, ["background", "sky"]),
    tiledSprite("Rolling mountain wall", mountains.id, MEADOW_LEVEL_WIDTH / 2, 420, MEADOW_LEVEL_WIDTH, 512, ART.mountain, 0, ["background", "mountains"]),
    // forests.png is solid only down to row ~428 of 512. At y=620 that ended at
    // world y 791, 29px above the solid soil (820), so the sky colour showed
    // through the grass tufts. y=656 runs the solid trees to 827, under the turf.
    tiledSprite("Deep forest line", forest.id, MEADOW_LEVEL_WIDTH / 2, 656, MEADOW_LEVEL_WIDTH, 512, ART.forest, 0, ["background", "forest"]),
  ];

  const grounds = GROUND_SPANS.map(([left, right]) => groundSegment(play.id, left, right));
  const platforms = PLATFORMS.map(([left, top, width], index) => grassPlatform(play.id, index, left, top, width));
  const movers = [
    movingPlatform(play.id, "Drifting root A", 4430, 700, 150, 160),
    movingPlatform(play.id, "Drifting root B", 11030, 700, 150, 170),
    movingPlatform(play.id, "Drifting root C", 14530, 692, 150, 180),
  ];
  const spikes = SPIKES.map((x, index) => spikeHazard(play.id, x, index));
  const fires = FIRES.map((x, index) => campfireHazard(play.id, x, index));
  const checkpoints = CHECKPOINTS.map((x, index) => checkpoint(play.id, x, index));
  const rocks = ROCKS.map(([x, scale], index) => boulder(play.id, x, index, scale));
  const groundDragons = GROUND_DRAGONS.map(([x, distance], index) => groundDragon(play.id, x, distance, index));
  const flyingDragons = FLYING_DRAGONS.map(([x, y, distance], index) => flyingDragon(play.id, x, y, distance, index));
  // Boards live in open ground windows so they never read as platform edges.
  const signs = [
    sign(play.id, 2720, "FIRE BURNS · FLAGS SAVE"),
    sign(play.id, 6560, "STOMP THE DRAGONS"),
    sign(play.id, 11900, "THE RIDGE RISES"),
  ].flat();

  const hazardXs = [...SPIKES, ...FIRES];
  const platformShards = PLATFORMS.filter(([, top]) => top < MEADOW_GROUND_TOP - 80).map(
    ([left, top, width]) => [left + width / 2, top - 66] as [number, number],
  );
  // Never bury a shard inside a ledge (including one that spans a pit).
  const ledgeBoxes = [...platforms, ...movers].map((object) => visualRect(object));
  const clearOfLedges = ([x, y]: [number, number]) =>
    !ledgeBoxes.some((box) => x > box.left - 18 && x < box.right + 18 && y + 18 > box.top && y - 18 < box.bottom);
  const shardPositions = [
    ...platformShards.filter(clearOfLedges),
    ...gapShards().filter(clearOfLedges),
    [18080, 594] as [number, number],
    [18180, 594] as [number, number],
    [18280, 594] as [number, number],
  ].filter(([x]) => !nearObstacle(x, hazardXs, 58));
  const shards = shardPositions.map(([x, y], index) => shard(play.id, x, y, index));

  const decorations: GameObject[] = [
    ...flowerPatch(play.id, 900, 0),
    ...flowerPatch(play.id, 2740, 1),
    ...flowerPatch(play.id, 4550, 2),
    ...flowerPatch(play.id, 6280, 3),
    ...flowerPatch(play.id, 9500, 4),
    ...flowerPatch(play.id, 11980, 5),
    ...flowerPatch(play.id, 14480, 6),
    ...flowerPatch(play.id, 16860, 7),
    ...flowerPatch(play.id, 17820, 8),
    grassTuft(play.id, 360, 0),
    grassTuft(play.id, 1610, 1),
    grassTuft(play.id, 4120, 2),
    grassTuft(play.id, 6980, 3),
    grassTuft(play.id, 8600, 4),
    grassTuft(play.id, 11740, 5),
    grassTuft(play.id, 14120, 6),
    grassTuft(play.id, 16620, 7),
    ...[8, 12, 18, 23, 29, 34, 40, 45, 50].flatMap((index) => {
      const platform = PLATFORMS[index];
      return platform ? [ledgeRoots(play.id, platform[0], platform[1], platform[2], index)] : [];
    }),
  ];

  const player = meadowHero(play.id, [
    makeBehavior("health", {
      max: 1,
      variable: "health",
      invulnMs: 2500,
      damageTags: "enemy,spike,hazard,death-zone,fire",
      contactDamage: 1,
      deathVariable: "lives",
      deathAmount: -1,
      respawnOnHit: true,
      respawnAtCheckpoint: true,
      respawnMessage: "Back to the last trail flag",
      damageSfxAssetId: "asset_starter_jump_sfx",
    }),
  ]);

  const goal = summitCairn(play.id);

  // Dark hollow behind the ground spans so a pit reads as a drop, not as a

  // hole cut out of the sky. The ground art covers it everywhere else.
  const pitHollow = makeObject({
    name: "Shaded hollow below the turf",
    layerId: play.id,
    x: MEADOW_LEVEL_WIDTH / 2,
    y: (MEADOW_GROUND_TOP + MEADOW_LEVEL_HEIGHT) / 2,
    width: MEADOW_LEVEL_WIDTH,
    height: MEADOW_LEVEL_HEIGHT - MEADOW_GROUND_TOP,
    color: "#16241c",
    visual: makeShape(MEADOW_LEVEL_WIDTH, MEADOW_LEVEL_HEIGHT - MEADOW_GROUND_TOP, [
      rectShape(MEADOW_LEVEL_WIDTH, MEADOW_LEVEL_HEIGHT - MEADOW_GROUND_TOP, "#16241c"),
    ]),
    tags: ["background", "meadow-pit"],
  });

  // Below the ground art (which ends at 1054) so the strip never paints over
  // the visible soil when the camera follows a fall.
  const deathZone = makeObject({
    name: "Loose shale below the trail",
    layerId: play.id,
    x: MEADOW_LEVEL_WIDTH / 2,
    y: 1127,
    width: MEADOW_LEVEL_WIDTH,
    height: 145,
    color: "#10242e",
    visual: makeShape(MEADOW_LEVEL_WIDTH, 90, [rectShape(MEADOW_LEVEL_WIDTH, 90, "#10242e")]),
    tags: ["death-zone", "hazard"],
  });

  const scene = makeScene({
    name: "Meadow Run",
    width: MEADOW_LEVEL_WIDTH,
    height: MEADOW_LEVEL_HEIGHT,
    background: SKY,
    layers: [sky, mountains, forest, play],
    objects: [
      ...backgrounds,
      pitHollow,
      // Spikes are drawn before the ground so their buried bases disappear
      // under the turf instead of sitting on top of it.
      ...spikes,
      ...grounds,
      ...rocks,
      ...platforms,
      ...movers,
      ...decorations,
      ...signs,
      ...shards,
      ...fires,
      ...checkpoints,
      ...groundDragons,
      ...flyingDragons,
      player,
      goal,
      ...finishArchitecture(play.id),
      deathZone,
    ],
    camera: { x: 800, y: 620, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Opening instruction",
        enabled: true,
        once: true,
        when: [{ kind: "scene-start" }],
        do: [
          { kind: "show-message", text: "A / D run · Space jump — follow the shards, raise the flags, reach the summit.", durationMs: 3600 },
        ],
      },
      {
        id: newId("rul"),
        name: "Reach the summit camp",
        enabled: true,
        once: true,
        when: [{ kind: "overlap", objectId: player.id, otherId: goal.id }],
        do: [
          { kind: "set-variable", name: "won", op: "set", value: true },
          { kind: "set-variable", name: "score", op: "add", value: 100 },
          { kind: "show-message", text: "Summit camp reached — stage clear!", durationMs: 3200 },
        ],
      },
      {
        id: newId("rul"),
        name: "Out of lives",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "lives", op: "<=", value: 0 }],
        do: [
          { kind: "set-variable", name: "lost", op: "set", value: true },
          { kind: "show-message", text: "The trail wins this time.", durationMs: 3200 },
        ],
      },
    ],
  });

  return makeDocument({
    name,
    templateOrigin: "meadow-run",
    settings: makeSettings({
      width: 1600,
      height: 900,
      background: SKY,
      gravity: { x: 0, y: 1700 },
      ui: {
        hud: [
          { id: "hud_stage", variable: "stage", label: "STAGE", corner: "top-left", style: "text", visible: true },
          { id: "hud_score", variable: "score", label: "SCORE", corner: "top-right", style: "text", visible: true },
          { id: "hud_lives", variable: "lives", label: "LIVES", corner: "bottom-left", style: "text", visible: true },
          { id: "hud_shards", variable: "shards", label: "SHARDS", corner: "bottom-right", style: "text", visible: true },
        ],
        accent: MINT,
        font: "inter",
        message: { color: "#f7ffe9", background: "rgba(18, 42, 45, 0.88)", fontSize: 24 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    variables: [
      { id: newId("var"), name: "score", type: "number", initial: 0, description: "Ten points for every sun shard, plus a summit bonus." },
      { id: newId("var"), name: "shards", type: "number", initial: 0, description: "Sun shards collected in this run." },
      { id: newId("var"), name: "lives", type: "number", initial: 10, description: "Lives left before the trail wins." },
      { id: newId("var"), name: "health", type: "number", initial: 1, description: "Current hit point; a hit costs one life." },
      { id: newId("var"), name: "stage", type: "string", initial: "1-1", description: "Current stage." },
      { id: newId("var"), name: "won", type: "boolean", initial: false },
      { id: newId("var"), name: "lost", type: "boolean", initial: false },
    ],
  });
}
