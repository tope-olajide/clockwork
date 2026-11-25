import { makeBody, makeDocument, makeLayer, makeObject, makeScene, makeSettings, makeShape, newId, rectShape } from "../factory";
import type { GameObject, ProjectDocument } from "../schema";
import { PLATFORMER_ASSET_IDS as ART } from "../../assets/starter-manifest";
import {
  MEADOW_LEVEL_HEIGHT,
  MEADOW_MINT,
  MEADOW_SKY,
  flowerPatch,
  grassPlatform,
  grassTuft,
  groundSegment,
  ledgeRoots,
  meadowHero,
  tiledSprite,
} from "./meadow-run";

/**
 * Meadow Sandbox: the Clockwork Meadows look and feel with no gameplay content.
 * Marlow, the parallax meadow, one unbroken floor and three easy ledges. There
 * are no coins, enemies, hazards, pits, checkpoints, goal, variables or HUD, so
 * features added later (for example by the AI) are easy to see.
 */
export const SANDBOX_LEVEL_WIDTH = 2_800;

/**
 * [left, surfaceTop, width]. All three sit near the start and are reachable
 * from the floor (the jump clears about 215px). Each ledge's solid slab ends
 * 30px under its surface, so tops at or above 640 leave a clear walkway under
 * them for a 120px-tall Marlow standing on the floor at 820.
 */
const SANDBOX_PLATFORMS: Array<[number, number, number]> = [
  [620, 640, 180],
  [960, 580, 180],
  [1320, 640, 180],
];

export function meadowSandboxTemplate(name: string): ProjectDocument {
  const sky = makeLayer("Sky", 0, { parallax: { x: 0, y: 1 } });
  const mountains = makeLayer("Mountains", 1, { parallax: { x: 0.2, y: 1 } });
  const forest = makeLayer("Forest", 2, { parallax: { x: 0.5, y: 1 } });
  const play = makeLayer("Meadow and actors", 3);

  // Parallax layers scroll slower than the world, so at the far end of the
  // level they are offset by (cameraX - width/2) * (1 - factor). Two extra
  // screens of art on each side keeps every layer covering the view.
  const artWidth = SANDBOX_LEVEL_WIDTH + 3_200;
  const backgrounds = [
    tiledSprite("Endless meadow sky", sky.id, SANDBOX_LEVEL_WIDTH / 2, 256, artWidth, 512, ART.sky, 0, ["background", "sky"]),
    tiledSprite("Rolling mountain wall", mountains.id, SANDBOX_LEVEL_WIDTH / 2, 420, artWidth, 512, ART.mountain, 0, ["background", "mountains"]),
    tiledSprite("Deep forest line", forest.id, SANDBOX_LEVEL_WIDTH / 2, 656, artWidth, 512, ART.forest, 0, ["background", "forest"]),
  ];

  // Dark soil under the ground art (which ends at y=1054) so a tall view never
  // shows sky colour at the bottom of the world.
  const deepSoil = makeObject({
    name: "Deep soil",
    layerId: play.id,
    x: SANDBOX_LEVEL_WIDTH / 2,
    y: (1_040 + MEADOW_LEVEL_HEIGHT) / 2,
    width: SANDBOX_LEVEL_WIDTH,
    height: MEADOW_LEVEL_HEIGHT - 1_040,
    color: "#16241c",
    visual: makeShape(SANDBOX_LEVEL_WIDTH, MEADOW_LEVEL_HEIGHT - 1_040, [
      rectShape(SANDBOX_LEVEL_WIDTH, MEADOW_LEVEL_HEIGHT - 1_040, "#16241c"),
    ]),
    tags: ["background", "meadow-soil"],
  });

  const ground = groundSegment(play.id, 0, SANDBOX_LEVEL_WIDTH);
  // Invisible walls just outside both ends so Marlow cannot run off the floor.
  const edgeWalls = [-20, SANDBOX_LEVEL_WIDTH + 20].map((x, index) =>
    makeObject({
      name: index === 0 ? "West edge wall" : "East edge wall",
      layerId: play.id,
      x,
      y: MEADOW_LEVEL_HEIGHT / 2,
      width: 40,
      height: MEADOW_LEVEL_HEIGHT,
      color: "#000000",
      bodyType: "static",
      body: makeBody(40, MEADOW_LEVEL_HEIGHT, "static"),
      tags: ["wall", "level-bounds"],
    }),
  );
  const platforms = SANDBOX_PLATFORMS.map(([left, top, width], index) => grassPlatform(play.id, index, left, top, width));

  const decorations: GameObject[] = [
    ...flowerPatch(play.id, 420, 0),
    ...flowerPatch(play.id, 1820, 1),
    ...flowerPatch(play.id, 2500, 2),
    grassTuft(play.id, 160, 0),
    grassTuft(play.id, 1120, 1),
    grassTuft(play.id, 2200, 2),
    ...SANDBOX_PLATFORMS.map(([left, top, width], index) => ledgeRoots(play.id, left, top, width, index)),
  ];

  const player = meadowHero(play.id);

  const scene = makeScene({
    name: "Meadow Sandbox",
    width: SANDBOX_LEVEL_WIDTH,
    height: MEADOW_LEVEL_HEIGHT,
    background: MEADOW_SKY,
    layers: [sky, mountains, forest, play],
    objects: [...backgrounds, deepSoil, ground, ...edgeWalls, ...platforms, ...decorations, player],
    camera: { x: 800, y: 620, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Opening instruction",
        enabled: true,
        once: true,
        when: [{ kind: "scene-start" }],
        do: [{ kind: "show-message", text: "A / D run · Space jump", durationMs: 3000 }],
      },
    ],
  });

  return makeDocument({
    name,
    templateOrigin: "meadow-sandbox",
    settings: makeSettings({
      width: 1600,
      height: 900,
      background: MEADOW_SKY,
      gravity: { x: 0, y: 1700 },
      ui: {
        hud: [],
        accent: MEADOW_MINT,
        font: "inter",
        message: { color: "#f7ffe9", background: "rgba(18, 42, 45, 0.88)", fontSize: 24 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    variables: [],
  });
}
