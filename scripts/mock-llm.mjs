#!/usr/bin/env node
/**
 * Deterministic OpenAI-compatible stub for agent UI acceptance.
 *
 * It reads the Clockwork context packet, moves the selected object right, and
 * emits preview_commands in Plan mode or apply_commands in Build mode. It is a
 * test fixture, not a model: it makes no semantic decisions.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT ?? 3031);

function toolCall(name, args) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    choices: [{
      index: 0,
      delta: {
        role: "assistant",
        tool_calls: [{
          index: 0,
          id: "call_mock_1",
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        }],
      },
    }],
  };
}

function textChunk(text) {
  return { id: "chatcmpl-mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: text } }] };
}

function sse(res, chunks) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

function parseContext(messages) {
  const holder = messages.find((message) => typeof message.content === "string" && message.content.startsWith("Context (JSON):"));
  if (!holder) return null;
  try {
    return JSON.parse(holder.content.slice("Context (JSON):".length));
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock", object: "model" }] }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(404).end();
    return;
  }
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => {
    let body = {};
    try { body = JSON.parse(raw); } catch { /* empty */ }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const system = String(messages.find((message) => message.role === "system")?.content ?? "");
    const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
    const lastUserText = String(messages[lastUserIndex]?.content ?? "");
    // History includes earlier turns' tool results; only the current turn matters.
    const hasToolResult = lastUserIndex >= 0 && messages.slice(lastUserIndex + 1).some((message) => message.role === "tool");

    // Provider capability probe: one token, no tools.
    if (body.max_tokens === 1 || !body.stream) {
      if (!body.stream) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "chatcmpl-mock",
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        }));
        return;
      }
      sse(res, [textChunk("ok")]);
      return;
    }

    if (hasToolResult) {
      sse(res, [textChunk("Applied the requested change.")]);
      return;
    }
    if (!/preview_commands|apply_commands/.test(lastUserText)) {
      sse(res, [textChunk("I inspected the project and made no changes.")]);
      return;
    }

    const context = parseContext(messages);
    const scene = context?.activeScene;
    const sceneId = scene?.id ?? context?.editor?.activeSceneId;
    const selectedId = context?.editor?.selection?.[0]?.id;
    const objectId = selectedId ?? scene?.objects?.[0]?.id;
    const index = scene?.objects?.find((object) => object.id === objectId);
    const detailed = context?.selectionDetails?.find((object) => object.id === objectId);
    const current = detailed?.transform ?? index;
    if (!sceneId || !objectId || !current) {
      sse(res, [textChunk("No selected object is available in context.")]);
      return;
    }

    const transform = {
      x: Number(current.x ?? 0) + 40,
      y: Number(current.y ?? 0),
      rotation: Number(current.rotation ?? 0),
      scaleX: Number(current.scaleX ?? 1),
      scaleY: Number(current.scaleY ?? 1),
    };
    const args = {
      summary: "Move the selected object 40 units right",
      expectedRevision: context?.project?.revision ?? 0,
      commands: [{ type: "object.updateTransform", args: { sceneId, objectId, transform } }],
    };
    const plan = /preview_commands/.test(lastUserText) && !/apply_commands/.test(lastUserText) || /Mode: Plan/i.test(system);
    sse(res, [toolCall(plan ? "preview_commands" : "apply_commands", args)]);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock LLM on http://127.0.0.1:${PORT}`);
});
