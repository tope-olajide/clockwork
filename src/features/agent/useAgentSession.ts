import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { AgentChatMessage, AgentMode, ChatAttachment, ToolResult } from "@shared/protocol";
import { buildContextPacket } from "../../engine/ai/context";
import { executeClientTool } from "../../engine/ai/client-tools";
import { applyCommandsInStore, batchHasDestructive, previewCommands, type ApplyCommandsArgs, type ChangeSetSummary } from "../../engine/ai/executor";
import { streamAgentStep } from "../../engine/ai/transport";
import { fetchAiSettings, fetchModels, fetchProviders, type ModelInfo, type ProviderInfo } from "../../engine/ai/api";
import { useEngineStore } from "../../engine/store/engine-store";
import { deleteChat, listChats, readChat, renameChat, saveChat, type ChatRecord } from "../../engine/persistence/indexeddb";
import { titleForMessages } from "./chat/chat-utils";
import { runHeadlessPlaytest, type PlaytestInput } from "../../engine/runtime/playtest";
import { useAgentPresenceStore } from "../../engine/store/agent-presence";
import { collectProjectAssets, createSnapshot } from "../../engine/io/snapshot";
import { streamAiPlay, verifyWithKane } from "../../engine/ai/kane-api";
import { aiPlayArgsFromToolCall } from "./kane-tool-args";
import { useTestPlanStore } from "../ai-play/test-plan-store";
import { runApprovedPhase } from "../ai-play/phase-runner";
import { gameTestProfileForDocument } from "../../engine/model/game-test-profile";

export type AgentStatus = "ready" | "thinking" | "streaming" | "tool" | "error";

export interface AgentToolCard {
  id: string;
  name: string;
  args: unknown;
  status: "running" | "done" | "error" | "canceled";
  result?: ToolResult & { imageDataUrl?: string; changeSet?: ChangeSetSummary; preview?: boolean };
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

export interface PendingPreview {
  id: string;
  summary: string;
  expectedRevision: number;
  commands: any[];
  changeSet?: ChangeSetSummary;
  changedIds: string[];
  previewDocument?: any;
  destructive: boolean;
  stale: boolean;
  transactionId: string;
}

interface UseAgentSessionArgs {
  projectId: string;
  tab: string;
  tool: string;
  camera?: { x: number; y: number; zoom: number };
  viewportSize?: { w: number; h: number };
  onOpenPanel?: (panel: string, tab?: string) => void;
  lockedSelectionId?: string | null;
}

const storageKey = (projectId: string) => `clockwork:agent-model:${projectId}`;
const sessionKey = (projectId: string) => `clockwork:agent-session:${projectId}`;

export interface ChatSessionSummary {
  sessionId: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

function actionForCode(code?: string): AgentUiError["action"] {
  if (!code) return "retry";
  if (code === "no-key" || code === "invalid-key" || code === "provider-timeout") return "open-settings";
  if (code === "no-model" || code === "model-unavailable" || code === "no-tools" || code === "no-vision") return "choose-model";
  return "retry";
}

export function useAgentSession(args: UseAgentSessionArgs) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => nanoid());
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [status, setStatus] = useState<AgentStatus>("ready");
  const [mode, setModeState] = useState<AgentMode>("ask");
  const [error, setError] = useState<AgentUiError | null>(null);
  const [selectedModelId, setSelectedModelIdState] = useState<string | null>(() => {
    try { return window.localStorage.getItem(storageKey(args.projectId)) || null; } catch { return null; }
  });
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [aiSettings, setAiSettings] = useState<{ defaultModelId: string | null; mock: boolean } | null>(null);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const agentTransactionIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setSessions([]);
    if (!args.projectId) return;
    void listChats(args.projectId).then((records) => {
      if (cancelled) return;
      setSessions(records.map(toSummary));
      let stored: string | null = null;
      try { stored = window.localStorage.getItem(sessionKey(args.projectId)); } catch { /* ignore */ }
      const selected = records.find((record) => record.sessionId === stored) ?? records[0];
      if (selected) {
        setSessionId(selected.sessionId);
        setMessages((selected.messages as DisplayMessage[]).slice(-50));
        try { window.localStorage.setItem(sessionKey(args.projectId), selected.sessionId); } catch { /* ignore */ }
      } else {
        const fresh = nanoid();
        setSessionId(fresh);
        try { window.localStorage.setItem(sessionKey(args.projectId), fresh); } catch { /* ignore */ }
      }
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
      // keep previous
    }
  }, []);

  useEffect(() => { void refreshAiMeta(); }, [refreshAiMeta]);

  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);
  // An env-only setup exposes a read-only "env" model; select it rather than
  // showing "No model" while the agent endpoint could answer.
  const envModelId = models.find((m) => m.providerId === "env")?.id ?? "";
  const effectiveModelId = selectedModelId ?? aiSettings?.defaultModelId ?? envModelId;
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
    useAgentPresenceStore.getState().setGhost(null);
  }, [canBuildPlan]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("ready");
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m.toolCard?.status === "running" ? { ...m, toolCard: { ...m.toolCard, status: "canceled" } } : m)));
  }, []);

  const newChat = useCallback(() => {
    stop();
    const fresh = nanoid();
    setMessages([]);
    setSessionId(fresh);
    try { window.localStorage.setItem(sessionKey(args.projectId), fresh); } catch { /* ignore */ }
    setError(null);
    setPendingPreview(null);
    useAgentPresenceStore.getState().clear();
    setStatus("ready");
  }, [args.projectId, stop]);

  const openChat = useCallback((nextSessionId: string) => {
    if (nextSessionId === sessionId) return;
    stop();
    void readChat(args.projectId, nextSessionId).then((record) => {
      if (!record) return;
      setSessionId(record.sessionId);
      setMessages((record.messages as DisplayMessage[]).slice(-50));
      try { window.localStorage.setItem(sessionKey(args.projectId), record.sessionId); } catch { /* ignore */ }
      setError(null);
      setPendingPreview(null);
      setStatus("ready");
    }).catch(() => undefined);
  }, [args.projectId, sessionId, stop]);

  const deleteChatSession = useCallback((nextSessionId: string) => {
    void deleteChat(args.projectId, nextSessionId).then(async () => {
      const records = await listChats(args.projectId);
      setSessions(records.map(toSummary));
      if (nextSessionId === sessionId) newChat();
    }).catch(() => undefined);
  }, [args.projectId, sessionId, newChat]);

  const renameChatSession = useCallback((nextSessionId: string, title: string) => {
    const clean = title.trim().slice(0, 80);
    if (!clean) return;
    void renameChat(args.projectId, nextSessionId, clean).then(async () => {
      const records = await listChats(args.projectId);
      setSessions(records.map(toSummary));
    }).catch(() => undefined);
  }, [args.projectId]);

  const executeAgentTool = useCallback(async (name: string, callArgs: Record<string, unknown>, transactionId: string) => {
    const store = useEngineStore.getState();
    const doc = store.document;
    const revision = doc?.revision ?? 0;
    const ok = (data: unknown, extra?: any) => ({ ok: true as const, data, revision: store.document?.revision ?? revision, name, args: callArgs, ...extra });
    const fail = (error: string, code?: string) => ({ ok: false as const, error, code, revision: store.document?.revision ?? revision, name, args: callArgs });

    if (name === "verify_with_kane" || name === "run_ai_play") {
      if (!doc) return fail("No project open.");
      try {
        const assets = await collectProjectAssets(doc);
        const snapshot = await createSnapshot(doc, { assets, ttlHours: 1 });
        const result = name === "verify_with_kane"
          ? await verifyWithKane({
            snapshotId: snapshot.id,
            objective: String(callArgs.objective ?? "Verify the current project in the snapshot player."),
            seed: 1234,
          })
          : await streamAiPlay(aiPlayArgsFromToolCall(callArgs, {
            snapshotId: snapshot.id,
            projectId: args.projectId,
            seed: 1234,
          }));
        return ok({
          status: result.status,
          summary: result.summary,
          finalState: result.finalState,
          durationMs: result.durationMs,
          steps: result.steps.slice(-12),
          runtimeErrors: result.runtimeErrors,
          evidencePath: result.evidencePath,
          evidenceUrl: result.evidenceUrl,
          testUrl: result.testUrl,
          snapshotId: snapshot.id,
          objective: result.objective,
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "Kane run failed.");
      }
    }

    if (name === "run_kane_test_phase") {
      if (!doc) return fail("No project open.");
      const draft = useTestPlanStore.getState().draft;
      if (!draft) return fail("No test plan exists. Draft and approve a plan before running a phase.");
      if (!draft.approval) return fail("The plan is not approved. Ask the user to approve it before any Kane phase runs.");
      const profile = gameTestProfileForDocument(doc);
      if (!profile) return fail("No game-test profile is registered for this project.");
      const phaseId = typeof callArgs.phaseId === "string" ? callArgs.phaseId : "";
      if (!phaseId) return fail("A phaseId from the approved plan is required.");
      try {
        const result = await runApprovedPhase({ draft, document: doc, profile, phaseId });
        useTestPlanStore.getState().recordPhaseResult(draft, result);
        return ok({
          phaseId: result.phaseId,
          phaseIndex: result.phaseIndex,
          verdict: result.verdict,
          failureKind: result.failureKind,
          reason: result.reason,
          summary: result.summary,
          kaneStatus: result.kaneStatus,
          checks: result.checks,
          acceptedInputs: result.acceptedInputs,
          finalState: result.finalState,
          durationMs: result.durationMs,
          steps: result.steps.slice(-12),
          runtimeErrors: result.runtimeErrors,
          evidenceUrl: result.evidenceUrl,
          testUrl: result.testUrl,
          snapshotId: result.snapshotId,
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "Kane phase failed.");
      }
    }

    if (name === "select_entities") {
      const ids = Array.isArray(callArgs.ids) ? callArgs.ids.filter((x): x is string => typeof x === "string") : [];
      const sceneId = typeof callArgs.sceneId === "string" ? callArgs.sceneId : null;
      if (sceneId && store.document?.scenes.some((s) => s.id === sceneId)) store.setActiveScene(sceneId);
      store.setSelection(ids);
      return ok({ selected: ids, sceneId: sceneId ?? store.activeSceneId });
    }

    if (name === "open_panel") {
      const panel = typeof callArgs.panel === "string" ? callArgs.panel : "";
      const tab = typeof callArgs.tab === "string" ? callArgs.tab : undefined;
      args.onOpenPanel?.(panel, tab);
      return ok({ opened: panel, tab: tab ?? null });
    }

    if (name === "undo_last_agent_change") {
      const lastTx = [...agentTransactionIdsRef.current].reverse()[0];
      if (!lastTx) return fail("No agent-authored change to undo.");
      const history = store.history;
      const entry = [...history].reverse().find((h: any) => h.transactionId === lastTx);
      if (!entry) return fail("The agent change is no longer in the undo history.");
      // undo only if it's the latest history entry; otherwise unsafe
      if (history[history.length - 1] !== entry) return fail("User edits happened after the agent change. Undo refused to avoid reverting user work.");
      const undone = store.undo();
      if (!undone) return fail("Undo failed.");
      agentTransactionIdsRef.current = agentTransactionIdsRef.current.filter((id) => id !== lastTx);
      return ok({ undone: true, transactionId: lastTx, revision: useEngineStore.getState().document?.revision ?? 0 });
    }

    if (name === "start_playtest") {
      if (!doc) return fail("No project open.");
      if (useEngineStore.getState().playtestRunning) return fail("A playtest is already running. Stop it before starting another.");
      const sceneId = typeof callArgs.sceneId === "string" ? callArgs.sceneId : store.activeSceneId ?? doc.startSceneId;
      if (!doc.scenes.some((scene) => scene.id === sceneId)) return fail(`Scene not found: ${sceneId}`);
      const durationMs = Math.max(0, Math.min(15000, Number(callArgs.durationMs) || 4000));
      const rawInputs = Array.isArray(callArgs.inputs) ? callArgs.inputs : [];
      const inputs: PlaytestInput[] = rawInputs
        .filter((input: any) => input && typeof input.atMs === "number" && typeof input.action === "string" && (input.phase === "press" || input.phase === "release"))
        .map((input: any) => ({ atMs: Number(input.atMs), action: input.action, phase: input.phase }));
      useEngineStore.getState().setPlaytestRunning(true);
      try {
        const result = runHeadlessPlaytest(doc, {
          sceneId,
          seed: Number(callArgs.seed) || 1234,
          durationMs,
          inputs,
        });
        return ok({ ...result, passed: result.passed, telemetry: result });
      } finally {
        useEngineStore.getState().setPlaytestRunning(false);
      }
    }

    if (name === "preview_commands") {
      if (!doc) return fail("No project open.");
      const input = callArgs as unknown as ApplyCommandsArgs;
      const result = previewCommands(doc, input);
      if (!result.ok) return { ok: false, error: result.message, code: result.code, revision: result.revision ?? doc.revision, name, args: callArgs, data: result };
      const destructive = batchHasDestructive((input.commands ?? []) as any[]);
      const changedIds = result.changedIds ?? [];
      setPendingPreview({
        id: nanoid(),
        summary: input.summary || result.changeSet?.label || "Previewed changes",
        expectedRevision: input.expectedRevision,
        commands: input.commands ?? [],
        changeSet: result.changeSet,
        changedIds,
        previewDocument: result.document,
        destructive,
        stale: false,
        transactionId,
      });
      useAgentPresenceStore.getState().setGhost({
        document: result.document ?? doc,
        changedIds,
        deletedIds: (result.changeSet?.changes ?? []).filter((change) => change.op === "delete").map((change) => change.entityId),
        sceneId: store.activeSceneId,
        label: input.summary || result.changeSet?.label || "Plan preview",
      });
      return ok({ preview: true, destructive, changeSet: result.changeSet, revision: result.revision }, { changeSet: result.changeSet, preview: true });
    }

    if (name === "apply_commands") {
      if (!doc) return fail("No project open.");
      const input = callArgs as unknown as ApplyCommandsArgs;
      const commands = (input.commands ?? []) as any[];
      if (mode === "plan") {
        // plan mode should not apply; convert behavior to preview result
        const p = previewCommands(doc, input);
        if (!p.ok) return { ok: false, error: p.message, code: p.code, revision: p.revision ?? doc.revision, name, args: callArgs };
        const planChangedIds = p.changedIds ?? [];
        setPendingPreview({ id: nanoid(), summary: input.summary || "Previewed changes", expectedRevision: input.expectedRevision, commands, changeSet: p.changeSet, changedIds: planChangedIds, previewDocument: p.document, destructive: batchHasDestructive(commands), stale: false, transactionId });
        useAgentPresenceStore.getState().setGhost({ document: p.document ?? doc, changedIds: planChangedIds, deletedIds: (p.changeSet?.changes ?? []).filter((change) => change.op === "delete").map((change) => change.entityId), sceneId: store.activeSceneId, label: input.summary || "Plan preview" });
        return ok({ preview: true, note: "Plan mode: previewed instead of applying.", changeSet: p.changeSet, revision: p.revision }, { changeSet: p.changeSet, preview: true });
      }
      const destructive = batchHasDestructive(commands);
      if (destructive) {
        const p = previewCommands(doc, input);
        if (!p.ok) return { ok: false, error: p.message, code: p.code, revision: p.revision ?? doc.revision, name, args: callArgs };
        const destructiveIds = p.changedIds ?? [];
        setPendingPreview({ id: nanoid(), summary: input.summary || p.changeSet?.label || "Destructive changes", expectedRevision: input.expectedRevision, commands, changeSet: p.changeSet, changedIds: destructiveIds, previewDocument: p.document, destructive: true, stale: false, transactionId });
        useAgentPresenceStore.getState().setGhost({ document: p.document ?? doc, changedIds: destructiveIds, deletedIds: (p.changeSet?.changes ?? []).filter((change) => change.op === "delete").map((change) => change.entityId), sceneId: store.activeSceneId, label: input.summary || "Destructive preview" });
        return ok({ preview: true, requiresConfirmation: true, destructive: true, changeSet: p.changeSet, revision: p.revision, message: "Destructive change requires confirmation. Review and confirm to apply." }, { changeSet: p.changeSet, preview: true });
      }
      const applied = applyCommandsInStore(store.dispatch as any, () => useEngineStore.getState().document, input, transactionId);
      if (!applied.ok) return { ok: false, error: applied.message, code: applied.code, revision: applied.revision ?? doc.revision, name, args: callArgs, data: applied };
      agentTransactionIdsRef.current.push(transactionId);
      useAgentPresenceStore.getState().setGhost(null);
      if (applied.changedIds?.length) {
        useAgentPresenceStore.getState().setPresence({ objectIds: applied.changedIds, sceneId: store.activeSceneId, label: input.summary || "Agent change" });
      }
      return ok({ applied: true, revision: applied.revision, changeSet: applied.changeSet, changedIds: applied.changedIds }, { changeSet: applied.changeSet });
    }

    // read tools
    if (doc) {
      const executed = executeClientTool({ document: doc, activeSceneId: store.activeSceneId, selection: store.selection, name, args: callArgs, allowViewportCapture: capabilities.vision });
      if (name === "propose_test_plan" && executed.ok) {
        const data = executed.data as { accepted?: boolean; draft?: import("../../engine/model/game-test-draft").TestPlanDraft; errors?: string[] } | null;
        // Surface the proposal in the review panel. Acceptance here is validation,
        // not approval: nothing runs until the user approves it.
        useTestPlanStore.getState().setProposal(data?.accepted ? data.draft ?? null : null, data?.errors ?? []);
      }
      return executed as any;
    }
    return fail("No project open.");
  }, [args, capabilities.vision, mode]);

  const applyPendingPreview = useCallback(() => {
    if (!pendingPreview) return;
    const store = useEngineStore.getState();
    const doc = store.document;
    if (!doc) { setError({ message: "No project open.", action: "retry" }); return; }
    if (doc.revision !== pendingPreview.expectedRevision) {
      setPendingPreview((p) => p ? { ...p, stale: true } : p);
      useAgentPresenceStore.getState().setGhost(null);
      setError({ message: "Preview is stale because the project changed. Ask the agent to re-plan.", code: "revision", action: "retry" });
      return;
    }
    const input: ApplyCommandsArgs = { summary: pendingPreview.summary, expectedRevision: pendingPreview.expectedRevision, commands: pendingPreview.commands };
    const applied = applyCommandsInStore(store.dispatch as any, () => useEngineStore.getState().document, input, pendingPreview.transactionId);
    if (!applied.ok) {
      setError({ message: applied.message || "Apply failed.", code: applied.code, action: "retry" });
      setStatus("error");
      return;
    }
    agentTransactionIdsRef.current.push(pendingPreview.transactionId);
    setMessages((prev) => [...prev, { id: nanoid(), role: "assistant", content: `Applied: ${pendingPreview.summary} (r${applied.revision}, 1 undo entry).`, createdAt: new Date().toISOString() }]);
    useAgentPresenceStore.getState().setGhost(null);
    if (applied.changedIds?.length) {
      useAgentPresenceStore.getState().setPresence({ objectIds: applied.changedIds, sceneId: useEngineStore.getState().activeSceneId, label: pendingPreview.summary });
    }
    setPendingPreview(null);
    setError(null);
  }, [pendingPreview]);

  const discardPendingPreview = useCallback(() => {
    if (pendingPreview) setMessages((prev) => [...prev, { id: nanoid(), role: "assistant", content: `Discarded preview: ${pendingPreview.summary}.`, createdAt: new Date().toISOString() }]);
    useAgentPresenceStore.getState().setGhost(null);
    setPendingPreview(null);
  }, [pendingPreview]);

  const send = useCallback(async (text: string, attachments?: ChatAttachment[], replaceUserId?: string) => {
    const trimmed = text.trim();
    if (!trimmed && !attachments?.length) return;
    const store = useEngineStore.getState();
    const doc = store.document;
    if (!doc) return;

    // Block before touching the network. Sending anyway produces a raw provider
    // failure (Kane's K2 run caught this as "fetch failure" with "No model").
    if (!mock) {
      if (!effectiveModel) {
        setError({
          message: "No model is selected. Choose a model to use the agent; manual editing and Play keep working without one.",
          code: "no-model",
          action: "choose-model",
        });
        setStatus("error");
        return;
      }
      if (!providerConfigured) {
        setError({
          message: `${effectiveModel.label} has no API key configured. Add a key in Settings → AI Models, or choose a model whose provider is connected.`,
          code: "no-key",
          action: "open-settings",
        });
        setStatus("error");
        return;
      }
      if ((mode === "build" || mode === "plan") && !canUseTools) {
        setError({
          message: "Build and Plan need a tool-capable model. Choose one, or switch to Ask.",
          code: "no-tools",
          action: "choose-model",
        });
        setStatus("error");
        return;
      }
    }

    setError(null);
    useAgentPresenceStore.getState().clearPresence();
    const replaceIndex = replaceUserId ? messages.findIndex((message) => message.id === replaceUserId) : -1;
    const baseMessages = replaceIndex >= 0 ? messages.slice(0, replaceIndex) : messages;
    const userMsg: DisplayMessage = {
      id: nanoid(),
      role: "user",
      content: trimmed || "Use the attached files in this game.",
      createdAt: new Date().toISOString(),
      ...(attachments?.length ? { attachments } : {}),
    };
    setMessages([...baseMessages.filter((message) => !message.streaming), userMsg]);

    const abort = new AbortController();
    abortRef.current = abort;

    const run = async () => {
      let conversation: AgentChatMessage[] = [...baseMessages.filter((m) => !m.streaming), userMsg].map(({ streaming, toolCard, ...m }) => m);
      const turnTransactionId = nanoid();
      let replanCount = 0;
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
          lockedSelectionId: args.lockedSelectionId,
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
          const executed: any = await executeAgentTool(call.name, (call.args as Record<string, unknown>) ?? {}, turnTransactionId);
          const toolResult: ToolResult & { imageDataUrl?: string; changeSet?: ChangeSetSummary; preview?: boolean } = {
            ok: executed.ok,
            data: executed.data,
            error: executed.error,
            revision: executed.revision ?? (useEngineStore.getState().document?.revision ?? 0),
            imageDataUrl: executed.imageDataUrl,
            changeSet: executed.changeSet,
            preview: executed.preview,
          };
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

          // A stale revision is recoverable: re-read context and re-plan once per
          // failure (at most twice per user turn), never retry the same batch.
          if (!executed.ok && executed.code === "revision" && replanCount < 2) {
            replanCount += 1;
            const currentRevision = useEngineStore.getState().document?.revision ?? 0;
            const note = `Revision changed to r${currentRevision}; re-read the context and re-plan. Do not retry the same batch.`;
            conversation = [...conversation, { id: nanoid(), role: "user", content: note, createdAt: new Date().toISOString() }];
            setMessages((prev) => [...prev, { id: nanoid(), role: "user", content: note, createdAt: new Date().toISOString() }]);
            break;
          }
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
      const raw = e instanceof Error ? e.message : "Agent request failed";
      const unreachable = /fetch|network|load failed|ECONN|socket/i.test(raw);
      setError({
        message: unreachable
          ? `Could not reach the model provider (${raw}). Check the provider key and connection in Settings → AI Models.`
          : raw,
        code: unreachable ? "provider-timeout" : undefined,
        action: unreachable ? "open-settings" : "retry",
      });
      setStatus("error");
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
    }
  }, [args.camera, args.lockedSelectionId, args.projectId, args.tab, args.tool, args.viewportSize, capabilities.vision, effectiveModel, effectiveModelId, executeAgentTool, messages, mock, mode, providerConfigured, canUseTools]);

  const isBusy = status === "thinking" || status === "streaming" || status === "tool";

  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) void send(lastUser.content, lastUser.attachments, lastUser.id);
  }, [messages, send]);

  const regenerate = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser && !isBusy) void send(lastUser.content, lastUser.attachments, lastUser.id);
  }, [isBusy, messages, send]);

  useEffect(() => {
    if (!args.projectId || !sessionId || isBusy) return;
    const persisted = messages
      .filter((message) => !message.streaming && message.toolCard?.status !== "running")
      .map(({ streaming, ...message }) => message);
    if (persisted.length === 0) return;
    const timer = window.setTimeout(() => {
      void saveChat(args.projectId, sessionId, persisted, titleForMessages(persisted as AgentChatMessage[]))
        .then(() => listChats(args.projectId))
        .then((records) => setSessions(records.map(toSummary)))
        .catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [args.projectId, isBusy, messages, sessionId]);

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
    regenerate,
    newChat,
    sessionId,
    sessions,
    openChat,
    deleteChatSession,
    renameChatSession,
    refreshAiMeta,
    pendingPreview,
    applyPendingPreview,
    discardPendingPreview,
  }), [messages, status, mode, setMode, error, selectedModelId, setSelectedModelId, effectiveModelId, effectiveModel, models, providers, aiSettings, mock, capabilities, canBuildPlan, modelLabel, isBusy, send, stop, retry, regenerate, newChat, sessionId, sessions, openChat, deleteChatSession, renameChatSession, refreshAiMeta, pendingPreview, applyPendingPreview, discardPendingPreview]);
}

function toSummary(record: ChatRecord): ChatSessionSummary {
  return {
    sessionId: record.sessionId,
    title: record.title,
    updatedAt: record.updatedAt,
    messageCount: record.messages.length,
  };
}
