import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { SnapshotAsset, SnapshotPayload } from "../../shared/snapshot";
import { SNAPSHOT_FORMAT, SNAPSHOT_VERSION } from "../../shared/snapshot";

interface SnapshotRow {
  id: string;
  payload: string;
  created_at: string;
  expires_at: string;
}

const DB_PATH = join(process.cwd(), ".data", "snapshots.sqlite");
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS snapshots_expires ON snapshots(expires_at);
`);

const insert = db.prepare("INSERT INTO snapshots (id, payload, created_at, expires_at) VALUES (?, ?, ?, ?)");
const select = db.prepare("SELECT id, payload, created_at, expires_at FROM snapshots WHERE id = ?");
const remove = db.prepare("DELETE FROM snapshots WHERE id = ?");
const cleanup = db.prepare("DELETE FROM snapshots WHERE expires_at <= ?");

function purgeExpired(): void {
  cleanup.run(new Date().toISOString());
}

export interface StoredSnapshot {
  id: string;
  payload: SnapshotPayload;
  createdAt: string;
  expiresAt: string;
}

export function createSnapshot(document: Record<string, unknown>, assets: SnapshotAsset[], ttlHours = 24): StoredSnapshot {
  purgeExpired();
  const id = randomBytes(10).toString("base64url");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(168, ttlHours)) * 60 * 60 * 1000).toISOString();
  const payload: SnapshotPayload = {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    id,
    createdAt,
    expiresAt,
    document,
    assets,
  };
  insert.run(id, JSON.stringify(payload), createdAt, expiresAt);
  return { id, payload, createdAt, expiresAt };
}

export function getSnapshot(id: string): StoredSnapshot | null {
  purgeExpired();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  const row = select.get(id) as SnapshotRow | undefined;
  if (!row) return null;
  if (row.expires_at <= new Date().toISOString()) {
    remove.run(id);
    return null;
  }
  try {
    const payload = JSON.parse(row.payload) as SnapshotPayload;
    return { id: row.id, payload, createdAt: row.created_at, expiresAt: row.expires_at };
  } catch {
    remove.run(id);
    return null;
  }
}

export function deleteSnapshot(id: string): boolean {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return false;
  return remove.run(id).changes > 0;
}

export function snapshotCount(): number {
  purgeExpired();
  const row = db.prepare("SELECT COUNT(*) AS count FROM snapshots").get() as { count: number };
  return row.count;
}
