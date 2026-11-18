import {
  circle,
  makeBehavior,
  makeDocument,
  makeLayer,
  makeObject,
  makeScene,
  makeSettings,
  makeShape,
  rectShape,
} from "../factory";
import type { GameObject, Prefab, ProjectDocument } from "../schema";

const columns = 20;
const rows = 15;
const cellSize = 32;
const originX = 80;
const originY = 40;
const width = 800;
const height = 560;
const background = "#111a2b";
const mint = "#8fe3c0";
const gold = "#f4c56a";

function gridObjectPosition(column: number, row: number): { x: number; y: number } {
  return {
    x: originX + column * cellSize + cellSize / 2,
    y: originY + row * cellSize + cellSize / 2,
  };
}

export function snakeTemplate(name: string): ProjectDocument {
  const backgroundLayer = makeLayer("Backdrop", 0);
  const boardLayer = makeLayer("Grid and food", 1);
  const actorLayer = makeLayer("Snake", 2);
  const ui = makeLayer("HUD", 3, { parallax: { x: 0, y: 0 } });
  const backdrop = makeObject({
    name: "Night background",
    layerId: backgroundLayer.id,
    x: width / 2,
    y: height / 2,
    width,
    height,
    color: background,
    visual: makeShape(width, height, [rectShape(width, height, background)]),
    tags: ["background"],
  });
  const board = makeObject({
    name: "Snake board",
    layerId: boardLayer.id,
    x: originX + (columns * cellSize) / 2,
    y: originY + (rows * cellSize) / 2,
    width: columns * cellSize,
    height: rows * cellSize,
    color: "#18263c",
    visual: makeShape(columns * cellSize, rows * cellSize, [
      rectShape(columns * cellSize, rows * cellSize, "#18263c", { stroke: "#35496b", strokeWidth: 3 }),
      ...Array.from({ length: Math.floor((columns - 1) / 2) }, (_, index) =>
        rectShape(1, rows * cellSize, "#22334e", { x: -(columns * cellSize) / 2 + (index + 1) * cellSize * 2 }),
      ),
      ...Array.from({ length: Math.floor((rows - 1) / 2) }, (_, index) =>
        rectShape(columns * cellSize, 1, "#22334e", { y: -(rows * cellSize) / 2 + (index + 1) * cellSize * 2 }),
      ),
    ]),
    tags: ["board"],
  });
  const perimeter: Array<{ x: number; y: number }> = [];
  for (let column = 0; column < columns; column += 1) {
    perimeter.push({ x: column, y: 0 }, { x: column, y: rows - 1 });
  }
  for (let row = 1; row < rows - 1; row += 1) {
    perimeter.push({ x: 0, y: row }, { x: columns - 1, y: row });
  }
  const wallObjects = perimeter.map((cell) => {
    const position = gridObjectPosition(cell.x, cell.y);
    return makeObject({
      name: `Board wall ${cell.x}-${cell.y}`,
      layerId: boardLayer.id,
      x: position.x,
      y: position.y,
      width: cellSize,
      height: cellSize,
      color: "#35496b",
      visual: makeShape(cellSize, cellSize, [rectShape(cellSize, cellSize, "#35496b", { stroke: "#536c93", strokeWidth: 1 })]),
      tags: ["wall", "board-boundary"],
    });
  });
  const bodyPrefabRoot: GameObject = makeObject({
    name: "Snake segment",
    layerId: actorLayer.id,
    x: 0,
    y: 0,
    width: 26,
    height: 26,
    color: "#54a88d",
    visual: makeShape(26, 26, [
      rectShape(26, 26, "#54a88d", { stroke: "#b1f3db", strokeWidth: 2 }),
      circle(5, "#214c43", { x: -5, y: -4 }),
    ]),
    tags: ["snake-body"],
  });
  bodyPrefabRoot.id = "pfb_snake_body_root";
  const bodyPrefab: Prefab = {
    id: "pfb_snake_body",
    name: "Snake segment",
    root: bodyPrefabRoot,
    objects: [],
    params: {},
  };
  const headPosition = gridObjectPosition(10, 7);
  const head = makeObject({
    name: "Snake head",
    layerId: actorLayer.id,
    x: headPosition.x,
    y: headPosition.y,
    width: 28,
    height: 28,
    color: mint,
    visual: makeShape(28, 28, [
      rectShape(28, 28, mint, { stroke: "#e1fff2", strokeWidth: 2 }),
      circle(6, "#274a43", { x: 6, y: -4 }),
    ]),
    behaviors: [
      makeBehavior("snake", {
        cols: columns,
        rows,
        cellSize,
        originX,
        originY,
        stepMs: 120,
        initialLength: 3,
        bodyPrefabId: bodyPrefab.id,
        foodTag: "snake-food",
        wallTags: "wall",
        scoreVariable: "score",
        scorePerFood: 10,
        lengthVariable: "length",
        winScore: 100,
        winVariable: "won",
        lostVariable: "lost",
        loseOnWall: true,
        loseOnSelf: true,
      }),
    ],
    tags: ["player", "snake-head"],
  });
  const foodPosition = gridObjectPosition(14, 7);
  const food = makeObject({
    name: "Food",
    layerId: boardLayer.id,
    x: foodPosition.x,
    y: foodPosition.y,
    width: 22,
    height: 22,
    color: gold,
    visual: makeShape(22, 22, [circle(20, gold, { stroke: "#fff1bd", strokeWidth: 2 })]),
    tags: ["snake-food", "food"],
  });
  const title = makeObject({
    name: "Title",
    layerId: ui.id,
    x: width / 2,
    y: 18,
    width: 260,
    height: 22,
    color: "#f1f0ed",
    visual: { kind: "text", text: "SNAKE", style: { font: "inter", size: 18, color: "#f1f0ed", align: "center" } },
    tags: ["ui"],
  });
  const controls = makeObject({
    name: "Controls",
    layerId: ui.id,
    x: width / 2,
    y: height - 18,
    width: 520,
    height: 20,
    color: "#aab0c6",
    visual: { kind: "text", text: "WASD / arrows turn       Eat 10 stars to reach 100       R restart", style: { font: "inter", size: 14, color: "#aab0c6", align: "center" } },
    tags: ["ui"],
  });
  const scene = makeScene({
    name: "Grid Snack",
    width,
    height,
    background,
    layers: [backgroundLayer, boardLayer, actorLayer, ui],
    objects: [backdrop, board, ...wallObjects, food, head, title, controls],
    camera: { x: width / 2, y: height / 2, zoom: 1 },
  });
  return makeDocument({
    name,
    templateOrigin: "snake",
    settings: makeSettings({
      width,
      height,
      background,
      gravity: { x: 0, y: 0 },
      ui: {
        hud: [
          { id: "hud_score", variable: "score", label: "SCORE", corner: "top-left", style: "text", visible: true },
          { id: "hud_length", variable: "length", label: "LENGTH", corner: "top-right", style: "text", visible: true },
        ],
        accent: mint,
        font: "inter",
        message: { color: "#f1f0ed", background: "rgba(17, 26, 43, 0.9)", fontSize: 22 },
      },
    }),
    startSceneId: scene.id,
    scenes: [scene],
    prefabs: [bodyPrefab],
    variables: [
      { id: "var_score", name: "score", type: "number", initial: 0 },
      { id: "var_length", name: "length", type: "number", initial: 3 },
      { id: "var_won", name: "won", type: "boolean", initial: false },
      { id: "var_lost", name: "lost", type: "boolean", initial: false },
    ],
  });
}
