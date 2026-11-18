import { toolDefinitionsForRequest } from "../../shared/ai-tools";
import type { AgentChatMessage, StepEvent, StepRequest } from "../../shared/protocol";
import { buildSystemPrompt } from "./system-prompt";

function ndjson(event: StepEvent): string {
  return JSON.stringify(event) + "\n";
}

function trimText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 40)) + "\n…[trimmed]";
}

function toOpenAIMessages(req: StepRequest, maxContextChars: number, visionEnabled: boolean) {
  const contextJson = trimText(JSON.stringify(req.context), Math.max(4000, Math.floor(maxContextChars * 0.6)));
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: buildSystemPrompt(req.mode) },
    { role: "user", content: `Context (JSON):\n${contextJson}` },
  ];
  const historyBudget = Math.max(2000, maxContextChars - contextJson.length - 2000);
  let used = 0;
  const tail = req.messages.slice(-30);
  for (const m of tail) {
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.toolResult ?? {});
    if (used + text.length > historyBudget && messages.length > 2) continue;
    used += text.length;
    if (m.role === "user") messages.push({ role: "user", content: textContent(m) });
    else if (m.role === "assistant") messages.push({ role: "assistant", content: m.content || "" });
    else if (m.role === "tool") {
      let content = typeof m.content === "string" ? m.content : JSON.stringify(m.toolResult ?? {});
      if (!visionEnabled) content = content.replace(/\[image attached\]/g, "[image omitted: vision not supported]");
      messages.push({ role: "tool", tool_call_id: m.toolCallId ?? "tool_call", content });
    }
  }
  return messages;
}

function textContent(m: AgentChatMessage): string {
  if (typeof m.content === "string" && m.content) return m.content;
  return "";
}

export async function* openAICompatibleStream(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  req: StepRequest;
  toolsEnabled?: boolean;
  visionEnabled?: boolean;
  contextWindow?: number;
  signal?: AbortSignal;
  allowKane?: boolean;
}): AsyncGenerator<string> {
  const { baseUrl, apiKey, model, req } = opts;
  const toolsEnabled = opts.toolsEnabled !== false;
  const visionEnabled = Boolean(opts.visionEnabled);
  const contextWindow = opts.contextWindow ?? 8192;
  const maxContextChars = Math.max(8000, Math.min(120000, contextWindow * 3));

  const url = `${baseUrl}/chat/completions`;
  const allowWrites = toolsEnabled && (req.mode === "build" || req.mode === "plan");
  const tools = toolDefinitionsForRequest({ toolsEnabled, visionEnabled, allowWrites, allowKane: opts.allowKane });
  const body: Record<string, unknown> = {
    model,
    stream: true,
    temperature: 0.2,
    max_tokens: 1400,
    messages: toOpenAIMessages(req, maxContextChars, visionEnabled),
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    const code = response.status === 401 || response.status === 403 ? "invalid-key" : response.status === 429 ? "rate-limit" : "provider-error";
    yield ndjson({ type: "error", message: `Provider request failed (${response.status}). ${text.slice(0, 300)}`, code });
    yield ndjson({ type: "step_end", finishReason: "error" });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const toolCalls = new Map<number, { id: string; name: string; args: string }>();
  let sawToolCall = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        for (const [, tc] of [...toolCalls.entries()].sort((a, b) => a[0] - b[0])) {
          let parsed: unknown = {};
          try { parsed = tc.args ? JSON.parse(tc.args) : {}; } catch { parsed = { _raw: tc.args }; }
          yield ndjson({ type: "tool_call", callId: tc.id || `call_${Date.now()}`, name: tc.name, args: parsed });
        }
        yield ndjson({ type: "step_end", finishReason: sawToolCall || toolCalls.size > 0 ? "tool-calls" : "stop" });
        return;
      }
      let json: any;
      try { json = JSON.parse(data); } catch { continue; }
      const delta = json?.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === "string" && delta.content) {
        yield ndjson({ type: "text_delta", text: delta.content });
      }
      if (Array.isArray(delta.tool_calls)) {
        sawToolCall = true;
        for (const tc of delta.tool_calls) {
          const idx = typeof tc.index === "number" ? tc.index : 0;
          const entry = toolCalls.get(idx) ?? { id: "", name: "", args: "" };
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (typeof tc.function?.arguments === "string") entry.args += tc.function.arguments;
          toolCalls.set(idx, entry);
        }
      }
    }
  }
  for (const [, tc] of [...toolCalls.entries()].sort((a, b) => a[0] - b[0])) {
    let parsed: unknown = {};
    try { parsed = tc.args ? JSON.parse(tc.args) : {}; } catch { parsed = { _raw: tc.args }; }
    yield ndjson({ type: "tool_call", callId: tc.id || `call_${Date.now()}`, name: tc.name, args: parsed });
  }
  yield ndjson({ type: "step_end", finishReason: sawToolCall || toolCalls.size > 0 ? "tool-calls" : "stop" });
}
