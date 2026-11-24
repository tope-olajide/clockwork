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

function resolveEnvModel(): ResolvedModelOk | null {
  const model = process.env.LLM_MODEL?.trim() || process.env.AI_MODEL?.trim();
  const baseUrl = process.env.LLM_BASE_URL?.trim() || process.env.AI_BASE_URL?.trim();
  const apiKey = process.env.LLM_API_KEY?.trim() || process.env.AI_API_KEY?.trim();
  if (!model || !baseUrl) return null;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  // Check if this is a local endpoint that doesn't require an API key
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(normalizedBaseUrl);
  return {
    kind: "ok",
    providerId: "env",
    model,
    fullModelId: `env:${model}`,
    apiStyle: "openai-compatible",
    baseUrl: normalizedBaseUrl,
    apiKey: apiKey ?? (isLocal ? "dummy-key-for-local" : ""),
    tools: true,
    vision: false,
    contextWindow: 128_000,
  };
}

export function resolveModel(requestedModelId?: string): ResolvedModel {
  if (isMockEnabled()) return { kind: "mock", label: "MOCK" };

  const requested = requestedModelId || getDefaultModelId();
  if (!requested) {
    // A single-provider .env.local setup is enough to run the agent without
    // first adding a custom provider and API key in Settings.
    const fromEnv = resolveEnvModel();
    if (fromEnv) return fromEnv;
  }

  const modelId = requested || process.env.AI_MODEL;
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
  // Allow local providers without key (ollama, local endpoints, etc.)
  const isLocalProvider = (provider as any).local || (provider.id === "ollama") || 
    (provider.id === "env" && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(provider.baseUrl));
  if (!apiKey && !isLocalProvider) {
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
