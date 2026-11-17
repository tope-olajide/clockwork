export const SNAPSHOT_FORMAT = "clockwork-snapshot";
export const SNAPSHOT_VERSION = 1;
export const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
export const MAX_SNAPSHOT_ASSETS = 500;

export interface SnapshotAsset {
  id: string;
  dataUrl: string;
  mime?: string;
}

export interface SnapshotPayload {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  id: string;
  createdAt: string;
  expiresAt: string;
  document: Record<string, unknown>;
  assets: SnapshotAsset[];
}

export interface SnapshotCreateInput {
  document: Record<string, unknown>;
  assets: SnapshotAsset[];
  ttlHours?: number;
}

export interface SnapshotCreateResult {
  id: string;
  url: string;
  expiresAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateSnapshotInput(value: unknown): { ok: true; input: SnapshotCreateInput } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "Snapshot body must be an object." };
  const document = value.document;
  if (!isRecord(document)) return { ok: false, error: "Snapshot is missing its project document." };
  if (typeof document.id !== "string" || !document.id) return { ok: false, error: "Project document is missing an id." };
  if (typeof document.name !== "string" || !document.name) return { ok: false, error: "Project document is missing a name." };
  if (!Array.isArray(document.scenes) || document.scenes.length === 0) return { ok: false, error: "Project document has no scenes." };
  if (!Array.isArray(document.assets) || !Array.isArray(document.prefabs) || !Array.isArray(document.variables)) {
    return { ok: false, error: "Project document is not a Clockwork document." };
  }
  const assets = Array.isArray(value.assets) ? value.assets : [];
  if (assets.length > MAX_SNAPSHOT_ASSETS) return { ok: false, error: `Snapshots support at most ${MAX_SNAPSHOT_ASSETS} assets.` };
  const cleanAssets: SnapshotAsset[] = [];
  for (const asset of assets) {
    if (!isRecord(asset) || typeof asset.id !== "string" || typeof asset.dataUrl !== "string") {
      return { ok: false, error: "Every snapshot asset needs an id and dataUrl." };
    }
    if (!asset.dataUrl.startsWith("data:")) return { ok: false, error: `Asset ${asset.id} is not a data URL.` };
    cleanAssets.push({ id: asset.id, dataUrl: asset.dataUrl, mime: typeof asset.mime === "string" ? asset.mime : undefined });
  }
  const ttl = Number(value.ttlHours);
  const ttlHours = Number.isFinite(ttl) ? Math.max(1, Math.min(24 * 7, ttl)) : 24;
  const input: SnapshotCreateInput = { document, assets: cleanAssets, ttlHours };
  if (new TextEncoder().encode(JSON.stringify(input)).length > MAX_SNAPSHOT_BYTES) {
    return { ok: false, error: "Snapshot is larger than 20 MB." };
  }
  return { ok: true, input };
}

export function isSnapshotPayload(value: unknown): value is SnapshotPayload {
  return isRecord(value) && value.format === SNAPSHOT_FORMAT && value.version === SNAPSHOT_VERSION && isRecord(value.document);
}
