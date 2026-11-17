import type { StepEvent, StepRequest } from "../../shared/protocol";

function ndjson(event: StepEvent): string {
  return JSON.stringify(event) + "\n";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* mockStepStream(req: StepRequest): AsyncGenerator<string> {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const lower = lastUser.toLowerCase();
  const hasToolResult = req.messages.some((m) => m.role === "tool");

  // allow forcing states for UI coverage
  if (lower.includes("[mock:error]")) {
    yield ndjson({ type: "error", message: "Mock provider error (requested).", code: "mock-error" });
    yield ndjson({ type: "step_end", finishReason: "error" });
    return;
  }

  if (!hasToolResult && (lower.includes("[mock:text]") || lower.includes("summarize") || req.mode === "ask" && lower.includes("hello"))) {
    const text = `Mock response (${req.mode}). Project ${req.context.project.name} is at revision ${req.context.project.revision}.`;
    for (const chunk of text.match(/.{1,24}/g) ?? [text]) {
      yield ndjson({ type: "text_delta", text: chunk });
      await sleep(15);
    }
    yield ndjson({ type: "step_end", finishReason: "stop", usage: { promptTokens: 120, completionTokens: 24 } });
    return;
  }

  if (!hasToolResult) {
    // default: stream a short text and request a tool call
    const pre = "I'll inspect the project context. ";
    for (const chunk of pre.match(/.{1,16}/g) ?? [pre]) {
      yield ndjson({ type: "text_delta", text: chunk });
      await sleep(10);
    }
    const toolName = req.context.editor.selection.length > 0 ? "get_selection" : "list_scenes";
    yield ndjson({ type: "tool_call", callId: "mock_call_1", name: toolName, args: {} });
    yield ndjson({ type: "step_end", finishReason: "tool-calls", usage: { promptTokens: 140, completionTokens: 18 } });
    return;
  }

  // after tool result: final streamed answer
  const text = `Mock tool result received. I can see ${req.context.project.sceneCount} scene(s) and revision ${req.context.project.revision}.`;
  for (const chunk of text.match(/.{1,28}/g) ?? [text]) {
    yield ndjson({ type: "text_delta", text: chunk });
    await sleep(12);
  }
  yield ndjson({ type: "step_end", finishReason: "stop", usage: { promptTokens: 220, completionTokens: 30 } });
}
