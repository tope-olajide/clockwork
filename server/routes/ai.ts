import { Hono } from "hono";
import { streamText } from "hono/streaming";
import type { StepRequest } from "../../shared/protocol";
import { mockStepStream } from "../ai/mock";
import { openAICompatibleStream } from "../ai/openai-compatible";
import { resolveModel } from "../ai/provider";
import { modelsResponse, providersResponse, settingsResponse } from "../ai/models";
import {
  addCustomModel,
  addCustomProvider,
  getKeyStatus,
  getModel,
  getProvider,
  removeCustomModel,
  removeCustomProvider,
  removeProviderKey,
  resolveApiKey,
  setDefaultModelId,
  setProviderKey,
} from "../ai/store";

const app = new Hono();

function isSafeBaseUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    if (local) return u.protocol === "http:" || u.protocol === "https:";
    if (u.protocol !== "https:") return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.|127\.|::1$|^fc|^fd|^fe80)/i.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function jsonError(c: any, message: string, code: string, status = 400) {
  return c.json({ ok: false, error: message, code }, status);
}

app.get("/providers", (c) => c.json({ ok: true, providers: providersResponse() }));

app.get("/models", (c) => {
  const providerId = c.req.query("providerId") || undefined;
  return c.json({ ok: true, models: modelsResponse(providerId) });
});

app.get("/settings", (c) => c.json({ ok: true, settings: settingsResponse() }));

app.post("/settings", async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return jsonError(c, "Invalid JSON body", "bad-request"); }
  const defaultModelId = body?.defaultModelId ?? null;
  if (defaultModelId !== null && typeof defaultModelId !== "string") return jsonError(c, "defaultModelId must be a string or null", "bad-request");
  if (typeof defaultModelId === "string") {
    const model = getModel(defaultModelId);
    if (!model) return jsonError(c, "Unknown model.", "model-unavailable", 404);
  }
  setDefaultModelId(defaultModelId ?? undefined);
  return c.json({ ok: true, settings: settingsResponse() });
});

app.post("/providers/:id/key", async (c) => {
  const id = c.req.param("id");
  const provider = getProvider(id);
  if (!provider) return jsonError(c, "Unknown provider.", "not-found", 404);
  const status = getKeyStatus(id);
  if (status.source === "env") return jsonError(c, "Environment keys are read-only.", "read-only", 400);
  let body: any;
  try { body = await c.req.json(); } catch { return jsonError(c, "Invalid JSON body", "bad-request"); }
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const mode = body?.mode === "session" ? "session" : "vault";
  if (!key) return jsonError(c, "API key is required.", "bad-request");
  const result = setProviderKey(id, key, mode);
  return c.json({ ok: true, key: result });
});

app.delete("/providers/:id/key", (c) => {
  const id = c.req.param("id");
  const res = removeProviderKey(id);
  if (!res.ok) return jsonError(c, res.error!, "read-only", 400);
  return c.json({ ok: true });
});

app.post("/providers/:id/test", async (c) => {
  const id = c.req.param("id");
  const provider = getProvider(id);
  if (!provider) return jsonError(c, "Unknown provider.", "not-found", 404);
  const apiKey = resolveApiKey(id);
  if (!apiKey && !(provider.id === "ollama")) return jsonError(c, "No API key configured for this provider.", "no-key", 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const url = provider.apiStyle === "openai-compatible" ? `${provider.baseUrl.replace(/\/$/, "")}/models` : provider.baseUrl;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) {
      if (provider.apiStyle === "anthropic") headers["x-api-key"] = apiKey;
      else if (provider.apiStyle === "google") { /* skip */ }
      else headers["Authorization"] = `Bearer ${apiKey}`;
    }
    if (provider.apiStyle === "anthropic") headers["anthropic-version"] = "2023-06-01";
    if (provider.apiStyle === "google") {
      clearTimeout(timeout);
      return c.json({ ok: true, result: "reachable" });
    }
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      const msg = res.status === 401 || res.status === 403 ? "Invalid API key or unauthorized." : `Connection test failed (${res.status}).`;
      return jsonError(c, msg, res.status === 401 || res.status === 403 ? "invalid-key" : "provider-timeout", 400);
    }
    return c.json({ ok: true, result: "connected" });
  } catch (e) {
    clearTimeout(timeout);
    const aborted = (e as Error).name === "AbortError";
    return jsonError(c, aborted ? "Connection timed out." : "Could not reach provider.", aborted ? "provider-timeout" : "model-unavailable", 400);
  }
});

app.post("/custom-providers", async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return jsonError(c, "Invalid JSON body", "bad-request"); }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl.trim() : "";
  if (!name || !baseUrl) return jsonError(c, "name and baseUrl are required.", "bad-request");
  if (!isSafeBaseUrl(baseUrl)) return jsonError(c, "Base URL is not allowed. Use https (or http for localhost).", "bad-url", 400);
  const id = typeof body?.id === "string" && body.id.trim() ? body.id.trim() : `custom-${Date.now()}`;
  const provider = addCustomProvider({ id, name, baseUrl: baseUrl.replace(/\/$/, "") });
  return c.json({ ok: true, provider });
});

app.delete("/custom-providers/:id", (c) => {
  removeCustomProvider(c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/custom-models", async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return jsonError(c, "Invalid JSON body", "bad-request"); }
  const providerId = typeof body?.providerId === "string" ? body.providerId : "";
  const modelName = typeof body?.model === "string" ? body.model.trim() : "";
  const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : modelName;
  const contextWindow = Number(body?.contextWindow) > 0 ? Number(body.contextWindow) : 8192;
  const tools = Boolean(body?.tools);
  const vision = Boolean(body?.vision);
  const provider = getProvider(providerId);
  if (!provider) return jsonError(c, "Unknown provider.", "not-found", 404);
  if (!modelName) return jsonError(c, "model is required.", "bad-request");
  const id = `${providerId}:${modelName}`;
  const model = addCustomModel({ id, providerId, label, contextWindow, tools, vision });
  return c.json({ ok: true, model });
});

app.delete("/custom-models", async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { body = {}; }
  const id = typeof body?.id === "string" ? body.id : (c.req.query("id") || "");
  if (!id) return jsonError(c, "id is required.", "bad-request");
  removeCustomModel(id);
  return c.json({ ok: true });
});

app.post("/step", async (c) => {
  let body: StepRequest & { apiKey?: string; baseUrl?: string };
  try {
    body = (await c.req.json()) as any;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if ((body as any).apiKey || (body as any).baseUrl) {
    return c.json({ error: "Client-supplied credentials are not allowed." }, 400);
  }

  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return jsonError(c, "messages must be a non-empty array.", "bad-request");
  }

  const resolved = resolveModel(body.modelId);
  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-cache");

  return streamText(c, async (stream) => {
    const write = async (obj: any) => { await stream.write(JSON.stringify(obj) + "\n"); };

    if (resolved.kind === "mock") {
      for await (const chunk of mockStepStream(body)) await stream.write(chunk);
      return;
    }
    if (resolved.kind === "missing" || resolved.kind === "invalid") {
      await write({ type: "error", message: resolved.message, code: resolved.code });
      await write({ type: "step_end", finishReason: "error" });
      return;
    }
    if ((body.mode === "build" || body.mode === "plan") && !resolved.tools) {
      await write({ type: "error", message: "This model does not support tool use, so Build and Plan are unavailable. Choose a tool-capable model or use Ask.", code: "no-tools" });
      await write({ type: "step_end", finishReason: "error" });
      return;
    }
    if (resolved.apiStyle !== "openai-compatible") {
      await write({ type: "error", message: `Provider API style "${resolved.apiStyle}" is not supported for streaming in this build. Use an OpenAI-compatible provider.`, code: "model-unavailable" });
      await write({ type: "step_end", finishReason: "error" });
      return;
    }
    try {
      for await (const chunk of openAICompatibleStream({
        baseUrl: resolved.baseUrl,
        apiKey: resolved.apiKey,
        model: resolved.model,
        req: body,
        toolsEnabled: resolved.tools,
        visionEnabled: resolved.vision,
        contextWindow: resolved.contextWindow,
        signal: c.req.raw.signal,
        allowKane: true,
      })) {
        await stream.write(chunk);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider stream failed";
      const code = /401|403|unauthorized|invalid api key/i.test(message) ? "invalid-key" : /timeout|timed out/i.test(message) ? "provider-timeout" : /429|rate/i.test(message) ? "rate-limit" : "provider-error";
      await write({ type: "error", message, code });
      await write({ type: "step_end", finishReason: "error" });
    }
  });
});

export const aiRoutes = app;
