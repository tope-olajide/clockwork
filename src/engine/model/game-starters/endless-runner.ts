import {
  makeBehavior,
  makeBody,
  makeDocument,
  makeLayer,
  makeObject,
  makeScene,
  makeSettings,
  makeShape,
  newId,
  rectShape,
} from "../factory";
import type { GameObject, Prefab, ProjectDocument } from "../schema";

const width = 1280;
const height = 720;
const playerX = 230;
const obstaclePrefabId = "pfb_runner_obstacle";
const corePrefabId = "pfb_runner_core";
const background = "#141a2b";
const coral = "#ff856f";
const lavender = "#a9b4ff";
const mint = "#8fe3c0";
const gold = "#f4c56a";

function obstacleObject(layerId: string, x: number, y: number, name: string): GameObject {
  return makeObject({
    name,
    layerId,
    x,
    y,
    width: 44,
    height: 56,
    color: coral,
    visual: makeShape(44, 56, [
      rectShape(44, 56, coral, { stroke: "#ffd0c7", strokeWidth: 2 }),
      rectShape(14, 8, "#7b4351", { x: -9, y: -14 }),
    ]),
    bodyType: "static",
    body: makeBody(40, 54, "static"),
    behaviors: [makeBehavior("mover", { vx: -290, lifetimeMs: 6500, passX: playerX + 24, passVariable: "score" })],
    tags: ["obstacle", "hazard"],
  });
}

function coreObject(layerId: string, x: number, y: number, name: string): GameObject {
  return makeObject({
    name,
    layerId,
    x,
    y,
    width: 24,
    height: 24,
    color: gold,
    visual: makeShape(24, 24, [
      { kind: "circle", width: 22, height: 22, color: gold, stroke: "#fff1bd", strokeWidth: 2 },
      { kind: "circle", width: 8, height: 8, color: "#fff1bd" },
    ]),
    behaviors: [
      makeBehavior("collectible", { variable: "score", amount: 5 }),
      makeBehavior("mover", { vx: -290, lifetimeMs: 6500 }),
    ],
    tags: ["coin", "collectible"],
  });
}

export function endlessRunnerTemplate(name: string): ProjectDocument {
  const sky = makeLayer("Sky", 0, { parallax: { x: 0.1, y: 0.1 } });
  const far = makeLayer("Distant skyline", 1, { parallax: { x: 0.3, y: 0.2 } });
  const play = makeLayer("Runner and track", 2);
  const ui = makeLayer("HUD and controls", 3, { parallax: { x: 0, y: 0 } });
  const backdrop = makeObject({
    name: "Night sky",
    layerId: sky.id,
    x: width / 2,
    y: height / 2,
    width,
    height,
    color: background,
    visual: makeShape(width, height, [rectShape(width, height, background)]),
    tags: ["background"],
  });
  const skyline = makeObject({
    name: "Distant skyline",
    layerId: far.id,
    x: width / 2,
    y: 482,
    width,
    height: 240,
    color: "#222c45",
    visual: makeShape(width, 240, [
      rectShape(110, 150, "#293550", { x: -475, y: 34 }),
      rectShape(145, 210, "#293550", { x: -285, y: 4 }),
      rectShape(100, 125, "#293550", { x: -95, y: 48 }),
      rectShape(160, 190, "#293550", { x: 120, y: 16 }),
      rectShape(118, 145, "#293550", { x: 340, y: 38 }),
      rectShape(135, 205, "#293550", { x: 520, y: 8 }),
    ]),
    tags: ["decoration"],
  });
  const track = makeObject({
    name: "Running track",
    layerId: play.id,
    x: width / 2,
    y: 680,
    width,
    height: 80,
    color: "#343d56",
    visual: makeShape(width, 80, [
      rectShape(width, 80, "#343d56"),
      rectShape(width, 6, mint, { y: -36 }),
      ...Array.from({ length: 10 }, (_, index) => rectShape(64, 5, "#606a83", { x: -570 + index * 128, y: 15 })),
    ]),
    bodyType: "static",
    body: makeBody(width, 80, "static"),
    tags: ["ground"],
  });
  const player = makeObject({
    name: "Runner",
    layerId: play.id,
    x: playerX,
    y: 616,
    width: 38,
    height: 48,
    color: lavender,
    visual: makeShape(38, 48, [
      rectShape(27, 38, lavender, { y: -1, stroke: "#e5e8ff", strokeWidth: 2 }),
      rectShape(15, 8, "#4e5b91", { x: 2, y: 8 }),
      rectShape(10, 5, "#f1f0ed", { x: 5, y: -7 }),
    ]),
    bodyType: "dynamic",
    body: makeBody(32, 46, "dynamic"),
    behaviors: [
      makeBehavior("platformer-controller", { speed: 0, jump: 570, maxAirJumps: 0, coyoteMs: 80, bufferMs: 100 }),
      makeBehavior("duck", { trigger: "down", bodyHeight: 24, visualScaleY: 0.62 }),
      makeBehavior("health", {
        max: 1,
        variable: "health",
        invulnMs: 950,
        damageTags: "obstacle",
        deathVariable: "lives",
        deathAmount: -1,
        respawnOnHit: true,
      }),
    ],
    tags: ["player"],
  });
  const obstaclePrefabRoot = obstacleObject(play.id, 0, 0, "Traffic cone");
  obstaclePrefabRoot.id = "pfb_runner_obstacle_root";
  const obstaclePrefab: Prefab = {
    id: obstaclePrefabId,
    name: "Traffic cone",
    root: obstaclePrefabRoot,
    objects: [],
    params: {},
  };
  const corePrefabRoot = coreObject(play.id, 0, 0, "Bonus core");
  corePrefabRoot.id = "pfb_runner_core_root";
  const corePrefab: Prefab = {
    id: corePrefabId,
    name: "Bonus core",
    root: corePrefabRoot,
    objects: [],
    params: {},
  };
  const firstObstacle = obstacleObject(play.id, 870, 612, "First traffic cone");
  firstObstacle.prefabId = obstaclePrefabId;
  firstObstacle.prefabInstanceId = newId("pinst");
  firstObstacle.prefabSlot = "root";
  const firstCore = coreObject(play.id, 1100, 535, "First bonus core");
  firstCore.prefabId = corePrefabId;
  firstCore.prefabInstanceId = newId("pinst");
  firstCore.prefabSlot = "root";
  const director = makeObject({
    name: "Obstacle director",
    layerId: play.id,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    behaviors: [
      makeBehavior("spawner", {
        prefabId: obstaclePrefabId,
        startDelayMs: 1200,
        intervalMs: 1750,
        intervalDecayPerSecond: 28,
        minIntervalMs: 760,
        minX: 1340,
        maxX: 1340,
        minY: 610,
        maxY: 610,
        limit: 8,
      }),
      makeBehavior("spawner", {
        prefabId: corePrefabId,
        startDelayMs: 1900,
        intervalMs: 2600,
        minX: 1340,
        maxX: 1340,
        minY: 505,
        maxY: 555,
        limit: 5,
      }),
    ],
    tags: ["spawner", "director"],
  });
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 28,
    y: 28,
    width: 300,
    height: 24,
    color: "#f1f0ed",
    visual: { kind: "text", text: "ENDLESS RUNNER", style: { font: "inter", size: 18, color: "#f1f0ed", align: "left" } },
    tags: ["ui"],
  });
  const controls = makeObject({
    name: "Controls",
    layerId: ui.id,
    x: 640,
    y: 28,
    width: 500,
    height: 22,
    color: "#aab0c6",
    visual: { kind: "text", text: "Space jump       Down duck       Avoid cones, collect bonus cores", style: { font: "inter", size: 15, color: "#aab0c6", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Night Sprint",
    width,
    height,
    background,
    layers: [sky, far, play, ui],
    objects: [backdrop, skyline, track, firstObstacle, firstCore, player, director, title, controls],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Out of lives",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "lives", op: "<=", value: 0 }],
        do: [{ kind: "set-variable", name: "lost", op: "set", value: true }],
      },
    ],
  });

  return makeDocument({
    name,
    templateOrigin: "endless-runner",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 1200 },
      ui: {
        hud: [
          { id: "hud_score", variable: "score", label: "SCORE", corner: "top-left", style: "text", visible: true },
          { id: "hud_lives", variable: "lives", label: "LIVES", corner: "top-right", style: "text", visible: true },
        ],
        accent: mint,
        font: "inter",
        message: { color: "#f1f0ed", background: "rgba(20, 26, 43, 0.88)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    prefabs: [obstaclePrefab, corePrefab],
    variables: [
      { id: "var_score", name: "score", type: "number", initial: 0 },
      { id: "var_lives", name: "lives", type: "number", initial: 3 },
      { id: "var_health", name: "health", type: "number", initial: 1 },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
