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
const hazardPrefabId = "pfb_falling_hazard";
const bonusPrefabId = "pfb_falling_bonus";
const background = "#111a2b";
const coral = "#ff856f";
const mint = "#8fe3c0";
const gold = "#f4c56a";

function hazardObject(layerId: string, x: number, y: number, name: string): GameObject {
  return makeObject({
    name,
    layerId,
    x,
    y,
    width: 34,
    height: 34,
    color: coral,
    visual: makeShape(34, 34, [
      circle(30, coral, { stroke: "#ffd0c7", strokeWidth: 2 }),
      rectShape(7, 7, "#7b4351"),
    ]),
    behaviors: [makeBehavior("mover", { vy: 250, lifetimeMs: 3600 })],
    tags: ["falling-hazard", "hazard"],
  });
}

function bonusObject(layerId: string, x: number, y: number, name: string): GameObject {
  return makeObject({
    name,
    layerId,
    x,
    y,
    width: 24,
    height: 24,
    color: gold,
    visual: makeShape(24, 24, [circle(22, gold, { stroke: "#fff1bd", strokeWidth: 2 }), circle(7, "#fff1bd")]),
    behaviors: [
      makeBehavior("collectible", { variable: "score", amount: 10 }),
      makeBehavior("mover", { vy: 190, lifetimeMs: 4200 }),
    ],
    tags: ["bonus", "collectible"],
  });
}

export function fallingObjectsTemplate(name: string): ProjectDocument {
  const sky = makeLayer("Sky", 0, { parallax: { x: 0.1, y: 0.1 } });
  const play = makeLayer("Catch lane", 1);
  const ui = makeLayer("HUD", 2, { parallax: { x: 0, y: 0 } });
  const backdrop = makeObject({
    name: "Deep sky",
    layerId: sky.id,
    x: width / 2,
    y: height / 2,
    width,
    height,
    color: background,
    visual: makeShape(width, height, [
      rectShape(width, height, background),
      circle(520, "#18263c", { x: -440, y: -280 }),
      circle(680, "#17243a", { x: 420, y: -250 }),
    ]),
    tags: ["background"],
  });
  const lane = makeObject({
    name: "Catch lane",
    layerId: play.id,
    x: width / 2,
    y: 682,
    width,
    height: 76,
    color: "#283753",
    visual: makeShape(width, 76, [
      rectShape(width, 76, "#283753"),
      rectShape(width, 5, mint, { y: -34 }),
      ...Array.from({ length: 10 }, (_, index) => rectShape(50, 5, "#4b5c78", { x: -555 + index * 123, y: 10 })),
    ]),
    tags: ["lane"],
  });
  const player = makeObject({
    name: "Catcher",
    layerId: play.id,
    x: width / 2,
    y: 624,
    width: 58,
    height: 36,
    color: mint,
    visual: makeShape(58, 36, [
      rectShape(58, 12, mint, { y: 12, stroke: "#d7fff0", strokeWidth: 2 }),
      rectShape(38, 19, "#4b8c76", { y: -3 }),
      circle(7, "#1c3934", { x: -10, y: -4 }),
      circle(7, "#1c3934", { x: 10, y: -4 }),
    ]),
    bodyType: "dynamic",
    body: makeBody(52, 32, "dynamic", { gravityScale: 0, collideWorldBounds: true }),
    behaviors: [
      makeBehavior("top-down-controller", { speed: 400, lockAxis: "y" }),
      makeBehavior("health", {
        max: 1,
        variable: "health",
        invulnMs: 850,
        damageTags: "falling-hazard",
        deathVariable: "lives",
        deathAmount: -1,
        respawnOnHit: true,
      }),
    ],
    tags: ["player"],
  });
  const hazardRoot = hazardObject(play.id, 0, 0, "Meteor");
  hazardRoot.id = "pfb_falling_hazard_root";
  const hazardPrefab: Prefab = { id: hazardPrefabId, name: "Meteor", root: hazardRoot, objects: [], params: {} };
  const bonusRoot = bonusObject(play.id, 0, 0, "Bonus star");
  bonusRoot.id = "pfb_falling_bonus_root";
  const bonusPrefab: Prefab = { id: bonusPrefabId, name: "Bonus star", root: bonusRoot, objects: [], params: {} };
  const firstHazard = hazardObject(play.id, 360, 140, "First meteor");
  firstHazard.prefabId = hazardPrefabId;
  firstHazard.prefabInstanceId = newId("pinst");
  firstHazard.prefabSlot = "root";
  const firstBonus = bonusObject(play.id, 900, 260, "First bonus star");
  firstBonus.prefabId = bonusPrefabId;
  firstBonus.prefabInstanceId = newId("pinst");
  firstBonus.prefabSlot = "root";
  const director = makeObject({
    name: "Sky director",
    layerId: play.id,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    color: background,
    behaviors: [
      makeBehavior("spawner", {
        prefabId: hazardPrefabId,
        startDelayMs: 700,
        intervalMs: 760,
        minX: 44,
        maxX: width - 44,
        minY: -24,
        maxY: -24,
        limit: 14,
      }),
      makeBehavior("spawner", {
        prefabId: bonusPrefabId,
        startDelayMs: 1500,
        intervalMs: 2350,
        minX: 50,
        maxX: width - 50,
        minY: -24,
        maxY: -24,
        limit: 5,
      }),
      makeBehavior("countdown", { durationMs: 60000, variable: "timeLeft" }),
    ],
    tags: ["director", "spawner"],
  });
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 28,
    y: 28,
    width: 280,
    height: 22,
    color: "#f1f0ed",
    visual: { kind: "text", text: "FALLING OBJECTS", style: { font: "inter", size: 18, color: "#f1f0ed", align: "left" } },
    tags: ["ui"],
  });
  const controls = makeObject({
    name: "Controls",
    layerId: ui.id,
    x: width / 2,
    y: 28,
    width: 520,
    height: 22,
    color: "#aab0c6",
    visual: { kind: "text", text: "A / D move       Avoid meteors       Catch stars for bonus points", style: { font: "inter", size: 15, color: "#aab0c6", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Meteor Watch",
    width,
    height,
    background,
    layers: [sky, play, ui],
    objects: [backdrop, lane, firstHazard, firstBonus, player, director, title, controls],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Survive the storm",
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
    templateOrigin: "falling-objects",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 0 },
      ui: {
        hud: [
          { id: "hud_score", variable: "score", label: "SCORE", corner: "top-left", style: "text", visible: true },
          { id: "hud_lives", variable: "lives", label: "LIVES", corner: "top-right", style: "text", visible: true },
          { id: "hud_time", variable: "timeLeft", label: "TIME", corner: "bottom-right", style: "text", visible: true },
        ],
        accent: mint,
        font: "inter",
        message: { color: "#f1f0ed", background: "rgba(17, 26, 43, 0.88)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    prefabs: [hazardPrefab, bonusPrefab],
    variables: [
      { id: "var_score", name: "score", type: "number", initial: 0 },
      { id: "var_lives", name: "lives", type: "number", initial: 3 },
      { id: "var_health", name: "health", type: "number", initial: 1 },
      { id: "var_time", name: "timeLeft", type: "number", initial: 60 },
      { id: "var_won", name: "won", type: "boolean", initial: false },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
