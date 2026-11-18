import {
  circle,
  makeBehavior,
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
import type { GameObject, Prefab, ProjectDocument } from "../schema";

const width = 1280;
const height = 720;
const background = "#090b18";
const cyan = "#78e8ff";
const gold = "#ffd47c";
const smallAsteroidId = "pfb_asteroid_shard";
const explosionId = "pfb_asteroid_spark";

const shardPrefab: Prefab = {
  id: smallAsteroidId,
  name: "Asteroid shard",
  root: {
    id: "pfb_asteroid_shard_root",
    name: "Asteroid shard",
    layerId: "",
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    visual: makeShape(30, 28, [
      polygonShape(30, 28, "#8790a3", [
        { x: -0.2, y: -1 },
        { x: 0.8, y: -0.45 },
        { x: 1, y: 0.35 },
        { x: 0.15, y: 1 },
        { x: -0.85, y: 0.55 },
        { x: -1, y: -0.3 },
      ], { stroke: "#c5c9d4", strokeWidth: 2 }),
    ]),
    behaviors: [
      makeBehavior("mover", { vx: 24, vy: -18, spin: 110, wrap: true, destroyOffscreen: false }),
      makeBehavior("health", {
        max: 1,
        scoreVariable: "score",
        scoreOnDeath: 100,
        deathVariable: "asteroids",
        deathAmount: -1,
        deathPrefabId: explosionId,
        deathSpawnCount: 2,
        spawnSpread: 14,
      }),
    ],
    properties: {},
    tags: ["asteroid", "shard"],
  },
  objects: [],
  params: {},
};

const sparkPrefab: Prefab = {
  id: explosionId,
  name: "Asteroid spark",
  root: {
    id: "pfb_asteroid_spark_root",
    name: "Asteroid spark",
    layerId: "",
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    visual: makeShape(10, 10, [circle(8, gold, { stroke: "#fff1bd", strokeWidth: 2 })]),
    behaviors: [makeBehavior("mover", { vx: 0, vy: 90, spin: 140, lifetimeMs: 380, destroyOffscreen: true })],
    properties: {},
    tags: ["fx"],
  },
  objects: [],
  params: {},
};

function asteroidShape(index: number, size: number) {
  const points = [
    { x: -0.2, y: -1 },
    { x: 0.52, y: -0.78 },
    { x: 1, y: -0.1 },
    { x: 0.65, y: 0.75 },
    { x: -0.22, y: 1 },
    { x: -0.92, y: 0.5 },
    { x: -1, y: -0.38 },
  ].map((point, pointIndex) => ({
    x: point.x * (0.86 + ((index + pointIndex) % 4) * 0.06),
    y: point.y * (0.86 + ((index * 2 + pointIndex) % 4) * 0.06),
  }));
  return makeShape(size, size, [
    polygonShape(size, size, "#69738b", points, { stroke: "#abb5c8", strokeWidth: 3 }),
    circle(size * 0.22, "#424b61", { x: -size * 0.12, y: -size * 0.09 }),
    circle(size * 0.14, "#424b61", { x: size * 0.2, y: size * 0.16 }),
  ]);
}

function bigAsteroid(layerId: string, index: number, x: number, y: number): GameObject {
  return makeObject({
    name: `Rock ${index + 1}`,
    layerId,
    x,
    y,
    width: 62,
    height: 62,
    color: "#69738b",
    visual: asteroidShape(index, 62),
    behaviors: [
      makeBehavior("mover", {
        vx: ((index % 3) - 1) * 36,
        vy: ((index % 2) === 0 ? 1 : -1) * (22 + (index % 3) * 8),
        spin: index % 2 === 0 ? 27 : -35,
        wrap: true,
        destroyOffscreen: false,
      }),
      makeBehavior("health", {
        max: 1,
        scoreVariable: "score",
        scoreOnDeath: 50,
        deathVariable: "asteroids",
        deathAmount: -1,
        deathPrefabId: smallAsteroidId,
        deathSpawnCount: 2,
        spawnSpread: 44,
      }),
    ],
    tags: ["asteroid", "large-asteroid"],
  });
}

function playerShip(layerId: string): GameObject {
  return makeObject({
    name: "Pilot",
    layerId,
    x: width / 2,
    y: height / 2,
    width: 48,
    height: 48,
    color: cyan,
    visual: makeShape(48, 48, [
      triangleShape(34, 40, cyan, { y: -2, stroke: "#e2fbff", strokeWidth: 2 }),
      rectShape(10, 18, gold, { y: 20 }),
      circle(12, "#1c4760", { y: -4, stroke: "#b9f4ff", strokeWidth: 2 }),
    ]),
    behaviors: [
      makeBehavior("rotate-thrust", { turnSpeed: 220, thrust: 390, drag: 0.24, maxSpeed: 380, wrap: true }),
      makeBehavior("shooter", {
        prefabId: "pfb_asteroid_bullet",
        trigger: "action",
        cooldownMs: 240,
        speed: 700,
        direction: "aim",
        offsetY: -30,
        maxAlive: 5,
      }),
      makeBehavior("health", {
        max: 1,
        variable: "hull",
        invulnMs: 1250,
        damageTags: "asteroid",
        deathVariable: "lives",
        deathAmount: -1,
        respawnOnHit: true,
      }),
    ],
    tags: ["player"],
  });
}

export function asteroidFieldTemplate(name: string): ProjectDocument {
  const far = makeLayer("Far field", 0, { parallax: { x: 0.2, y: 0.2 } });
  const actors = makeLayer("Asteroids and ship", 1);
  const effects = makeLayer("Effects", 2);
  const ui = makeLayer("UI", 3, { parallax: { x: 0, y: 0 } });

  shardPrefab.root.layerId = actors.id;
  sparkPrefab.root.layerId = effects.id;
  const bulletPrefab: Prefab = {
    id: "pfb_asteroid_bullet",
    name: "Pulse bolt",
    root: {
      id: "pfb_asteroid_bullet_root",
      name: "Pulse bolt",
      layerId: actors.id,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      visual: makeShape(8, 18, [rectShape(5, 16, "#efffff", { stroke: cyan, strokeWidth: 2 })]),
      behaviors: [makeBehavior("projectile", { targetTags: "asteroid", damage: 1, lifetimeMs: 950 })],
      properties: {},
      tags: ["player-bullet"],
    },
    objects: [],
    params: {},
  };

  const backdrop = makeObject({
    name: "Void",
    layerId: far.id,
    x: width / 2,
    y: height / 2,
    width,
    height,
    color: background,
    visual: makeShape(width, height, [rectShape(width, height, background)]),
    tags: ["background"],
  });
  const stars = Array.from({ length: 58 }, (_, index) => {
    const size = 2 + (index % 3);
    const color = index % 6 === 0 ? cyan : "#a8b2ca";
    return makeObject({
      name: `Star ${index + 1}`,
      layerId: far.id,
      x: 20 + ((index * 191) % (width - 40)),
      y: 18 + ((index * 127) % (height - 36)),
      width: size,
      height: size,
      color,
      visual: makeShape(size, size, [circle(size, color)]),
      tags: ["star"],
    });
  });
  const asteroids = [
    [170, 150], [430, 250], [710, 120], [1030, 205], [320, 550], [900, 520],
  ].map(([x, y], index) => bigAsteroid(actors.id, index, x!, y!));
  const player = playerShip(actors.id);
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 26,
    y: 26,
    width: 300,
    height: 24,
    color: "#e4fbff",
    visual: { kind: "text", text: "ASTEROID FIELD", style: { font: "inter", size: 18, color: "#e4fbff", align: "left" } },
    tags: ["ui"],
  });
  const hint = makeObject({
    name: "Controls",
    layerId: ui.id,
    x: width / 2,
    y: 28,
    width: 560,
    height: 20,
    color: "#aab9d1",
    visual: { kind: "text", text: "A / D turn       W thrust       E / click fire       R restart", style: { font: "inter", size: 15, color: "#aab9d1", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Asteroid Field",
    width,
    height,
    background,
    layers: [far, actors, effects, ui],
    objects: [backdrop, ...stars, ...asteroids, player, title, hint],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Field cleared",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "asteroids", op: "<=", value: 0 }],
        do: [{ kind: "set-variable", name: "won", op: "set", value: true }],
      },
      {
        id: newId("rul"),
        name: "Pilot lost",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "lives", op: "<=", value: 0 }],
        do: [{ kind: "set-variable", name: "lost", op: "set", value: true }],
      },
    ],
  });

  return makeDocument({
    name,
    templateOrigin: "asteroid-field",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 0 },
      ui: {
        hud: [
          { id: "hud_score", variable: "score", label: "SCORE", corner: "top-left", style: "text", visible: true },
          { id: "hud_lives", variable: "lives", label: "SHIPS", corner: "top-right", style: "text", visible: true },
          { id: "hud_rocks", variable: "asteroids", label: "ROCKS", corner: "bottom-right", style: "text", visible: true },
        ],
        accent: cyan,
        font: "inter",
        message: { color: "#e4fbff", background: "rgba(9, 11, 24, 0.84)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    prefabs: [bulletPrefab, shardPrefab, sparkPrefab],
    variables: [
      { id: "var_score", name: "score", type: "number", initial: 0 },
      { id: "var_lives", name: "lives", type: "number", initial: 3 },
      { id: "var_hull", name: "hull", type: "number", initial: 1 },
      { id: "var_asteroids", name: "asteroids", type: "number", initial: 6 },
      { id: "var_won", name: "won", type: "boolean", initial: false },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
