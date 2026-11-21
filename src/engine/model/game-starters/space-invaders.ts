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
import type { GameObject, Prefab, ProjectDocument } from "../schema";

const width = 1280;
const height = 720;
const background = "#080d19";
const mint = "#75f0c1";
const gold = "#ffd479";
const pink = "#ff7599";

const enemyBullet: Prefab = {
  id: "pfb_invader_bullet",
  name: "Invader bolt",
  root: {
    id: "pfb_invader_bullet_root",
    name: "Invader bolt",
    layerId: "",
    transform: { x: 0, y: 0, rotation: 180, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    visual: makeShape(9, 18, [triangleShape(8, 16, pink)]),
    behaviors: [makeBehavior("projectile", { targetTags: "player,barrier", damage: 1, lifetimeMs: 1800 })],
    properties: {},
    tags: ["enemy-bullet"],
  },
  objects: [],
  params: {},
};

function invader(layerId: string, x: number, y: number, row: number): GameObject {
  const color = row < 2 ? mint : gold;
  return makeObject({
    name: `Invader ${row + 1}`,
    layerId,
    x,
    y,
    width: 42,
    height: 34,
    color,
    visual: makeShape(42, 34, [
      rectShape(26, 22, color, { y: -2 }),
      circle(10, "#152b35", { y: -2 }),
      rectShape(10, 7, color, { x: -13, y: 12 }),
      rectShape(10, 7, color, { x: 13, y: 12 }),
    ]),
    behaviors: [
      makeBehavior("health", {
        max: 1,
        scoreVariable: "score",
        scoreOnDeath: 50,
        deathVariable: "enemies",
        deathAmount: -1,
      }),
      makeBehavior("shooter", {
        prefabId: enemyBullet.id,
        trigger: "auto",
        chance: 0.003,
        cooldownMs: 1100,
        speed: 300,
        direction: "down",
        offsetY: 22,
        maxAlive: 5,
      }),
    ],
    tags: ["enemy", "invader"],
  });
}

function playerShip(layerId: string): GameObject {
  return makeObject({
    name: "Defender",
    layerId,
    x: width / 2,
    y: height - 58,
    width: 48,
    height: 38,
    color: "#8adfff",
    visual: makeShape(48, 38, [
      triangleShape(34, 30, "#8adfff", { y: -2, stroke: "#dff9ff", strokeWidth: 2 }),
      rectShape(24, 8, "#286b8b", { y: 13 }),
      circle(9, gold, { y: 2 }),
    ]),
    bodyType: "dynamic",
    body: makeBody(40, 30, "dynamic", { collideWorldBounds: true, gravityScale: 0 }),
    behaviors: [
      makeBehavior("top-down-controller", { speed: 390, lockAxis: "y" }),
      makeBehavior("shooter", {
        prefabId: "pfb_invader_player_bullet",
        trigger: "jump",
        cooldownMs: 260,
        speed: 660,
        direction: "up",
        offsetY: -24,
        maxAlive: 4,
      }),
      makeBehavior("health", {
        max: 1,
        variable: "hull",
        invulnMs: 1100,
        damageTags: "enemy,enemy-bullet",
        deathVariable: "lives",
        deathAmount: -1,
        respawnOnHit: true,
      }),
    ],
    tags: ["player"],
  });
}

export function spaceInvadersTemplate(name: string): ProjectDocument {
  const sky = makeLayer("Starfield", 0, { parallax: { x: 0.15, y: 0.15 } });
  const actors = makeLayer("Formation", 1);
  const defense = makeLayer("Defense", 2);
  const ui = makeLayer("UI", 3, { parallax: { x: 0, y: 0 } });
  enemyBullet.root.layerId = actors.id;

  const stars = Array.from({ length: 42 }, (_, index) => {
    const size = 2 + (index % 2);
    return makeObject({
      name: `Star ${index + 1}`,
      layerId: sky.id,
      x: 24 + ((index * 173) % (width - 48)),
      y: 20 + ((index * 109) % (height - 40)),
      width: size,
      height: size,
      color: index % 4 === 0 ? mint : "#8292b5",
      visual: makeShape(size, size, [circle(size, index % 4 === 0 ? mint : "#8292b5")]),
      tags: ["star"],
    });
  });
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
  const invaders = Array.from({ length: 24 }, (_, index) => {
    const row = Math.floor(index / 6);
    const column = index % 6;
    return invader(actors.id, 330 + column * 112, 120 + row * 54, row);
  });
  const formationDirector = makeObject({
    name: "Formation director",
    layerId: actors.id,
    x: 1,
    y: 1,
    width: 1,
    height: 1,
    color: background,
    behaviors: [
      makeBehavior("formation", {
        groupId: "main-invaders",
        groupTag: "invader",
        speed: 76,
        dropDistance: 24,
        edgeMargin: 86,
        breachY: 620,
        breachVariable: "breached",
      }),
    ],
    tags: ["director"],
  });
  const barriers = [280, 640, 1000].map((x, index) =>
    makeObject({
      name: `Shield ${index + 1}`,
      layerId: defense.id,
      x,
      y: 550,
      width: 132,
      height: 34,
      color: "#457b79",
      visual: makeShape(132, 34, [
        rectShape(132, 34, "#457b79", { stroke: "#8ed9c1", strokeWidth: 2 }),
        rectShape(26, 12, background, { x: -42, y: 11 }),
        rectShape(26, 12, background, { x: 42, y: 11 }),
      ]),
      bodyType: "static",
      body: makeBody(132, 34, "static"),
      behaviors: [makeBehavior("health", { max: 5 })],
      tags: ["barrier"],
    }),
  );
  const player = playerShip(actors.id);
  const playerBullet: Prefab = {
    id: "pfb_invader_player_bullet",
    name: "Defender bolt",
    root: {
      id: "pfb_invader_player_bullet_root",
      name: "Defender bolt",
      layerId: actors.id,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      visual: makeShape(8, 18, [rectShape(6, 16, "#c8f5ff", { stroke: "#ffffff", strokeWidth: 1 })]),
      behaviors: [makeBehavior("projectile", { targetTags: "invader,barrier", damage: 1, lifetimeMs: 1400 })],
      properties: {},
      tags: ["player-bullet"],
    },
    objects: [],
    params: {},
  };
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 26,
    y: 26,
    width: 280,
    height: 24,
    color: "#e5fff7",
    visual: { kind: "text", text: "LAST DEFENSE", style: { font: "inter", size: 18, color: "#e5fff7", align: "left" } },
    tags: ["ui"],
  });
  const hint = makeObject({
    name: "Controls",
    layerId: ui.id,
    x: width / 2,
    y: 28,
    width: 500,
    height: 20,
    color: "#a9bad1",
    visual: { kind: "text", text: "A / D move       Space fire       R restart", style: { font: "inter", size: 15, color: "#a9bad1", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Last Defense",
    width,
    height,
    background,
    layers: [sky, actors, defense, ui],
    objects: [backdrop, ...stars, formationDirector, ...invaders, ...barriers, player, title, hint],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Formation cleared",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "enemies", op: "<=", value: 0 }],
        do: [{ kind: "set-variable", name: "won", op: "set", value: true }],
      },
      {
        id: newId("rul"),
        name: "Defenders lost",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "lives", op: "<=", value: 0 }],
        do: [{ kind: "set-variable", name: "lost", op: "set", value: true }],
      },
      {
        id: newId("rul"),
        name: "Formation breached",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "breached", op: "==", value: true }],
        do: [{ kind: "set-variable", name: "lost", op: "set", value: true }],
      },
    ],
  });

  return makeDocument({
    name,
    templateOrigin: "space-invaders",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 0 },
      ui: {
        hud: [
          { id: "hud_score", variable: "score", label: "SCORE", corner: "top-left", style: "text", visible: true },
          { id: "hud_lives", variable: "lives", label: "SHIPS", corner: "top-right", style: "text", visible: true },
          { id: "hud_enemies", variable: "enemies", label: "INVADERS", corner: "bottom-right", style: "text", visible: true },
        ],
        accent: mint,
        font: "inter",
        message: { color: "#e5fff7", background: "rgba(8, 13, 25, 0.84)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    prefabs: [enemyBullet, playerBullet],
    variables: [
      { id: "var_score", name: "score", type: "number", initial: 0 },
      { id: "var_lives", name: "lives", type: "number", initial: 3 },
      { id: "var_hull", name: "hull", type: "number", initial: 1 },
      { id: "var_enemies", name: "enemies", type: "number", initial: 24 },
      { id: "var_breached", name: "breached", type: "boolean", initial: false },
      { id: "var_won", name: "won", type: "boolean", initial: false },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
