import type { AiPlayResult } from "@shared/protocol/kane";
import type { GameObject, ProjectDocument, Scene } from "../model/schema";

export interface AiPlayRepair {
  summary: string;
  diagnosis: string;
  sceneId: string;
  objectId: string;
  objectName: string;
  command: { type: "object.update"; args: { sceneId: string; objectId: string; patch: { transform: GameObject["transform"] } } };
}

function visualSize(object: GameObject): { w: number; h: number } {
  if (object.visual?.kind === "rect") return { w: object.visual.width, h: object.visual.height };
  if (object.visual?.kind === "sprite") return { w: object.visual.width ?? 24, h: object.visual.height ?? 24 };
  if (object.visual?.kind === "text") return { w: 80, h: object.visual.style.size };
  return { w: 24, h: 24 };
}

function solidBounds(object: GameObject) {
  if (object.body?.type !== "static" && object.body?.type !== "kinematic") return null;
  const width = object.body.width;
  const height = object.body.height;
  return {
    left: object.transform.x + object.body.offsetX - width / 2,
    right: object.transform.x + object.body.offsetX + width / 2,
    top: object.transform.y + object.body.offsetY - height / 2,
    bottom: object.transform.y + object.body.offsetY + height / 2,
  };
}

function findEmbeddedCoin(scene: Scene): { coin: GameObject; solid: GameObject } | null {
  const coins = scene.objects.filter((object) => object.tags.includes("coin") || object.behaviors.some((behavior) => behavior.type === "collectible"));
  for (const coin of coins) {
    const size = visualSize(coin);
    const left = coin.transform.x - size.w / 2;
    const right = coin.transform.x + size.w / 2;
    const top = coin.transform.y - size.h / 2;
    const bottom = coin.transform.y + size.h / 2;
    for (const object of scene.objects) {
      const bounds = solidBounds(object);
      if (!bounds) continue;
      const overlaps = left < bounds.right && right > bounds.left && top < bounds.bottom && bottom > bounds.top;
      if (overlaps) return { coin, solid: object };
    }
  }
  return null;
}

/**
 * Deterministic, non-destructive content repair used by Auto-fix. It only
 * moves one coin out of a solid; it never deletes content and commits as one
 * undoable object.update command.
 */
export function repairAiPlayFailure(document: ProjectDocument, result: AiPlayResult): AiPlayRepair | null {
  const coins = Number.parseInt(result.finalState.coins ?? "", 10);
  if (Number.isFinite(coins) && result.steps.length > 0) {
    // The assertion tells us the count; the geometry below tells us the cause.
  }
  const scene = document.scenes.find((candidate) => candidate.id === document.startSceneId) ?? document.scenes[0];
  if (!scene) return null;
  const embedded = findEmbeddedCoin(scene);
  if (!embedded) return null;
  const { coin, solid } = embedded;
  const size = visualSize(coin);
  const top = solidBounds(solid)?.top ?? coin.transform.y;
  const y = Math.max(size.h / 2 + 12, top - size.h / 2 - 24);
  const x = Math.max(size.w / 2 + 12, Math.min(scene.size.w - size.w / 2 - 12, coin.transform.x));
  return {
    summary: `Move ${coin.name} out of ${solid.name}`,
    diagnosis: `${coin.name} is embedded in ${solid.name}, so the collider prevents collection. Moving it above the platform makes it reachable.`,
    sceneId: scene.id,
    objectId: coin.id,
    objectName: coin.name,
    command: {
      type: "object.update",
      args: {
        sceneId: scene.id,
        objectId: coin.id,
        patch: { transform: { ...coin.transform, x, y } },
      },
    },
  };
}
