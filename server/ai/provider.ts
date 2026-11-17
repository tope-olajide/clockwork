export interface ResolvedProvider {
  kind: "mock" | "openai-compatible" | "missing";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  label: string;
}

export function resolveProvider(requestedModelId: string): ResolvedProvider {
  if (process.env.AI_MOCK === "1") {
    return { kind: "mock", label: "MOCK" };
  }
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const apiKey = process.env.AI_API_KEY?.trim();
  const model = requestedModelId && requestedModelId !== "env" ? requestedModelId : process.env.AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) {
    return { kind: "missing", label: "No model configured", baseUrl, apiKey, model };
  }
  return { kind: "openai-compatible", baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model, label: model };
}
