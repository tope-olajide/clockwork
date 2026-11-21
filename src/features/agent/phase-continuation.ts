import type { AgentChatMessage, ToolResult } from "@shared/protocol";
import type { KanePhaseResult } from "@shared/protocol/game-testing";

/**
 * Phase 5: the panel path and the agent path share one continuation shape.
 * A phase run started from `TestPlanPanel` is handed to the agent as a typed
 * `run_kane_test_phase` tool result appended to the same conversation — never
 * as a fake user message — so the agent can explain it and request a
 * follow-up phase with the same tool it uses itself.
 */

export interface PhaseResultPayload {
  phaseId: string;
  phaseIndex: number;
  verdict: KanePhaseResult["verdict"];
  failureKind: KanePhaseResult["failureKind"];
  reason: string;
  summary: string;
  kaneStatus: KanePhaseResult["kaneStatus"];
  checks: KanePhaseResult["checks"];
  acceptedInputs: KanePhaseResult["acceptedInputs"];
  framesAdvanced: KanePhaseResult["framesAdvanced"];
  finalState: KanePhaseResult["finalState"];
  durationMs: number;
  steps: KanePhaseResult["steps"];
  runtimeErrors: KanePhaseResult["runtimeErrors"];
  evidenceUrl?: string;
  testUrl?: string;
  snapshotId: string;
}

/** The exact data payload both paths attach to a phase tool result. */
export function phaseResultPayload(result: KanePhaseResult): PhaseResultPayload {
  // The agent loop historically kept only the trailing steps to bound context;
  // the full result stays in the test-plan store, so the panel never loses it.
  return {
    phaseId: result.phaseId,
    phaseIndex: result.phaseIndex,
    verdict: result.verdict,
    failureKind: result.failureKind,
    reason: result.reason,
    summary: result.summary,
    kaneStatus: result.kaneStatus,
    checks: result.checks,
    acceptedInputs: result.acceptedInputs,
    framesAdvanced: result.framesAdvanced,
    finalState: result.finalState,
    durationMs: result.durationMs,
    steps: result.steps.slice(-12),
    runtimeErrors: result.runtimeErrors,
    evidenceUrl: result.evidenceUrl,
    testUrl: result.testUrl,
    snapshotId: result.snapshotId,
  };
}

export interface PhaseContinuation {
  toolCallId: string;
  toolName: "run_kane_test_phase";
  toolArgs: { phaseId: string; source: "test-plan-panel" };
  toolResult: ToolResult;
}

/**
 * Builds the typed tool message for a panel-started phase. The caller appends
 * it to the conversation as role "tool" and then runs a model turn, so the
 * agent explains the result in its own words instead of reading a paraphrase.
 */
export function buildPhaseContinuation(
  result: KanePhaseResult,
  revision: number,
  toolCallId: string,
): PhaseContinuation {
  const toolResult: ToolResult = {
    ok: true,
    data: phaseResultPayload(result),
    revision,
  };
  return {
    toolCallId,
    toolName: "run_kane_test_phase",
    toolArgs: { phaseId: result.phaseId, source: "test-plan-panel" },
    toolResult,
  };
}

export function continuationChatMessage(continuation: PhaseContinuation, id: string): AgentChatMessage {
  return {
    id,
    role: "tool",
    content: JSON.stringify(continuation.toolResult),
    createdAt: new Date().toISOString(),
    toolCallId: continuation.toolCallId,
    toolName: continuation.toolName,
    toolArgs: continuation.toolArgs,
    toolResult: continuation.toolResult,
  };
}

export interface PhaseCheckView {
  id: string;
  text: string;
  status: string;
}

export interface PhaseCardView {
  phaseId: string;
  verdictLabel: string;
  verdictTone: "success" | "danger" | "muted";
  failureLabel: string;
  reason: string;
  checks: PhaseCheckView[];
  inputsLabel: string;
  framesLabel: string;
  durationLabel: string;
  evidenceUrl?: string;
}

/** Normalizes either path's tool data into the rich phase card. Returns null when the payload is not a phase result. */
export function phaseCardView(data: Record<string, unknown> | null | undefined): PhaseCardView | null {
  if (!data || typeof data.phaseId !== "string" || typeof data.verdict !== "string") return null;
  const verdict = data.verdict;
  const checks = Array.isArray(data.checks) ? data.checks : [];
  const durationMs = typeof data.durationMs === "number" ? data.durationMs : 0;
  const evidenceUrl = typeof data.evidenceUrl === "string" ? data.evidenceUrl : undefined;
  return {
    phaseId: data.phaseId,
    verdictLabel: verdict.toUpperCase(),
    verdictTone: verdict === "passed" ? "success" : verdict === "failed" ? "danger" : "muted",
    failureLabel: typeof data.failureKind === "string" ? data.failureKind : "unknown",
    reason: typeof data.reason === "string" ? data.reason : "",
    checks: checks.map((check: any) => ({
      id: String(check?.id ?? check?.observationId ?? "check"),
      text: `${String(check?.observationId ?? "?")} ${String(check?.operator ?? "?")} ${String(check?.expected ?? "?")} · observed ${check?.actual ?? "none"}`,
      status: String(check?.status ?? "missing"),
    })),
    inputsLabel: data.acceptedInputs === null || data.acceptedInputs === undefined
      ? "unknown"
      : String(data.acceptedInputs),
    framesLabel: data.framesAdvanced === null || data.framesAdvanced === undefined
      ? "unknown"
      : String(data.framesAdvanced),
    durationLabel: durationMs > 0 ? `${(durationMs / 1000).toFixed(1)}s` : "unknown",
    evidenceUrl,
  };
}
