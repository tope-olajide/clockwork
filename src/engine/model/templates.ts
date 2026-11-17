import {
  createEmptyProject,
  makeBehavior,
  makeBody,
  makeDocument,
  makeLayer,
  makeObject,
  makeScene,
  makeSettings,
  newId,
} from "./factory";
import type { GameObject, Prefab, ProjectDocument, Scene, TemplateOrigin } from "./schema";

const coral = "#ff856f";
const periwinkle = "#a9b4ff";
const mint = "#8fe3c0";
const gold = "#f4c56a";
const groundColor = "#29314b";

function platformerTemplate(name: string): ProjectDocument {
  const sky = makeLayer("Sky", 0, { parallax: { x: 0.05, y: 0.05 } });
  const far = makeLayer("Far", 1, { parallax: { x: 0.3, y: 0.2 } });
  const play = makeLayer("Play", 2);
  const ui = makeLayer("UI", 3, { parallax: { x: 0, y: 0 } });

  const skyBackdrop = makeObject({
    name: "Sky gradient",
    layerId: sky.id,
    x: 1200,
    y: 500,
    width: 2400,
    height: 1000,
    color: "#10162a",
    tags: ["sky"],
  });
  const moon = makeObject({
    name: "Moon",
    layerId: sky.id,
    x: 1840,
    y: 150,
    width: 128,
    height: 128,
    color: "#f6e7c8",
    tags: ["moon"],
  });
  const ridge = makeObject({
    name: "Ridge",
    layerId: far.id,
    x: 900,
    y: 560,
    width: 1900,
    height: 475,
    color: "#1e263d",
  });
  const ridgeTwo = makeObject({
    name: "Ridge detail",
    layerId: far.id,
    x: 1480,
    y: 690,
    width: 1400,
    height: 350,
    color: "#252f4a",
  });
  const ridgeForeground = makeObject({
    name: "Ridge foreground",
    layerId: far.id,
    x: 1700,
    y: 630,
    width: 1600,
    height: 400,
    color: "#2b3654",
  });

  const player = makeObject({
    name: "Player",
    layerId: play.id,
    x: 160,
    y: 710,
    width: 34,
    height: 52,
    color: coral,
    bodyType: "dynamic",
    body: makeBody(34, 52, "dynamic", { collideWorldBounds: true }),
    behaviors: [
      makeBehavior("platformer-controller", { speed: 280, jump: 640 }),
      makeBehavior("camera-follow", { damping: 0.12, offsetY: -40 }),
    ],
    tags: ["player"],
  });
  const ground = makeObject({
    name: "Ground",
    layerId: play.id,
    x: 1100,
    y: 872,
    width: 2200,
    height: 100,
    color: groundColor,
    bodyType: "static",
    tags: ["ground"],
  });
  const ledge = makeObject({
    name: "Ledge A",
    layerId: play.id,
    x: 620,
    y: 690,
    width: 260,
    height: 28,
    color: "#384562",
    bodyType: "static",
    tags: ["ground"],
  });
  const ledgeB = makeObject({
    name: "Ledge B",
    layerId: play.id,
    x: 1080,
    y: 560,
    width: 240,
    height: 28,
    color: "#384562",
    bodyType: "static",
    tags: ["ground"],
  });
  const ledgeC = makeObject({
    name: "Ledge C",
    layerId: play.id,
    x: 1530,
    y: 675,
    width: 230,
    height: 28,
    color: "#384562",
    bodyType: "static",
    tags: ["ground"],
  });
  const coinPrefab: Prefab = {
    id: "pfb_coin",
    name: "Coin",
    root: {
      id: "pfb_coin_root",
      name: "Coin",
      layerId: play.id,
      transform: { x: 610, y: 630, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      visual: { kind: "rect", width: 22, height: 22, color: gold, stroke: "#fff1c4" },
      behaviors: [makeBehavior("collectible", { variable: "coins", amount: 1 })],
      properties: {},
      tags: ["coin"],
    },
    objects: [],
    params: {},
  };

  function coinInstance(name: string, x: number, y: number): GameObject {
    return {
      id: newId("obj"),
      name,
      layerId: play.id,
      prefabId: coinPrefab.id,
      prefabInstanceId: newId("pinst"),
      prefabSlot: "root",
      transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      visual: { kind: "rect", width: 22, height: 22, color: gold, stroke: "#fff1c4" },
      behaviors: [makeBehavior("collectible", { variable: "coins", amount: 1 })],
      properties: {},
      tags: ["coin"],
    };
  }

  const coinA = coinInstance("Core A", 610, 630);
  const coinB = coinInstance("Core B", 1080, 500);
  const coinC = coinInstance("Core C", 1540, 615);
  const hazard = makeObject({
    name: "Spark hazard",
    layerId: play.id,
    x: 1370,
    y: 800,
    width: 44,
    height: 44,
    color: "#ffb45c",
    bodyType: "static",
    behaviors: [makeBehavior("hazard", { respawn: true })],
    tags: ["hazard"],
  });
  const checkpoint = makeObject({
    name: "Checkpoint",
    layerId: play.id,
    x: 1130,
    y: 790,
    width: 20,
    height: 62,
    color: mint,
    behaviors: [makeBehavior("checkpoint")],
    tags: ["checkpoint"],
  });
  const goal = makeObject({
    name: "Relay",
    layerId: play.id,
    x: 2070,
    y: 760,
    width: 44,
    height: 124,
    color: periwinkle,
    visual: { kind: "rect", width: 44, height: 124, color: periwinkle, stroke: "#e2e6ff" },
    behaviors: [makeBehavior("checkpoint")],
    tags: ["goal"],
  });
  const hint = makeObject({
    name: "Hint",
    layerId: ui.id,
    x: 1560,
    y: 86,
    width: 380,
    height: 30,
    color: "#f1f0ed",
    visual: {
      kind: "text",
      text: "A / D  move    Space  jump",
      style: { font: "inter", size: 18, color: "#aab0c6", align: "right" },
    },
    tags: ["ui"],
  });

  const winLayer = makeLayer("Win", 0);
  const winMessage = makeObject({
    name: "Win message",
    layerId: winLayer.id,
    x: 640,
    y: 360,
    width: 420,
    height: 40,
    color: "#f1f0ed",
    visual: {
      kind: "text",
      text: "All cores recovered. You win!",
      style: { font: "inter", size: 32, color: "#f1f0ed", align: "center" },
    },
    tags: ["ui"],
  });
  const winScene = makeScene({
    name: "Win",
    width: 1280,
    height: 720,
    background: "#10162a",
    layers: [winLayer],
    objects: [winMessage],
    rules: [
      {
        id: "rul_win_message",
        name: "Show win message",
        enabled: true,
        once: true,
        when: [{ kind: "scene-start" }],
        do: [{ kind: "show-message", text: "All cores recovered. You win!", durationMs: 2200 }],
      },
    ],
  });

  const scene = makeScene({
    name: "Dusk Run",
    width: 2400,
    height: 1000,
    background: "#10162a",
    layers: [sky, far, play, ui],
    objects: [skyBackdrop, moon, ridge, ridgeTwo, ridgeForeground, ground, ledge, ledgeB, ledgeC, player, coinA, coinB, coinC, hazard, checkpoint, goal, hint],
    rules: [
      {
        id: "rul_win_scene",
        name: "Win when all cores collected",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "coins", op: ">=", value: 3 }],
        do: [
          { kind: "set-variable", name: "won", op: "set", value: true },
          { kind: "go-scene", sceneId: winScene.id },
        ],
      },
      {
        id: "rul_lose",
        name: "Lose when time runs out",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "lives", op: "<=", value: 0 }],
        do: [{ kind: "show-message", text: "Out of lives. Try again.", durationMs: 2200 }],
      },
    ],
  });

  const doc = makeDocument({
    name,
    templateOrigin: "platformer",
    settings: makeSettings({
      background: "#10162a",
      ui: {
        hud: [{ id: "hud_coins", variable: "coins", label: "CORES", corner: "top-left", style: "text", visible: true }],
        accent: coral,
        font: "inter",
        message: { color: "#f1f0ed", background: "rgba(11, 13, 18, 0.72)", fontSize: 20 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene, winScene],
    prefabs: [coinPrefab],
    variables: [
      { id: "var_coins", name: "coins", type: "number", initial: 0, description: "Cores collected in the run." },
      { id: "var_won", name: "won", type: "boolean", initial: false, description: "Set when the relay is reached." },
      { id: "var_lives", name: "lives", type: "number", initial: 3, description: "Lives remaining." },
    ],
  });
  return doc;
}

function topDownTemplate(name: string): ProjectDocument {
  const ground = makeLayer("Ground", 0);
  const actors = makeLayer("Actors", 1);
  const ui = makeLayer("UI", 2);

  const floor = makeObject({
    name: "Floor",
    layerId: ground.id,
    x: 800,
    y: 500,
    width: 1500,
    height: 900,
    color: "#1d2940",
    bodyType: "static",
    tags: ["ground"],
  });
  const wallTop = makeObject({
    name: "Wall top",
    layerId: ground.id,
    x: 800,
    y: 70,
    width: 1500,
    height: 50,
    color: "#33405f",
    bodyType: "static",
    tags: ["wall"],
  });
  const wallBottom = makeObject({
    name: "Wall bottom",
    layerId: ground.id,
    x: 800,
    y: 930,
    width: 1500,
    height: 50,
    color: "#33405f",
    bodyType: "static",
    tags: ["wall"],
  });
  const wallLeft = makeObject({
    name: "Wall left",
    layerId: ground.id,
    x: 70,
    y: 500,
    width: 50,
    height: 900,
    color: "#33405f",
    bodyType: "static",
    tags: ["wall"],
  });
  const wallRight = makeObject({
    name: "Wall right",
    layerId: ground.id,
    x: 1530,
    y: 500,
    width: 50,
    height: 900,
    color: "#33405f",
    bodyType: "static",
    tags: ["wall"],
  });
  const player = makeObject({
    name: "Player",
    layerId: actors.id,
    x: 220,
    y: 500,
    width: 38,
    height: 38,
    color: coral,
    visual: { kind: "rect", width: 38, height: 38, color: coral, stroke: "#ffd0c7" },
    bodyType: "dynamic",
    body: makeBody(38, 38, "dynamic"),
    behaviors: [
      makeBehavior("top-down-controller", { speed: 250 }),
      makeBehavior("camera-follow", { damping: 0.1 }),
      makeBehavior("health", { max: 3 }),
    ],
    tags: ["player"],
  });
  const core = makeObject({
    name: "Core",
    layerId: actors.id,
    x: 760,
    y: 330,
    width: 26,
    height: 26,
    color: gold,
    behaviors: [makeBehavior("collectible", { variable: "cores", amount: 1 })],
    tags: ["core"],
  });
  const guard = makeObject({
    name: "Sweeper",
    layerId: actors.id,
    x: 1120,
    y: 540,
    width: 42,
    height: 42,
    color: "#ffb45c",
    bodyType: "dynamic",
    behaviors: [makeBehavior("patrol", { distance: 220, speed: 70 })],
    tags: ["enemy"],
  });
  const goal = makeObject({
    name: "Exit",
    layerId: actors.id,
    x: 1410,
    y: 500,
    width: 54,
    height: 54,
    color: periwinkle,
    tags: ["goal"],
  });
  const hint = makeObject({
    name: "Hint",
    layerId: ui.id,
    x: 800,
    y: 60,
    width: 600,
    height: 30,
    color: "#f1f0ed",
    visual: {
      kind: "text",
      text: "WASD / arrows  move    E  interact",
      style: { font: "inter", size: 18, color: "#aab0c6", align: "center" },
    },
    tags: ["ui"],
  });

  const scene = makeScene({
    name: "Server Room",
    width: 1600,
    height: 1000,
    background: "#111a2b",
    layers: [ground, actors, ui],
    objects: [floor, wallTop, wallBottom, wallLeft, wallRight, player, core, guard, goal, hint],
    rules: [
      {
        id: "rul_exit",
        name: "Reach the exit",
        enabled: true,
        once: true,
        when: [{ kind: "overlap", objectId: player.id, otherTag: "goal" }],
        do: [{ kind: "set-variable", name: "escaped", op: "set", value: true }],
      },
    ],
  });

  return makeDocument({
    name,
    templateOrigin: "topdown",
    settings: makeSettings({
      background: "#111a2b",
      gravity: { x: 0, y: 0 },
      ui: {
        hud: [{ id: "hud_cores", variable: "cores", label: "CORES", corner: "top-left", style: "text", visible: true }],
        accent: periwinkle,
        font: "inter",
        message: { color: "#f1f0ed", background: "rgba(11, 13, 18, 0.72)", fontSize: 20 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    variables: [
      { id: "var_cores", name: "cores", type: "number", initial: 0 },
      { id: "var_escaped", name: "escaped", type: "boolean", initial: false },
    ],
  });
}

function puzzleTemplate(name: string): ProjectDocument {
  const board = makeLayer("Board", 0);
  const actors = makeLayer("Actors", 1);
  const ui = makeLayer("UI", 2);

  const objects = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const isWall = (row === 0 || row === 4 || col === 0 || col === 6) && !(row === 4 && col === 3);
      objects.push(
        makeObject({
          name: isWall ? `Wall ${row}-${col}` : `Tile ${row}-${col}`,
          layerId: board.id,
          x: 170 + col * 110,
          y: 160 + row * 110,
          width: 104,
          height: 104,
          color: isWall ? "#38425f" : "#202d46",
          bodyType: isWall ? "static" : "none",
          tags: isWall ? ["wall"] : ["floor"],
        }),
      );
    }
  }

  const player = makeObject({
    name: "Player",
    layerId: actors.id,
    x: 170,
    y: 160,
    width: 48,
    height: 48,
    color: coral,
    visual: { kind: "rect", width: 48, height: 48, color: coral, stroke: "#ffd0c7" },
    bodyType: "dynamic",
    body: makeBody(48, 48, "dynamic"),
    behaviors: [makeBehavior("top-down-controller", { speed: 230 })],
    tags: ["player"],
  });
  const keyA = makeObject({
    name: "Key A",
    layerId: actors.id,
    x: 500,
    y: 380,
    width: 30,
    height: 30,
    color: gold,
    behaviors: [makeBehavior("collectible", { variable: "keys", amount: 1 })],
    tags: ["key"],
  });
  const keyB = makeObject({
    name: "Key B",
    layerId: actors.id,
    x: 720,
    y: 270,
    width: 30,
    height: 30,
    color: gold,
    behaviors: [makeBehavior("collectible", { variable: "keys", amount: 1 })],
    tags: ["key"],
  });
  const gate = makeObject({
    name: "Exit gate",
    layerId: actors.id,
    x: 610,
    y: 600,
    width: 66,
    height: 46,
    color: periwinkle,
    tags: ["goal"],
  });
  objects.push(player, keyA, keyB, gate);

  const scene = makeScene({
    name: "Lock Chamber",
    width: 1000,
    height: 800,
    background: "#141b2d",
    layers: [board, actors, ui],
    objects,
    rules: [
      {
        id: "rul_keys",
        name: "Collect both keys",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "keys", op: ">=", value: 2 }],
        do: [{ kind: "show-message", text: "The gate is open.", durationMs: 2000 }],
      },
      {
        id: "rul_win",
        name: "Enter the gate",
        enabled: true,
        once: true,
        when: [
          { kind: "variable", name: "keys", op: ">=", value: 2 },
          { kind: "overlap", objectId: player.id, otherTag: "goal" },
        ],
        do: [{ kind: "set-variable", name: "solved", op: "set", value: true }],
      },
    ],
  });

  return makeDocument({
    name,
    templateOrigin: "puzzle",
    settings: makeSettings({
      background: "#141b2d",
      gravity: { x: 0, y: 0 },
      ui: {
        hud: [{ id: "hud_keys", variable: "keys", label: "KEYS", corner: "top-left", style: "text", visible: true }],
        accent: gold,
        font: "inter",
        message: { color: "#f1f0ed", background: "rgba(11, 13, 18, 0.72)", fontSize: 20 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    variables: [
      { id: "var_keys", name: "keys", type: "number", initial: 0 },
      { id: "var_solved", name: "solved", type: "boolean", initial: false },
    ],
  });
}

export function createProjectFromTemplate(template: Exclude<TemplateOrigin, "brief" | "import">, name: string): ProjectDocument {
  switch (template) {
    case "platformer":
      return platformerTemplate(name);
    case "topdown":
      return topDownTemplate(name);
    case "puzzle":
      return puzzleTemplate(name);
    case "blank":
    default:
      return createEmptyProject(name);
  }
}

export type TemplateId = Exclude<TemplateOrigin, "brief" | "import">;

export function templateSummary(template: TemplateId): { label: string; blurb: string; accent: string } {
  switch (template) {
    case "platformer":
      return { label: "Platformer", blurb: "Run, jump, collect, reach a goal.", accent: coral };
    case "topdown":
      return { label: "Top-down", blurb: "Move freely, explore a room.", accent: periwinkle };
    case "puzzle":
      return { label: "Puzzle", blurb: "Keys, gates, and a small grid.", accent: gold };
    case "blank":
    default:
      return { label: "Blank", blurb: "An empty scene and one layer.", accent: "#aab0c6" };
  }
}

export function scenesFor(document: ProjectDocument): Scene[] {
  return document.scenes;
}
