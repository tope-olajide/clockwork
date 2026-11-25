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
} from "../factory";
import type { ProjectDocument } from "../schema";

const width = 1024;
const height = 768;
const background = "#111426";
const gold = "#ffd47c";
const cyan = "#78e8ff";

export function brickBreakerTemplate(name: string): ProjectDocument {
  const play = makeLayer("Playfield", 0);
  const ui = makeLayer("HUD and controls", 1, { parallax: { x: 0, y: 0 } });
  const brickColors = ["#ff758f", "#ff9f74", "#ffd47c", "#8ce0bb", "#8fc8ff"];
  const bricks = Array.from({ length: 50 }, (_, index) => {
    const row = Math.floor(index / 10);
    const column = index % 10;
    const color = brickColors[row]!;
    const brick = makeObject({
      name: `Brick ${row + 1}-${column + 1}`,
      layerId: play.id,
      x: 72 + column * 88,
      y: 132 + row * 40,
      width: 78,
      height: 30,
      color,
      visual: makeShape(78, 30, [rectShape(78, 30, color, { stroke: "#fff2df", strokeWidth: 2 })]),
      bodyType: "static",
      body: makeBody(78, 30, "static"),
      behaviors: [
        makeBehavior("health", {
          max: row === 0 || row === 1 ? 2 : 1,
          scoreVariable: "score",
          scoreOnDeath: (5 - row) * 10,
          deathVariable: "bricks",
          deathAmount: -1,
        }),
      ],
      tags: ["brick", `brick-row-${row + 1}`],
    });
    return brick;
  });
  const paddle = makeObject({
    name: "Paddle",
    layerId: play.id,
    x: width / 2,
    // 180px up from the bottom edge: Test Mode and AI Play dock their control
    // buttons along the bottom-centre of the view (about 130px tall), and at
    // height - 58 the paddle sat underneath them and could not be seen.
    y: height - 180,
    width: 124,
    height: 18,
    color: cyan,
    visual: makeShape(124, 18, [rectShape(124, 18, cyan, { stroke: "#e5fbff", strokeWidth: 2 })]),
    bodyType: "static",
    body: makeBody(124, 18, "static"),
    behaviors: [makeBehavior("paddle", { axis: "x", speed: 590, min: 64, max: width - 64 })],
    tags: ["paddle", "player"],
  });
  const ball = makeObject({
    name: "Ball",
    layerId: play.id,
    x: width / 2,
    // Resting on the paddle (the ball's attach offset is -24).
    y: height - 204,
    width: 18,
    height: 18,
    color: "#fff5d8",
    visual: makeShape(18, 18, [circle(18, "#fff5d8", { stroke: gold, strokeWidth: 2 })]),
    behaviors: [
      makeBehavior("ball", {
        speed: 360,
        serveDirection: "up",
        serveTrigger: "jump",
        serveDelayMs: 400,
        attachToTag: "paddle",
        offsetY: -24,
        paddleTag: "paddle",
        bounceAngle: 64,
        speedUpEvery: 4,
        speedUpBy: 14,
        maxSpeed: 560,
        targetTags: "brick",
        damage: 1,
        missBottomVariable: "lives",
        missAmount: -1,
      }),
    ],
    tags: ["ball"],
  });
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 24,
    y: 24,
    width: 280,
    height: 22,
    color: "#f4f1e9",
    visual: { kind: "text", text: "BRICK BREAKER", style: { font: "inter", size: 18, color: "#f4f1e9", align: "left" } },
    tags: ["ui"],
  });
  const controls = makeObject({
    name: "Controls",
    layerId: ui.id,
    x: width / 2,
    y: height - 22,
    width: 480,
    height: 20,
    color: "#b7bfd2",
    visual: { kind: "text", text: "A / D move       Space serve       R restart", style: { font: "inter", size: 14, color: "#b7bfd2", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Brick Breaker",
    width,
    height,
    background,
    layers: [play, ui],
    objects: [...bricks, paddle, ball, title, controls],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Wall cleared",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "bricks", op: "<=", value: 0 }],
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
    templateOrigin: "brick-breaker",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 0 },
      ui: {
        hud: [
          { id: "hud_score", variable: "score", label: "SCORE", corner: "top-left", style: "text", visible: true },
          { id: "hud_lives", variable: "lives", label: "BALLS", corner: "top-right", style: "text", visible: true },
          { id: "hud_bricks", variable: "bricks", label: "BRICKS", corner: "bottom-right", style: "text", visible: true },
        ],
        accent: gold,
        font: "inter",
        message: { color: "#f4f1e9", background: "rgba(17, 20, 38, 0.86)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    variables: [
      { id: "var_score", name: "score", type: "number", initial: 0 },
      { id: "var_lives", name: "lives", type: "number", initial: 3 },
      { id: "var_bricks", name: "bricks", type: "number", initial: bricks.length },
      { id: "var_won", name: "won", type: "boolean", initial: false },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
