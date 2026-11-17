import { SLICE6_TOOL_DEFINITIONS } from "../../shared/ai-tools";
import type { AgentChatMessage, StepEvent, StepRequest } from "../../shared/protocol";
import { buildSystemPrompt } from "./system-prompt";

function ndjson(event: StepEvent): string {
  return JSON.stringify(event) + "\n";
}

function toOpenAIMessages(req: StepRequest) {
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: `Context (JSON):\n${JSON.stringify(req.context).slice(0, 48000)}`,
    },
  ];
  for (const m of req.messages) {
    if (m.role === "user") messages.push({ role: "user", content: textContent(m) });
    else if (m.role === "assistant") {
      // assistant messages may include tool_calls info encoded in toolName/toolArgs? better keep simple text
      messages.push({ role: "assistant", content: m.content || "" });
    } else if (m.role === "tool") {
      messages.push({
        role: "tool",
        tool_call_id: m.toolCallId ?? "tool_call",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.toolResult ?? {}),
      });
    }
  }
  // if last tool results were appended as tool messages, ensure preceding assistant had tool_calls in a real impl;
  // minimal: include tool results as user-visible context fallback when structure is imperfect.
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
}): AsyncGenerator<string> {
  const { baseUrl, apiKey, model, req } = opts;
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model,
    stream: true,
    temperature: 0.2,
    max_tokens: 1024,
    messages: toOpenAIMessages(req),
    tools: SLICE6_TOOL_DEFINITIONS,
    tool_choice: "auto",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    yield ndjson({ type: "error", message: `Provider request failed (${response.status}). ${text.slice(0, 300)}`, code: "provider-error" });
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
        // emit accumulated tool calls
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
