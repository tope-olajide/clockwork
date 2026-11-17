import fs from "node:fs";
import path from "node:path";
import { BUILT_IN_PROVIDERS, CURATED_MODELS, type ModelMeta } from "./catalog";
import { deleteVaultKey, getVaultHint, getVaultKey, hasVaultKey, saveVaultKey } from "./vault";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "ai-settings.json");

export interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiStyle: "openai-compatible";
  envKeyName?: string;
}

export interface CustomModel {
  id: string; // providerId:model
  providerId: string;
  label: string;
  contextWindow: number;
  tools: boolean;
  vision: boolean;
}

interface AiSettingsFile {
  customProviders: CustomProvider[];
  customModels: CustomModel[];
  defaultModelId?: string;
}

const sessionKeys = new Map<string, string>(); // providerId -> apiKey

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore(): AiSettingsFile {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) return { customProviders: [], customModels: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as AiSettingsFile;
    return { customProviders: parsed.customProviders ?? [], customModels: parsed.customModels ?? [], defaultModelId: parsed.defaultModelId };
  } catch {
    return { customProviders: [], customModels: [] };
  }
}

function writeStore(file: AiSettingsFile) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(file, null, 2), "utf8");
}

export function listProviders() {
  const store = readStore();
  const builtIn = BUILT_IN_PROVIDERS.map((p) => ({ ...p, builtIn: true as const }));
  const custom = store.customProviders.map((p) => ({ ...p, modelsEndpoint: false, local: p.baseUrl.includes("localhost") || p.baseUrl.includes("127.0.0.1"), builtIn: false as const }));
  return [...builtIn, ...custom];
}

export function getProvider(providerId: string) {
  return listProviders().find((p) => p.id === providerId) ?? null;
}

export function getKeyStatus(providerId: string): { configured: boolean; source: "env" | "vault" | "session" | "missing"; hint?: string } {
  const provider = getProvider(providerId);
  if (!provider) return { configured: false, source: "missing" };
  const envName = ("envKeyName" in provider && provider.envKeyName) ? provider.envKeyName : undefined;
  if (envName && process.env[envName]) {
    const val = process.env[envName]!;
    const hint = val.length <= 8 ? "••••" : `${val.slice(0, 4)}…${val.slice(-4)}`;
    return { configured: true, source: "env", hint };
  }
  if (hasVaultKey(providerId)) return { configured: true, source: "vault", hint: getVaultHint(providerId) ?? "••••" };
  if (sessionKeys.has(providerId)) {
    const val = sessionKeys.get(providerId)!;
    const hint = val.length <= 8 ? "••••" : `${val.slice(0, 4)}…${val.slice(-4)}`;
    return { configured: true, source: "session", hint };
  }
  return { configured: false, source: "missing" };
}

export function resolveApiKey(providerId: string): string | null {
  const provider = getProvider(providerId);
  if (!provider) return null;
  const envName = ("envKeyName" in provider && provider.envKeyName) ? provider.envKeyName : undefined;
  if (envName && process.env[envName]) return process.env[envName]!;
  const vault = getVaultKey(providerId);
  if (vault) return vault;
  return sessionKeys.get(providerId) ?? null;
}

export function setProviderKey(providerId: string, apiKey: string, mode: "vault" | "session") {
  if (mode === "vault") {
    sessionKeys.delete(providerId);
    return saveVaultKey(providerId, apiKey);
  }
  sessionKeys.set(providerId, apiKey);
  const hint = apiKey.length <= 8 ? "••••" : `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
  return { configured: true as const, source: "session" as const, hint };
}

export function removeProviderKey(providerId: string) {
  const status = getKeyStatus(providerId);
  if (status.source === "env") return { ok: false as const, error: "Environment keys are read-only." };
  sessionKeys.delete(providerId);
  deleteVaultKey(providerId);
  return { ok: true as const };
}

export function listAllModels(): (ModelMeta & { custom?: boolean })[] {
  const store = readStore();
  const custom: (ModelMeta & { custom: boolean })[] = store.customModels.map((m) => ({ ...m, custom: true }));
  return [...CURATED_MODELS, ...custom];
}

export function getModel(modelId: string) {
  return listAllModels().find((m) => m.id === modelId) ?? null;
}

export function addCustomProvider(input: { id: string; name: string; baseUrl: string }) {
  const store = readStore();
  const provider: CustomProvider = { id: input.id, name: input.name, baseUrl: input.baseUrl, apiStyle: "openai-compatible" };
  const idx = store.customProviders.findIndex((p) => p.id === provider.id);
  if (idx >= 0) store.customProviders[idx] = provider; else store.customProviders.push(provider);
  writeStore(store);
  return provider;
}

export function removeCustomProvider(id: string) {
  const store = readStore();
  store.customProviders = store.customProviders.filter((p) => p.id !== id);
  store.customModels = store.customModels.filter((m) => m.providerId !== id);
  if (store.defaultModelId?.startsWith(id + ":")) delete store.defaultModelId;
  writeStore(store);
  removeProviderKey(id);
}

export function addCustomModel(input: CustomModel) {
  const store = readStore();
  const idx = store.customModels.findIndex((m) => m.id === input.id);
  if (idx >= 0) store.customModels[idx] = input; else store.customModels.push(input);
  writeStore(store);
  return input;
}

export function removeCustomModel(id: string) {
  const store = readStore();
  store.customModels = store.customModels.filter((m) => m.id !== id);
  if (store.defaultModelId === id) delete store.defaultModelId;
  writeStore(store);
}

export function getDefaultModelId(): string | undefined {
  return readStore().defaultModelId;
}

export function setDefaultModelId(modelId: string | undefined) {
  const store = readStore();
  if (modelId) store.defaultModelId = modelId; else delete store.defaultModelId;
  writeStore(store);
}
