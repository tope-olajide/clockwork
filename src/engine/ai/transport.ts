import type { AgentChatMessage, ContextPacket, StepEvent, StepRequest } from "@shared/protocol";

export interface StreamStepArgs {
  projectId: string;
  modelId: string;
  mode: StepRequest["mode"];
  messages: AgentChatMessage[];
  context: ContextPacket;
  signal?: AbortSignal;
}

function toWireMessages(messages: AgentChatMessage[]): AgentChatMessage[] {
  // Attach capture image to the next step as an image-capable user content if present
  return messages.map((m) => {
    if (m.role === "tool" && m.toolName === "capture_viewport" && m.toolResult && (m.toolResult as any).imageDataUrl) {
      const imageDataUrl = (m.toolResult as any).imageDataUrl as string;
      return {
        ...m,
        content: JSON.stringify({ ...(m.toolResult ?? {}), imageDataUrl: "[omitted from tool content]" }),
        // carry image in a conventional field for server/provider adaptation
        ...( { imageDataUrl } as any ),
      } as any;
    }
    return m;
  });
}

export async function* streamAgentStep(args: StreamStepArgs): AsyncGenerator<StepEvent> {
  const body: StepRequest = {
    projectId: args.projectId,
    modelId: args.modelId,
    mode: args.mode,
    messages: toWireMessages(args.messages),
    context: args.context,
  };

  const response = await fetch("/api/ai/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    yield { type: "error", message: `Request failed (${response.status}). ${text.slice(0, 200)}`, code: "http-error" };
    yield { type: "step_end", finishReason: "error" };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as StepEvent;
      } catch {
        // ignore non-JSON
      }
    }
  }
  if (buffer.trim()) {
    try { yield JSON.parse(buffer.trim()) as StepEvent; } catch {}
  }
}
