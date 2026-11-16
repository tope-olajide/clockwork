import { z } from "zod";

export const INPUT_ACTIONS = ["left", "right", "up", "down", "jump", "action"] as const;
export type InputAction = (typeof INPUT_ACTIONS)[number];

export const TEMPLATE_ORIGINS = ["blank", "platformer", "topdown", "puzzle", "brief", "import"] as const;
export type TemplateOrigin = (typeof TEMPLATE_ORIGINS)[number];

export const vec2Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const transformSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite().default(0),
  scaleX: z.number().finite().refine((value) => value !== 0, "Scale cannot be zero").default(1),
  scaleY: z.number().finite().refine((value) => value !== 0, "Scale cannot be zero").default(1),
  originX: z.number().min(0).max(1).default(0.5),
  originY: z.number().min(0).max(1).default(0.5),
});

export const bodySchema = z.object({
  type: z.enum(["dynamic", "static", "kinematic", "none"]).default("none"),
  width: z.number().positive(),
  height: z.number().positive(),
  offsetX: z.number().finite().default(0),
  offsetY: z.number().finite().default(0),
  gravityScale: z.number().finite().default(1),
  collideWorldBounds: z.boolean().default(false),
  oneWay: z.boolean().default(false),
});

export const textStyleSchema = z.object({
  font: z.enum(["inter", "mono"]).default("inter"),
  size: z.number().positive().default(24),
  color: z.string().default("#f1f0ed"),
  align: z.enum(["left", "center", "right"]).default("left"),
});

export const visualSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sprite"),
    assetId: z.string().min(1),
    frame: z.number().int().nonnegative().optional(),
    tint: z.string().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  }),
  z.object({
    kind: z.literal("rect"),
    width: z.number().positive(),
    height: z.number().positive(),
    color: z.string(),
    stroke: z.string().optional(),
  }),
  z.object({
    kind: z.literal("text"),
    text: z.string(),
    style: textStyleSchema,
  }),
  z.object({
    kind: z.literal("tilemap"),
    tilesetId: z.string().min(1),
    tileSize: z.number().int().positive(),
    data: z.array(z.number().int().nonnegative()),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
]);

export const behaviorTypeSchema = z.enum([
  "platformer-controller",
  "top-down-controller",
  "patrol",
  "follow",
  "collectible",
  "hazard",
  "checkpoint",
  "camera-follow",
  "spawner",
  "timer",
  "variable-set",
  "health",
]);

export const behaviorInstanceSchema = z.object({
  id: z.string().min(1),
  type: behaviorTypeSchema,
  enabled: z.boolean().default(true),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const gameObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  layerId: z.string().min(1),
  parentId: z.string().optional(),
  prefabId: z.string().optional(),
  transform: transformSchema,
  visual: visualSchema.optional(),
  body: bodySchema.optional(),
  behaviors: z.array(behaviorInstanceSchema).default([]),
  properties: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
});

export const layerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  order: z.number().int().nonnegative(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  parallax: vec2Schema.default({ x: 1, y: 1 }),
});

export const conditionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("variable"),
    name: z.string().min(1),
    op: z.enum(["==", "!=", ">", ">=", "<", "<="]),
    value: z.union([z.number(), z.string(), z.boolean()]),
  }),
  z.object({
    kind: z.literal("overlap"),
    objectId: z.string().optional(),
    tag: z.string().optional(),
    otherId: z.string().optional(),
    otherTag: z.string().optional(),
  }),
  z.object({
    kind: z.literal("input"),
    action: z.enum(INPUT_ACTIONS),
    mode: z.enum(["pressed", "down", "released"]),
  }),
  z.object({ kind: z.literal("timer"), timerId: z.string() }),
  z.object({ kind: z.literal("scene-start") }),
]);

export const ruleActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("set-variable"),
    name: z.string().min(1),
    op: z.enum(["set", "add", "toggle"]),
    value: z.union([z.number(), z.string(), z.boolean()]),
  }),
  z.object({ kind: z.literal("spawn"), prefabId: z.string(), x: z.number(), y: z.number() }),
  z.object({ kind: z.literal("destroy"), target: z.enum(["self", "object"]), objectId: z.string().optional() }),
  z.object({ kind: z.literal("play-sound"), assetId: z.string(), volume: z.number().min(0).max(1).optional() }),
  z.object({ kind: z.literal("show-message"), text: z.string(), durationMs: z.number().positive().optional() }),
  z.object({ kind: z.literal("go-scene"), sceneId: z.string(), delayMs: z.number().nonnegative().optional() }),
  z.object({
    kind: z.literal("set-behavior-param"),
    objectId: z.string(),
    behaviorId: z.string(),
    param: z.string(),
    value: z.unknown(),
  }),
  z.object({ kind: z.literal("log"), message: z.string() }),
]);

export const ruleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  enabled: z.boolean().default(true),
  once: z.boolean().default(false),
  when: z.array(conditionSchema).default([]),
  do: z.array(ruleActionSchema).default([]),
});

export const sceneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  kind: z.enum(["level", "menu", "ui"]).default("level"),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }),
  background: z.object({ color: z.string(), assetId: z.string().optional() }),
  camera: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive().default(1) }),
  layers: z.array(layerSchema).min(1),
  objects: z.array(gameObjectSchema),
  rules: z.array(ruleSchema).default([]),
  audio: z
    .object({ musicAssetId: z.string().optional(), loop: z.boolean(), volume: z.number().min(0).max(1) })
    .optional(),
});

export const assetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  kind: z.enum(["image", "audio", "tileset"]),
  hash: z.string().min(1),
  mime: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  size: z.number().int().nonnegative(),
  tags: z.array(z.string()).default([]),
  slices: z
    .array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }))
    .optional(),
  animations: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        frameIndices: z.array(z.number().int().nonnegative()),
        fps: z.number().positive(),
        loop: z.boolean(),
      }),
    )
    .optional(),
});

export const prefabSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  root: gameObjectSchema,
  /** Additional objects captured with the prefab; parentId links them to the root or each other. */
  objects: z.array(gameObjectSchema).default([]),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const variableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  type: z.enum(["number", "boolean", "string"]),
  initial: z.union([z.number(), z.boolean(), z.string()]),
  description: z.string().optional(),
});

export const projectSettingsSchema = z.object({
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(720),
  pixelArt: z.boolean().default(false),
  gravity: z.object({ x: z.number().default(0), y: z.number().default(980) }),
  background: z.string().default("#151a2c"),
  inputMap: z
    .record(z.enum(INPUT_ACTIONS), z.array(z.string()))
    .default({
      left: ["ArrowLeft", "KeyA"],
      right: ["ArrowRight", "KeyD"],
      up: ["ArrowUp", "KeyW"],
      down: ["ArrowDown", "KeyS"],
      jump: ["Space", "KeyW"],
      action: ["KeyE", "Enter"],
    }),
  audio: z.object({ musicVolume: z.number().min(0).max(1).default(0.6), sfxVolume: z.number().min(0).max(1).default(0.8) }),
  ui: z.object({
    hud: z.array(
      z.object({
        id: z.string(),
        variable: z.string(),
        label: z.string(),
        corner: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
        style: z.enum(["text", "bar"]),
        max: z.number().positive().optional(),
      }),
    ).default([]),
    accent: z.string().default("#ff856f"),
    font: z.enum(["inter", "mono"]).default("inter"),
  }),
});

export const projectDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().optional(),
  templateOrigin: z.enum(TEMPLATE_ORIGINS),
  settings: projectSettingsSchema,
  startSceneId: z.string().min(1),
  scenes: z.array(sceneSchema).min(1),
  assets: z.array(assetSchema).default([]),
  prefabs: z.array(prefabSchema).default([]),
  variables: z.array(variableSchema).default([]),
});

export type ProjectDocument = z.infer<typeof projectDocumentSchema>;
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type GameObject = z.infer<typeof gameObjectSchema>;
export type Body = z.infer<typeof bodySchema>;
export type Visual = z.infer<typeof visualSchema>;
export type BehaviorInstance = z.infer<typeof behaviorInstanceSchema>;
export type BehaviorType = z.infer<typeof behaviorTypeSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type RuleAction = z.infer<typeof ruleActionSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Prefab = z.infer<typeof prefabSchema>;
export type Variable = z.infer<typeof variableSchema>;
export type ProjectRecord = {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  coverDataUrl?: string;
  template: TemplateOrigin;
  archivedAt?: string;
  sceneCount: number;
};

export interface EditorState {
  activeSceneId: string | null;
  selection: string[];
  activeLayerId: string | null;
  tool: "select" | "hand" | "rect";
  camera: { x: number; y: number; zoom: number };
  panels: { left: boolean; right: boolean; agent: boolean; bottom: boolean };
  tab: "scene" | "content" | "logic" | "presentation";
  playtest: "off" | "running" | "paused";
  saveState: "saved" | "dirty" | "saving" | "error";
  agentPresence: { objectIds: string[]; label: string } | null;
  ghostPreview: { label: string } | null;
}

export function migrateDocument(input: unknown): ProjectDocument {
  return projectDocumentSchema.parse(input);
}

export function toProjectRecord(document: ProjectDocument, coverDataUrl?: string): ProjectRecord {
  return {
    id: document.id,
    name: document.name,
    updatedAt: document.updatedAt,
    revision: document.revision,
    coverDataUrl,
    template: document.templateOrigin,
    archivedAt: document.archivedAt,
    sceneCount: document.scenes.length,
  };
}
