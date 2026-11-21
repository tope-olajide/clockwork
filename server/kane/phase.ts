import { z } from "zod";
import type { AiPlayResult } from "../../shared/protocol/kane";
import { redactLocalPaths, redactStrings } from "../../shared/protocol/redaction";
import {
  KANE_PHASE_LIMITS,
  PHASE_OPERATORS,
  PHASE_STOP_CONDITIONS,
  type KanePhaseRequest,
  type KanePhaseResult,
  type PhaseAssertionResult,
  type PhaseFailureKind,
  type PhaseSpec,
  type PhaseVerdict,
} from "../../shared/protocol/game-testing";

const SAFE_TEXT = /^[^<>]*$/;
const ID_TEXT = /^[A-Za-z0-9_-]{1,64}$/;
const SESSION_TEXT = /^[A-Za-z0-9_-]{8,64}$/;

const primitive = z.union([z.string().max(200), z.number().finite(), z.boolean()]);

const assertionSchema = z
  .object({
    id: z.string().regex(ID_TEXT),
    observationId: z.string().regex(ID_TEXT),
    operator: z.enum(PHASE_OPERATORS),
    expected: primitive,
  })
  .strict();

const phaseSchema = z
  .object({
    id: z.string().regex(ID_TEXT),
    objectiveId: z.string().regex(ID_TEXT).optional(),
    purpose: z.string().min(1).max(200).regex(SAFE_TEXT),
    kaneObjective: z.string().min(1).max(600).regex(SAFE_TEXT),
    allowedControlIds: z
      .array(z.string().regex(/^[a-z0-9-]{1,40}$/))
      .max(KANE_PHASE_LIMITS.maxControlsPerPhase),
    assertions: z
      .array(assertionSchema)
      .min(1)
      .max(KANE_PHASE_LIMITS.maxAssertionsPerPhase),
    stopWhen: z.array(z.enum(PHASE_STOP_CONDITIONS)).min(1),
  })
  .strict();

const planSchema = z
  .object({
    version: z.literal(1),
    projectId: z.string().regex(ID_TEXT),
    sourceRevision: z.number().int().nonnegative(),
    sceneId: z.string().regex(ID_TEXT),
    seed: z.number().int().min(0).max(2_147_483_647),
    scenarioId: z.string().regex(ID_TEXT).optional(),
    userGoal: z.string().min(1).max(1000).regex(SAFE_TEXT),
    phases: z.array(phaseSchema).min(1).max(KANE_PHASE_LIMITS.maxPhases),
    budget: z
      .object({
        maxKanePhases: z.number().int().min(1).max(KANE_PHASE_LIMITS.maxPhases),
        maxKaneStepsPerPhase: z.number().int().min(1).max(8),
        maxWallTimeSecondsPerPhase: z.number().int().min(10).max(140),
        maxFramesPerAdvance: z.number().int().min(1).max(600),
        maxFramesPerPhase: z.number().int().min(1).max(3600),
      })
      .strict(),
  })
  .strict();

export const kanePhaseRequestSchema = z
  .object({
    sessionId: z.string().regex(SESSION_TEXT),
    snapshotId: z.string().regex(ID_TEXT),
    phaseId: z.string().regex(ID_TEXT),
    plan: planSchema,
    observationLabels: z.record(z.string().regex(ID_TEXT), z.string().min(1).max(40).regex(SAFE_TEXT)).optional(),
    baseline: z.record(z.string().regex(ID_TEXT), primitive).optional(),
  })
  .strict();

export interface PhaseValidationDocument {
  id: string;
  revision: number;
  scenes: { id: string }[];
}

export type PhaseValidation =
  | { ok: true; request: KanePhaseRequest; phase: PhaseSpec; phaseIndex: number }
  | { ok: false; error: string };

/**
 * Validates a phase request against the stored project document. The plan is
 * treated as untrusted input: it may only reference ids that exist in the
 * snapshot document, and its budget may only narrow the server limits.
 */
export function validatePhaseRequest(body: unknown, document: PhaseValidationDocument): PhaseValidation {
  const parsed = kanePhaseRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return { ok: false, error: `${path}${issue?.message ?? "Malformed phase request."}` };
  }
  const request = parsed.data as KanePhaseRequest;
  const { plan } = request;

  if (plan.projectId !== document.id) {
    return { ok: false, error: "The plan belongs to a different project than the snapshot." };
  }
  if (plan.sourceRevision !== document.revision) {
    return {
      ok: false,
      error: `The plan targets revision ${plan.sourceRevision}, but the snapshot is revision ${document.revision}. Re-approve the plan for the current revision.`,
    };
  }
  if (!document.scenes.some((scene) => scene.id === plan.sceneId)) {
    return { ok: false, error: `Scene "${plan.sceneId}" does not exist in the snapshot.` };
  }
  if (plan.phases.length > plan.budget.maxKanePhases) {
    return { ok: false, error: "The plan has more phases than its approved budget allows." };
  }
  const seen = new Set<string>();
  for (const phase of plan.phases) {
    if (seen.has(phase.id)) return { ok: false, error: `Duplicate phase id "${phase.id}".` };
    seen.add(phase.id);
    for (const assertion of phase.assertions) {
      if (!phase.allowedControlIds.length && assertion.operator === "increased" && !request.baseline?.[assertion.observationId]) {
        return { ok: false, error: `Assertion "${assertion.id}" needs a baseline value for "${assertion.observationId}".` };
      }
    }
  }

  const phaseIndex = plan.phases.findIndex((phase) => phase.id === request.phaseId);
  if (phaseIndex < 0) return { ok: false, error: `Phase "${request.phaseId}" is not part of the approved plan.` };
  const phase = plan.phases[phaseIndex];
  if (!phase) return { ok: false, error: `Phase "${request.phaseId}" is not part of the approved plan.` };

  const assertionObservationIds = new Set(phase.assertions.map((assertion) => assertion.observationId));
  for (const key of Object.keys(request.observationLabels ?? {})) {
    if (!assertionObservationIds.has(key)) {
      return { ok: false, error: `Observation label "${key}" is not asserted by this phase.` };
    }
  }
  if (request.baseline && Object.keys(request.baseline).length > KANE_PHASE_LIMITS.maxBaselineEntries) {
    return { ok: false, error: "Too many baseline values." };
  }
  for (const key of Object.keys(request.baseline ?? {})) {
    if (!assertionObservationIds.has(key)) {
      return { ok: false, error: `Baseline "${key}" is not asserted by this phase.` };
    }
  }

  return { ok: true, request, phase, phaseIndex };
}

/**
 * Idempotency key input. Two approvals of the same revision and seed can differ in
 * assertions, so the plan content is part of the key; only an identical request
 * replays a stored result.
 */
export function phaseFingerprint(request: KanePhaseRequest): string {
  const raw = JSON.stringify({
    plan: request.plan,
    observationLabels: request.observationLabels ?? null,
    baseline: request.baseline ?? null,
  });
  let hash = 5381;
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash * 33) ^ raw.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

/** Server-composed objective. Never taken verbatim from the client. */
export function composePhaseObjective(request: KanePhaseRequest, phase: PhaseSpec): string {
  const labels = request.observationLabels ?? {};
  const lines: string[] = [
    `Approved Clockwork test plan phase "${phase.id}".`,
    `User goal (authoritative, do not replace): ${request.plan.userGoal}`,
    `Phase purpose: ${phase.purpose}`,
    `What to do: ${phase.kaneObjective}`,
  ];
  if (phase.allowedControlIds.length) {
    lines.push(`Use only these controls: ${phase.allowedControlIds.join(", ")}.`);
  } else {
    lines.push("Do not press gameplay controls in this phase; observe only.");
  }
  lines.push(
    "The page is in Clockwork Test Mode. The simulation advances only when you take an action; do not reload or re-navigate.",
    "When the phase is complete, read the OBSERVATIONS panel and store each value exactly as instructed:",
  );
  for (const assertion of phase.assertions) {
    const label = labels[assertion.observationId] ?? assertion.observationId.toUpperCase();
    lines.push(`- ${label} as '${assertion.observationId}'`);
  }
  lines.push(
    "Also store the ACCEPTED INPUTS counter as 'accepted_inputs'.",
    "Then end the run. Do not add checks that are not listed above.",
  );
  const objective = lines.join("\n");
  return objective.slice(0, KANE_PHASE_LIMITS.maxObjectiveChars);
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function actualText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function missingText(value: string | undefined): boolean {
  return value === undefined || value.trim() === "" || value.trim().toLowerCase() === "none";
}

function judgeCheck(
  assertion: PhaseAssertionResult,
  finalState: Record<string, string>,
  baseline: Record<string, string | number | boolean> | undefined,
): PhaseAssertionResult {
  const raw = finalState[assertion.observationId];
  const actual = actualText(raw);
  if (missingText(actual)) return { ...assertion, status: "missing" };

  const operator = assertion.operator;
  const expected = assertion.expected;
  if (operator === "increased") {
    const before = numeric(baseline?.[assertion.observationId]);
    const after = numeric(actual);
    if (before === null || after === null) return { ...assertion, actual, status: "missing" };
    return { ...assertion, actual, status: after > before ? "passed" : "failed" };
  }

  if (operator === "eq" || operator === "neq") {
    const expectedText = String(expected);
    const actualNumber = numeric(actual);
    const equal = actualText(raw) === expectedText || (actualNumber !== null && actualNumber === numeric(expected));
    const status = (operator === "eq") === equal ? "passed" : "failed";
    return { ...assertion, actual, status };
  }

  const left = numeric(actual);
  const right = numeric(expected);
  if (left === null || right === null) return { ...assertion, actual, status: "missing" };
  const passed =
    operator === "gt" ? left > right : operator === "gte" ? left >= right : operator === "lt" ? left < right : left <= right;
  return { ...assertion, actual, status: passed ? "passed" : "failed" };
}

export interface PhaseJudgeInput {
  result: AiPlayResult;
  request: KanePhaseRequest;
  phase: PhaseSpec;
  phaseIndex: number;
  objective: string;
  startedAt: string;
  /** CLI version observed by the server; recorded for reproducibility, not a pass signal. */
  kaneCliVersion?: string;
}

/**
 * Strictly joins the Kane verdict, input receipts, observations, assertions and
 * evidence into one typed phase result. A Kane pass alone is never a phase pass.
 */
export function judgePhase(input: PhaseJudgeInput): KanePhaseResult {
  const { result, request, phase, phaseIndex, objective, startedAt, kaneCliVersion } = input;
  const finalState = result.finalState ?? {};
  const checks = phase.assertions.map((assertion) =>
    judgeCheck({ ...assertion, status: "missing" }, finalState, request.baseline),
  );
  const acceptedInputs = numeric(finalState.accepted_inputs);
  const runtimeErrors = (result.runtimeErrors ?? []).map(redactLocalPaths);

  let verdict: PhaseVerdict = "inconclusive";
  let failureKind: PhaseFailureKind = "verdict";
  let reason = "The phase did not reach a verifiable verdict.";

  const missing = checks.filter((check) => check.status === "missing");
  const failed = checks.filter((check) => check.status === "failed");

  if (result.status === "cancelled" && /timed out/i.test(result.summary ?? "")) {
    // The runner reports both a kill and the wall-clock cap as `cancelled`; only
    // the summary distinguishes a timeout, which is inconclusive, not a cancel.
    verdict = "inconclusive";
    failureKind = "timeout";
    reason = result.summary;
  } else if (result.status === "cancelled") {
    verdict = "cancelled";
    failureKind = "cancelled";
    reason = result.summary || "The phase was cancelled.";
  } else if (result.status === "error") {
    verdict = "inconclusive";
    failureKind = /timed out/i.test(result.summary ?? "") ? "timeout" : "infrastructure";
    reason = result.summary || "Kane reported an error without a usable verdict.";
  } else if (missing.length) {
    verdict = "inconclusive";
    failureKind = "observation";
    reason = `Kane did not report ${missing.map((check) => check.observationId).join(", ")}.`;
  } else if (phase.allowedControlIds.length > 0 && acceptedInputs === null) {
    verdict = "inconclusive";
    failureKind = "input";
    reason = "Kane did not report an accepted-input count, so the plan cannot prove the controls worked.";
  } else if (phase.allowedControlIds.length > 0 && acceptedInputs === 0) {
    verdict = "failed";
    failureKind = "input";
    reason = "No input was accepted by the game during this phase.";
  } else if (result.status === "failed") {
    verdict = "failed";
    failureKind = "product";
    reason = result.summary || "Kane reported the phase as failed.";
  } else if (failed.length) {
    verdict = "failed";
    failureKind = "product";
    reason = `Assertion failed: ${failed
      .map((check) => `${check.observationId} expected ${check.operator} ${String(check.expected)}, got ${check.actual}`)
      .join("; ")}.`;
  } else if (runtimeErrors.length) {
    // A gameplay/runtime error means the observed values cannot be trusted as a pass,
    // even when the assertion numbers happen to match.
    verdict = "inconclusive";
    failureKind = "evidence";
    reason = `The run reported runtime errors, so the pass is not trustworthy: ${runtimeErrors.join("; ")}`;
  } else if (!result.evidenceUrl) {
    verdict = "inconclusive";
    failureKind = "evidence";
    reason = "The run produced no evidence bundle, so the pass cannot be reviewed.";
  } else {
    verdict = "passed";
    failureKind = "none";
    reason = "Kane passed and every approved assertion matched the observed values.";
  }

  return {
    sessionId: request.sessionId,
    snapshotId: request.snapshotId,
    runId: result.runId,
    planRevision: request.plan.sourceRevision,
    phaseId: phase.id,
    phaseIndex,
    verdict,
    failureKind,
    reason: redactLocalPaths(reason),
    summary: redactLocalPaths(result.summary || reason),
    kaneStatus: result.status,
    objective: redactLocalPaths(objective),
    checks: checks.map((check) => ({ ...check, ...(check.actual !== undefined ? { actual: redactLocalPaths(check.actual) } : {}) })),
    finalState: redactStrings(finalState),
    acceptedInputs,
    steps: (result.steps ?? []).map((step) => ({ step: step.step, status: step.status, remark: redactLocalPaths(step.remark) })),
    runtimeErrors,
    evidenceUrl: result.evidenceUrl,
    testUrl: result.testUrl,
    reproducibility: {
      projectRevision: request.plan.sourceRevision,
      seed: request.plan.seed,
      ...(request.plan.scenarioId ? { scenarioId: request.plan.scenarioId } : {}),
      budget: { ...request.plan.budget },
      ...(kaneCliVersion ? { kaneCliVersion } : {}),
      ...(result.evidenceUrl ? { evidenceRef: result.evidenceUrl } : {}),
    },
    durationMs: result.durationMs,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}
