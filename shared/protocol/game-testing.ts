import type { AiPlayResult, KaneEvent, KaneRunStatus, KaneStep } from "./kane";

/**
 * Contract between the approved plan and the Kane runner. The browser sends ids,
 * bounds and observation baselines — never a URL, command line or arbitrary
 * browser instruction. The server composes the objective and the snapshot URL.
 */
export const KANE_PHASE_LIMITS = {
  maxPhases: 3,
  maxAssertionsPerPhase: 12,
  maxControlsPerPhase: 6,
  maxObjectiveChars: 4000,
  maxBaselineEntries: 24,
} as const;

export const PHASE_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "increased"] as const;
export type PhaseOperator = (typeof PHASE_OPERATORS)[number];

export const PHASE_STOP_CONDITIONS = ["passed", "failed", "lost", "won", "budget-exhausted"] as const;

export interface PhaseAssertionSpec {
  id: string;
  observationId: string;
  operator: PhaseOperator;
  expected: string | number | boolean;
}

export interface PhaseSpec {
  id: string;
  objectiveId?: string;
  purpose: string;
  kaneObjective: string;
  allowedControlIds: string[];
  assertions: PhaseAssertionSpec[];
  stopWhen: string[];
}

export interface PlanForPhase {
  version: 1;
  projectId: string;
  sourceRevision: number;
  sceneId: string;
  seed: number;
  scenarioId?: string;
  userGoal: string;
  phases: PhaseSpec[];
  budget: {
    maxKanePhases: number;
    maxKaneStepsPerPhase: number;
    maxWallTimeSecondsPerPhase: number;
    maxFramesPerAdvance: number;
    maxFramesPerPhase: number;
  };
}

export interface KanePhaseRequest {
  sessionId: string;
  snapshotId: string;
  phaseId: string;
  plan: PlanForPhase;
  /** Visible labels the phase objective may name. Keys must be assertion observation ids. */
  observationLabels?: Record<string, string>;
  /** Visible control labels from the registered profile. Keys must be allowed controls. */
  controlLabels?: Record<string, string>;
  /** Control semantics so the objective tells Kane whether to toggle or click once. */
  controlModes?: Record<string, "hold" | "pulse">;
  /** Values observed at frame zero, used only for `increased` comparisons. */
  baseline?: Record<string, string | number | boolean>;
}

export type PhaseVerdict = "passed" | "failed" | "inconclusive" | "cancelled";

export type PhaseFailureKind =
  | "none"
  | "product"
  | "input"
  | "observation"
  | "verdict"
  | "evidence"
  | "infrastructure"
  | "timeout"
  | "budget"
  | "cancelled";

export interface PhaseAssertionResult extends PhaseAssertionSpec {
  actual?: string;
  status: "passed" | "failed" | "missing";
}

export interface PhaseReproducibility {
  projectRevision: number;
  seed: number;
  scenarioId?: string;
  budget: PlanForPhase["budget"];
  kaneCliVersion?: string;
  /** Safe, client-facing evidence reference. Raw local paths stay in server logs. */
  evidenceRef?: string;
}

export interface KanePhaseResult {
  sessionId: string;
  snapshotId: string;
  runId?: string;
  planRevision: number;
  phaseId: string;
  phaseIndex: number;
  verdict: PhaseVerdict;
  failureKind: PhaseFailureKind;
  reason: string;
  summary: string;
  kaneStatus: KaneRunStatus;
  objective: string;
  checks: PhaseAssertionResult[];
  finalState: Record<string, string>;
  acceptedInputs: number | null;
  /** Runtime frames observed at the end of the phase; used to enforce the approved budget. */
  framesAdvanced: number | null;
  steps: Pick<KaneStep, "step" | "status" | "remark">[];
  runtimeErrors: string[];
  evidenceUrl?: string;
  testUrl?: string;
  reproducibility?: PhaseReproducibility;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

export type KanePhaseEvent = KaneEvent | { type: "phase_result"; result: KanePhaseResult };

export interface KanePhaseStreamHandlers {
  onEvent?: (event: KanePhaseEvent) => void;
  signal?: AbortSignal;
}

export type JudgeKanePhase = (input: {
  result: AiPlayResult;
  request: KanePhaseRequest;
  objective: string;
  startedAt: string;
}) => KanePhaseResult;
