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
  triangleShape,
} from "../factory";
import type { GameObject, Prefab, ProjectDocument } from "../schema";

const width = 1280;
const height = 720;
const background = "#14243b";
const pipePrefabId = "pfb_flappy_gate";
const pipeSpeed = 190;
const pipeHeight = 600;
const gapHeight = 190;
const playerX = 290;

function makePipe(layerId: string, name: string, y: number, color: string): GameObject {
  return makeObject({
    name,
    layerId,
    x: 0,
    y,
    width: 96,
    height: pipeHeight,
    color,
    visual: makeShape(96, pipeHeight, [
      rectShape(96, pipeHeight, color, { stroke: "#c5f3c9", strokeWidth: 4 }),
      rectShape(112, 28, "#398b68", { y: y < 0 ? pipeHeight / 2 - 18 : -pipeHeight / 2 + 18 }),
    ]),
    bodyType: "static",
    body: makeBody(96, pipeHeight, "static"),
    behaviors: [makeBehavior("mover", { vx: -pipeSpeed, vy: 0, destroyOffscreen: true })],
    tags: ["hazard", "pipe"],
  });
}

export function flappyFlyerTemplate(name: string): ProjectDocument {
  const sky = makeLayer("Sky", 0, { parallax: { x: 0.15, y: 0.15 } });
  const play = makeLayer("Flight path", 1);
  const ui = makeLayer("HUD and controls", 2, { parallax: { x: 0, y: 0 } });
  const pipeRoot: GameObject = makeObject({
    name: "Gate score marker",
    layerId: play.id,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    color: background,
    behaviors: [makeBehavior("mover", { vx: -pipeSpeed, vy: 0, passX: playerX, passVariable: "score", passAmount: 1, destroyOffscreen: true })],
    tags: ["gate-marker"],
  });
  delete pipeRoot.visual;
  const pipePrefab: Prefab = {
    id: pipePrefabId,
    name: "Moving gate",
    root: pipeRoot,
    objects: [
      makePipe(play.id, "Upper pipe", -(gapHeight / 2 + pipeHeight / 2), "#4ab17d"),
      makePipe(play.id, "Lower pipe", gapHeight / 2 + pipeHeight / 2, "#4ab17d"),
    ],
    params: {},
  };
  pipePrefab.objects.forEach((object) => {
    object.parentId = pipeRoot.id;
  });

  const backdrop = makeObject({
    name: "Morning sky",
    layerId: sky.id,
    x: width / 2,
    y: height / 2,
    width,
    height,
    color: background,
    visual: makeShape(width, height, [rectShape(width, height, background)]),
    tags: ["background"],
  });
  const cloudObjects = Array.from({ length: 6 }, (_, index) =>
    makeObject({
      name: `Cloud ${index + 1}`,
      layerId: sky.id,
      x: 130 + index * 210,
      y: 100 + (index % 3) * 56,
      width: 130,
      height: 38,
      color: "#294261",
      visual: makeShape(130, 38, [rectShape(130, 38, "#294261")]),
      tags: ["decoration"],
    }),
  );
  const ground = makeObject({
    name: "Ground",
    layerId: play.id,
    x: width / 2,
    y: height - 20,
    width,
    height: 40,
    color: "#bd9e64",
    visual: makeShape(width, 40, [rectShape(width, 40, "#bd9e64"), rectShape(width, 8, "#78a35c", { y: -16 })]),
    bodyType: "static",
    body: makeBody(width, 40, "static"),
    tags: ["ground", "hazard"],
  });
  const player = makeObject({
    name: "Flyer",
    layerId: play.id,
    x: playerX,
    y: height / 2,
    width: 34,
    height: 28,
    color: "#ffd47c",
    visual: makeShape(34, 28, [
      triangleShape(30, 22, "#ffd47c", { rotation: 90, stroke: "#fff1bd", strokeWidth: 2 }),
      rectShape(13, 7, "#ff9867", { x: -3, y: 11 }),
    ]),
    bodyType: "dynamic",
    body: makeBody(30, 24, "dynamic"),
    behaviors: [
      makeBehavior("flap", {
        trigger: "jump",
        impulse: 320,
        gravityScale: 1,
        maxFallSpeed: 520,
        lockX: true,
        ceiling: 0,
        floor: height - 40,
        loseVariable: "lost",
        hazardTags: "hazard,pipe,ground",
      }),
    ],
    tags: ["player"],
  });
  const firstGateX = 850;
  const firstGapY = 350;
  const firstGateMarker = makeObject({
    name: "First gate score marker",
    layerId: play.id,
    x: firstGateX,
    y: firstGapY,
    width: 1,
    height: 1,
    color: background,
    behaviors: [
      makeBehavior("mover", {
        vx: -pipeSpeed,
        vy: 0,
        passX: playerX,
        passVariable: "score",
        passAmount: 1,
        destroyOffscreen: true,
      }),
    ],
    tags: ["gate-marker"],
  });
  delete firstGateMarker.visual;
  const firstUpperPipe = makePipe(play.id, "First upper pipe", -(gapHeight / 2 + pipeHeight / 2), "#4ab17d");
  firstUpperPipe.transform.x = firstGateX;
  firstUpperPipe.transform.y = firstGapY - (gapHeight / 2 + pipeHeight / 2);
  const firstLowerPipe = makePipe(play.id, "First lower pipe", gapHeight / 2 + pipeHeight / 2, "#4ab17d");
  firstLowerPipe.transform.x = firstGateX;
  firstLowerPipe.transform.y = firstGapY + gapHeight / 2 + pipeHeight / 2;
  const director = makeObject({
    name: "Gate director",
    layerId: play.id,
    x: 1,
    y: 1,
    width: 1,
    height: 1,
    color: background,
    behaviors: [
      makeBehavior("spawner", {
        prefabId: pipePrefabId,
        intervalMs: 1700,
        startDelayMs: 1000,
        minX: width + 60,
        maxX: width + 60,
        minY: 260,
        maxY: 440,
        limit: 15,
      }),
    ],
    tags: ["director"],
  });
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 26,
    y: 24,
    width: 280,
    height: 24,
    color: "#f0f7ff",
    visual: { kind: "text", text: "FLAPPY FLYER", style: { font: "inter", size: 18, color: "#f0f7ff", align: "left" } },
    tags: ["ui"],
  });
  const controls = makeObject({
    name: "Controls",
    layerId: ui.id,
    x: width / 2,
    y: height - 58,
    width: 420,
    height: 20,
    color: "#d1e4f6",
    visual: { kind: "text", text: "Space / click flap       Pass gates to score       R restart", style: { font: "inter", size: 15, color: "#d1e4f6", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Flappy Flyer",
    width,
    height,
    background,
    layers: [sky, play, ui],
    objects: [backdrop, ...cloudObjects, ground, firstGateMarker, firstUpperPipe, firstLowerPipe, player, director, title, controls],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Collision",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "lost", op: "==", value: true }],
        do: [{ kind: "show-message", text: "Run over — press R to try again", durationMs: 4000 }],
      },
    ],
  });

  return makeDocument({
    name,
    templateOrigin: "flappy-flyer",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 720 },
      ui: {
        hud: [{ id: "hud_score", variable: "score", label: "GATES", corner: "top-right", style: "text", visible: true }],
        accent: "#ffd47c",
        font: "inter",
        message: { color: "#f0f7ff", background: "rgba(20, 36, 59, 0.86)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    prefabs: [pipePrefab],
    variables: [
      { id: "var_score", name: "score", type: "number", initial: 0 },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
