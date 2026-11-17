import { Assets, Texture } from "pixi.js";

const textures = new Map<string, Texture>();
const urls = new Map<string, string>();
const loading = new Map<string, Promise<Texture | null>>();

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
      const texture = await Assets.load<Texture>(url);
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

export function disposeTexture(assetId: string): void {
  const texture = textures.get(assetId);
  if (texture) texture.destroy(true);
  textures.delete(assetId);
  const url = urls.get(assetId);
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  urls.delete(assetId);
}
