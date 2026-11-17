import { useCallback, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { AgentChatMessage, AgentMode, ToolResult } from "@shared/protocol";
import { buildContextPacket } from "../../engine/ai/context";
import { executeClientTool } from "../../engine/ai/client-tools";
import { streamAgentStep } from "../../engine/ai/transport";
import { useEngineStore } from "../../engine/store/engine-store";

export type AgentStatus = "ready" | "thinking" | "streaming" | "tool" | "error";

export interface AgentToolCard {
  id: string;
  name: string;
  args: unknown;
  status: "running" | "done" | "error" | "canceled";
  result?: ToolResult & { imageDataUrl?: string };
}

export interface DisplayMessage extends AgentChatMessage {
  streaming?: boolean;
  toolCard?: AgentToolCard;
}

interface UseAgentSessionArgs {
  projectId: string;
  tab: string;
  tool: string;
  camera?: { x: number; y: number; zoom: number };
  viewportSize?: { w: number; h: number };
}

export function useAgentSession(args: UseAgentSessionArgs) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>("ready");
  const [mode, setMode] = useState<AgentMode>("build");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const modelId = (import.meta as any).env?.VITE_AI_MODEL_LABEL
    ? String((import.meta as any).env.VITE_AI_MODEL_LABEL)
    : "env";

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("ready");
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m.toolCard?.status === "running" ? { ...m, toolCard: { ...m.toolCard, status: "canceled" } } : m)));
  }, []);

  const newChat = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
    setStatus("ready");
  }, [stop]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const store = useEngineStore.getState();
    const doc = store.document;
    if (!doc) return;

    setError(null);
    const userMsg: DisplayMessage = { id: nanoid(), role: "user", content: trimmed, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    const abort = new AbortController();
    abortRef.current = abort;

    const run = async () => {
      let conversation: AgentChatMessage[] = [...messages.filter((m) => !m.streaming), userMsg].map(({ streaming, toolCard, ...m }) => m);
      for (let step = 0; step < 8; step++) {
        if (abort.signal.aborted) return;
        setStatus(step === 0 ? "thinking" : "thinking");
        const fresh = useEngineStore.getState();
        const currentDoc = fresh.document;
        if (!currentDoc) throw new Error("No project open");
        const context = buildContextPacket({
          document: currentDoc,
          activeSceneId: fresh.activeSceneId,
          activeLayerId: fresh.activeLayerId,
          selection: fresh.selection,
          tab: args.tab,
          tool: args.tool,
          playtestRunning: fresh.playtestRunning,
          history: fresh.history,
          camera: args.camera,
          viewportSize: args.viewportSize,
        });

        const assistantId = nanoid();
        setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString(), streaming: true }]);
        let assistantText = "";
        const toolCalls: Array<{ callId: string; name: string; args: unknown }> = [];
        let gotError: string | null = null;

        for await (const event of streamAgentStep({ projectId: args.projectId, modelId, mode, messages: conversation, context, signal: abort.signal })) {
          if (abort.signal.aborted) return;
          if (event.type === "text_delta") {
            setStatus("streaming");
            assistantText += event.text;
            setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: assistantText, streaming: true } : m));
          } else if (event.type === "tool_call") {
            toolCalls.push({ callId: event.callId, name: event.name, args: event.args });
          } else if (event.type === "error") {
            gotError = event.message;
          }
        }

        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: assistantText || (gotError ? "" : m.content), streaming: false } : m));
        if (gotError) {
          const errMsg: DisplayMessage = { id: nanoid(), role: "assistant", content: "", createdAt: new Date().toISOString() };
          setMessages((prev) => [...prev, { ...errMsg, content: `Error: ${gotError}` } as any]);
          setError(gotError);
          setStatus("error");
          return;
        }

        const assistantMsg: AgentChatMessage = { id: assistantId, role: "assistant", content: assistantText, createdAt: new Date().toISOString() };
        conversation = [...conversation, assistantMsg];

        if (toolCalls.length === 0) {
          if (!assistantText.trim()) {
            setMessages((prev) => [...prev, { id: nanoid(), role: "assistant", content: "No changes made.", createdAt: new Date().toISOString() }]);
          }
          setStatus("ready");
          return;
        }

        for (const call of toolCalls) {
          if (abort.signal.aborted) return;
          setStatus("tool");
          const cardId = nanoid();
          const card: AgentToolCard = { id: call.callId || cardId, name: call.name, args: call.args, status: "running" };
          setMessages((prev) => [...prev, { id: nanoid(), role: "tool", content: "", createdAt: new Date().toISOString(), toolCallId: card.id, toolName: call.name, toolArgs: call.args, toolCard: card }]);
          const fresh2 = useEngineStore.getState();
          const doc2 = fresh2.document;
          const executed = doc2
            ? executeClientTool({ document: doc2, activeSceneId: fresh2.activeSceneId, selection: fresh2.selection, name: call.name, args: (call.args as Record<string, unknown>) ?? {} })
            : { ok: false, error: "No project open", revision: 0, name: call.name, args: call.args } as any;
          const toolResult: ToolResult & { imageDataUrl?: string } = { ok: executed.ok, data: executed.data, error: executed.error, revision: executed.revision, imageDataUrl: executed.imageDataUrl };
          setMessages((prev) => prev.map((m) => m.toolCallId === card.id ? { ...m, toolCard: { ...card, status: executed.ok ? "done" : "error", result: toolResult }, toolResult, content: JSON.stringify(executed.imageDataUrl ? { ...toolResult, imageDataUrl: "[image attached]" } : toolResult) } : m));
          const toolMsg: AgentChatMessage = {
            id: nanoid(),
            role: "tool",
            content: JSON.stringify(toolResult),
            createdAt: new Date().toISOString(),
            toolCallId: card.id,
            toolName: call.name,
            toolArgs: call.args,
            toolResult,
          } as any;
          (toolMsg as any).imageDataUrl = executed.imageDataUrl;
          conversation = [...conversation, toolMsg];
        }
      }
      setStatus("ready");
    };

    try {
      await run();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStatus("ready");
        return;
      }
      const message = e instanceof Error ? e.message : "Agent request failed";
      setError(message);
      setStatus("error");
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
    }
  }, [args.camera, args.projectId, args.tab, args.tool, args.viewportSize, messages, mode, modelId]);

  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) void send(lastUser.content);
  }, [messages, send]);

  const isBusy = status === "thinking" || status === "streaming" || status === "tool";

  return useMemo(() => ({
    messages,
    status,
    mode,
    setMode,
    error,
    modelId,
    isBusy,
    send,
    stop,
    retry,
    newChat,
  }), [messages, status, mode, error, modelId, isBusy, send, stop, retry, newChat]);
}
