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
  circle,
} from "../factory";
import type { GameObject, Prefab, ProjectDocument } from "../schema";

const width = 1280;
const height = 720;
const background = "#141a2b";
const mint = "#8fe3c0";
const coral = "#ff856f";

function enemyObject(layerId: string, x: number, y: number, name: string): GameObject {
  return makeObject({
    name,
    layerId,
    x,
    y,
    width: 40,
    height: 40,
    color: coral,
    visual: makeShape(40, 40, [
      circle(36, coral, { stroke: "#ffd0c7", strokeWidth: 2 }),
      circle(8, "#512f43", { x: -7, y: -3 }),
      circle(8, "#512f43", { x: 7, y: -3 }),
    ]),
    bodyType: "dynamic",
    body: makeBody(34, 34, "dynamic"),
    behaviors: [
      makeBehavior("follow", { targetTag: "player", speed: 82, stopDistance: 24 }),
      makeBehavior("health", { max: 2, scoreVariable: "score", scoreOnDeath: 10 }),
    ],
    tags: ["enemy"],
  });
}

export function arenaSurvivalTemplate(name: string): ProjectDocument {
  const sky = makeLayer("Arena", 0);
  const play = makeLayer("Combat", 1);
  const ui = makeLayer("HUD", 2, { parallax: { x: 0, y: 0 } });
  const floor = makeObject({
    name: "Arena floor",
    layerId: sky.id,
    x: width / 2,
    y: height / 2,
    width,
    height,
    color: background,
    visual: makeShape(width, height, [
      rectShape(width, height, background),
      circle(500, "#1c2940", { stroke: "#2b4662", strokeWidth: 3 }),
      circle(320, "#1c2940", { stroke: "#2b4662", strokeWidth: 2 }),
    ]),
    tags: ["background"],
  });
  const arenaEdge = makeObject({
    name: "Arena boundary",
    layerId: sky.id,
    x: width / 2,
    y: height / 2,
    width: width - 48,
    height: height - 48,
    color: "#283953",
    visual: makeShape(width - 48, height - 48, [
      rectShape(width - 48, 12, "#283953", { y: -(height - 48) / 2 + 6 }),
      rectShape(width - 48, 12, "#283953", { y: (height - 48) / 2 - 6 }),
      rectShape(12, height - 48, "#283953", { x: -(width - 48) / 2 + 6 }),
      rectShape(12, height - 48, "#283953", { x: (width - 48) / 2 - 6 }),
    ]),
    tags: ["arena-boundary", "wall"],
  });
  const player = makeObject({
    name: "Sentinel",
    layerId: play.id,
    x: width / 2,
    y: height / 2,
    width: 38,
    height: 44,
    color: mint,
    visual: makeShape(38, 44, [
      rectShape(30, 36, mint, { stroke: "#e1fff2", strokeWidth: 2 }),
      circle(9, "#274a43", { x: -5, y: -4 }),
      circle(9, "#274a43", { x: 5, y: -4 }),
    ]),
    bodyType: "dynamic",
    body: makeBody(30, 38, "dynamic", { collideWorldBounds: true }),
    behaviors: [
      makeBehavior("top-down-controller", { speed: 260 }),
      makeBehavior("melee", { trigger: "action", cooldownMs: 420, range: 72, damage: 1, targetTags: "enemy" }),
      makeBehavior("health", {
        max: 3,
        variable: "health",
        invulnMs: 650,
        contactDamage: 1,
        damageTags: "enemy",
        deathVariable: "lives",
        deathAmount: -1,
        respawnOnHit: true,
      }),
    ],
    tags: ["player"],
  });
  const enemyPrefabRoot = enemyObject(play.id, 0, 0, "Chaser");
  enemyPrefabRoot.id = "pfb_arena_enemy_root";
  const enemyPrefab: Prefab = { id: "pfb_arena_enemy", name: "Chaser", root: enemyPrefabRoot, objects: [], params: {} };
  const firstEnemy = enemyObject(play.id, 180, 130, "First chaser");
  firstEnemy.prefabId = enemyPrefab.id;
  firstEnemy.prefabInstanceId = newId("pinst");
  firstEnemy.prefabSlot = "root";
  const director = makeObject({
    name: "Wave director",
    layerId: play.id,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    color: background,
    behaviors: [
      makeBehavior("spawner", {
        prefabId: enemyPrefab.id,
        startDelayMs: 1500,
        intervalMs: 3200,
        minX: 90,
        maxX: width - 90,
        minY: 90,
        maxY: height - 90,
        limit: 8,
      }),
      makeBehavior("countdown", { durationMs: 60000, variable: "timeLeft" }),
    ],
    tags: ["director"],
  });
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 28,
    y: 28,
    width: 280,
    height: 22,
    color: "#f1f0ed",
    visual: { kind: "text", text: "ARENA SURVIVAL", style: { font: "inter", size: 18, color: "#f1f0ed", align: "left" } },
    tags: ["ui"],
  });
  const controls = makeObject({
    name: "Controls",
    layerId: ui.id,
    x: width / 2,
    y: 28,
    width: 540,
    height: 22,
    color: "#aab0c6",
    visual: { kind: "text", text: "WASD move       Click / E attack       Survive for 60 seconds", style: { font: "inter", size: 15, color: "#aab0c6", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Last Stand",
    width,
    height,
    background,
    layers: [sky, play, ui],
    objects: [floor, arenaEdge, firstEnemy, player, director, title, controls],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Survive the timer",
        enabled: true,
        once: true,
        when: [
          { kind: "variable", name: "timeLeft", op: "<=", value: 0 },
          { kind: "variable", name: "lives", op: ">", value: 0 },
        ],
        do: [{ kind: "set-variable", name: "won", op: "set", value: true }],
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
    templateOrigin: "arena-survival",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 0 },
      ui: {
        hud: [
          { id: "hud_score", variable: "score", label: "SCORE", corner: "top-left", style: "text", visible: true },
          { id: "hud_health", variable: "health", label: "HULL", corner: "top-right", style: "text", visible: true },
          { id: "hud_time", variable: "timeLeft", label: "TIME", corner: "bottom-right", style: "text", visible: true },
        ],
        accent: mint,
        font: "inter",
        message: { color: "#f1f0ed", background: "rgba(20, 26, 43, 0.88)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    prefabs: [enemyPrefab],
    variables: [
      { id: "var_score", name: "score", type: "number", initial: 0 },
      { id: "var_health", name: "health", type: "number", initial: 3 },
      { id: "var_lives", name: "lives", type: "number", initial: 3 },
      { id: "var_time", name: "timeLeft", type: "number", initial: 60 },
      { id: "var_won", name: "won", type: "boolean", initial: false },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
