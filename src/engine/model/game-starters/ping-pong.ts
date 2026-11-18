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
import type { ProjectDocument } from "../schema";

const width = 960;
const height = 640;
const background = "#10131f";
const coral = "#ff9f74";
const cyan = "#78e8ff";
const white = "#e8edf7";

export function pingPongTemplate(name: string): ProjectDocument {
  const field = makeLayer("Court", 0);
  const ui = makeLayer("HUD and controls", 1, { parallax: { x: 0, y: 0 } });
  const border = (objectName: string, x: number, y: number, w: number, h: number) =>
    makeObject({
      name: objectName,
      layerId: field.id,
      x,
      y,
      width: w,
      height: h,
      color: "#354052",
      visual: makeShape(w, h, [rectShape(w, h, "#354052")]),
      bodyType: "static",
      tags: ["wall"],
    });

  const player = makeObject({
    name: "Player paddle",
    layerId: field.id,
    x: 62,
    y: height / 2,
    width: 18,
    height: 112,
    color: coral,
    visual: makeShape(18, 112, [rectShape(18, 112, coral, { stroke: "#ffe0d2", strokeWidth: 2 })]),
    bodyType: "static",
    body: makeBody(18, 112, "static"),
    behaviors: [makeBehavior("paddle", { axis: "y", speed: 500, min: 84, max: height - 84 })],
    tags: ["paddle", "player"],
  });
  const opponent = makeObject({
    name: "Computer paddle",
    layerId: field.id,
    x: width - 62,
    y: height / 2,
    width: 18,
    height: 104,
    color: cyan,
    visual: makeShape(18, 104, [rectShape(18, 104, cyan, { stroke: "#d8faff", strokeWidth: 2 })]),
    bodyType: "static",
    body: makeBody(18, 104, "static"),
    behaviors: [
      makeBehavior("ai-paddle", {
        targetTag: "ball",
        axis: "y",
        speed: 235,
        error: 48,
        reactionMs: 260,
        min: 80,
        max: height - 80,
      }),
    ],
    tags: ["paddle", "opponent"],
  });
  const ball = makeObject({
    name: "Ball",
    layerId: field.id,
    x: width / 2,
    y: height / 2,
    width: 18,
    height: 18,
    color: white,
    visual: makeShape(18, 18, [circle(18, white)]),
    behaviors: [
      makeBehavior("ball", {
        speed: 380,
        serveDirection: "right",
        serveTrigger: "auto",
        serveDelayMs: 900,
        paddleTag: "paddle",
        bounceAngle: 58,
        maxSpeed: 560,
        missLeftVariable: "rightScore",
        missRightVariable: "leftScore",
        missAmount: 1,
      }),
    ],
    tags: ["ball"],
  });
  const centerLine = Array.from({ length: 14 }, (_, index) =>
    makeObject({
      name: `Center dash ${index + 1}`,
      layerId: field.id,
      x: width / 2,
      y: 28 + index * 45,
      width: 5,
      height: 24,
      color: "#4b5364",
      visual: makeShape(5, 24, [rectShape(5, 24, "#4b5364")]),
      tags: ["decoration"],
    }),
  );
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 28,
    y: 24,
    width: 250,
    height: 24,
    color: white,
    visual: { kind: "text", text: "PING PONG", style: { font: "inter", size: 18, color: white, align: "left" } },
    tags: ["ui"],
  });
  const controls = makeObject({
    name: "Controls",
    layerId: ui.id,
    x: width / 2,
    y: height - 22,
    width: 420,
    height: 20,
    color: "#abb5c7",
    visual: { kind: "text", text: "W / S move       First to 5 wins       R restart", style: { font: "inter", size: 14, color: "#abb5c7", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Ping Pong",
    width,
    height,
    background,
    layers: [field, ui],
    objects: [
      border("Top wall", width / 2, 14, width, 28),
      border("Bottom wall", width / 2, height - 14, width, 28),
      ...centerLine,
      player,
      opponent,
      ball,
      title,
      controls,
    ],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Player wins",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "leftScore", op: ">=", value: 5 }],
        do: [{ kind: "set-variable", name: "won", op: "set", value: true }],
      },
      {
        id: newId("rul"),
        name: "Computer wins",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "rightScore", op: ">=", value: 5 }],
        do: [{ kind: "set-variable", name: "lost", op: "set", value: true }],
      },
    ],
  });

  return makeDocument({
    name,
    templateOrigin: "ping-pong",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 0 },
      ui: {
        hud: [
          { id: "hud_left", variable: "leftScore", label: "YOU", corner: "top-left", style: "text", visible: true },
          { id: "hud_right", variable: "rightScore", label: "CPU", corner: "top-right", style: "text", visible: true },
        ],
        accent: coral,
        font: "inter",
        message: { color: white, background: "rgba(16, 19, 31, 0.86)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    variables: [
      { id: "var_left_score", name: "leftScore", type: "number", initial: 0 },
      { id: "var_right_score", name: "rightScore", type: "number", initial: 0 },
      { id: "var_won", name: "won", type: "boolean", initial: false },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
