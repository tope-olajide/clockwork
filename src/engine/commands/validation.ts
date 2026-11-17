import { projectDocumentSchema, type ProjectDocument } from "../model/schema";

export class CommandError extends Error {
  code:
    | "SCHEMA"
    | "NOT_FOUND"
    | "CONFLICT"
    | "READ_ONLY"
    | "INVALID_REFERENCE"
    | "INVARIANT"
    | "REVISION";

  constructor(code: CommandError["code"], message: string) {
    super(message);
    this.name = "CommandError";
    this.code = code;
  }
}

export function validateDocument(document: ProjectDocument): void {
  const parsed = projectDocumentSchema.safeParse(document);
  if (!parsed.success) {
    throw new CommandError("SCHEMA", parsed.error.issues[0]?.message ?? "Document failed schema validation.");
  }

  const sceneIds = new Set<string>();
  for (const scene of document.scenes) {
    if (sceneIds.has(scene.id)) throw new CommandError("INVARIANT", `Duplicate scene id: ${scene.id}`);
    sceneIds.add(scene.id);
    if (scene.size.w <= 0 || scene.size.h <= 0) {
      throw new CommandError("INVARIANT", "Scene dimensions must be greater than zero.");
    }
    if (scene.layers.length === 0) throw new CommandError("INVARIANT", "Every scene needs at least one layer.");

    const layerIds = new Set<string>();
    for (const layer of scene.layers) {
      if (layerIds.has(layer.id)) throw new CommandError("INVARIANT", `Duplicate layer id: ${layer.id}`);
      layerIds.add(layer.id);
    }

    const objectIds = new Set<string>();
    for (const object of scene.objects) {
      if (objectIds.has(object.id)) throw new CommandError("INVARIANT", `Duplicate object id: ${object.id}`);
      objectIds.add(object.id);
      if (!layerIds.has(object.layerId)) {
        throw new CommandError("INVALID_REFERENCE", `Object ${object.name} points to a missing layer.`);
      }
      if (object.parentId && !scene.objects.some((candidate) => candidate.id === object.parentId)) {
        throw new CommandError("INVALID_REFERENCE", `Object ${object.name} points to a missing parent.`);
      }
    }

    for (const object of scene.objects) {
      let cursor = object.parentId;
      const seen = new Set<string>();
      while (cursor) {
        if (seen.has(cursor) || cursor === object.id) {
          throw new CommandError("INVARIANT", `Parent cycle detected at ${object.name}.`);
        }
        seen.add(cursor);
        cursor = scene.objects.find((candidate) => candidate.id === cursor)?.parentId;
      }
    }

    // Rule references may become stale after deletions; runtime flags and refuses them.
  }

  if (!sceneIds.has(document.startSceneId)) {
    throw new CommandError("INVALID_REFERENCE", "The project start scene does not exist.");
  }
}
