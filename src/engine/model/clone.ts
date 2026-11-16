import { newBehaviorId, newLayerId, newObjectId, newProjectId, newRuleId, newSceneId, nowIso } from "./factory";
import type { GameObject, ProjectDocument, Scene } from "./schema";

function cloneObject(object: GameObject, idMap: Map<string, string>): GameObject {
  const id = newObjectId();
  idMap.set(object.id, id);
  return {
    ...structuredClone(object),
    id,
  };
}

export function cloneScene(scene: Scene, name = scene.name): Scene {
  const idMap = new Map<string, string>();
  const layerMap = new Map<string, string>();
  const layers = scene.layers.map((layer) => {
    const id = newLayerId();
    layerMap.set(layer.id, id);
    return { ...structuredClone(layer), id, name: layer.name };
  });
  const objects = scene.objects.map((object) => {
    const cloned = cloneObject(object, idMap);
    return {
      ...cloned,
      layerId: layerMap.get(object.layerId) ?? cloned.layerId,
      behaviors: cloned.behaviors.map((behavior) => ({ ...behavior, id: newBehaviorId() })),
    };
  });
  const objectIdMap = idMap;
  for (const object of objects) {
    if (object.parentId) object.parentId = objectIdMap.get(object.parentId) ?? object.parentId;
  }
  const sceneId = newSceneId();
  const remap = (value?: string) => (value ? objectIdMap.get(value) ?? value : value);
  const rules = scene.rules.map((rule) => {
    const cloned = structuredClone(rule);
    cloned.id = newRuleId();
    cloned.when = cloned.when.map((condition) => {
      if (condition.kind === "overlap") {
        return { ...condition, objectId: remap(condition.objectId), otherId: remap(condition.otherId) };
      }
      return condition;
    });
    cloned.do = cloned.do.map((action) => {
      if (action.kind === "destroy") return { ...action, objectId: remap(action.objectId) };
      if (action.kind === "set-behavior-param") {
        return { ...action, objectId: remap(action.objectId) ?? action.objectId };
      }
      if (action.kind === "go-scene") return { ...action, sceneId };
      return action;
    });
    return cloned;
  });
  return {
    ...structuredClone(scene),
    id: sceneId,
    name,
    layers,
    objects,
    rules,
  };
}

export function duplicateProjectDocument(document: ProjectDocument, name: string): ProjectDocument {
  const scenes = document.scenes.map((scene) => cloneScene(scene));
  const time = nowIso();
  return {
    ...structuredClone(document),
    id: newProjectId(),
    name,
    revision: 0,
    createdAt: time,
    updatedAt: time,
    archivedAt: undefined,
    scenes,
    startSceneId:
      scenes[document.scenes.findIndex((scene) => scene.id === document.startSceneId)]?.id ??
      scenes[0]?.id ??
      document.startSceneId,
    variables: structuredClone(document.variables),
    assets: structuredClone(document.assets),
    prefabs: structuredClone(document.prefabs),
  };
}
