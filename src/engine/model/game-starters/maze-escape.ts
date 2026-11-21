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
import type { GameObject, ProjectDocument } from "../schema";

const cellSize = 48;
const columns = 20;
const rows = 12;
const width = cellSize * columns;
const height = cellSize * rows;
const background = "#111a2b";
const mint = "#8fe3c0";
const coral = "#ff856f";
const gold = "#f4c56a";

function cellCenter(column: number, row: number): { x: number; y: number } {
  return { x: column * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
}

function wall(layerId: string, column: number, row: number): GameObject {
  const { x, y } = cellCenter(column, row);
  return makeObject({
    name: `Wall ${column}-${row}`,
    layerId,
    x,
    y,
    width: cellSize,
    height: cellSize,
    color: "#35496b",
    visual: makeShape(cellSize, cellSize, [
      rectShape(cellSize, cellSize, "#35496b", { stroke: "#536c93", strokeWidth: 2 }),
      rectShape(cellSize - 12, 6, "#415b81", { y: -cellSize / 2 + 9 }),
    ]),
    bodyType: "static",
    body: makeBody(cellSize, cellSize, "static"),
    tags: ["wall", "maze-wall"],
  });
}

export function mazeEscapeTemplate(name: string): ProjectDocument {
  const floorLayer = makeLayer("Maze floor", 0);
  const wallLayer = makeLayer("Walls and gates", 1);
  const actorLayer = makeLayer("Actors and dots", 2);
  const ui = makeLayer("HUD", 3, { parallax: { x: 0, y: 0 } });
  const floor = makeObject({
    name: "Maze floor",
    layerId: floorLayer.id,
    x: width / 2,
    y: height / 2,
    width,
    height,
    color: background,
    visual: makeShape(width, height, [rectShape(width, height, background)]),
    tags: ["background"],
  });
  const wallCells = new Set<string>();
  const addWall = (column: number, row: number) => wallCells.add(`${column},${row}`);
  for (let column = 0; column < columns; column += 1) {
    addWall(column, 0);
    addWall(column, rows - 1);
  }
  for (let row = 1; row < rows - 1; row += 1) {
    addWall(0, row);
    addWall(columns - 1, row);
  }
  for (let row = 1; row <= 8; row += 1) if (row !== 4) addWall(5, row);
  for (let row = 3; row <= 10; row += 1) if (row !== 8) addWall(9, row);
  for (let row = 1; row <= 8; row += 1) if (row !== 4) addWall(14, row);
  const walls = [...wallCells].map((cell) => {
    const [column, row] = cell.split(",").map(Number);
    return wall(actorLayer.id, column!, row!);
  });
  const dotCells = [
    [2, 1], [3, 1], [4, 1],
    [1, 2], [2, 2], [3, 2],
    [1, 3], [2, 3], [3, 3], [4, 3],
    [4, 4], [5, 4], [6, 4], [7, 4], [8, 4],
  ] as const;
  const dots = dotCells.map(([column, row], index) => {
    const { x, y } = cellCenter(column, row);
    return makeObject({
      name: `Maze dot ${index + 1}`,
      layerId: actorLayer.id,
      x,
      y,
      width: 18,
      height: 18,
      color: gold,
      visual: makeShape(18, 18, [circle(14, gold, { stroke: "#fff1bd", strokeWidth: 1 })]),
      behaviors: [makeBehavior("collectible", { variable: "dots", amount: 1 })],
      tags: ["dot", "collectible"],
    });
  });
  const start = cellCenter(1, 1);
  const player = makeObject({
    name: "Maze runner",
    layerId: actorLayer.id,
    x: start.x,
    y: start.y,
    width: 30,
    height: 30,
    color: mint,
    visual: makeShape(30, 30, [
      circle(28, mint, { stroke: "#e1fff2", strokeWidth: 2 }),
      circle(7, "#274a43", { x: 6, y: -4 }),
    ]),
    bodyType: "dynamic",
    body: makeBody(26, 26, "dynamic", { gravityScale: 0, collideWorldBounds: true }),
    behaviors: [
      makeBehavior("top-down-controller", { speed: 210 }),
      makeBehavior("health", {
        max: 1,
        variable: "health",
        damageTags: "maze-enemy",
        deathVariable: "lives",
        deathAmount: -1,
      }),
    ],
    tags: ["player"],
  });
  const enemyStart = cellCenter(18, 1);
  const enemy = makeObject({
    name: "Maze warden",
    layerId: actorLayer.id,
    x: enemyStart.x,
    y: enemyStart.y,
    width: 30,
    height: 30,
    color: coral,
    visual: makeShape(30, 30, [
      circle(28, coral, { stroke: "#ffd0c7", strokeWidth: 2 }),
      circle(6, "#512f43", { x: -5, y: -3 }),
      circle(6, "#512f43", { x: 5, y: -3 }),
    ]),
    behaviors: [makeBehavior("follow", { targetTag: "player", speed: 100, stopDistance: 24, cellSize, wallTags: "wall" })],
    tags: ["maze-enemy", "enemy"],
  });
  const exitPosition = cellCenter(18, 10);
  const exit = makeObject({
    name: "Locked exit",
    layerId: wallLayer.id,
    x: exitPosition.x,
    y: exitPosition.y,
    width: cellSize,
    height: cellSize,
    color: "#6d507b",
    visual: makeShape(cellSize, cellSize, [
      rectShape(cellSize, cellSize, "#6d507b", { stroke: "#dfc4ec", strokeWidth: 3 }),
      rectShape(8, 20, "#dfc4ec", { x: -10 }),
      circle(5, gold, { x: 10 }),
    ]),
    bodyType: "static",
    body: makeBody(cellSize, cellSize, "static"),
    behaviors: [makeBehavior("exit-gate", { variable: "dots", required: 15, openVariable: "exitOpen", openColor: mint })],
    tags: ["goal", "exit", "gate", "wall"],
  });
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: 24,
    y: 22,
    width: 270,
    height: 22,
    color: "#f1f0ed",
    visual: { kind: "text", text: "MAZE ESCAPE", style: { font: "inter", size: 18, color: "#f1f0ed", align: "left" } },
    tags: ["ui"],
  });
  const controls = makeObject({
    name: "Controls",
    layerId: ui.id,
    x: width / 2,
    y: 22,
    width: 460,
    height: 22,
    color: "#aab0c6",
    visual: { kind: "text", text: "WASD move       Collect 15 dots       Reach the opened gate", style: { font: "inter", size: 14, color: "#aab0c6", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Warden's Maze",
    width,
    height,
    background,
    layers: [floorLayer, wallLayer, actorLayer, ui],
    objects: [floor, ...walls, ...dots, player, enemy, exit, title, controls],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
    rules: [
      {
        id: newId("rul"),
        name: "Escape with all dots",
        enabled: true,
        once: true,
        when: [
          { kind: "variable", name: "exitOpen", op: "==", value: true },
          { kind: "overlap", objectId: player.id, otherTag: "goal" },
        ],
        do: [{ kind: "set-variable", name: "won", op: "set", value: true }],
      },
      {
        id: newId("rul"),
        name: "Caught by the warden",
        enabled: true,
        once: true,
        when: [{ kind: "variable", name: "lives", op: "<=", value: 0 }],
        do: [{ kind: "set-variable", name: "lost", op: "set", value: true }],
      },
    ],
  });
  return makeDocument({
    name,
    templateOrigin: "maze-escape",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 0 },
      ui: {
        hud: [
          { id: "hud_dots", variable: "dots", label: "DOTS", corner: "top-left", style: "text", visible: true },
          { id: "hud_health", variable: "health", label: "HEALTH", corner: "top-right", style: "text", visible: true },
        ],
        accent: mint,
        font: "inter",
        message: { color: "#f1f0ed", background: "rgba(17, 26, 43, 0.9)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    variables: [
      { id: "var_dots", name: "dots", type: "number", initial: 0 },
      { id: "var_health", name: "health", type: "number", initial: 1 },
      { id: "var_lives", name: "lives", type: "number", initial: 1 },
      { id: "var_exit", name: "exitOpen", type: "boolean", initial: false },
      { id: "var_won", name: "won", type: "boolean", initial: false },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
