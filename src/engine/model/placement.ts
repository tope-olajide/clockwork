import type { Body, GameObject, Visual } from "./schema";

/**
 * Placement helpers shared by the game starters.
 *
 * The engine treats an object's transform as the centre of its visual and its
 * body as an axis-aligned box centred on `transform + body.offset*`. An object
 * that has a visual but no body (or a body smaller than the art) therefore has
 * two different lower edges. These helpers make ground placement explicit
 * instead of relying on hand-tuned centre coordinates, which is what previously
 * let characters, spikes and rocks hover above the terrain.
 */

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Size of the art that is drawn for an object. */
export function visualSize(object: GameObject): Size {
  const visual: Visual | undefined = object.visual;
  if (visual?.kind === "rect") return { w: visual.width, h: visual.height };
  if (visual?.kind === "shape") return { w: visual.width, h: visual.height };
  if (visual?.kind === "sprite") {
    const rect = visual.sourceRect;
    return { w: visual.width ?? rect?.w ?? 32, h: visual.height ?? rect?.h ?? 32 };
  }
  if (visual?.kind === "tilemap") return { w: visual.cols * visual.tileSize, h: visual.rows * visual.tileSize };
  if (visual?.kind === "text") {
    const longest = visual.text.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
    return {
      w: Math.max(40, longest * visual.style.size * 0.58),
      h: Math.max(visual.style.size, visual.text.split("\n").length * visual.style.size * 1.3),
    };
  }
  return object.body ? { w: object.body.width, h: object.body.height } : { w: 24, h: 24 };
}

/** Size of the collision box, falling back to the art when there is no body. */
export function collisionSize(object: GameObject): Size {
  return object.body ? { w: object.body.width, h: object.body.height } : visualSize(object);
}

/** Collision box in world units for an object at (x, y). */
export function collisionRect(object: GameObject, x = object.transform.x, y = object.transform.y): Rect {
  const { w, h } = collisionSize(object);
  const offsetX = object.body?.offsetX ?? 0;
  const offsetY = object.body?.offsetY ?? 0;
  const left = x + offsetX - w / 2;
  const top = y + offsetY - h / 2;
  return { left, top, right: left + w, bottom: top + h, width: w, height: h };
}

/** Art bounds in world units for an object at (x, y). */
export function visualRect(object: GameObject, x = object.transform.x, y = object.transform.y): Rect {
  const { w, h } = visualSize(object);
  const left = x - w / 2;
  const top = y - h / 2;
  return { left, top, right: left + w, bottom: top + h, width: w, height: h };
}

/** Lowest point the player can see or stand on, whichever is lower. */
export function objectBottom(object: GameObject): number {
  return Math.max(visualRect(object).bottom, object.body ? collisionRect(object).bottom : Number.NEGATIVE_INFINITY);
}

/**
 * Move an object vertically so its lowest visible/collision edge sits on a
 * surface. `gap` lifts it slightly (positive) to leave grass clearance.
 */
export function placeOnGround<T extends GameObject>(object: T, surfaceY: number, gap = 0): T {
  const bottom = objectBottom(object);
  object.transform.y += surfaceY - gap - bottom;
  return object;
}

/** Top edge of the collider when there is one, otherwise of the art. */
export function surfaceTopOf(object: GameObject): number {
  if (object.body) return object.transform.y + object.body.offsetY - object.body.height / 2;
  return visualRect(object).top;
}

/**
 * Move an object so its collision surface (the walkable top of a floor or ledge)
 * sits exactly on `surfaceY`. This is the placement primitive that keeps sprites,
 * hazards and characters on the same ground line.
 */
export function placeSurfaceAt<T extends GameObject>(object: T, surfaceY: number): T {
  object.transform.y += surfaceY - surfaceTopOf(object);
  return object;
}

/** Move an object so its art top sits on `topY` (tops of jump-through ledges). */
export function placeArtTopAt<T extends GameObject>(object: T, topY: number): T {
  object.transform.y += topY - visualRect(object).top;
  return object;
}

/**
 * Fit a body to an object's art.
 *
 * `surfaceInset` is the distance from the art's top to the walkable surface
 * (grass tufts and outline padding above a ledge's surface, for example). The
 * body then spans from that surface to the bottom of the art, so landing height
 * and art height agree exactly.
 */
export function bodyFromArt(
  object: GameObject,
  options: {
    widthRatio?: number;
    heightRatio?: number;
    surfaceInset?: number;
    /** Solid slab of this thickness hanging from the walkable surface. */
    depth?: number;
    oneWay?: boolean;
    type?: Body["type"];
  } = {},
): void {
  const art = visualSize(object);
  const inset = Math.min(art.h - 1, Math.max(0, options.surfaceInset ?? 0));
  const width = Math.max(1, art.w * (options.widthRatio ?? 1));
  const depth = options.depth === undefined ? null : Math.max(1, Math.min(art.h - inset, options.depth));
  const height = depth ?? Math.max(1, (art.h - inset) * (options.heightRatio ?? 1));
  object.body = {
    type: options.type ?? "static",
    width,
    height,
    offsetX: 0,
    // By default the collider's bottom sits on the art's bottom and a surface
    // inset lifts the top onto the walkable surface. A `depth` instead hangs a
    // solid slab from that surface, so a ledge blocks its edges without the
    // deep collider turning the space beneath it into a low ceiling.
    offsetY: depth === null ? art.h / 2 - height / 2 : inset + height / 2 - art.h / 2,
    gravityScale: 1,
    collideWorldBounds: false,
    oneWay: options.oneWay ?? false,
  };
}
