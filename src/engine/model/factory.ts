import { nanoid } from "nanoid";
import type {
  BehaviorInstance,
  BehaviorType,
  Body,
  GameObject,
  Layer,
  ProjectDocument,
  ProjectSettings,
  Scene,
  TemplateOrigin,
  Visual,
} from "./schema";

export const nowIso = () => new Date().toISOString();

export function newId(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}

export const newProjectId = () => newId("prj");
export const newSceneId = () => newId("scn");
export const newLayerId = () => newId("lyr");
export const newObjectId = () => newId("obj");
export const newBehaviorId = () => newId("bhv");
export const newRuleId = () => newId("rul");
export const newVariableId = () => newId("var");
export const newAssetId = () => newId("ast");
export const newPrefabId = () => newId("prf");

export function makeTransform(x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) {
  return { x, y, rotation, scaleX, scaleY, originX: 0.5, originY: 0.5 };
}

export function makeBody(width: number, height: number, type: Body["type"] = "static", overrides: Partial<Body> = {}): Body {
  return {
    type,
    width,
    height,
    offsetX: 0,
    offsetY: 0,
    gravityScale: 1,
    collideWorldBounds: false,
    oneWay: false,
    ...overrides,
  };
}

export function makeRect(width: number, height: number, color: string, stroke?: string): Visual {
  return { kind: "rect", width, height, color, stroke };
}

export function makeText(text: string, size = 24, color = "#f1f0ed"): Visual {
  return { kind: "text", text, style: { font: "inter", size, color, align: "left" } };
}

export function makeBehavior(type: BehaviorType, params: Record<string, unknown> = {}): BehaviorInstance {
  return { id: newBehaviorId(), type, enabled: true, params };
}

export function makeLayer(name: string, order: number, overrides: Partial<Layer> = {}): Layer {
  return {
    id: newLayerId(),
    name,
    order,
    visible: true,
    locked: false,
    opacity: 1,
    parallax: { x: 1, y: 1 },
    ...overrides,
  };
}

export function makeObject(input: {
  name: string;
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  bodyType?: Body["type"];
  visual?: Visual;
  body?: Body;
  behaviors?: BehaviorInstance[];
  tags?: string[];
  properties?: Record<string, unknown>;
}): GameObject {
  const visual = input.visual ?? makeRect(input.width, input.height, input.color);
  const body =
    input.body ??
    (input.bodyType && input.bodyType !== "none"
      ? makeBody(input.width, input.height, input.bodyType)
      : undefined);
  return {
    id: newObjectId(),
    name: input.name,
    layerId: input.layerId,
    transform: makeTransform(input.x, input.y),
    visual,
    body,
    behaviors: input.behaviors ?? [],
    properties: input.properties ?? {},
    tags: input.tags ?? [],
  };
}

export function makeScene(input: {
  name: string;
  width: number;
  height: number;
  background: string;
  layers: Layer[];
  objects?: GameObject[];
  rules?: Scene["rules"];
  kind?: Scene["kind"];
  camera?: { x: number; y: number; zoom: number };
}): Scene {
  return {
    id: newSceneId(),
    name: input.name,
    kind: input.kind ?? "level",
    size: { w: input.width, h: input.height },
    background: { color: input.background },
    camera: input.camera ?? { x: 0, y: 0, zoom: 1 },
    layers: input.layers,
    objects: input.objects ?? [],
    rules: input.rules ?? [],
    audio: undefined,
  };
}

export function makeSettings(overrides: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    width: 1280,
    height: 720,
    pixelArt: false,
    gravity: { x: 0, y: 980 },
    background: "#151a2c",
    inputMap: {
      left: ["ArrowLeft", "KeyA"],
      right: ["ArrowRight", "KeyD"],
      up: ["ArrowUp", "KeyW"],
      down: ["ArrowDown", "KeyS"],
      jump: ["Space", "KeyW"],
      action: ["KeyE", "Enter"],
    },
    audio: { musicVolume: 0.6, sfxVolume: 0.8 },
    ui: { hud: [], accent: "#ff856f", font: "inter" },
    ...overrides,
  };
}

export function makeDocument(input: {
  name: string;
  templateOrigin: TemplateOrigin;
  settings: ProjectSettings;
  startSceneId: string;
  scenes: Scene[];
  variables?: ProjectDocument["variables"];
}): ProjectDocument {
  const time = nowIso();
  return {
    schemaVersion: 1,
    id: newProjectId(),
    name: input.name,
    revision: 0,
    createdAt: time,
    updatedAt: time,
    templateOrigin: input.templateOrigin,
    settings: input.settings,
    startSceneId: input.startSceneId,
    scenes: input.scenes,
    assets: [],
    prefabs: [],
    variables: input.variables ?? [],
  };
}

export function createEmptyProject(name: string): ProjectDocument {
  const layer = makeLayer("Objects", 0);
  const scene = makeScene({
    name: "Scene 1",
    width: 1600,
    height: 900,
    background: "#151a2c",
    layers: [layer],
  });
  return makeDocument({
    name,
    templateOrigin: "blank",
    settings: makeSettings(),
    startSceneId: scene.id,
    scenes: [scene],
  });
}
