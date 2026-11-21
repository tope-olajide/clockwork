import type { KanePhaseResult } from "@shared/protocol/game-testing";
import { redactLocalPaths } from "../../../shared/protocol/redaction";
import type { TestPlanAssertion, TestPlanBudget } from "./game-test-plan";
import type { TestPlanDraft } from "./game-test-draft";

/**
 * Per-criterion report for an approved test plan.
 *
 * A criterion is PASS only when its assertion matched, its phase verdict passed,
 * the phase has an evidence bundle and the run reported no runtime errors.
 * Everything else is FAIL or INCONCLUSIVE — a phase that never ran is never
 * reported as a pass, and an unrun criterion is not silently dropped.
 */
export type TestReportCriterionStatus = "passed" | "failed" | "inconclusive";

export type TestReportVerdict = "passed" | "failed" | "inconclusive";

export interface TestReportCriterion {
  phaseId: string;
  objectiveId?: string;
  assertionId: string;
  observationId: string;
  operator: TestPlanAssertion["operator"];
  expected: string | number | boolean;
  actual?: string;
  status: TestReportCriterionStatus;
  note?: string;
}

export interface TestReportPhaseSummary {
  phaseId: string;
  purpose: string;
  ran: boolean;
  verdict?: KanePhaseResult["verdict"];
  failureKind?: KanePhaseResult["failureKind"];
  evidenceUrl?: string;
  runId?: string;
}

export interface TestReportReproducibility {
  projectRevision: number;
  planRevision: number;
  sceneId: string;
  seed: number;
  scenarioId?: string;
  modelLabel: string;
  kaneCliVersion?: string;
  budget: TestPlanBudget;
}

export interface TestReportAssessment {
  /** What the Clockwork planner inferred without touching the game. */
  inferred: string;
  /** What Kane CLI actually observed in the browser. */
  observed: string;
}

export interface TestReportEvidenceRef {
  phaseId: string;
  runId?: string;
  url: string;
}

export interface GameTestReport {
  userGoal: string;
  projectId: string;
  sourceRevision: number;
  seed: number;
  phases: TestReportPhaseSummary[];
  criteria: TestReportCriterion[];
  verdict: TestReportVerdict;
  reason: string;
  evidenceUrls: string[];
  evidenceRefs: TestReportEvidenceRef[];
  reproducibility: TestReportReproducibility;
  assessment: TestReportAssessment;
  followUps: string[];
  limitations: string[];
}

export interface BuildTestReportOptions {
  /** Planner identity shown in the UI; recorded so the report names the model. */
  modelLabel?: string;
  /** Current project revision, used to call out stale plan results. */
  currentRevision?: number;
}

function criterionStatus(
  check: KanePhaseResult["checks"][number] | undefined,
  result: KanePhaseResult | undefined,
): { status: TestReportCriterionStatus; note?: string } {
  if (!result) return { status: "inconclusive", note: "phase has not been run" };
  if (!check) return { status: "inconclusive", note: "the phase result did not include this assertion" };
  if (check.status === "failed") return { status: "failed" };
  if (check.status === "missing") return { status: "inconclusive", note: "observation was not reported" };
  if (!result.evidenceUrl) return { status: "inconclusive", note: "phase has no evidence bundle" };
  if (result.verdict !== "passed") {
    return {
      status: "inconclusive",
      note: `phase ended ${result.verdict} (${result.failureKind}); the observed value alone is not a pass`,
    };
  }
  return { status: "passed" };
}

export function buildTestReport(
  draft: TestPlanDraft,
  results: Record<string, KanePhaseResult>,
  options: BuildTestReportOptions = {},
): GameTestReport {
  const phases: TestReportPhaseSummary[] = [];
  const criteria: TestReportCriterion[] = [];

  for (const phase of draft.phases) {
    const result = results[phase.id];
    phases.push({
      phaseId: phase.id,
      purpose: phase.purpose,
      ran: result !== undefined,
      verdict: result?.verdict,
      failureKind: result?.failureKind,
      evidenceUrl: result?.evidenceUrl,
      ...(result?.runId ? { runId: result.runId } : {}),
    });
    for (const assertion of phase.assertions) {
      const check = result?.checks.find((candidate) => candidate.id === assertion.id);
      const status = criterionStatus(check, result);
      criteria.push({
        phaseId: phase.id,
        ...(phase.objectiveId ? { objectiveId: phase.objectiveId } : {}),
        assertionId: assertion.id,
        observationId: assertion.observationId,
        operator: assertion.operator,
        expected: assertion.expected,
        ...(check?.actual !== undefined ? { actual: redactLocalPaths(check.actual) } : {}),
        ...status,
        ...(status.note ? { note: redactLocalPaths(status.note) } : {}),
      });
    }
  }

  const counts = (status: TestReportCriterionStatus) => criteria.filter((criterion) => criterion.status === status).length;
  const passed = counts("passed");
  const failed = counts("failed");
  const inconclusive = counts("inconclusive");

  // A phase-level failure or inconclusive verdict is a report failure even when an
  // individual observation still matched: the contract is the whole phase.
  const phaseFailed = phases.some((phase) => phase.verdict === "failed");
  const phaseInconclusive = phases.some((phase) => phase.verdict === "inconclusive" || phase.verdict === "cancelled");

  let verdict: TestReportVerdict;
  let reason: string;
  if (failed > 0 || phaseFailed) {
    verdict = "failed";
    reason = `${failed} of ${criteria.length} criteria failed${phaseFailed ? "; at least one phase verdict failed" : ""}.`;
  } else if (inconclusive > 0 || phaseInconclusive) {
    verdict = "inconclusive";
    reason = `${inconclusive} of ${criteria.length} criteria are inconclusive or the phase result is not a verified pass.`;
  } else {
    verdict = "passed";
    reason = `All ${passed} criteria passed with evidence.`;
  }

  const ranPhases = phases.filter((phase) => phase.ran).length;
  const observedPhases = draft.phases.filter((phase) =>
    results[phase.id]?.checks.some((check) => check.actual !== undefined),
  ).length;
  const unrunPhases = phases.filter((phase) => !phase.ran);
  const evidenceRefs = phases.flatMap((phase): TestReportEvidenceRef[] =>
    phase.evidenceUrl ? [{ phaseId: phase.phaseId, ...(phase.runId ? { runId: phase.runId } : {}), url: phase.evidenceUrl }] : [],
  );
  const kaneCliVersion = Object.values(results)
    .map((result) => result.reproducibility?.kaneCliVersion)
    .find((version): version is string => Boolean(version));
  const modelLabel = options.modelLabel?.trim() || "Clockwork agent";
  const staleRevision = options.currentRevision !== undefined && options.currentRevision !== draft.sourceRevision;
  const runtimeErrors = Object.entries(results).flatMap(([phaseId, result]) =>
    result.runtimeErrors.map((error) => `${phaseId}: ${redactLocalPaths(error)}`),
  );

  const limitations: string[] = [];
  if (ranPhases === 0) {
    limitations.push("No phase ran, so this report contains no browser evidence.");
  } else {
    limitations.push(
      `Only the ${criteria.length} approved assertion${criteria.length === 1 ? "" : "s"} are covered; unasserted mechanics and balance remain untested.`,
    );
    if (evidenceRefs.length < ranPhases) {
      limitations.push(`${ranPhases - evidenceRefs.length} run phase(s) have no evidence bundle.`);
    }
  }
  if (unrunPhases.length) {
    limitations.push(`${unrunPhases.length} phase(s) never ran; every criterion in ${unrunPhases.map((phase) => `"${phase.phaseId}"`).join(", ")} is inconclusive.`);
  }
  if (runtimeErrors.length) {
    limitations.push(`Runtime errors were reported: ${runtimeErrors.join("; ")}. Those phases cannot pass.`);
  }
  if (staleRevision) {
    limitations.push(
      `The plan targets project revision ${draft.sourceRevision}, but the project is now at revision ${options.currentRevision}. These results cannot validate the current revision.`,
    );
  }
  limitations.push("Local evidence paths are redacted from this report; full raw paths remain in the server's local run logs.");
  if (verdict === "inconclusive" && evidenceRefs.length === 0 && ranPhases > 0) {
    limitations.push("No evidence link is available, so the observed values cannot be reviewed.");
  }

  const followUps: string[] = [];
  for (const phase of unrunPhases) {
    followUps.push(`Run phase "${phase.phaseId}" (${phase.purpose}) against revision ${draft.sourceRevision}.`);
  }
  if (failed > 0) {
    const failedCriteria = criteria.filter((criterion) => criterion.status === "failed");
    followUps.push(
      `Inspect ${failedCriteria.map((criterion) => `"${criterion.assertionId}"`).join(", ")} against the linked Kane evidence before changing gameplay.`,
    );
  }
  if (inconclusive > 0 && ranPhases > 0) {
    followUps.push("Re-run only the inconclusive phase; do not treat a retry as a pass without fresh evidence.");
  }
  if (verdict === "passed") {
    followUps.push(`Re-run plan revision ${draft.revisions.length} with seed ${draft.seed} to confirm determinism.`);
  }
  if (staleRevision) {
    followUps.push(`Ask the agent to draft a new plan for project revision ${options.currentRevision} instead of reusing this one.`);
  }
  if (!followUps.length) {
    followUps.push("Attach the evidence links to the review and record the remaining untested mechanics as limitations.");
  }

  return {
    userGoal: redactLocalPaths(draft.userGoal),
    projectId: draft.projectId,
    sourceRevision: draft.sourceRevision,
    seed: draft.seed,
    phases,
    criteria,
    verdict,
    reason: redactLocalPaths(reason),
    evidenceUrls: [...new Set(evidenceRefs.map((ref) => ref.url))],
    evidenceRefs,
    reproducibility: {
      projectRevision: draft.sourceRevision,
      planRevision: draft.revisions.length,
      sceneId: draft.sceneId,
      seed: draft.seed,
      ...(draft.scenarioId ? { scenarioId: draft.scenarioId } : {}),
      modelLabel,
      ...(kaneCliVersion ? { kaneCliVersion } : {}),
      budget: { ...draft.budget },
    },
    assessment: {
      inferred: `${modelLabel} inferred the goal, controls and ${criteria.length} criteria from the game-test profile. It did not operate the browser or observe gameplay.`,
      observed:
        observedPhases === 0
          ? ranPhases === 0
            ? "Kane CLI observed nothing: no phase ran. Every criterion is unverified."
            : `Kane returned ${ranPhases} phase result(s) without a reported observation, so no gameplay state is directly verified.`
          : `Kane CLI directly observed ${observedPhases} of ${draft.phases.length} phase(s) in Chrome at project revision ${draft.sourceRevision} with seed ${draft.seed}${draft.scenarioId ? ` and scenario "${draft.scenarioId}"` : ""}; ${evidenceRefs.length} evidence bundle(s) are linked.`,
    },
    followUps,
    limitations,
  };
}
