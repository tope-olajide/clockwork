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
import { cancelAiPlay, fetchKaneStatus, streamAiPlay, verifyWithKane } from "../../engine/ai/kane-api";
import type { KaneCliStatus, KaneEvent } from "@shared/protocol/kane";
import type { ProjectDocument } from "../../engine/model/schema";
import { aiPlayArgsFromToolCall, verifyArgsFromToolCall } from "./kane-tool-args";
import { KaneTurnBudget, runKaneCheck, smokeCheckArgs } from "./kane-check-session";
import { controlSummary } from "../../engine/runtime/kane-check-runner";
import { observationValue } from "../../engine/runtime/test-observations";
import { TestController } from "../../engine/runtime/test-controller";
import { changeAffectsGameplay, kaneCheckRequestMessage } from "./verification-offer";
import { useTestPlanStore } from "../ai-play/test-plan-store";
import { runApprovedPhase } from "../ai-play/phase-runner";
import { buildPhaseContinuation, continuationChatMessage, phaseResultPayload } from "./phase-continuation";
import type { KanePhaseResult } from "@shared/protocol/game-testing";
import { gameTestProfileForDocument } from "../../engine/model/game-test-profile";

export type AgentStatus = "ready" | "thinking" | "streaming" | "tool" | "error";

export interface AgentToolCard {
  id: string;
  name: string;
  args: unknown;
  status: "running" | "done" | "error" | "canceled";
  /** Live Kane progress while a verification run is in flight. */
  progress?: KaneProgress;
  result?: ToolResult & { imageDataUrl?: string; changeSet?: ChangeSetSummary; preview?: boolean };
}

export interface KaneProgress {
  message: string;
  step?: number;
  runId?: string;
  startedAt: number;
}

/** Offered after an applied change that could alter gameplay. */
export interface VerifyOffer {
  id: string;
  summary: string;
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
  const [kaneStatus, setKaneStatus] = useState<KaneCliStatus | null>(null);
  const [verifyOffer, setVerifyOffer] = useState<VerifyOffer | null>(null);
  // Run id of the Kane run this session started, so Stop can cancel it on the server.
  const kaneRunIdRef = useRef<string | null>(null);
  // Set when an applied change could alter gameplay during the current turn.
  const gameplayChangeRef = useRef<string | null>(null);
  // Kane/simulator budget for the current user message; replaced on every send.
  const kaneBudgetRef = useRef(new KaneTurnBudget());
  // True while the current user message itself asked for a Kane check.
  const userAskedKaneRef = useRef(false);

  const refreshKaneStatus = useCallback(async (force = false) => {
    try {
      setKaneStatus(await fetchKaneStatus(force));
    } catch {
      setKaneStatus(null);
    }
  }, []);

  useEffect(() => { void refreshKaneStatus(); }, [refreshKaneStatus]);

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
  const selectedModel = selectedModelId ? models.find((m) => m.id === selectedModelId) : undefined;
  const defaultModel = aiSettings?.defaultModelId
    ? models.find((m) => m.id === aiSettings.defaultModelId)
    : undefined;
  const effectiveModelId = selectedModel?.id ?? defaultModel?.id ?? envModelId;
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
    // Aborting the fetch only drops the stream; the server-side Kane run keeps
    // going unless it is cancelled by id.
    const kaneRunId = kaneRunIdRef.current;
    kaneRunIdRef.current = null;
    if (kaneRunId) void cancelAiPlay(kaneRunId);
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

  const executeAgentTool = useCallback(async (name: string, callArgs: Record<string, unknown>, transactionId: string, cardId?: string, signal?: AbortSignal) => {
    const store = useEngineStore.getState();
    const doc = store.document;
    const revision = doc?.revision ?? 0;
    const ok = (data: unknown, extra?: any) => ({ ok: true as const, data, revision: store.document?.revision ?? revision, name, args: callArgs, ...extra });
    const fail = (error: string, code?: string) => ({ ok: false as const, error, code, revision: store.document?.revision ?? revision, name, args: callArgs });

    if (name === "verify_with_kane" || name === "run_ai_play") {
      if (!doc) return fail("No project open.");
      // A Kane run after an edit is the verification; do not offer another one.
      gameplayChangeRef.current = null;
      const startedAt = Date.now();
      const setStage = (message: string) => {
        if (!cardId) return;
        setMessages((prev) => prev.map((m) => m.toolCallId === cardId && m.toolCard?.status === "running"
          ? { ...m, toolCard: { ...m.toolCard, progress: { startedAt, ...m.toolCard.progress, message } } }
          : m));
      };
      const progressHandlers = {
        signal,
        onRunId: (runId: string) => {
          kaneRunIdRef.current = runId;
          setMessages((prev) => prev.map((m) => m.toolCallId === cardId && m.toolCard?.status === "running"
            ? { ...m, toolCard: { ...m.toolCard, progress: { message: "Kane is starting its browser", startedAt, ...m.toolCard.progress, runId } } }
            : m));
        },
        onEvent: (event: KaneEvent) => {
          if (event.type !== "step") return;
          const generic = !event.remark || /^Step \d+$/i.test(event.remark.trim());
          setMessages((prev) => prev.map((m) => m.toolCallId === cardId && m.toolCard?.status === "running"
            ? { ...m, toolCard: { ...m.toolCard, progress: { message: "Kane is working", startedAt, ...m.toolCard.progress, step: event.step, ...(generic ? {} : { message: event.remark }) } } }
            : m));
        },
      };
      // Free-text objective (no structured expectations): sent to Kane verbatim
      // against the real-time player, exactly as the user or agent wrote it.
      if (name === "verify_with_kane" && !Array.isArray(callArgs.expect) && typeof callArgs.objective === "string" && callArgs.objective.trim()) {
        const unavailable = kaneUnavailableFor(kaneStatus);
        if (unavailable) return fail(`Kane cannot run: ${unavailable} Next: report this to the user; do not call Kane tools again this message.`, "kane-unavailable");
        if (kaneBudgetRef.current.kaneRunsLeft === 0) return fail("This message already used its Kane runs. Next: report the earlier results; do not call Kane again.", "kane-budget");
        kaneBudgetRef.current.kaneRuns += 1;
        try {
          setStage("Preparing a snapshot of this project");
          const assets = await collectProjectAssets(doc);
          const snapshot = await createSnapshot(doc, { assets, ttlHours: 1 });
          setStage("Kane is starting its browser");
          const body = verifyArgsFromToolCall(callArgs, { snapshotId: snapshot.id, seed: 1234 });
          const result = await verifyWithKane(body, progressHandlers);
          kaneRunIdRef.current = null;
          return ok({
            target: "game-snapshot",
            runId: result.runId,
            status: result.status,
            summary: result.summary,
            finalState: result.finalState,
            durationMs: result.durationMs,
            steps: result.steps.filter((step) => step.status !== "running").slice(-8),
            runtimeErrors: result.runtimeErrors,
            evidenceUrl: result.evidenceUrl,
            testUrl: result.testUrl,
            snapshotId: snapshot.id,
            objective: result.objective,
            nextStep: result.status === "passed"
              ? "Kane passed this objective. Report it with the stored values and evidence link. Do not run it again."
              : result.status === "failed"
                ? "Kane ran to completion and the assertion failed. Report the stored values and Kane's reason. Do not retry the same objective; do not reword it to make it pass."
                : "Kane did not return a verdict. Report this as unknown, not as a pass. Do not retry automatically.",
            runsLeftThisTurn: kaneBudgetRef.current.kaneRunsLeft,
          });
        } catch (error) {
          kaneRunIdRef.current = null;
          return fail(`${error instanceof Error ? error.message : "Kane run failed."} Next: report this; do not retry automatically.`);
        }
      }
      if (name === "verify_with_kane") {
        const outcome = await runKaneCheck(callArgs, {
          document: doc,
          profile: gameTestProfileForDocument(doc),
          budget: kaneBudgetRef.current,
          sceneId: typeof callArgs.sceneId === "string" ? callArgs.sceneId : store.activeSceneId ?? undefined,
          seed: 1234,
          kaneUnavailable: kaneUnavailableFor(kaneStatus),
          onStage: setStage,
          runKane: async (check, sceneId) => {
            setStage("Preparing a snapshot of this project");
            const assets = await collectProjectAssets(doc);
            const snapshot = await createSnapshot(doc, { assets, ttlHours: 1 });
            setStage("Kane is starting its browser");
            try {
              const result = await verifyWithKane({ snapshotId: snapshot.id, check, seed: 1234, ...(sceneId ? { sceneId } : {}) }, progressHandlers);
              return { ...result, snapshotId: snapshot.id };
            } finally {
              kaneRunIdRef.current = null;
            }
          },
        });
        if (!outcome.ok) return { ...fail(`${outcome.error} Next: ${outcome.nextStep}`, outcome.code), data: { nextStep: outcome.nextStep } };
        return ok(outcome.payload);
      }
      const updateProgress = (patch: Partial<KaneProgress>) => {
        if (!cardId) return;
        setMessages((prev) => prev.map((m) => m.toolCallId === cardId && m.toolCard?.status === "running"
          ? { ...m, toolCard: { ...m.toolCard, progress: { message: "Starting Kane", startedAt, ...m.toolCard.progress, ...patch } } }
          : m));
      };
      const handlers = {
        signal,
        onRunId: (runId: string) => {
          kaneRunIdRef.current = runId;
          updateProgress({ runId });
        },
        onEvent: (event: KaneEvent) => {
          if (event.type === "step") {
            // Kane opens each step with a bare "Step N" remark; keep the last
            // descriptive remark instead of showing "Step 4 · Step 3".
            const generic = !event.remark || /^Step \d+$/i.test(event.remark.trim());
            updateProgress(generic ? { step: event.step } : { step: event.step, message: event.remark });
          }
          else if (event.type === "warning") updateProgress({ message: event.message });
        },
      };
      updateProgress({ message: "Preparing a snapshot of this project" });
      try {
        const assets = await collectProjectAssets(doc);
        const snapshot = await createSnapshot(doc, { assets, ttlHours: 1 });
        updateProgress({ message: "Starting Kane" });
        const result = await streamAiPlay(aiPlayArgsFromToolCall(callArgs, {
          snapshotId: snapshot.id,
          projectId: args.projectId,
          seed: 1234,
        }), handlers);
        kaneRunIdRef.current = null;
        return ok({
          target: "game-snapshot",
          runId: result.runId,
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
        kaneRunIdRef.current = null;
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
      const replayTestKey = typeof callArgs.replayTestKey === "string" && callArgs.replayTestKey ? callArgs.replayTestKey : undefined;
      try {
        const result = await runApprovedPhase({ draft, document: doc, profile, phaseId, ...(replayTestKey ? { replayTestKey } : {}) });
        useTestPlanStore.getState().recordPhaseResult(draft, result);
        // The panel-to-agent handoff builds the same payload, so both paths
        // render one verdict for one stored result.
        return ok(phaseResultPayload(result));
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

    if ((name === "apply_commands" || name === "preview_commands") && !Array.isArray(callArgs.commands)) {
      return fail(`${name} needs "commands" as an array of {type, args} objects; it received ${typeof callArgs.commands}. Nothing was changed.`);
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
      if (changeAffectsGameplay(applied.changeSet)) gameplayChangeRef.current = input.summary || applied.changeSet?.label || "the change";
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
  }, [args, capabilities.vision, kaneStatus, mode]);

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
    if (kaneStatus?.installed && kaneStatus.authenticated && changeAffectsGameplay(applied.changeSet)) setVerifyOffer({ id: nanoid(), summary: pendingPreview.summary });
    setMessages((prev) => [...prev, { id: nanoid(), role: "assistant", content: `Applied: ${pendingPreview.summary} (r${applied.revision}, 1 undo entry).`, createdAt: new Date().toISOString() }]);
    useAgentPresenceStore.getState().setGhost(null);
    if (applied.changedIds?.length) {
      useAgentPresenceStore.getState().setPresence({ objectIds: applied.changedIds, sceneId: useEngineStore.getState().activeSceneId, label: pendingPreview.summary });
    }
    setPendingPreview(null);
    setError(null);
  }, [kaneStatus, pendingPreview]);

  const discardPendingPreview = useCallback(() => {
    if (pendingPreview) setMessages((prev) => [...prev, { id: nanoid(), role: "assistant", content: `Discarded preview: ${pendingPreview.summary}.`, createdAt: new Date().toISOString() }]);
    useAgentPresenceStore.getState().setGhost(null);
    setPendingPreview(null);
  }, [pendingPreview]);

  // Default policy is Ask: offer a button after a gameplay-changing edit, never run unasked.
  const offerVerification = useCallback(() => {
    const summary = gameplayChangeRef.current;
    gameplayChangeRef.current = null;
    if (!summary) return;
    // The user already asked for Kane in this message; the agent owns that call.
    if (userAskedKaneRef.current) return;
    if (!kaneStatus?.installed || !kaneStatus.authenticated) return;
    setVerifyOffer({ id: nanoid(), summary });
  }, [kaneStatus]);

  /**
   * Runs one model turn against an explicit conversation. `send` builds a
   * conversation from a new user message; `continueWithPhaseResult` builds one
   * from a panel-started phase result appended as a typed tool message. Both
   * share the loop so the agent explains either source the same way.
   */
  const runTurn = useCallback(async (initialConversation: AgentChatMessage[], abort: AbortController, options: { expectKane?: boolean } = {}) => {
    try {
      let conversation: AgentChatMessage[] = initialConversation;
      const turnTransactionId = nanoid();
      let replanCount = 0;
      // A user who asked for a Kane check gets one nudge if the model replies
      // without calling the tool, instead of a reply that only promises a run.
      let kaneCalled = false;
      // Up to 3 reminders per message, never two in a row: each one must be
      // followed by a real tool call before another is allowed.
      let nudges = 0;
      let lastStepWasNudge = false;
      userAskedKaneRef.current = Boolean(options.expectKane) || /\bkane\b/i.test(latestUserText(initialConversation));
      const askedKane = userAskedKaneRef.current;
      // Model steps per user message. Eight ran out mid-task: an edit, a retry,
      // a preflight and a few lookups used them all and the turn ended without
      // the Kane check the user asked for. The last KANE_RESERVE steps are kept
      // for verification when the user asked for Kane.
      const MAX_STEPS = 12;
      const KANE_RESERVE = 3;
      let reserveNoteSent = false;
      for (let step = 0; step < MAX_STEPS; step++) {
        if (abort.signal.aborted) return;
        if (askedKane && !kaneCalled && !reserveNoteSent && step >= MAX_STEPS - KANE_RESERVE) {
          reserveNoteSent = true;
          conversation = [...conversation, {
            id: nanoid(),
            role: "user",
            content: `Only ${MAX_STEPS - step} steps remain for this message. Stop editing and inspecting now: call verify_with_kane with a check built from context.kane.testMode, then report the result.`,
            createdAt: new Date().toISOString(),
          }];
        }
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
          kane: {
            installed: Boolean(kaneStatus?.installed),
            authenticated: Boolean(kaneStatus?.authenticated),
            ...(typeof kaneStatus?.credits === "number" ? { credits: kaneStatus.credits } : {}),
            ...(kaneUnavailableFor(kaneStatus) ? { reason: kaneUnavailableFor(kaneStatus)! } : {}),
            ...(() => { try { return { testMode: testModeContext(currentDoc, fresh.activeSceneId) }; } catch { return {}; } })(),
            runsLeftThisTurn: kaneBudgetRef.current.kaneRunsLeft,
          },
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

        // A reply that only announces its next action ("Let me see…", "I need
        // the schemas…") and then stops is the main way the agent stalls. Give it
        // exactly one nudge per user message to actually make the call.
        const wantsKane = (options.expectKane || /\bkane\b/i.test(latestUserText(initialConversation))) && !kaneCalled;
        const announcedAction = (mode === "build" || mode === "plan") && ANNOUNCED_ACTION.test(assistantText);
        const emptyStep = !assistantText.trim();
        if (toolCalls.length === 0 && nudges < 3 && !lastStepWasNudge && (wantsKane || announcedAction || emptyStep) && step < MAX_STEPS - 1) {
          nudges += 1;
          lastStepWasNudge = true;
          const note = wantsKane
            ? "You have not called verify_with_kane yet. Call it now with a check built from context.kane.testMode (finish any edit the request needs first), or say in one sentence why it cannot be checked."
            : emptyStep
              ? "Your last reply was empty. Continue the task: make the next tool call now."
              : "You described your next step but did not take it. Call the tool now (e.g. list_commands with prefixes, then apply_commands). Do not reply with a plan.";
          conversation = [...conversation, { id: nanoid(), role: "user", content: note, createdAt: new Date().toISOString() }];
          continue;
        }

        if (toolCalls.length === 0) {
          if (!assistantText.trim()) {
            setMessages((prev) => [...prev, {
              id: nanoid(),
              role: "assistant",
              content: "The model returned an empty response. Try again, or switch models in the model picker.",
              createdAt: new Date().toISOString(),
            }]);
          }
          offerVerification();
          setStatus("ready");
          return;
        }

        lastStepWasNudge = false;
        for (const call of toolCalls) {
          if (abort.signal.aborted) return;
          if (call.name === "verify_with_kane") kaneCalled = true;
          setStatus("tool");
          const cardId = nanoid();
          const card: AgentToolCard = { id: call.callId || cardId, name: call.name, args: call.args, status: "running" };
          setMessages((prev) => [...prev, { id: nanoid(), role: "tool", content: "", createdAt: new Date().toISOString(), toolCallId: card.id, toolName: call.name, toolArgs: call.args, toolCard: card }]);
          // A throwing tool used to leave its card on "working" forever and end
          // the turn; it now returns a normal error the model can fix.
          const brokenArgs = (call.args as any)?._invalidJson === true;
          const executed: any = brokenArgs
            ? {
              ok: false,
              error: (call.args as any)._truncated
                ? `Your ${call.name} call was cut off at the model's output limit (${(call.args as any)._length} chars sent), so nothing ran. Send the same change as smaller calls: at most 3 object.create commands per apply_commands, and keep visuals minimal.`
                : `Your ${call.name} arguments were not valid JSON, so nothing ran. Send them again as a JSON object.`,
              revision: useEngineStore.getState().document?.revision ?? 0,
            }
            : await executeAgentTool(call.name, normalizeToolArgs(call.args), turnTransactionId, card.id, abort.signal)
            .catch((error: unknown) => ({ ok: false, error: `Tool ${call.name} failed: ${error instanceof Error ? error.message : String(error)}. Fix the arguments and call it again.`, revision: useEngineStore.getState().document?.revision ?? 0 }));
          // Stop already marked the card canceled; never overwrite it with a result.
          if (abort.signal.aborted) return;
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
      // The step budget ran out. Say so instead of ending silently, and be
      // explicit when the Kane check the user asked for never ran.
      setMessages((prev) => [...prev, {
        id: nanoid(),
        role: "assistant",
        content: askedKane && !kaneCalled
          ? `I used all ${MAX_STEPS} steps for this message before running the Kane check you asked for. Send "verify with Kane" to run it now.`
          : `I used all ${MAX_STEPS} steps for this message. Send "continue" to pick up where I stopped.`,
        createdAt: new Date().toISOString(),
      }]);
      offerVerification();
      setStatus("ready");
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
  }, [args.camera, args.lockedSelectionId, args.projectId, args.tab, args.tool, args.viewportSize, capabilities.vision, effectiveModelId, executeAgentTool, kaneStatus, mode, offerVerification]);

  const send = useCallback(async (text: string, attachments?: ChatAttachment[], replaceUserId?: string, options: { expectKane?: boolean } = {}) => {
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
    setVerifyOffer(null);
    gameplayChangeRef.current = null;
    kaneBudgetRef.current = new KaneTurnBudget();
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

    const initialConversation: AgentChatMessage[] = [...baseMessages.filter((m) => !m.streaming), userMsg].map(({ streaming, toolCard, ...m }) => m);

    await runTurn(initialConversation, abort, options);
  }, [args.camera, args.lockedSelectionId, args.projectId, args.tab, args.tool, args.viewportSize, capabilities.vision, effectiveModel, effectiveModelId, executeAgentTool, messages, mock, mode, providerConfigured, canUseTools, runTurn]);

  /**
   * Hands a panel-started phase to the agent. The stored result is appended
   * to the same conversation as a typed `run_kane_test_phase` tool result —
   * not as a fake user message — and then runs a model turn so the agent
   * explains it and may request a follow-up phase with its own tool call.
   */
  const continueWithPhaseResult = useCallback(async (result: KanePhaseResult) => {
    const store = useEngineStore.getState();
    const doc = store.document;
    if (!doc) {
      setError({ message: "No project open.", action: "retry" });
      setStatus("error");
      return;
    }
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
    }
    setError(null);
    const continuation = buildPhaseContinuation(result, doc.revision, nanoid());
    const display: DisplayMessage = {
      id: nanoid(),
      role: "tool",
      content: "",
      createdAt: new Date().toISOString(),
      toolCallId: continuation.toolCallId,
      toolName: continuation.toolName,
      toolArgs: continuation.toolArgs,
      toolCard: { id: continuation.toolCallId, name: continuation.toolName, args: continuation.toolArgs, status: "done", result: continuation.toolResult },
    };
    const base = messages.filter((message) => !message.streaming);
    const conversation: AgentChatMessage[] = [
      ...base.map(({ streaming, toolCard, ...m }) => m),
      continuationChatMessage(continuation, nanoid()),
    ];
    setMessages([...base, display]);
    const abort = new AbortController();
    abortRef.current = abort;
    await runTurn(conversation, abort);
  }, [messages, mock, effectiveModel, providerConfigured, runTurn]);

  /**
   * Test with Kane without the model choosing anything: runs the check (the
   * built-in smoke check by default) through the same tool executor, then, if
   * a tool-capable model is available, hands the typed result to the agent to
   * explain — the same continuation shape a panel-started phase uses.
   */
  const runKaneCheckDirect = useCallback(async (checkArgs?: Record<string, unknown>) => {
    const doc = useEngineStore.getState().document;
    if (!doc) return;
    setError(null);
    setVerifyOffer(null);
    kaneBudgetRef.current = new KaneTurnBudget();
    const callArgs = checkArgs ?? smokeCheckArgs(gameTestProfileForDocument(doc));
    const toolCallId = `kane-direct-${nanoid(8)}`;
    const card: AgentToolCard = { id: toolCallId, name: "verify_with_kane", args: callArgs, status: "running", progress: { message: "Rehearsing in the engine simulator", startedAt: Date.now() } };
    const base = messages.filter((message) => !message.streaming);
    setMessages([...base, { id: nanoid(), role: "tool", content: "", createdAt: new Date().toISOString(), toolCallId, toolName: card.name, toolArgs: callArgs, toolCard: card }]);
    const abort = new AbortController();
    abortRef.current = abort;
    setStatus("tool");
    const executed: any = await executeAgentTool("verify_with_kane", callArgs, nanoid(), toolCallId, abort.signal);
    if (abort.signal.aborted) return;
    const toolResult: ToolResult = { ok: executed.ok, data: executed.data, error: executed.error, revision: executed.revision ?? doc.revision };
    setMessages((prev) => prev.map((m) => m.toolCallId === toolCallId ? { ...m, toolCard: { ...card, status: executed.ok ? "done" : "error", result: toolResult }, toolResult, content: JSON.stringify(toolResult) } : m));
    const modelReady = mock || (Boolean(effectiveModel) && providerConfigured && canUseTools);
    if (!modelReady) {
      setStatus("ready");
      if (abortRef.current === abort) abortRef.current = null;
      return;
    }
    const toolMessage: AgentChatMessage = {
      id: nanoid(),
      role: "tool",
      content: JSON.stringify(toolResult),
      createdAt: new Date().toISOString(),
      toolCallId,
      toolName: "verify_with_kane",
      toolArgs: { ...callArgs, source: "test-with-kane-button" },
      toolResult,
    };
    await runTurn([...base.map(({ streaming, toolCard, ...m }) => m), toolMessage], abort);
  }, [canUseTools, effectiveModel, executeAgentTool, messages, mock, providerConfigured, runTurn]);

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
    continueWithPhaseResult,
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
    kaneStatus,
    refreshKaneStatus,
    verifyOffer,
    dismissVerifyOffer: () => setVerifyOffer(null),
    runKaneCheckDirect,
    requestKaneCheck: (description: string) => send(kaneCheckRequestMessage(description), undefined, undefined, { expectKane: true }),
  }), [kaneStatus, refreshKaneStatus, verifyOffer, runKaneCheckDirect, messages, status, mode, setMode, error, selectedModelId, setSelectedModelId, effectiveModelId, effectiveModel, models, providers, aiSettings, mock, capabilities, canBuildPlan, modelLabel, isBusy, send, continueWithPhaseResult, stop, retry, regenerate, newChat, sessionId, sessions, openChat, deleteChatSession, renameChatSession, refreshAiMeta, pendingPreview, applyPendingPreview, discardPendingPreview]);
}

/** Text that promises an action without taking it. */
const ANNOUNCED_ACTION = /\b(let me|i'll|i will|i need (to|the)|next,? i|now i|i'm going to|first,? i|re-?running|re-?trying|running (it|the \w+) again|trying again|re-?checking|re-?applying)\b/i;

/**
 * Models often send nested arrays as JSON strings (`commands: "[{...}]"`).
 * Parse those once here so every tool sees real arrays and objects.
 */
export function normalizeToolArgs(raw: unknown): Record<string, unknown> {
  let args: unknown = raw;
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch { return {}; }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  const out: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!(trimmed.startsWith("[") || trimmed.startsWith("{"))) continue;
    try { out[key] = JSON.parse(trimmed); } catch { /* leave as text */ }
  }
  return out;
}

function latestUserText(conversation: AgentChatMessage[]): string {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    if (conversation[index]?.role === "user") return conversation[index]!.content ?? "";
  }
  return "";
}

/** Why a Kane run cannot start, or null when it can. */
export function kaneUnavailableFor(status: KaneCliStatus | null): string | null {
  if (!status) return "Kane CLI status is unknown (the server did not answer).";
  if (!status.installed) return status.reason ?? "Kane CLI is not installed.";
  if (!status.authenticated) return status.reason ?? "Kane CLI is not signed in.";
  if (status.reason && /credit/i.test(status.reason)) return status.reason;
  return null;
}

/** Controls and frame-zero readouts the agent can name in a verify_with_kane check. */
function testModeContext(document: ProjectDocument, sceneId: string | null) {
  const profile = gameTestProfileForDocument(document);
  const scene = sceneId && document.scenes.some((candidate) => candidate.id === sceneId) ? sceneId : document.startSceneId;
  const controller = new TestController(document, { seed: 1234, sceneId: scene });
  return {
    controls: controlSummary(profile),
    readouts: profile.observations.map((observation) => ({
      id: observation.id,
      label: observation.label,
      start: String(observationValue(controller, observation) ?? "none"),
    })),
  };
}

function toSummary(record: ChatRecord): ChatSessionSummary {
  return {
    sessionId: record.sessionId,
    title: record.title,
    updatedAt: record.updatedAt,
    messageCount: record.messages.length,
  };
}
