import type { AiPlayResult, KaneCliStatus, KaneEvent } from "@shared/protocol/kane";
import type { KanePhaseEvent, KanePhaseRequest, KanePhaseResult } from "@shared/protocol/game-testing";
import type { KaneCheckRequest } from "@shared/kane-check";

export interface AiPlayStreamHandlers {
  onEvent?: (event: KaneEvent) => void;
  onResult?: (result: AiPlayResult) => void;
  /** Called once with the server run id, as soon as it is known (needed for Stop). */
  onRunId?: (runId: string) => void;
  signal?: AbortSignal;
}

export async function fetchKaneStatus(refresh = false): Promise<KaneCliStatus> {
  const response = await fetch(`/api/kane/status${refresh ? "?refresh=1" : ""}`);
  const body = await response.json().catch(() => null) as { ok?: boolean; status?: KaneCliStatus; error?: string } | null;
  if (!response.ok || !body?.status) throw new Error(body?.error || `Kane status failed (HTTP ${response.status}).`);
  return body.status;
}

async function streamKane(
  endpoint: string,
  input: Record<string, unknown>,
  handlers: AiPlayStreamHandlers = {},
): Promise<AiPlayResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: handlers.signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    throw Object.assign(new Error(body?.error || `AI Play failed (HTTP ${response.status}).`), { code: body?.code, status: response.status });
  }
  if (!response.body) throw new Error("AI Play returned no event stream.");
  let reportedRunId: string | null = null;
  const reportRunId = (runId: string | null | undefined) => {
    if (!runId || reportedRunId === runId) return;
    reportedRunId = runId;
    handlers.onRunId?.(runId);
  };
  reportRunId(response.headers.get("X-Kane-Run"));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: AiPlayResult | null = null;

  const consume = (line: string) => {
    if (!line.trim()) return;
    let event: KaneEvent;
    try { event = JSON.parse(line) as KaneEvent; } catch { return; }
    if (event.type === "stream_start") reportRunId(event.runId);
    handlers.onEvent?.(event);
    if (event.type === "run_end") {
      final = event.result;
      handlers.onResult?.(event.result);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer.trim()) consume(buffer);
  if (!final) throw new Error("Kane ended without a verdict. Check the run evidence and Kane CLI sign-in.");
  return final;
}

export interface KanePhaseStreamHandlers {
  onEvent?: (event: KanePhaseEvent) => void;
  onResult?: (result: KanePhaseResult) => void;
  onRunId?: (runId: string) => void;
  signal?: AbortSignal;
}

export interface PhaseReplayRef {
  key: string;
  phaseId: string;
  label: string;
}

/** Recorded testmd replays the panel can offer per phase. Paths stay server-side. */
export async function fetchPhaseReplays(): Promise<PhaseReplayRef[]> {
  try {
    const response = await fetch("/api/kane/phase-replays");
    const body = (await response.json().catch(() => null)) as { ok?: boolean; replays?: PhaseReplayRef[] } | null;
    if (!response.ok || !body || !Array.isArray(body.replays)) return [];
    return body.replays.filter((replay) => replay && typeof replay.key === "string" && typeof replay.phaseId === "string");
  } catch {
    return [];
  }
}

const PHASE_RESUME_ATTEMPTS = 18;
const PHASE_RESUME_DELAY_MS = 5_000;

/** One request/stream attempt. Returns null when the run is still in flight. */
async function streamKanePhaseOnce(
  input: KanePhaseRequest,
  handlers: KanePhaseStreamHandlers,
): Promise<KanePhaseResult | null> {
  const response = await fetch("/api/kane/phase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: handlers.signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    // 409 means the approved run is still active (or its budget is used). The
    // server's idempotent store returns the typed result as soon as it exists,
    // so the caller can safely retry the same approved request.
    if (response.status === 409) return null;
    throw Object.assign(new Error(body?.error || `Kane phase failed (HTTP ${response.status}).`), {
      code: body?.code,
      status: response.status,
    });
  }
  if (!response.body) throw new Error("Kane phase returned no event stream.");
  const headerRunId = response.headers.get("X-Kane-Run");
  if (headerRunId) handlers.onRunId?.(headerRunId);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: KanePhaseResult | null = null;

  const consume = (line: string) => {
    if (!line.trim()) return;
    let event: KanePhaseEvent;
    try { event = JSON.parse(line) as KanePhaseEvent; } catch { return; }
    if (event.type === "stream_start") handlers.onRunId?.(event.runId);
    handlers.onEvent?.(event);
    if (event.type === "phase_result") {
      final = event.result;
      handlers.onResult?.(event.result);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer.trim()) consume(buffer);
  return final;
}

/**
 * Run one approved phase, surviving a dropped development proxy connection.
 * A long Kane run can outlive an HTTP connection while the server keeps going.
 * Re-posting the same request is safe: the server keys the session by plan
 * fingerprint and replays the finished typed result instead of running again.
 */
export async function streamKanePhase(
  input: KanePhaseRequest,
  handlers: KanePhaseStreamHandlers = {},
): Promise<KanePhaseResult> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < PHASE_RESUME_ATTEMPTS; attempt += 1) {
    if (handlers.signal?.aborted) throw new Error("Kane phase was cancelled.");
    try {
      const result = await streamKanePhaseOnce(input, handlers);
      if (result) return result;
    } catch (error) {
      if (handlers.signal?.aborted) throw error;
      const status = (error as { status?: number }).status;
      if (status && status !== 409) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, PHASE_RESUME_DELAY_MS));
  }
  throw lastError ?? new Error("Kane phase ended without a typed result.");
}

export function streamAiPlay(
  input: { snapshotId: string; projectId?: string; attempt?: number; goal?: string; sceneId?: string; seed?: number },
  handlers: AiPlayStreamHandlers = {},
): Promise<AiPlayResult> {
  return streamKane("/api/kane/ai-play", input, handlers);
}

export function verifyWithKane(
  input: { snapshotId: string; objective?: string; check?: KaneCheckRequest; sceneId?: string; seed?: number },
  handlers: AiPlayStreamHandlers = {},
): Promise<AiPlayResult> {
  return streamKane("/api/kane/qa", input, handlers);
}

export async function cancelAiPlay(runId: string): Promise<void> {
  await fetch(`/api/kane/ai-play/${encodeURIComponent(runId)}/cancel`, { method: "POST" }).catch(() => undefined);
}

export async function fetchKaneObjective(snapshotId: string): Promise<{ objective: string; qaObjective: string }> {
  const response = await fetch(`/api/kane/ai-play/objective/${encodeURIComponent(snapshotId)}`);
  const body = await response.json().catch(() => null) as { ok?: boolean; objective?: string; qaObjective?: string; error?: string } | null;
  if (!response.ok || !body?.objective) throw new Error(body?.error || "Could not build the Kane objective.");
  return { objective: body.objective, qaObjective: body.qaObjective ?? body.objective };
}
