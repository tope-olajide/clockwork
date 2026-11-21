import {
  circle,
  makeBehavior,
  makeBody,
  makeDocument,
  makeLayer,
  makeObject,
  makeScene,
  makeSettings,
  makePrimitive,
  makeShape,
  newId,
  polygonShape,
  rectShape,
  triangleShape,
} from "../factory";
import type { GameObject, Prefab, ProjectDocument } from "../schema";

const width = 1280;
const height = 720;
const cyan = "#79e6ff";
const coral = "#ff7d9c";
const gold = "#ffd479";
const hull = "#9ee7ff";
const space = "#070b1a";

const bulletPrefab: Prefab = {
  id: "pfb_shooter_bullet",
  name: "Player bullet",
  root: {
    id: "pfb_shooter_bullet_root",
    name: "Player bullet",
    layerId: "",
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    visual: makeShape(8, 22, [rectShape(6, 20, cyan, { stroke: "#e8fbff", strokeWidth: 1 })]),
    behaviors: [
      makeBehavior("projectile", { targetTags: "enemy,asteroid", damage: 1, lifetimeMs: 1300 }),
    ],
    properties: {},
    tags: ["bullet", "player-bullet"],
  },
  objects: [],
  params: {},
};

const enemyBulletPrefab: Prefab = {
  id: "pfb_enemy_bullet",
  name: "Enemy bullet",
  root: {
    id: "pfb_enemy_bullet_root",
    name: "Enemy bullet",
    layerId: "",
    transform: { x: 0, y: 0, rotation: 180, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    visual: makeShape(9, 18, [triangleShape(9, 16, coral)]),
    behaviors: [
      makeBehavior("projectile", { targetTags: "player", damage: 1, lifetimeMs: 2200 }),
    ],
    properties: {},
    tags: ["enemy-bullet"],
  },
  objects: [],
  params: {},
};

const explosionPrefab: Prefab = {
  id: "pfb_shooter_explosion",
  name: "Explosion spark",
  root: {
    id: "pfb_shooter_explosion_root",
    name: "Explosion spark",
    layerId: "",
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    visual: makeShape(12, 12, [
      circle(9, gold, { stroke: "#fff4d1", strokeWidth: 2 }),
      rectShape(2, 12, "#fff4d1", { rotation: 45 }),
    ]),
    behaviors: [
      makeBehavior("mover", { vy: 145, spin: 220, lifetimeMs: 420, destroyOffscreen: true }),
    ],
    properties: {},
    tags: ["fx"],
  },
  objects: [],
  params: {},
};

const enemyPrefab: Prefab = {
  id: "pfb_shooter_enemy",
  name: "Raider",
  root: {
    id: "pfb_shooter_enemy_root",
    name: "Raider",
    layerId: "",
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    visual: makeShape(44, 36, [
      polygonShape(43, 33, coral, [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0.35, y: 1 },
        { x: -0.35, y: 1 },
        { x: -1, y: 0 },
      ]),
      circle(12, "#3c1630", { y: 1, stroke: "#ffb3c6", strokeWidth: 2 }),
    ]),
    behaviors: [
      makeBehavior("mover", { vy: 105, destroyOffscreen: true }),
      makeBehavior("health", {
        max: 2,
        scoreVariable: "score",
        scoreOnDeath: 100,
        deathPrefabId: explosionPrefab.id,
        deathSpawnCount: 3,
        spawnSpread: 20,
      }),
      makeBehavior("shooter", {
        prefabId: enemyBulletPrefab.id,
        trigger: "auto",
        chance: 0.35,
        cooldownMs: 1500,
        speed: 270,
        direction: "down",
        offsetY: 22,
        maxAlive: 6,
      }),
    ],
    properties: {},
    tags: ["enemy"],
  },
  objects: [],
  params: {},
};

const asteroidPrefab: Prefab = {
  id: "pfb_shooter_asteroid",
  name: "Asteroid",
  root: {
    id: "pfb_shooter_asteroid_root",
    name: "Asteroid",
    layerId: "",
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    visual: makeShape(58, 52, [
      polygonShape(
        58,
        52,
        "#6d7f9c",
        [
          { x: -0.2, y: -1 },
          { x: 0.55, y: -0.7 },
          { x: 1, y: 0.1 },
          { x: 0.45, y: 0.9 },
          { x: -0.4, y: 1 },
          { x: -1, y: 0.2 },
          { x: -0.75, y: -0.6 },
        ],
        { stroke: "#a9b4cc", strokeWidth: 2 },
      ),
      circle(14, "#4b5a73", { x: -8, y: -6 }),
      circle(9, "#4b5a73", { x: 13, y: 8 }),
    ]),
    behaviors: [
      makeBehavior("mover", { vy: 125, spin: 55, destroyOffscreen: true }),
      makeBehavior("health", {
        max: 2,
        scoreVariable: "score",
        scoreOnDeath: 50,
        deathPrefabId: explosionPrefab.id,
        deathSpawnCount: 2,
        spawnSpread: 26,
      }),
    ],
    properties: {},
    tags: ["asteroid"],
  },
  objects: [],
  params: {},
};

function star(index: number, layerId: string): GameObject {
  const size = 2 + (index % 3);
  return makeObject({
    name: `Star ${index + 1}`,
    layerId,
    x: 40 + ((index * 197) % (width - 80)),
    y: 30 + ((index * 113) % (height - 60)),
    width: size,
    height: size,
    color: index % 5 === 0 ? cyan : "#c8d4ff",
    visual: makeShape(size, size, [circle(size, index % 5 === 0 ? cyan : "#c8d4ff")]),
    tags: ["star"],
  });
}

function playerShip(layerId: string): GameObject {
  return makeObject({
    name: "Player ship",
    layerId,
    x: width / 2,
    y: height - 88,
    width: 60,
    height: 58,
    color: hull,
    visual: makeShape(60, 58, [
      rectShape(11, 18, gold, { x: 0, y: 24 }),
      polygonShape(30, 18, "#3f7f9e", [
        { x: -1, y: 0.45 },
        { x: -0.15, y: -0.6 },
        { x: 0.15, y: -0.6 },
        { x: 1, y: 0.45 },
      ], { y: 13 }),
      triangleShape(44, 40, hull, { y: -1, stroke: "#d9f8ff", strokeWidth: 2 }),
      rectShape(8, 14, "#2b6078", { y: 12 }),
      circle(13, "#123246", { y: -6, stroke: cyan, strokeWidth: 2 }),
    ]),
    bodyType: "dynamic",
    body: makeBody(38, 40, "dynamic", { collideWorldBounds: true }),
    behaviors: [
      makeBehavior("top-down-controller", { speed: 400, lockAxis: "y" }),
      makeBehavior("shooter", {
        prefabId: bulletPrefab.id,
        trigger: "jump",
        cooldownMs: 190,
        speed: 780,
        direction: "up",
        offsetY: -36,
        maxAlive: 5,
      }),
      makeBehavior("health", {
        max: 3,
        variable: "health",
        invulnMs: 1000,
        damageTags: "enemy,asteroid,enemy-bullet",
        contactDamage: 1,
      }),
    ],
    tags: ["player"],
  });
}

export function spaceShooterTemplate(name: string): ProjectDocument {
  const bg = makeLayer("Starfield", 0, { parallax: { x: 0.1, y: 0.1 } });
  const actors = makeLayer("Actors", 1);
  const fx = makeLayer("FX", 2);
  const ui = makeLayer("UI", 3, { parallax: { x: 0, y: 0 } });

  bulletPrefab.root.layerId = actors.id;
  enemyBulletPrefab.root.layerId = actors.id;
  explosionPrefab.root.layerId = fx.id;
  enemyPrefab.root.layerId = actors.id;
  asteroidPrefab.root.layerId = actors.id;

  const backdrop = makeObject({
    name: "Deep space",
    layerId: bg.id,
    x: width / 2,
    y: height / 2,
    width,
    height,
    color: space,
    visual: makeShape(width, height, [rectShape(width, height, space)]),
    tags: ["background"],
  });
  const band = makeObject({
    name: "Nebula band",
    layerId: bg.id,
    x: width / 2,
    y: 310,
    width: 920,
    height: 180,
    color: "#0d1730",
    visual: makeShape(920, 180, [
      polygonShape(920, 180, "#0d1730", [
        { x: -1, y: 0.1 },
        { x: -0.4, y: -0.8 },
        { x: 0.35, y: -0.55 },
        { x: 1, y: 0.25 },
        { x: 0.4, y: 0.9 },
        { x: -0.45, y: 0.7 },
      ]),
      circle(70, "#142448", { x: -260, y: -10 }),
    ]),
    tags: ["background"],
  });
  const player = playerShip(actors.id);

  const director = makeObject({
    name: "Wave director",
    layerId: ui.id,
    x: 1,
    y: 1,
    width: 1,
    height: 1,
    color: space,
    visual: makeShape(1, 1, [rectShape(1, 1, space)]),
    behaviors: [
      makeBehavior("countdown", { durationMs: 60000, variable: "timeLeft" }),
      makeBehavior("spawner", {
        prefabId: asteroidPrefab.id,
        intervalMs: 1750,
        startDelayMs: 900,
        minX: 90,
        maxX: width - 90,
        minY: -50,
        maxY: -50,
        limit: 7,
      }),
      makeBehavior("spawner", {
        prefabId: enemyPrefab.id,
        intervalMs: 2900,
        startDelayMs: 2400,
        minX: 150,
        maxX: width - 150,
        minY: -45,
        maxY: -45,
        limit: 4,
      }),
    ],
    tags: ["director"],
  });

  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 26,
    y: 28,
    width: 360,
    height: 24,
    color: "#dff8ff",
    visual: {
      kind: "text",
      text: "ORBITAL WATCH",
      style: { font: "inter", size: 18, color: "#dff8ff", align: "left" },
    },
    tags: ["ui"],
  });
  const hint = makeObject({
    name: "Controls hint",
    layerId: ui.id,
    x: width / 2,
    y: 30,
    width: 500,
    height: 20,
    color: "#8fa4c8",
    visual: {
      kind: "text",
      text: "A / D  move       Space  fire       R  restart",
      style: { font: "inter", size: 15, color: "#8fa4c8", align: "center" },
    },
    tags: ["ui"],
  });
  const line = makeObject({
    name: "Defence line",
    layerId: fx.id,
    x: width / 2,
    y: height - 24,
    width: width - 120,
    height: 2,
    color: "#1d3a55",
    visual: makeShape(width - 120, 2, [
      makePrimitive({
        kind: "line",
        width: width - 120,
        height: 2,
        color: "#1d3a55",
        stroke: "#1d3a55",
        strokeWidth: 2,
      }),
    ]),
    tags: ["fx"],
  });

  const scene = makeScene({
    name: "Orbital Watch",
    width,
    height,
    background: space,
    layers: [bg, actors, fx, ui],
    objects: [
      backdrop,
      band,
      ...Array.from({ length: 46 }, (_, index) => star(index, bg.id)),
      player,
      director,
      title,
      hint,
      line,
    ],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Survive the watch",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "timeLeft", op: "<=", value: 0 }],
        do: [{ kind: "set-variable", name: "won", op: "set", value: true }],
      },
      {
        id: newId("rul"),
        name: "Ship destroyed",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "health", op: "<=", value: 0 }],
        do: [{ kind: "set-variable", name: "lost", op: "set", value: true }],
      },
    ],
  });

  return makeDocument({
    name,
    templateOrigin: "space-shooter",
    settings: makeSettings({
      width,
      height,
      background: space,
      gravity: { x: 0, y: 0 },
      pixelArt: false,
      ui: {
        hud: [
          { id: "hud_score", variable: "score", label: "SCORE", corner: "top-left", style: "text", visible: true },
          { id: "hud_health", variable: "health", label: "HULL", corner: "top-right", style: "bar", visible: true, max: 3 },
          { id: "hud_time", variable: "timeLeft", label: "TIME", corner: "bottom-right", style: "text", visible: true },
        ],
        accent: cyan,
        font: "inter",
        message: { color: "#dff8ff", background: "rgba(7, 11, 26, 0.82)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    prefabs: [bulletPrefab, enemyBulletPrefab, enemyPrefab, asteroidPrefab, explosionPrefab],
    variables: [
      { id: "var_score", name: "score", type: "number", initial: 0, description: "Points from destroyed enemies and asteroids." },
      { id: "var_health", name: "health", type: "number", initial: 3, description: "Player hull integrity." },
      { id: "var_time", name: "timeLeft", type: "number", initial: 60, description: "Seconds until the watch ends." },
      { id: "var_won", name: "won", type: "boolean", initial: false },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
