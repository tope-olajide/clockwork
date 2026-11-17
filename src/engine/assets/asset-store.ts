import { newAssetId } from "../model/factory";
import type { Asset, ProjectDocument } from "../model/schema";
import { readAssetBlob, writeAssetBlob, deleteAssetBlob } from "../persistence/indexeddb";

export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

const SUPPORTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
]);

export function isSupportedAssetFile(file: File): boolean {
  return SUPPORTED_MIME.has(file.type) || file.name.toLowerCase().endsWith(".svg");
}

export async function sha256Bytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function assetKindForMime(mime: string): Asset["kind"] {
  if (mime.startsWith("audio/")) return "audio";
  return "image";
}

async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number } | undefined> {
  try {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return undefined;
  }
}

export async function generateThumbnail(blob: Blob, mime: string): Promise<string | undefined> {
  if (!mime.startsWith("image/")) return undefined;
  try {
    const bitmap = await createImageBitmap(blob);
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return undefined;
    }
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

export interface ImportAssetResult {
  asset: Asset;
  reused: boolean;
}

export async function importAssetFile(file: File, document: ProjectDocument): Promise<ImportAssetResult> {
  if (file.size > MAX_ASSET_BYTES) {
    throw new Error("That file is larger than 20 MB.");
  }
  if (!isSupportedAssetFile(file)) {
    throw new Error("Unsupported file type.");
  }

  const bytes = await file.arrayBuffer();
  const hash = await sha256Bytes(bytes);
  const existing = document.assets.find((asset) => asset.hash === hash);
  if (existing) {
    return { asset: existing, reused: true };
  }

  const blob = new Blob([bytes], { type: file.type || "application/octet-stream" });
  const dimensions = await readImageDimensions(blob);
  const thumbnail = await generateThumbnail(blob, file.type);
  const id = newAssetId();
  await writeAssetBlob(id, blob);

  const asset: Asset = {
    id,
    name: file.name,
    kind: assetKindForMime(file.type),
    hash,
    mime: file.type || "application/octet-stream",
    width: dimensions?.width,
    height: dimensions?.height,
    size: file.size,
    tags: [],
    thumbnail,
  };
  return { asset, reused: false };
}

export async function removeAssetBlob(assetId: string): Promise<void> {
  await deleteAssetBlob(assetId);
}

export { readAssetBlob, writeAssetBlob, deleteAssetBlob };
