import type { Asset } from "../model/schema";

export interface ColliderBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const cache = new Map<string, ColliderBounds>();

export function clearColliderCache(assetId?: string): void {
  if (assetId) cache.delete(assetId);
  else cache.clear();
}

export async function fitColliderToAsset(asset: Asset, frameIndex = 0): Promise<ColliderBounds | null> {
  const cacheKey = `${asset.id}:${frameIndex}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { readAssetBlob } = await import("../persistence/indexeddb");
  const blob = await readAssetBlob(asset.id);
  if (!blob) return null;

  const bitmap = await createImageBitmap(blob);
  const frame = asset.slices?.[frameIndex];
  const region = frame
    ? { x: frame.x, y: frame.y, w: frame.w, h: frame.h }
    : { x: 0, y: 0, w: bitmap.width, h: bitmap.height };

  let minX = region.w;
  let minY = region.h;
  let maxX = 0;
  let maxY = 0;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(region.x, region.y, region.w, region.h).data;
  for (let y = 0; y < region.h; y += 1) {
    for (let x = 0; x < region.w; x += 1) {
      const alpha = pixels[(y * region.w + x) * 4 + 3] as number;
      if (alpha > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  bitmap.close();

  if (maxX < minX || maxY < minY) {
    const result = { x: 0, y: 0, width: region.w, height: region.h };
    cache.set(cacheKey, result);
    return result;
  }
  const result = {
    x: region.x + minX,
    y: region.y + minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  cache.set(cacheKey, result);
  return result;
}
