import type { SnapshotAsset, SnapshotCreateResult, SnapshotPayload } from "@shared/snapshot";
import type { ProjectDocument } from "../model/schema";
import { readAssetBlob } from "../persistence/indexeddb";

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new SnapshotError("Could not read an asset from local storage."));
    reader.readAsDataURL(blob);
  });
}

export async function collectProjectAssets(document: ProjectDocument): Promise<SnapshotAsset[]> {
  const assets: SnapshotAsset[] = [];
  for (const asset of document.assets) {
    const blob = await readAssetBlob(asset.id);
    if (!blob) throw new SnapshotError(`Asset “${asset.name}” is missing from local storage. Save the project and try again.`);
    assets.push({ id: asset.id, dataUrl: await blobToDataUrl(blob), mime: asset.mime || blob.type || undefined });
  }
  return assets;
}

export async function createSnapshot(document: ProjectDocument, options: { assets?: SnapshotAsset[]; ttlHours?: number } = {}): Promise<SnapshotCreateResult> {
  const assets = options.assets ?? await collectProjectAssets(document);
  const response = await fetch("/api/snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document, assets, ttlHours: options.ttlHours ?? 24 }),
  });
  const result = (await response.json().catch(() => null)) as (SnapshotCreateResult & { ok?: boolean; error?: string }) | null;
  if (!response.ok || !result?.id) {
    throw new SnapshotError(result?.error || `Snapshot failed (HTTP ${response.status}).`);
  }
  return { id: result.id, url: `${window.location.origin}/s/${result.id}`, expiresAt: result.expiresAt };
}

export async function readSnapshot(id: string): Promise<SnapshotPayload> {
  const response = await fetch(`/api/snapshots/${encodeURIComponent(id)}`);
  const result = (await response.json().catch(() => null)) as { ok?: boolean; snapshot?: SnapshotPayload; error?: string } | null;
  if (!response.ok || !result?.snapshot) {
    throw new SnapshotError(result?.error || "Snapshot not found or expired.");
  }
  return result.snapshot;
}

export async function deleteSnapshot(id: string): Promise<void> {
  const response = await fetch(`/api/snapshots/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new SnapshotError(result?.error || "Snapshot could not be deleted.");
  }
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  return Math.max(0, Math.floor(((dataUrl.length - comma - 1) * 3) / 4));
}
