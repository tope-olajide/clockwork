import { CURATED_MODELS } from "./catalog";
import { getDefaultModelId, getModel, listAllModels, listProviders, getKeyStatus } from "./store";

export function providersResponse() {
  return listProviders().map((p) => ({
    id: p.id,
    name: p.name,
    apiStyle: p.apiStyle,
    baseUrl: p.baseUrl,
    envKeyName: "envKeyName" in p ? p.envKeyName : undefined,
    builtIn: (p as any).builtIn ?? false,
    local: (p as any).local ?? false,
    key: getKeyStatus(p.id),
  }));
}

export function modelsResponse(providerId?: string) {
  const models = providerId ? listAllModels().filter((m) => m.providerId === providerId) : listAllModels();
  return models.map((m) => ({
    id: m.id,
    providerId: m.providerId,
    label: m.label,
    contextWindow: m.contextWindow,
    tools: m.tools,
    vision: m.vision,
    recommended: Boolean((m as any).recommended),
    custom: Boolean((m as any).custom),
  }));
}

export function settingsResponse() {
  const def = getDefaultModelId();
  return { defaultModelId: def ?? null, mock: process.env.AI_MOCK === "1" };
}
