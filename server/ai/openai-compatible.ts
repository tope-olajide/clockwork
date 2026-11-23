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

const MAX_TOOL_RESULT_CHARS = 12000;
const MAX_MESSAGE_CHARS = 8000;
const MAX_HISTORY_MESSAGES = 24;

/**
 * Assemble one request. Budgets are deliberately much tighter than the model
 * window: the agent loop can make up to 8 steps per turn, and every step
 * re-sends the system prompt, context and history. A single oversized tool
 * result (get_scene returns a whole scene) used to be dropped outright by the
 * old "skip if it does not fit" check, so the model silently lost it; each
 * message is now capped instead, and the newest messages win the budget.
 */
function toOpenAIMessages(req: StepRequest, maxContextChars: number, visionEnabled: boolean) {
  const contextJson = trimText(JSON.stringify(req.context), Math.max(4000, Math.floor(maxContextChars * 0.6)));
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: buildSystemPrompt(req.mode) },
    { role: "user", content: `Context (JSON):\n${contextJson}` },
  ];
  const historyBudget = Math.max(2000, maxContextChars - contextJson.length - 2000);
  const history: Array<Record<string, unknown>> = [];
  let used = 0;
  for (let i = req.messages.length - 1; i >= 0 && history.length < MAX_HISTORY_MESSAGES; i--) {
    const m = req.messages[i];
    if (!m) continue;
    let text = typeof m.content === "string" ? m.content : JSON.stringify(m.toolResult ?? {});
    const room = historyBudget - used;
    if (room < 400) break;
    if (m.role === "tool") {
      text = trimText(text, MAX_TOOL_RESULT_CHARS);
      if (!visionEnabled) text = text.replace(/\[image attached\]/g, "[image omitted: vision not supported]");
      text = trimText(text, Math.min(MAX_MESSAGE_CHARS, room));
      history.push({ role: "tool", tool_call_id: m.toolCallId ?? "tool_call", content: text });
    } else if (m.role === "assistant") {
      text = trimText(text, Math.min(MAX_MESSAGE_CHARS, room));
      history.push({ role: "assistant", content: text });
    } else if (m.role === "user") {
      text = trimText(textContent(m), Math.min(MAX_MESSAGE_CHARS, room));
      history.push({ role: "user", content: text });
    } else {
      continue;
    }
    used += text.length;
  }
  history.reverse();
  // A budget cut can leave a tool result with no history before it; drop those
  // orphans rather than starting the request with an unpaired tool message.
  while (history[0]?.role === "tool") history.shift();
  messages.push(...history);
  return messages;
}

function textContent(m: AgentChatMessage): string {
  if (typeof m.content === "string" && m.content) return m.content;
  return "";
}

/**
 * Probe whether the gateway supports tool-calling by sending a minimal request
 * with tools attached and checking if we get back any SSE lines within 3s.
 * Returns true if tools are supported (or if we can't tell — fail open).
 */
async function probeToolSupport(url: string, apiKey: string, model: string, signal?: AbortSignal): Promise<boolean> {
  const probeBody = {
    model,
    stream: true,
    max_tokens: 1,
    messages: [{ role: "user", content: "hi" }],
    tools: [{ type: "function", function: { name: "_probe", description: "probe", parameters: { type: "object", properties: {} } } }],
    tool_choice: "auto",
  };

  const timeoutMs = 3000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  // If the parent request is already aborted, abort probe too
  signal?.addEventListener("abort", () => ac.abort(), { once: true });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(probeBody),
      signal: ac.signal,
    });

    if (!res.ok || !res.body) return false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let got = false;

    // Read for up to timeoutMs; if we get any SSE data line, tools are supported
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (text.includes("data:")) { got = true; break; }
    }
    reader.cancel().catch(() => {});
    return got;
  } catch {
    // Timeout, abort, or network error — assume tools not supported
    return false;
  } finally {
    clearTimeout(timer);
  }
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
  // The old cap was contextWindow * 3 (up to 120k chars ≈ 30k tokens) for
  // context + history on every step. Two chars per window token keeps the
  // per-request input near the model's needs while leaving output headroom.
  const maxContextChars = Math.max(8000, Math.min(48000, contextWindow * 2));

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const url = normalizedBaseUrl.endsWith("/chat/completions")
    ? normalizedBaseUrl
    : normalizedBaseUrl.endsWith("/v1")
      ? `${normalizedBaseUrl}/chat/completions`
      : `${normalizedBaseUrl}/v1/chat/completions`;

  const allowWrites = toolsEnabled && (req.mode === "build" || req.mode === "plan");
  const tools = toolDefinitionsForRequest({ toolsEnabled, visionEnabled, allowWrites, allowKane: opts.allowKane });

  const baseBody: Record<string, unknown> = {
    model,
    stream: true,
    temperature: 0.2,
    max_tokens: 1400,
    messages: toOpenAIMessages(req, maxContextChars, visionEnabled),
  };

  // Determine whether to send tools. For local/gateway providers that don't
  // support tool-calling, the gateway may return an empty SSE stream and hang.
  // We probe first with a cheap 1-token request; if we get no SSE lines back
  // within 3 s, the gateway doesn't support tools and we skip them.
  let sendTools = tools.length > 0;
  if (sendTools) {
    const supported = await probeToolSupport(url, apiKey, model, opts.signal);
    if (!supported) sendTools = false;
  }

  const body: Record<string, unknown> = { ...baseBody };
  if (sendTools) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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

  yield* streamSSE(response, sendTools);
}

async function* streamSSE(response: Response, withTools: boolean): AsyncGenerator<string> {
  const reader = response.body!.getReader();
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
      if (withTools && Array.isArray(delta.tool_calls)) {
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

  // Flush remaining buffer
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data:")) {
      const data = trimmed.slice(5).trim();
      if (data !== "[DONE]") {
        try {
          const json: any = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta;
          if (delta && typeof delta.content === "string" && delta.content) {
            yield ndjson({ type: "text_delta", text: delta.content });
          }
        } catch { /* ignore */ }
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
