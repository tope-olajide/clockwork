import { useCallback, useRef, useState } from "react";
import type { AiPlayResult, KaneCliStatus, KaneEvent, KaneStep } from "@shared/protocol/kane";
import { collectProjectAssets, createSnapshot } from "../../engine/io/snapshot";
import { cancelAiPlay, fetchKaneObjective, fetchKaneStatus, streamAiPlay } from "../../engine/ai/kane-api";
import type { ProjectDocument } from "../../engine/model/schema";

export type AiPlayPhase = "idle" | "preparing" | "running" | "fixing" | "passed" | "failed" | "error";

export interface AiPlayAttemptView {
  attempt: number;
  result: AiPlayResult;
}

interface UseAiPlayArgs {
  projectId: string;
  getDocument: () => ProjectDocument | null;
  saveNow: () => Promise<void>;
  onRepair: (result: AiPlayResult) => Promise<boolean>;
}

const CONSENT_KEY = "clockwork:ai-play-consent:v1";

export function useAiPlay(args: UseAiPlayArgs) {
  const [phase, setPhase] = useState<AiPlayPhase>("idle");
  const [steps, setSteps] = useState<KaneStep[]>([]);
  const [attempts, setAttempts] = useState<AiPlayAttemptView[]>([]);
  const [objective, setObjective] = useState("");
  const [result, setResult] = useState<AiPlayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<KaneCliStatus | null>(null);
  const [autoFix, setAutoFix] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const consentRef = useRef(false);
  const [consentOpen, setConsentOpen] = useState(false);

  const refreshStatus = useCallback(async (refresh = false) => {
    try {
      const next = await fetchKaneStatus(refresh);
      setStatus(next);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach Kane.");
      return null;
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (runId) void cancelAiPlay(runId);
    setPhase("idle");
  }, [runId]);

  const runAttempts = useCallback(async (forceConsent = false, allowAutoFix = autoFix) => {
    if (consentRef.current === false) {
      let consented = false;
      try { consented = window.sessionStorage.getItem(CONSENT_KEY) === "1"; } catch { /* ignore */ }
      if (!consented && !forceConsent) {
        setConsentOpen(true);
        return;
      }
      consentRef.current = true;
    }
    setError(null);
    setAttempts([]);
    setSteps([]);
    setResult(null);
    setPhase("preparing");
    const abort = new AbortController();
    abortRef.current = abort;
    let latest: AiPlayResult | null = null;
    try {
      const kane = await refreshStatus();
      if (!kane?.installed || !kane.authenticated) {
        setError(kane?.reason || "Kane CLI is not configured. Set up Kane and try again.");
        setPhase("error");
        return;
      }

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        if (abort.signal.aborted) return;
        const document = args.getDocument();
        if (!document) throw new Error("No project is open.");
        setPhase(attempt === 1 ? "preparing" : "running");
        await args.saveNow();
        const assets = await collectProjectAssets(document);
        const snapshot = await createSnapshot(document, { assets, ttlHours: 1 });
        const copy = await fetchKaneObjective(snapshot.id);
        setObjective(copy.objective);
        setPhase("running");
        const liveSteps: KaneStep[] = [];
        setSteps(liveSteps);
        const run = await streamAiPlay({
          snapshotId: snapshot.id,
          projectId: args.projectId,
          attempt,
          seed: 1234,
        }, {
          signal: abort.signal,
          onEvent: (event: KaneEvent) => {
            if (event.type === "stream_start") setRunId(event.runId);
            if (event.type === "step") {
              liveSteps.push({ step: event.step, status: event.status, remark: event.remark, childId: event.childId });
              setSteps([...liveSteps]);
            }
            if (event.type === "error") setError(event.message);
          },
        });
        latest = run;
        setResult(run);
        setAttempts((previous) => [...previous, { attempt, result: run }]);
        setPhase(run.status === "passed" ? "passed" : "failed");

        if (run.status === "passed" || !allowAutoFix || attempt === 2) break;
        setPhase("fixing");
        const fixed = await args.onRepair(run);
        if (!fixed) {
          setError("The Clockwork agent could not find a safe repair for this failure. Inspect the evidence or undo the run.");
          setPhase("failed");
          break;
        }
      }
    } catch (caught) {
      if ((caught as Error).name === "AbortError") {
        setPhase("idle");
        return;
      }
      setError(caught instanceof Error ? caught.message : "AI Play failed.");
      setPhase("error");
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      if (latest) setResult(latest);
    }
  }, [args, autoFix, refreshStatus]);

  const begin = useCallback(async (enableAutoFix: boolean) => {
    setAutoFix(enableAutoFix);
    await runAttempts(false, enableAutoFix);
  }, [runAttempts]);

  const acceptConsent = useCallback(async (remember: boolean) => {
    if (remember) {
      try { window.sessionStorage.setItem(CONSENT_KEY, "1"); } catch { /* ignore */ }
    }
    consentRef.current = true;
    setConsentOpen(false);
    await runAttempts(true, autoFix);
  }, [autoFix, runAttempts]);

  const undoFix = useCallback(async () => {
    setPhase("idle");
    setError("Use Undo in the editor to revert the AI fix.");
  }, []);

  return {
    phase,
    steps,
    attempts,
    objective,
    result,
    error,
    runId,
    status,
    autoFix,
    setAutoFix,
    consentOpen,
    setConsentOpen,
    begin,
    acceptConsent,
    stop,
    undoFix,
    refreshStatus,
  };
}
