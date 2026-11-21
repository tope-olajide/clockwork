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
  rectShape,
  triangleShape,
} from "../factory";
import type { GameObject, ProjectDocument } from "../schema";

const width = 1600;
const height = 900;
const background = "#10162a";
const lavender = "#a9b4ff";
const mint = "#8fe3c0";
const gold = "#f4c56a";
const coral = "#ff856f";

function platform(layerId: string, name: string, x: number, y: number, w: number, h: number, moving = false): GameObject {
  return makeObject({
    name,
    layerId,
    x,
    y,
    width: w,
    height: h,
    color: moving ? mint : "#384562",
    visual: makeShape(w, h, [rectShape(w, h, moving ? mint : "#384562", { stroke: moving ? "#d7fff0" : "#6c7d9e", strokeWidth: 2 })]),
    bodyType: moving ? "kinematic" : "static",
    body: makeBody(w, h, moving ? "kinematic" : "static", { oneWay: true }),
    behaviors: moving ? [makeBehavior("patrol", { distance: 96, speed: 74, axis: "x" })] : [],
    tags: ["ground", "platform", ...(moving ? ["moving-platform"] : [])],
  });
}

function spikes(layerId: string, name: string, x: number, y: number): GameObject {
  return makeObject({
    name,
    layerId,
    x,
    y,
    width: 76,
    height: 28,
    color: coral,
    visual: makeShape(76, 28, Array.from({ length: 4 }, (_, index) =>
      triangleShape(22, 28, coral, { x: -27 + index * 18, stroke: "#ffd0c7", strokeWidth: 1 }),
    )),
    tags: ["spike", "hazard"],
  });
}

export function platformJumperTemplate(name: string): ProjectDocument {
  const sky = makeLayer("Sky", 0, { parallax: { x: 0.08, y: 0.08 } });
  const far = makeLayer("Distant hills", 1, { parallax: { x: 0.35, y: 0.25 } });
  const play = makeLayer("Platforms and actors", 2);
  const ui = makeLayer("HUD and controls", 3, { parallax: { x: 0, y: 0 } });
  const backdrop = makeObject({
    name: "Dusk sky",
    layerId: sky.id,
    x: width / 2,
    y: height / 2,
    width,
    height,
    color: background,
    visual: makeShape(width, height, [rectShape(width, height, background)]),
    tags: ["background"],
  });
  const hills = makeObject({
    name: "Far ridge",
    layerId: far.id,
    x: width / 2,
    y: 725,
    width,
    height: 350,
    color: "#202b45",
    visual: makeShape(width, 350, [triangleShape(width, 350, "#202b45", { y: 70 })]),
    tags: ["decoration"],
  });
  const platforms = [
    platform(play.id, "Starting ground", 200, 840, 400, 60),
    platform(play.id, "Middle ground", 800, 840, 520, 60),
    platform(play.id, "Exit ground", 1340, 840, 520, 60),
    platform(play.id, "Ledge A", 500, 700, 180, 20),
    platform(play.id, "Ledge B", 740, 610, 170, 20),
    platform(play.id, "Moving ledge", 980, 550, 140, 20, true),
    platform(play.id, "Ledge C", 1190, 675, 180, 20),
  ];
  const player = makeObject({
    name: "Jumper",
    layerId: play.id,
    x: 90,
    y: 780,
    width: 38,
    height: 48,
    color: lavender,
    visual: makeShape(38, 48, [
      rectShape(26, 34, lavender, { y: 3, stroke: "#e5e8ff", strokeWidth: 2 }),
      circle(10, "#263052", { x: -4, y: -3 }),
      rectShape(18, 8, "#626fa0", { y: 22 }),
    ]),
    bodyType: "dynamic",
    body: makeBody(32, 46, "dynamic"),
    behaviors: [
      makeBehavior("platformer-controller", { speed: 300, jump: 590, maxAirJumps: 0, coyoteMs: 100, bufferMs: 120 }),
      makeBehavior("camera-follow", { damping: 0.14, offsetY: -24 }),
      makeBehavior("health", {
        max: 1,
        variable: "health",
        invulnMs: 900,
        damageTags: "spike,death-zone",
        deathVariable: "lives",
        deathAmount: -1,
        respawnOnHit: true,
      }),
    ],
    tags: ["player"],
  });
  const coinPositions = [
    [170, 760],
    [500, 650],
    [740, 560],
    [980, 500],
    [1280, 620],
  ] as const;
  const coins = coinPositions.map(([x, y], index) =>
    makeObject({
      name: `Core ${index + 1}`,
      layerId: play.id,
      x,
      y,
      width: 24,
      height: 24,
      color: gold,
      visual: makeShape(24, 24, [circle(22, gold, { stroke: "#fff1bd", strokeWidth: 2 }), circle(8, "#fff1bd")]),
      behaviors: [makeBehavior("collectible", { variable: "coins", amount: 1 })],
      tags: ["coin", "collectible"],
    }),
  );
  const hazardObjects = [
    spikes(play.id, "Spike patch A", 330, 790),
    spikes(play.id, "Spike patch B", 880, 790),
    makeObject({
      name: "Death zone",
      layerId: play.id,
      x: width / 2,
      y: 880,
      width,
      height: 40,
      color: "#a83d5b",
      visual: makeShape(width, 40, [rectShape(width, 40, "#a83d5b")]),
      tags: ["death-zone", "hazard"],
    }),
  ];
  const goal = makeObject({
    name: "Relay exit",
    layerId: play.id,
    x: 1510,
    y: 775,
    width: 42,
    height: 80,
    color: lavender,
    visual: makeShape(42, 80, [
      rectShape(42, 80, "#515d94", { stroke: "#e5e8ff", strokeWidth: 3 }),
      rectShape(8, 8, gold, { x: 10 }),
    ]),
    tags: ["goal", "exit"],
  });
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 26,
    y: 28,
    width: 300,
    height: 24,
    color: "#f1f0ed",
    visual: { kind: "text", text: "PLATFORM JUMPER", style: { font: "inter", size: 18, color: "#f1f0ed", align: "left" } },
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
    visual: { kind: "text", text: "A / D move       Space jump       Collect 5 cores, then reach the relay", style: { font: "inter", size: 15, color: "#aab0c6", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Core Run",
    width,
    height,
    background,
    layers: [sky, far, play, ui],
    objects: [backdrop, hills, ...platforms, ...hazardObjects, ...coins, player, goal, title, controls],
    camera: { x: 320, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Reach relay with every core",
        enabled: true,
        once: true,
        when: [
          { kind: "variable", name: "coins", op: ">=", value: 5 },
          { kind: "overlap", objectId: player.id, otherTag: "goal" },
        ],
        do: [
          { kind: "set-variable", name: "won", op: "set", value: true },
          { kind: "show-message", text: "All five cores recovered!", durationMs: 2400 },
        ],
      },
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
    templateOrigin: "platform-jumper",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 980 },
      ui: {
        hud: [
          { id: "hud_coins", variable: "coins", label: "CORES", corner: "top-left", style: "text", visible: true },
          { id: "hud_lives", variable: "lives", label: "LIVES", corner: "top-right", style: "text", visible: true },
        ],
        accent: lavender,
        font: "inter",
        message: { color: "#f1f0ed", background: "rgba(16, 22, 42, 0.86)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    variables: [
      { id: "var_coins", name: "coins", type: "number", initial: 0 },
      { id: "var_lives", name: "lives", type: "number", initial: 3 },
      { id: "var_health", name: "health", type: "number", initial: 1 },
      { id: "var_won", name: "won", type: "boolean", initial: false },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
