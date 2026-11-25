import { Rectangle, Texture } from "pixi.js";

const textures = new Map<string, Texture>();
const urls = new Map<string, string>();
const loading = new Map<string, Promise<Texture | null>>();
const frames = new Map<string, Texture>();

export function getTexture(assetId: string): Texture | null {
  return textures.get(assetId) ?? null;
}

export function setTexture(assetId: string, texture: Texture): void {
  textures.set(assetId, texture);
}

export async function ensureTexture(assetId: string, url: string): Promise<Texture | null> {
  const existing = textures.get(assetId);
  if (existing) return existing;
  const pending = loading.get(assetId);
  if (pending) return pending;

  urls.set(assetId, url);
  const promise = (async () => {
    try {
      // Imported assets are stored as blob URLs, which carry no file extension
      // for Pixi's asset parser to detect. Decode the bitmap directly instead.
      const image = new Image();
      image.src = url;
      await image.decode();
      const texture = Texture.from(image);
      textures.set(assetId, texture);
      return texture;
    } catch {
      return null;
    }
  })();
  loading.set(assetId, promise);
  const result = await promise;
  loading.delete(assetId);
  return result;
}

/**
 * Sub-rectangle views of a loaded texture (atlas frames, cropped art). Cached by
 * geometry so animated sprites reuse one GPU texture per frame instead of
 * allocating a new Texture every render.
 */
export function getFrameTexture(assetId: string, rect: { x: number; y: number; w: number; h: number }): Texture | null {
  const texture = textures.get(assetId);
  if (!texture) return null;
  const key = `${assetId}:${rect.x},${rect.y},${rect.w},${rect.h}`;
  const cached = frames.get(key);
  if (cached) return cached;
  const frame = new Texture({ source: texture.source, frame: new Rectangle(rect.x, rect.y, rect.w, rect.h) });
  frames.set(key, frame);
  return frame;
}

export function disposeTexture(assetId: string): void {
  for (const [key, frame] of frames) {
    if (!key.startsWith(`${assetId}:`)) continue;
    frame.destroy(false);
    frames.delete(key);
  }
  const texture = textures.get(assetId);
  if (texture) texture.destroy(true);
  textures.delete(assetId);
  const url = urls.get(assetId);
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  urls.delete(assetId);
}
