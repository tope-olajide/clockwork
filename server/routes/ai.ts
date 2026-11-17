import { Hono } from "hono";
import { streamText } from "hono/streaming";
import type { StepRequest } from "../../shared/protocol";
import { mockStepStream } from "../ai/mock";
import { openAICompatibleStream } from "../ai/openai-compatible";
import { resolveProvider } from "../ai/provider";

const app = new Hono();

app.post("/step", async (c) => {
  let body: StepRequest;
  try {
    body = (await c.req.json()) as StepRequest;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const resolved = resolveProvider(body.modelId);
  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-cache");

  return streamText(c, async (stream) => {
    const write = async (chunk: string) => {
      await stream.write(chunk);
    };

    if (resolved.kind === "mock") {
      for await (const chunk of mockStepStream(body)) await write(chunk);
      return;
    }
    if (resolved.kind === "missing") {
      await write(JSON.stringify({ type: "error", message: "No model configured. Set AI_MOCK=1 or AI_BASE_URL, AI_API_KEY, and AI_MODEL.", code: "no-model" }) + "\n");
      await write(JSON.stringify({ type: "step_end", finishReason: "error" }) + "\n");
      return;
    }
    try {
      for await (const chunk of openAICompatibleStream({
        baseUrl: resolved.baseUrl!,
        apiKey: resolved.apiKey!,
        model: resolved.model!,
        req: body,
      })) {
        await write(chunk);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider stream failed";
      await write(JSON.stringify({ type: "error", message, code: "provider-error" }) + "\n");
      await write(JSON.stringify({ type: "step_end", finishReason: "error" }) + "\n");
    }
  });
});

export const aiRoutes = app;
