import type { Asset, GameObject, ProjectDocument } from "../model/schema";
import { writeAssetBlob } from "../persistence/indexeddb";
import { generateThumbnail, sha256Bytes } from "./asset-store";
import { PLATFORMER_ASSETS, STARTER_ASSETS, STARTER_ASSET_IDS } from "./starter-manifest";
import { isGameStarterOrigin } from "../model/game-starters/catalog";

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.blob();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the starter art."));
    image.src = url;
  });
}

/** Draw an SVG into a canvas so the stored asset behaves like a normal PNG import. */
async function rasterizeSvg(blob: Blob, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = window.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Could not rasterize the starter art.");
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Seeds the bundled starter art into a newly created project. Safe to call more
 * than once: existing stable ids are skipped, and a single missing file never
 * prevents the project from being created.
 */
async function seedAssetSpecs(document: ProjectDocument, specs: typeof STARTER_ASSETS): Promise<ProjectDocument> {
  const existingIds = new Set(document.assets.map((asset) => asset.id));
  const added: Asset[] = [];

  for (const spec of specs) {
    if (existingIds.has(spec.id)) continue;
    try {
      const source = await fetchBlob(spec.url);
      const blob =
        spec.kind === "image" && spec.mime === "image/svg+xml" && spec.width && spec.height
          ? await rasterizeSvg(source, spec.width, spec.height)
          : source;
      const hash = await sha256Bytes(await blob.arrayBuffer());
      const asset: Asset = {
        id: spec.id,
        name: spec.name,
        kind: spec.mime.startsWith("audio/") ? "audio" : "image",
        hash,
        mime: blob.type || (spec.kind === "audio" ? spec.mime : "image/png"),
        width: spec.width,
        height: spec.height,
        size: blob.size,
        tags: ["starter", ...(spec.tags ?? [])],
        thumbnail: spec.kind === "image" ? await generateThumbnail(blob, "image/png") : undefined,
        slices: spec.slices,
        animations: spec.animations,
      };
      await writeAssetBlob(spec.id, blob);
      added.push(asset);
      existingIds.add(spec.id);
    } catch (error) {
      console.warn(`[clockwork] Starter asset failed: ${spec.url}`, error);
    }
  }

  if (added.length > 0) {
    document.assets = [...document.assets, ...added];
  }
  return document;
}

/** Seeds only the bundled starter art used by the legacy templates. */
export async function seedStarterAssets(document: ProjectDocument): Promise<ProjectDocument> {
  return seedAssetSpecs(document, STARTER_ASSETS);
}

/** Seeds the original platformer art pack without rewriting a hand-authored starter. */
export async function seedPlatformerAssets(document: ProjectDocument): Promise<ProjectDocument> {
  return seedAssetSpecs(document, PLATFORMER_ASSETS);
}

function sprite(object: GameObject, assetId: string, width: number, height: number): void {
  object.visual = { kind: "sprite", assetId, width, height, frame: 0 };
}

function upgradeObject(object: GameObject): void {
  const visual = object.visual;
  if (visual?.kind === "sprite" || visual?.kind === "tilemap") return;
  const width = visual?.kind === "rect" ? visual.width : object.body?.width ?? 64;
  const height = visual?.kind === "rect" ? visual.height : object.body?.height ?? 64;
  const tags = object.tags;
  const name = object.name.toLowerCase();

  if (tags.includes("sky")) {
    sprite(object, STARTER_ASSET_IDS.sky, width, height);
    return;
  }
  if (name.includes("moon")) {
    sprite(object, STARTER_ASSET_IDS.moon, width, height);
    return;
  }
  if (tags.includes("player")) {
    sprite(object, STARTER_ASSET_IDS.player, width, height);
    object.animations = { idle: "starter-idle", run: "starter-run", jump: "starter-jump" };
    return;
  }
  if (tags.includes("coin") || tags.includes("core") || tags.includes("key")) {
    sprite(object, STARTER_ASSET_IDS.coin, width, height);
    return;
  }
  if (tags.includes("hazard")) {
    sprite(object, STARTER_ASSET_IDS.hazard, width, height);
    return;
  }
  if (tags.includes("enemy")) {
    sprite(object, STARTER_ASSET_IDS.drone, width, height);
    return;
  }
  if (tags.includes("checkpoint") || tags.includes("goal")) {
    sprite(object, STARTER_ASSET_IDS.flag, width, height);
    return;
  }
  if (tags.includes("ground") || tags.includes("floor")) {
    sprite(object, height <= 48 ? STARTER_ASSET_IDS.platform : STARTER_ASSET_IDS.ground, width, height);
    return;
  }
  if (tags.includes("wall")) {
    sprite(object, STARTER_ASSET_IDS.ground, width, height);
    return;
  }
  if (tags.includes("ui")) return;
  if (name.includes("ridge foreground")) {
    sprite(object, STARTER_ASSET_IDS.hillNear, width, height);
    return;
  }
  if (name.includes("ridge detail")) {
    sprite(object, STARTER_ASSET_IDS.hillMid, width, height);
    return;
  }
  if (name.includes("ridge")) {
    sprite(object, STARTER_ASSET_IDS.hillFar, width, height);
  }
}

/**
 * Turns the rect placeholders in the built-in templates into sprite visuals that
 * reference the stable starter asset ids. Objects, ids, transforms, bodies,
 * tags and rules are untouched; if seeding failed the renderer falls back to a
 * tinted rect rather than breaking the project.
 */
export function applyStarterVisuals(document: ProjectDocument): ProjectDocument {
  if (isGameStarterOrigin(document.templateOrigin)) return document;
  for (const scene of document.scenes) {
    for (const object of scene.objects) upgradeObject(object);
  }
  for (const prefab of document.prefabs) {
    upgradeObject(prefab.root);
    for (const object of prefab.objects) upgradeObject(object);
  }
  return document;
}
