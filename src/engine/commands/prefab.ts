import { current, isDraft } from "immer";
import type { GameObject, Prefab, ProjectDocument, Scene } from "../model/schema";
import { newObjectId } from "../model/factory";

export interface InstantiatePrefabOptions {
  prefabId: string;
  sceneId: string;
  layerId?: string;
  x?: number;
  y?: number;
  count?: number;
  spacing?: number;
}

const OVERRIDE_FIELDS = ["name", "transform", "visual", "body", "behaviors", "animations", "properties", "tags"] as const;

function plain<T>(value: T): T {
  const v: any = value;
  return (isDraft(v) ? current(v) : v) as T;
}

function cloneValue<T>(value: T): T {
  return structuredClone(plain(value));
}

function cloneTagged(source: GameObject, prefab: Prefab, instanceId: string, slot: string, idMap: Map<string, string>): GameObject {
  const clone = cloneValue(source);
  clone.id = newObjectId();
  idMap.set(source.id, clone.id);
  clone.prefabId = prefab.id;
  clone.prefabInstanceId = instanceId;
  clone.prefabSlot = slot;
  delete clone.prefabOverrides;
  return clone;
}

/** Instantiate a prefab into a scene, returning the new root ids. */
export function instantiatePrefab(document: ProjectDocument, options: InstantiatePrefabOptions): string[] {
  const prefab = document.prefabs.find((candidate) => candidate.id === options.prefabId);
  const scene = document.scenes.find((candidate) => candidate.id === options.sceneId);
  if (!prefab) throw new Error("That prefab does not exist.");
  if (!scene) throw new Error("That scene does not exist.");
  const layerId = options.layerId ?? scene.layers[0]?.id;
  if (!layerId) throw new Error("The scene has no layer.");
  const count = Math.max(1, Math.min(100, Math.floor(options.count ?? 1)));
  const originX = options.x ?? prefab.root.transform.x;
  const originY = options.y ?? prefab.root.transform.y;
  const dx = originX - prefab.root.transform.x;
  const dy = originY - prefab.root.transform.y;
  const roots: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const instanceId = `pinst_${Math.random().toString(36).slice(2, 12)}`;
    const idMap = new Map<string, string>();
    const root = cloneTagged(prefab.root, prefab, instanceId, "root", idMap);
    root.layerId = layerId;
    root.transform = { ...root.transform, x: root.transform.x + dx + index * (options.spacing ?? 48), y: root.transform.y + dy };
    const clones = prefab.objects.map((source, childIndex) => {
      const clone = cloneTagged(source, prefab, instanceId, `obj:${childIndex}`, idMap);
      clone.layerId = layerId;
      clone.transform = { ...clone.transform, x: clone.transform.x + dx + index * (options.spacing ?? 48), y: clone.transform.y + dy };
      return clone;
    });
    for (const clone of [root, ...clones]) {
      if (clone.parentId) clone.parentId = idMap.get(clone.parentId) ?? undefined;
      if (!clone.parentId) delete clone.parentId;
    }
    scene.objects.push(root, ...clones);
    roots.push(root.id);
  }
  return roots;
}

function applyOverrides(source: GameObject, overrides: Record<string, unknown> | undefined, id: string, layerId: string, parentId?: string): GameObject {
  const clone = cloneValue(source);
  clone.id = id;
  clone.layerId = layerId;
  if (parentId) clone.parentId = parentId;
  else delete clone.parentId;
  if (!overrides) return clone;
  for (const field of OVERRIDE_FIELDS) {
    if (!(field in overrides)) continue;
    const value = overrides[field];
    if (value === null) {
      delete (clone as unknown as Record<string, unknown>)[field];
    } else if (field === "transform" && value && typeof value === "object") {
      clone.transform = { ...clone.transform, ...(plain(value) as Partial<GameObject["transform"]>) };
    } else {
      (clone as unknown as Record<string, unknown>)[field] = cloneValue(value);
    }
  }
  return clone;
}

/** Rebuild every instance of a prefab while preserving per-instance overrides. */
export function refreshPrefabInstances(document: ProjectDocument, prefab: Prefab): number {
  let updated = 0;
  for (const scene of document.scenes) {
    const grouped = new Map<string, GameObject[]>();
    for (const object of scene.objects) {
      if (object.prefabId !== prefab.id || !object.prefabInstanceId) continue;
      const list = grouped.get(object.prefabInstanceId) ?? [];
      list.push(object);
      grouped.set(object.prefabInstanceId, list);
    }
    for (const [instanceId, objects] of grouped) {
      const root = objects.find((object) => object.prefabSlot === "root") ?? objects[0];
      if (!root) continue;
      const layerId = root.layerId;
      const overrides = new Map(objects.map((object) => [object.prefabSlot, object.prefabOverrides]));
      const ids = new Map(objects.map((object) => [object.prefabSlot, object.id]));
      const idMap = new Map<string, string>();
      idMap.set(prefab.root.id, root.id);
      prefab.objects.forEach((source, childIndex) => {
        const existing = ids.get(`obj:${childIndex}`);
        if (existing) idMap.set(source.id, existing);
      });

      const nextRoot = applyOverrides(prefab.root, overrides.get("root"), root.id, layerId);
      nextRoot.prefabId = prefab.id;
      nextRoot.prefabInstanceId = instanceId;
      nextRoot.prefabSlot = "root";
      nextRoot.prefabOverrides = overrides.get("root");

      const nextObjects = prefab.objects.map((source, childIndex) => {
        const slot = `obj:${childIndex}`;
        const existingId = ids.get(slot) ?? newObjectId();
        const clone = applyOverrides(source, overrides.get(slot), existingId, layerId);
        clone.prefabId = prefab.id;
        clone.prefabInstanceId = instanceId;
        clone.prefabSlot = slot;
        clone.prefabOverrides = overrides.get(slot);
        if (source.parentId) clone.parentId = idMap.get(source.parentId) ?? root.id;
        else delete clone.parentId;
        return clone;
      });

      const keep = new Set([nextRoot.id, ...nextObjects.map((object) => object.id)]);
      scene.objects = scene.objects.filter((object) => object.prefabInstanceId !== instanceId || keep.has(object.id));
      const insertAt = scene.objects.findIndex((object) => object.id === root.id);
      scene.objects.splice(insertAt >= 0 ? insertAt : scene.objects.length, 0, nextRoot, ...nextObjects.filter((object) => !scene.objects.some((candidate) => candidate.id === object.id)));
      updated += 1;
    }
  }
  return updated;
}

export function recordPrefabOverride(object: GameObject, patch: Record<string, unknown>): void {
  if (!object.prefabId || !object.prefabInstanceId) return;
  const overrides = { ...(object.prefabOverrides ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "transform" && value && typeof value === "object") {
      overrides.transform = { ...((overrides.transform as Record<string, unknown> | undefined) ?? {}), ...(plain(value) as Record<string, unknown>) };
    } else {
      overrides[key] = cloneValue(value);
    }
  }
  object.prefabOverrides = overrides;
}

export function detachPrefabInstance(scene: Scene, instanceId: string): number {
  let detached = 0;
  for (const object of scene.objects) {
    if (object.prefabInstanceId !== instanceId) continue;
    delete object.prefabId;
    delete object.prefabInstanceId;
    delete object.prefabSlot;
    delete object.prefabOverrides;
    detached += 1;
  }
  return detached;
}
