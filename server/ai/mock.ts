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
  const lastUserIndex = req.messages.map((m) => m.role).lastIndexOf("user");
  const toolResults = req.messages.slice(Math.max(0, lastUserIndex)).filter((m) => m.role === "tool").length;
  const hasToolResult = toolResults > 0;

  // allow forcing states for UI coverage
  if (lower.includes("[mock:slow]")) {
    const text = "This is a deliberately slow mock stream so streaming and Stop states can be observed.";
    for (const chunk of text.match(/.{1,12}/g) ?? [text]) {
      yield ndjson({ type: "text_delta", text: chunk });
      await sleep(250);
    }
    yield ndjson({ type: "step_end", finishReason: "stop" });
    return;
  }

  if (lower.includes("[mock:stopped]")) {
    for (let index = 0; index < 80; index += 1) {
      yield ndjson({ type: "text_delta", text: `long stream chunk ${index} ` });
      await sleep(250);
    }
    yield ndjson({ type: "step_end", finishReason: "stop" });
    return;
  }

  if (lower.includes("[mock:chain]")) {
    if (toolResults === 0) {
      yield ndjson({ type: "text_delta", text: "Chain step 1. " });
      yield ndjson({ type: "tool_call", callId: "mock_chain_1", name: "list_scenes", args: {} });
      yield ndjson({ type: "step_end", finishReason: "tool-calls" });
      return;
    }
    if (toolResults === 1) {
      yield ndjson({ type: "text_delta", text: "Chain step 2. " });
      yield ndjson({ type: "tool_call", callId: "mock_chain_2", name: "get_variables", args: {} });
      yield ndjson({ type: "step_end", finishReason: "tool-calls" });
      return;
    }
    const text = "Chain complete: scenes and variables inspected.";
    for (const chunk of text.match(/.{1,20}/g) ?? [text]) {
      yield ndjson({ type: "text_delta", text: chunk });
      await sleep(15);
    }
    yield ndjson({ type: "step_end", finishReason: "stop" });
    return;
  }

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

  if (toolResults === 0 && lower.includes("[mock:query]")) {
    yield ndjson({ type: "tool_call", callId: "mock_query_1", name: "query_project", args: { text: "Player", kind: "object", limit: 5 } });
    yield ndjson({ type: "step_end", finishReason: "tool-calls" });
    return;
  }

  if (toolResults === 0 && lower.includes("[mock:capture]")) {
    yield ndjson({ type: "tool_call", callId: "mock_capture_1", name: "capture_viewport", args: {} });
    yield ndjson({ type: "step_end", finishReason: "tool-calls" });
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
