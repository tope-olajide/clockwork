import { getDefaultModelId, getModel, getProvider, listAllModels, resolveApiKey } from "./store";

export interface ResolvedModelOk {
  kind: "ok";
  providerId: string;
  model: string; // provider-native model id (after prefix)
  fullModelId: string;
  apiStyle: string;
  baseUrl: string;
  apiKey: string;
  tools: boolean;
  vision: boolean;
  contextWindow: number;
}

export type ResolvedModel =
  | { kind: "mock"; label: string }
  | { kind: "missing"; code: "no-key" | "no-model"; message: string }
  | { kind: "invalid"; code: "model-unavailable"; message: string }
  | ResolvedModelOk;

export function isMockEnabled() {
  return process.env.AI_MOCK === "1";
}

export function resolveModel(requestedModelId?: string): ResolvedModel {
  if (isMockEnabled()) return { kind: "mock", label: "MOCK" };

  const modelId = requestedModelId || getDefaultModelId() || process.env.AI_MODEL;
  if (!modelId) {
    return { kind: "missing", code: "no-model", message: "No model configured. Open Settings to choose a model or set AI_MODEL." };
  }

  const model = getModel(modelId);
  if (!model) {
    return { kind: "invalid", code: "model-unavailable", message: `Model "${modelId}" is not available.` };
  }

  const provider = getProvider(model.providerId);
  if (!provider) {
    return { kind: "invalid", code: "model-unavailable", message: `Provider "${model.providerId}" is not available.` };
  }

  const apiKey = resolveApiKey(model.providerId);
  // Allow local providers without key if explicitly ollama/local and no env requirement? keep strict except ollama may be empty in some setups; but better require configured
  if (!apiKey && !(provider.id === "ollama" && (provider as any).local)) {
    return { kind: "missing", code: "no-key", message: `No API key configured for ${provider.name}.` };
  }

  const raw = model.id.includes(":") ? model.id.slice(model.id.indexOf(":") + 1) : model.id;
  return {
    kind: "ok",
    providerId: provider.id,
    model: raw,
    fullModelId: model.id,
    apiStyle: provider.apiStyle,
    baseUrl: provider.baseUrl,
    apiKey: apiKey ?? "",
    tools: model.tools,
    vision: model.vision,
    contextWindow: model.contextWindow,
  };
}

export function listAvailableModels() {
  // models whose provider has a configured key (env/vault/session) OR ollama local with no key required
  return listAllModels().filter((m) => {
    const statusKey = resolveApiKey(m.providerId);
    if (statusKey) return true;
    const p = getProvider(m.providerId);
    return p?.id === "ollama";
  });
}

export function resolveProvider(requestedModelId?: string) {
  // backward-compat name used by existing route; replaced below
  return resolveModel(requestedModelId);
}
