import { enablePatches, produceWithPatches, type Patch } from "immer";
import { z } from "zod";
import { cloneScene } from "../model/clone";
import {
  makeBody,
  makeObject,
  makeTransform,
  nowIso,
} from "../model/factory";
import {
  behaviorInstanceSchema,
  bodySchema,
  gameObjectSchema,
  layerSchema,
  projectSettingsSchema,
  sceneSchema,
  transformSchema,
  vec2Schema,
  type BehaviorInstance,
  type GameObject,
  type Layer,
  type ProjectDocument,
  type ProjectSettings,
  type Scene,
  type Visual,
} from "../model/schema";
import { CommandError, validateDocument } from "./validation";

enablePatches();

const sceneId = z.string().min(1);
const objectId = z.string().min(1);
const layerId = z.string().min(1);
const behaviorId = z.string().min(1);

const transformPatchSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  rotation: z.number().finite().optional(),
  scaleX: z.number().finite().optional(),
  scaleY: z.number().finite().optional(),
  originX: z.number().min(0).max(1).optional(),
  originY: z.number().min(0).max(1).optional(),
});

const layerPatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  order: z.number().int().nonnegative().optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  parallax: vec2Schema.optional(),
});

const scenePatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  kind: z.enum(["level", "menu", "ui"]).optional(),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
  background: z.object({ color: z.string(), assetId: z.string().optional() }).optional(),
  camera: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }).optional(),
});

const objectPatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  layerId: layerId.optional(),
  parentId: z.string().nullable().optional(),
  transform: transformSchema.optional(),
  visual: z.unknown().nullable().optional(),
  body: bodySchema.nullable().optional(),
  behaviors: z.array(behaviorInstanceSchema).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

export type CommandDefinition = {
  type: string;
  schema: z.ZodType<unknown>;
  label: (args: unknown) => string;
  apply: (document: ProjectDocument, args: unknown) => void;
};

function definition<T>(
  type: string,
  schema: z.ZodType<T>,
  label: (args: T) => string,
  apply: (document: ProjectDocument, args: T) => void,
): CommandDefinition {
  return {
    type,
    schema: schema as unknown as z.ZodType<unknown>,
    label: (args) => label(args as T),
    apply: (document, args) => apply(document, args as T),
  };
}

function sceneOf(document: ProjectDocument, value: string): Scene {
  const scene = document.scenes.find((candidate) => candidate.id === value);
  if (!scene) throw new CommandError("NOT_FOUND", "That scene does not exist.");
  return scene;
}

function layerOf(scene: Scene, value: string): Layer {
  const layer = scene.layers.find((candidate) => candidate.id === value);
  if (!layer) throw new CommandError("NOT_FOUND", "That layer does not exist.");
  return layer;
}

function objectOf(scene: Scene, value: string): GameObject {
  const object = scene.objects.find((candidate) => candidate.id === value);
  if (!object) throw new CommandError("NOT_FOUND", "That object does not exist.");
  return object;
}

function reindexLayers(scene: Scene): void {
  const layers = [...scene.layers].sort((a, b) => a.order - b.order);
  layers.forEach((layer, index) => {
    layer.order = index;
  });
  scene.layers = layers;
}

function descendantIds(scene: Scene, rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of scene.objects) {
      if (!ids.has(object.id) && object.parentId && ids.has(object.parentId)) {
        ids.add(object.id);
        changed = true;
      }
    }
  }
  return ids;
}

const commands: CommandDefinition[] = [
  definition(
    "project.rename",
    z.object({ name: z.string().trim().min(1).max(80) }),
    () => "Rename project",
    (document, args) => {
      document.name = args.name.trim();
    },
  ),
  definition(
    "project.updateSettings",
    z.object({ settings: projectSettingsSchema }),
    () => "Update project settings",
    (document, args) => {
      document.settings = args.settings;
    },
  ),
  definition(
    "project.setStartScene",
    z.object({ sceneId }),
    () => "Set start scene",
    (document, args) => {
      sceneOf(document, args.sceneId);
      document.startSceneId = args.sceneId;
    },
  ),
  definition(
    "project.setArchived",
    z.object({ archived: z.boolean() }),
    (args) => (args.archived ? "Archive project" : "Restore project"),
    (document, args) => {
      document.archivedAt = args.archived ? nowIso() : undefined;
    },
  ),
  definition(
    "scene.create",
    z.object({ scene: sceneSchema }),
    () => "Create scene",
    (document, args) => {
      document.scenes.push(args.scene);
    },
  ),
  definition(
    "scene.update",
    z.object({ sceneId, patch: scenePatchSchema }),
    () => "Update scene",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      if (args.patch.name !== undefined) scene.name = args.patch.name;
      if (args.patch.kind !== undefined) scene.kind = args.patch.kind;
      if (args.patch.size !== undefined) scene.size = args.patch.size;
      if (args.patch.background !== undefined) scene.background = args.patch.background;
      if (args.patch.camera !== undefined) scene.camera = args.patch.camera;
    },
  ),
  definition(
    "scene.rename",
    z.object({ sceneId, name: z.string().trim().min(1).max(80) }),
    () => "Rename scene",
    (document, args) => {
      sceneOf(document, args.sceneId).name = args.name.trim();
    },
  ),
  definition(
    "scene.duplicate",
    z.object({ sceneId }),
    () => "Duplicate scene",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      document.scenes.push(cloneScene(scene, `${scene.name} copy`));
    },
  ),
  definition(
    "scene.delete",
    z.object({ sceneId }),
    () => "Delete scene",
    (document, args) => {
      if (document.scenes.length <= 1) {
        throw new CommandError("INVARIANT", "A project needs at least one scene.");
      }
      const index = document.scenes.findIndex((scene) => scene.id === args.sceneId);
      if (index < 0) throw new CommandError("NOT_FOUND", "That scene does not exist.");
      document.scenes.splice(index, 1);
      if (document.startSceneId === args.sceneId) {
        const fallback = document.scenes[0];
        if (!fallback) throw new CommandError("INVARIANT", "A project needs at least one scene.");
        document.startSceneId = fallback.id;
      }
    },
  ),
  definition(
    "scene.reorder",
    z.object({ sceneId, toIndex: z.number().int().nonnegative() }),
    () => "Reorder scene",
    (document, args) => {
      const index = document.scenes.findIndex((scene) => scene.id === args.sceneId);
      if (index < 0) throw new CommandError("NOT_FOUND", "That scene does not exist.");
      const [scene] = document.scenes.splice(index, 1);
      if (!scene) throw new CommandError("NOT_FOUND", "That scene does not exist.");
      document.scenes.splice(Math.min(args.toIndex, document.scenes.length), 0, scene);
    },
  ),
  definition(
    "layer.create",
    z.object({ sceneId, layer: layerSchema }),
    () => "Create layer",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      scene.layers.push(args.layer);
      reindexLayers(scene);
    },
  ),
  definition(
    "layer.update",
    z.object({ sceneId, layerId, patch: layerPatchSchema }),
    () => "Update layer",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      const layer = layerOf(scene, args.layerId);
      Object.assign(layer, args.patch);
    },
  ),
  definition(
    "layer.delete",
    z.object({
      sceneId,
      layerId,
      strategy: z.enum(["delete", "move"]).default("delete"),
      moveToLayerId: z.string().optional(),
    }),
    () => "Delete layer",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      if (scene.layers.length <= 1) throw new CommandError("INVARIANT", "A scene needs at least one layer.");
      layerOf(scene, args.layerId);
      if (args.strategy === "move") {
        if (!args.moveToLayerId) throw new CommandError("INVARIANT", "Choose a layer to keep objects in.");
        layerOf(scene, args.moveToLayerId);
        for (const object of scene.objects) {
          if (object.layerId === args.layerId) object.layerId = args.moveToLayerId;
        }
      } else {
        scene.objects = scene.objects.filter((object) => object.layerId !== args.layerId);
      }
      scene.layers = scene.layers.filter((layer) => layer.id !== args.layerId);
      reindexLayers(scene);
    },
  ),
  definition(
    "layer.reorder",
    z.object({ sceneId, layerId, toIndex: z.number().int().nonnegative() }),
    () => "Reorder layer",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      const ordered = [...scene.layers].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((layer) => layer.id === args.layerId);
      if (index < 0) throw new CommandError("NOT_FOUND", "That layer does not exist.");
      const [layer] = ordered.splice(index, 1);
      if (!layer) throw new CommandError("NOT_FOUND", "That layer does not exist.");
      ordered.splice(Math.min(args.toIndex, ordered.length), 0, layer);
      scene.layers = ordered;
      reindexLayers(scene);
    },
  ),
  definition(
    "object.create",
    z.object({ sceneId, object: gameObjectSchema }),
    () => "Create object",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      layerOf(scene, args.object.layerId);
      scene.objects.push(args.object);
    },
  ),
  definition(
    "object.update",
    z.object({ sceneId, objectId, patch: objectPatchSchema }),
    () => "Update object",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      const object = objectOf(scene, args.objectId);
      if (args.patch.layerId !== undefined) layerOf(scene, args.patch.layerId);
      if (args.patch.name !== undefined) object.name = args.patch.name;
      if (args.patch.layerId !== undefined) object.layerId = args.patch.layerId;
      if (args.patch.parentId !== undefined) {
        if (args.patch.parentId === null) delete object.parentId;
        else object.parentId = args.patch.parentId;
      }
      if (args.patch.transform !== undefined) object.transform = args.patch.transform;
      if (args.patch.visual !== undefined) {
        if (args.patch.visual === null) delete object.visual;
        else object.visual = args.patch.visual as Visual;
      }
      if (args.patch.body !== undefined) {
        if (args.patch.body === null) delete object.body;
        else object.body = args.patch.body;
      }
      if (args.patch.behaviors !== undefined) object.behaviors = args.patch.behaviors;
      if (args.patch.properties !== undefined) object.properties = args.patch.properties;
      if (args.patch.tags !== undefined) object.tags = args.patch.tags;
    },
  ),
  definition(
    "object.rename",
    z.object({ sceneId, objectId, name: z.string().trim().min(1).max(80) }),
    () => "Rename object",
    (document, args) => {
      objectOf(sceneOf(document, args.sceneId), args.objectId).name = args.name.trim();
    },
  ),
  definition(
    "object.updateTransform",
    z.object({ sceneId, objectId, transform: transformPatchSchema }),
    () => "Move object",
    (document, args) => {
      const object = objectOf(sceneOf(document, args.sceneId), args.objectId);
      object.transform = { ...object.transform, ...args.transform };
    },
  ),
  definition(
    "object.setVisual",
    z.object({ sceneId, objectId, visual: z.unknown().nullable() }),
    () => "Update object visual",
    (document, args) => {
      const object = objectOf(sceneOf(document, args.sceneId), args.objectId);
      if (args.visual === null) delete object.visual;
      else object.visual = args.visual as Visual;
    },
  ),
  definition(
    "object.setBody",
    z.object({ sceneId, objectId, body: bodySchema.nullable() }),
    () => "Update object body",
    (document, args) => {
      const object = objectOf(sceneOf(document, args.sceneId), args.objectId);
      if (args.body === null) delete object.body;
      else object.body = args.body;
    },
  ),
  definition(
    "object.setTags",
    z.object({ sceneId, objectId, tags: z.array(z.string()) }),
    () => "Update object tags",
    (document, args) => {
      objectOf(sceneOf(document, args.sceneId), args.objectId).tags = args.tags;
    },
  ),
  definition(
    "object.updateProperties",
    z.object({ sceneId, objectId, patch: z.record(z.string(), z.unknown()) }),
    () => "Update object data",
    (document, args) => {
      const object = objectOf(sceneOf(document, args.sceneId), args.objectId);
      object.properties = { ...object.properties, ...args.patch };
    },
  ),
  definition(
    "object.duplicate",
    z.object({ sceneId, objectId }),
    () => "Duplicate object",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      const source = objectOf(scene, args.objectId);
      const index = scene.objects.findIndex((object) => object.id === args.objectId);
      const copy = structuredClone(source);
      copy.id = `obj_${Math.random().toString(36).slice(2, 12)}`;
      copy.name = `${source.name} copy`;
      copy.transform = { ...copy.transform, x: copy.transform.x + 24, y: copy.transform.y + 24 };
      copy.behaviors = copy.behaviors.map((behavior) => ({
        ...behavior,
        id: `bhv_${Math.random().toString(36).slice(2, 12)}`,
      }));
      scene.objects.splice(index + 1, 0, copy);
    },
  ),
  definition(
    "object.delete",
    z.object({ sceneId, objectId }),
    () => "Delete object",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      objectOf(scene, args.objectId);
      const ids = descendantIds(scene, args.objectId);
      scene.objects = scene.objects.filter((object) => !ids.has(object.id));
    },
  ),
  definition(
    "object.reorder",
    z.object({ sceneId, objectId, toIndex: z.number().int().nonnegative() }),
    () => "Reorder object",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      const object = objectOf(scene, args.objectId);
      const sameLayer = scene.objects.filter((candidate) => candidate.layerId === object.layerId);
      const siblings = sameLayer.filter((candidate) => candidate.id !== object.id);
      const target = siblings[Math.min(args.toIndex, siblings.length - 1)];
      scene.objects = scene.objects.filter((candidate) => candidate.id !== object.id);
      if (!target) {
        scene.objects.push(object);
      } else {
        scene.objects.splice(scene.objects.indexOf(target), 0, object);
      }
    },
  ),
  definition(
    "object.reparent",
    z.object({ sceneId, objectId, layerId, parentId: z.string().nullable().optional() }),
    () => "Move object to layer",
    (document, args) => {
      const scene = sceneOf(document, args.sceneId);
      const object = objectOf(scene, args.objectId);
      layerOf(scene, args.layerId);
      object.layerId = args.layerId;
      if (args.parentId === null) delete object.parentId;
      else if (args.parentId !== undefined) {
        objectOf(scene, args.parentId);
        object.parentId = args.parentId;
      }
    },
  ),
  definition(
    "behavior.add",
    z.object({ sceneId, objectId, behavior: behaviorInstanceSchema }),
    () => "Add behavior",
    (document, args) => {
      objectOf(sceneOf(document, args.sceneId), args.objectId).behaviors.push(args.behavior);
    },
  ),
  definition(
    "behavior.update",
    z.object({
      sceneId,
      objectId,
      behaviorId,
      patch: z.object({
        enabled: z.boolean().optional(),
        params: z.record(z.string(), z.unknown()).optional(),
        type: behaviorInstanceSchema.shape.type.optional(),
      }),
    }),
    () => "Update behavior",
    (document, args) => {
      const object = objectOf(sceneOf(document, args.sceneId), args.objectId);
      const behavior = object.behaviors.find((candidate) => candidate.id === args.behaviorId);
      if (!behavior) throw new CommandError("NOT_FOUND", "That behavior does not exist.");
      if (args.patch.enabled !== undefined) behavior.enabled = args.patch.enabled;
      if (args.patch.type !== undefined) behavior.type = args.patch.type;
      if (args.patch.params !== undefined) behavior.params = { ...behavior.params, ...args.patch.params };
    },
  ),
  definition(
    "behavior.remove",
    z.object({ sceneId, objectId, behaviorId }),
    () => "Remove behavior",
    (document, args) => {
      const object = objectOf(sceneOf(document, args.sceneId), args.objectId);
      object.behaviors = object.behaviors.filter((behavior) => behavior.id !== args.behaviorId);
    },
  ),
];

export const commandRegistry = new Map(commands.map((command) => [command.type, command]));

export function commandDefinitions(): CommandDefinition[] {
  return commands;
}

export type CommandName = (typeof commands)[number]["type"];

export function getCommandDefinition(type: string): CommandDefinition {
  const command = commandRegistry.get(type);
  if (!command) throw new CommandError("NOT_FOUND", `Unknown command: ${type}`);
  return command;
}

export interface RunCommandOptions {
  expectedRevision?: number;
}

export interface CommandRunResult {
  document: ProjectDocument;
  patches: Patch[];
  inversePatches: Patch[];
  label: string;
}

export function runCommand(
  document: ProjectDocument,
  command: { type: string; args: unknown },
  options: RunCommandOptions = {},
): CommandRunResult {
  if (options.expectedRevision !== undefined && options.expectedRevision !== document.revision) {
    throw new CommandError("REVISION", `Project changed (revision ${document.revision}). Reload and try again.`);
  }
  const commandDefinition = getCommandDefinition(command.type);
  if (document.archivedAt && command.type !== "project.setArchived") {
    throw new CommandError("READ_ONLY", "This project is archived. Restore it to make changes.");
  }
  const parsed = commandDefinition.schema.safeParse(command.args);
  if (!parsed.success) {
    throw new CommandError("SCHEMA", parsed.error.issues[0]?.message ?? "Invalid command arguments.");
  }

  const [nextDocument, patches, inversePatches] = produceWithPatches(document, (draft) => {
    commandDefinition.apply(draft as ProjectDocument, parsed.data);
    draft.revision = document.revision + 1;
    draft.updatedAt = nowIso();
  });

  validateDocument(nextDocument);
  return {
    document: nextDocument,
    patches,
    inversePatches,
    label: commandDefinition.label(parsed.data),
  };
}

export function makeDefaultObject(input: {
  name: string;
  layerId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
}): GameObject {
  return makeObject({
    name: input.name,
    layerId: input.layerId,
    x: input.x ?? 0,
    y: input.y ?? 0,
    width: input.width ?? 64,
    height: input.height ?? 64,
    color: input.color ?? "#a9b4ff",
  });
}

export function makeDefaultLayer(name: string, order = 0): Layer {
  return { id: `lyr_${Math.random().toString(36).slice(2, 12)}`, name, order, visible: true, locked: false, opacity: 1, parallax: { x: 1, y: 1 } };
}

export function makeDefaultScene(name: string): Scene {
  return {
    id: `scn_${Math.random().toString(36).slice(2, 12)}`,
    name,
    kind: "level",
    size: { w: 1600, h: 900 },
    background: { color: "#151a2c" },
    camera: { x: 0, y: 0, zoom: 1 },
    layers: [makeDefaultLayer("Objects", 0)],
    objects: [],
    rules: [],
    audio: undefined,
  };
}

export type { BehaviorInstance, ProjectSettings };
export { makeBody, makeTransform };
