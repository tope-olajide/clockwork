import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { AgentChatMessage, AgentMode, ToolResult } from "@shared/protocol";
import { buildContextPacket } from "../../engine/ai/context";
import { executeClientTool } from "../../engine/ai/client-tools";
import { streamAgentStep } from "../../engine/ai/transport";
import { fetchAiSettings, fetchModels, fetchProviders, type ModelInfo, type ProviderInfo } from "../../engine/ai/api";
import { useEngineStore } from "../../engine/store/engine-store";
import { deleteChat, readChat, saveChat } from "../../engine/persistence/indexeddb";

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

export interface AgentUiError {
  message: string;
  code?: string;
  action?: "open-settings" | "choose-model" | "retry";
}

interface UseAgentSessionArgs {
  projectId: string;
  tab: string;
  tool: string;
  camera?: { x: number; y: number; zoom: number };
  viewportSize?: { w: number; h: number };
}

const storageKey = (projectId: string) => `clockwork:agent-model:${projectId}`;

function actionForCode(code?: string): AgentUiError["action"] {
  if (!code) return "retry";
  if (code === "no-key" || code === "invalid-key" || code === "provider-timeout") return "open-settings";
  if (code === "no-model" || code === "model-unavailable" || code === "no-tools" || code === "no-vision") return "choose-model";
  return "retry";
}

export function useAgentSession(args: UseAgentSessionArgs) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>("ready");
  const [mode, setModeState] = useState<AgentMode>("ask");
  const [error, setError] = useState<AgentUiError | null>(null);
  const [selectedModelId, setSelectedModelIdState] = useState<string | null>(() => {
    try { return window.localStorage.getItem(storageKey(args.projectId)) || null; } catch { return null; }
  });
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [aiSettings, setAiSettings] = useState<{ defaultModelId: string | null; mock: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    if (!args.projectId) return;
    void readChat(args.projectId).then((record) => {
      if (cancelled || !record || !Array.isArray(record.messages)) return;
      setMessages((record.messages as DisplayMessage[]).slice(-50));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [args.projectId]);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(storageKey(args.projectId));
      setSelectedModelIdState(v || null);
    } catch {
      setSelectedModelIdState(null);
    }
  }, [args.projectId]);

  const refreshAiMeta = useCallback(async () => {
    try {
      const [m, p, s] = await Promise.all([fetchModels(), fetchProviders(), fetchAiSettings()]);
      setModels(m.models);
      setProviders(p.providers);
      setAiSettings(s.settings);
    } catch {
      // keep previous; mock/env-only sessions may still function
    }
  }, []);

  useEffect(() => { void refreshAiMeta(); }, [refreshAiMeta]);

  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);
  const effectiveModelId = selectedModelId ?? aiSettings?.defaultModelId ?? "";
  const effectiveModel = useMemo(() => models.find((m) => m.id === effectiveModelId) ?? null, [models, effectiveModelId]);
  const effectiveProvider = effectiveModel ? providerById.get(effectiveModel.providerId) : undefined;
  const mock = Boolean(aiSettings?.mock);
  const providerConfigured = effectiveProvider ? (effectiveProvider.key.configured || effectiveProvider.local) : false;
  const capabilities = {
    tools: mock ? true : Boolean(effectiveModel?.tools),
    vision: mock ? true : Boolean(effectiveModel?.vision),
  };
  const modelLabel = mock ? "MOCK" : (effectiveModel?.label ?? (effectiveModelId || "No model"));
  const canUseTools = mock || (Boolean(effectiveModel) && capabilities.tools && providerConfigured);
  const canBuildPlan = canUseTools;

  useEffect(() => {
    if (!canBuildPlan && mode !== "ask") setModeState("ask");
  }, [canBuildPlan, mode]);

  const setSelectedModelId = useCallback((id: string | null) => {
    setSelectedModelIdState(id);
    try {
      const k = storageKey(args.projectId);
      if (id) window.localStorage.setItem(k, id);
      else window.localStorage.removeItem(k);
    } catch { /* ignore */ }
    setError(null);
  }, [args.projectId]);

  const setMode = useCallback((next: AgentMode) => {
    if ((next === "build" || next === "plan") && !canBuildPlan) {
      setError({ message: "This model does not support tool use, so Build and Plan are unavailable. Choose a tool-capable model or use Ask.", code: "no-tools", action: "choose-model" });
      setModeState("ask");
      return;
    }
    setModeState(next);
  }, [canBuildPlan]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("ready");
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m.toolCard?.status === "running" ? { ...m, toolCard: { ...m.toolCard, status: "canceled" } } : m)));
  }, []);

  const newChat = useCallback(() => {
    stop();
    setMessages([]);
    void deleteChat(args.projectId).catch(() => undefined);
    setError(null);
    setStatus("ready");
  }, [args.projectId, stop]);

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
        setStatus("thinking");
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
          includeViewportCapture: capabilities.vision,
        });

        const assistantId = nanoid();
        setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString(), streaming: true }]);
        let assistantText = "";
        const toolCalls: Array<{ callId: string; name: string; args: unknown }> = [];
        let gotError: { message: string; code?: string } | null = null;

        for await (const event of streamAgentStep({ projectId: args.projectId, modelId: effectiveModelId, mode, messages: conversation, context, signal: abort.signal })) {
          if (abort.signal.aborted) return;
          if (event.type === "text_delta") {
            setStatus("streaming");
            assistantText += event.text;
            setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: assistantText, streaming: true } : m));
          } else if (event.type === "tool_call") {
            toolCalls.push({ callId: event.callId, name: event.name, args: event.args });
          } else if (event.type === "error") {
            gotError = { message: event.message, code: event.code };
          }
        }

        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: assistantText || (gotError ? "" : m.content), streaming: false } : m));
        if (gotError) {
          setError({ message: gotError.message, code: gotError.code, action: actionForCode(gotError.code) });
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
            ? executeClientTool({ document: doc2, activeSceneId: fresh2.activeSceneId, selection: fresh2.selection, name: call.name, args: (call.args as Record<string, unknown>) ?? {}, allowViewportCapture: capabilities.vision })
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
          (toolMsg as any).imageDataUrl = capabilities.vision ? executed.imageDataUrl : undefined;
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
      setError({ message, action: "retry" });
      setStatus("error");
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
    }
  }, [args.camera, args.projectId, args.tab, args.tool, args.viewportSize, capabilities.vision, effectiveModelId, messages, mode]);

  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) void send(lastUser.content);
  }, [messages, send]);

  const isBusy = status === "thinking" || status === "streaming" || status === "tool";

  useEffect(() => {
    if (!args.projectId || isBusy) return;
    const persisted = messages
      .filter((message) => !message.streaming && message.toolCard?.status !== "running")
      .map(({ streaming, ...message }) => message);
    if (persisted.length === 0) return;
    const timer = window.setTimeout(() => { void saveChat(args.projectId, persisted).catch(() => undefined); }, 300);
    return () => window.clearTimeout(timer);
  }, [args.projectId, isBusy, messages]);

  return useMemo(() => ({
    messages,
    status,
    mode,
    setMode,
    error,
    setError,
    selectedModelId,
    setSelectedModelId,
    effectiveModelId,
    effectiveModel,
    models,
    providers,
    aiSettings,
    mock,
    capabilities,
    canBuildPlan,
    modelLabel,
    isBusy,
    send,
    stop,
    retry,
    newChat,
    refreshAiMeta,
  }), [messages, status, mode, setMode, error, selectedModelId, setSelectedModelId, effectiveModelId, effectiveModel, models, providers, aiSettings, mock, capabilities, canBuildPlan, modelLabel, isBusy, send, stop, retry, newChat, refreshAiMeta]);
}
