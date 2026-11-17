import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");
const SECRET_PATH = path.join(DATA_DIR, "secret.key");
const VAULT_PATH = path.join(DATA_DIR, "vault.json");

export interface VaultRecord {
  providerId: string;
  ciphertext: string;
  iv: string;
  tag: string;
  hint: string;
  updatedAt: string;
}

interface VaultFile {
  keys: Record<string, VaultRecord>;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getSecret(): Buffer {
  ensureDataDir();
  const env = process.env.CLOCKWORK_SECRET;
  if (env && env.trim()) {
    return crypto.createHash("sha256").update(env, "utf8").digest();
  }
  if (fs.existsSync(SECRET_PATH)) {
    return fs.readFileSync(SECRET_PATH);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_PATH, key, { mode: 0o600 });
  try { fs.chmodSync(SECRET_PATH, 0o600); } catch {}
  return key;
}

function readVault(): VaultFile {
  ensureDataDir();
  if (!fs.existsSync(VAULT_PATH)) return { keys: {} };
  try {
    return JSON.parse(fs.readFileSync(VAULT_PATH, "utf8")) as VaultFile;
  } catch {
    return { keys: {} };
  }
}

function writeVault(file: VaultFile) {
  ensureDataDir();
  fs.writeFileSync(VAULT_PATH, JSON.stringify(file, null, 2), "utf8");
}

function hintFor(key: string): string {
  const t = key.trim();
  if (t.length <= 8) return "••••";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

export function saveVaultKey(providerId: string, apiKey: string): { configured: true; source: "vault"; hint: string } {
  const secret = getSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secret, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const hint = hintFor(apiKey);
  const file = readVault();
  file.keys[providerId] = {
    providerId,
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    hint,
    updatedAt: new Date().toISOString(),
  };
  writeVault(file);
  return { configured: true, source: "vault", hint };
}

export function deleteVaultKey(providerId: string) {
  const file = readVault();
  delete file.keys[providerId];
  writeVault(file);
}

export function getVaultKey(providerId: string): string | null {
  const file = readVault();
  const rec = file.keys[providerId];
  if (!rec) return null;
  try {
    const secret = getSecret();
    const decipher = crypto.createDecipheriv("aes-256-gcm", secret, Buffer.from(rec.iv, "base64"));
    decipher.setAuthTag(Buffer.from(rec.tag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(rec.ciphertext, "base64")), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

export function getVaultHint(providerId: string): string | null {
  const file = readVault();
  return file.keys[providerId]?.hint ?? null;
}

export function hasVaultKey(providerId: string): boolean {
  return Boolean(readVault().keys[providerId]);
}
