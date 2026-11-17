export interface ProviderInfo {
  id: string;
  name: string;
  apiStyle: string;
  baseUrl: string;
  envKeyName?: string;
  builtIn: boolean;
  local: boolean;
  key: { configured: boolean; source: "env" | "vault" | "session" | "missing"; hint?: string };
}

export interface ModelInfo {
  id: string;
  providerId: string;
  label: string;
  contextWindow: number;
  tools: boolean;
  vision: boolean;
  recommended: boolean;
  custom: boolean;
}

async function j<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as any)?.error || `Request failed (${res.status})`), { data, status: res.status });
  return data as T;
}

export async function fetchProviders() {
  return j<{ ok: true; providers: ProviderInfo[] }>(await fetch("/api/ai/providers"));
}
export async function fetchModels(providerId?: string) {
  const q = providerId ? `?providerId=${encodeURIComponent(providerId)}` : "";
  return j<{ ok: true; models: ModelInfo[] }>(await fetch(`/api/ai/models${q}`));
}
export async function fetchAiSettings() {
  return j<{ ok: true; settings: { defaultModelId: string | null; mock: boolean } }>(await fetch("/api/ai/settings"));
}
export async function saveAiSettings(body: { defaultModelId: string | null }) {
  return j<{ ok: true; settings: { defaultModelId: string | null; mock: boolean } }>(await fetch("/api/ai/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
export async function saveProviderKey(providerId: string, body: { key: string; mode: "vault" | "session" }) {
  return j<{ ok: true; key: { configured: boolean; source: string; hint?: string } }>(await fetch(`/api/ai/providers/${encodeURIComponent(providerId)}/key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
export async function deleteProviderKey(providerId: string) {
  return j<{ ok: true }>(await fetch(`/api/ai/providers/${encodeURIComponent(providerId)}/key`, { method: "DELETE" }));
}
export async function testProvider(providerId: string) {
  return j<{ ok: true; result: string }>(await fetch(`/api/ai/providers/${encodeURIComponent(providerId)}/test`, { method: "POST" }));
}
export async function createCustomProvider(body: { id?: string; name: string; baseUrl: string }) {
  return j<{ ok: true; provider: any }>(await fetch("/api/ai/custom-providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
export async function deleteCustomProvider(id: string) {
  return j<{ ok: true }>(await fetch(`/api/ai/custom-providers/${encodeURIComponent(id)}`, { method: "DELETE" }));
}
export async function createCustomModel(body: { providerId: string; model: string; label?: string; contextWindow?: number; tools?: boolean; vision?: boolean }) {
  return j<{ ok: true; model: ModelInfo }>(await fetch("/api/ai/custom-models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
export async function deleteCustomModel(id: string) {
  return j<{ ok: true }>(await fetch("/api/ai/custom-models", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }));
}
