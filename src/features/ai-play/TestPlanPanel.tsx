import { useEffect, useRef, useState } from "react";
import { ClipboardList, Play, Sparkles, X } from "lucide-react";
import { Button } from "../../components/ui";
import type { ProjectDocument } from "../../engine/model/schema";
import { gameTestProfileForDocument } from "../../engine/model/game-test-profile";
import {
  approveDraft,
  estimateDraftCost,
  isDraftStale,
} from "../../engine/model/game-test-draft";
import { buildTestReport } from "../../engine/model/game-test-report";
import { useTestPlanStore } from "./test-plan-store";

interface TestPlanPanelProps {
  document: ProjectDocument;
  modelLabel: string;
  /** Sends the goal to the planning model; it must not start Kane. */
  onRequestPlan: (goal: string) => void;
}

export function TestPlanPanel({ document, modelLabel, onRequestPlan }: TestPlanPanelProps) {
  const profile = gameTestProfileForDocument(document);
  const draft = useTestPlanStore((state) => state.draft);
  const errors = useTestPlanStore((state) => state.errors);
  const notice = useTestPlanStore((state) => state.notice);
  const hydrate = useTestPlanStore((state) => state.hydrate);
  const setDraft = useTestPlanStore((state) => state.setDraft);
  const setNotice = useTestPlanStore((state) => state.setNotice);
  const clear = useTestPlanStore((state) => state.clear);
  const phaseResults = useTestPlanStore((state) => state.phaseResults);
  const runningPhaseId = useTestPlanStore((state) => state.runningPhaseId);
  const cancelling = useTestPlanStore((state) => state.cancelling);
  const phaseError = useTestPlanStore((state) => state.phaseError);
  const runPhase = useTestPlanStore((state) => state.runPhase);
  const cancelPhase = useTestPlanStore((state) => state.cancelPhase);
  const [goal, setGoal] = useState(draft?.userGoal ?? "");
  const revisionRef = useRef(document.revision);
  revisionRef.current = document.revision;

  useEffect(() => {
    // Hydrate once per project. Editing the document must not reset an active phase;
    // the stale banner and report limitation track revision changes instead.
    hydrate(document.id, revisionRef.current);
  }, [document.id, hydrate]);

  useEffect(() => {
    if (draft?.userGoal) setGoal(draft.userGoal);
  }, [draft?.userGoal]);

  if (!profile) {
    return (
      <section className="ai-play-objective" data-testid="test-plan-unavailable">
        <h3>Test plan</h3>
        <p className="muted">
          No game-test profile is registered for {document.templateOrigin}, so a mechanics plan cannot be validated here.
        </p>
      </section>
    );
  }

  const stale = draft ? isDraftStale(draft, document) : false;
  const estimate = draft ? estimateDraftCost(draft) : null;
  const canRequest = goal.trim().length > 0;
  const budgetExhausted = Boolean(draft) && Object.keys(phaseResults).length >= (draft?.budget.maxKanePhases ?? 0);
  const report = draft
    ? buildTestReport(draft, phaseResults, { modelLabel, currentRevision: document.revision })
    : null;

  function approve() {
    if (!draft) return;
    const result = approveDraft(draft, "local user", { document, profile: profile! });
    if (!result.ok) {
      useTestPlanStore.setState({ errors: result.errors });
      return;
    }
    setDraft(result.draft);
    setNotice("Plan approved. No Kane run has started; run a phase when you are ready.");
  }

  return (
    <section className="ai-play-objective" data-testid="test-plan-panel" aria-label="Test plan">
      <h3><ClipboardList size={13} /> Test plan</h3>

      <label className="ai-play-autofix" htmlFor="test-plan-goal">What should be tested?</label>
      <textarea
        id="test-plan-goal"
        data-testid="test-plan-objective"
        className="ai-plan-goal"
        rows={3}
        value={goal}
        placeholder="e.g. Verify shooting creates a projectile, a hit destroys an enemy and adds score."
        onChange={(event) => setGoal(event.target.value)}
      />

      <div className="ai-play-actions">
        {profile.objectives.map((objective) => (
          <Button
            key={objective.id}
            variant="ghost"
            size="sm"
            data-testid={`test-plan-suggest-${objective.id}`}
            onClick={() => setGoal(objective.description)}
            title={objective.description}
          >
            {objective.title}
          </Button>
        ))}
      </div>

      <div className="ai-play-actions">
        <Button
          variant="violet"
          size="sm"
          icon={<Sparkles size={12} />}
          data-testid="test-plan-request"
          disabled={!canRequest}
          onClick={() => onRequestPlan(goal.trim())}
        >
          Draft plan with agent
        </Button>
        {draft && (
          <Button variant="ghost" size="sm" icon={<X size={12} />} data-testid="test-plan-cancel" onClick={clear}>
            Discard draft
          </Button>
        )}
      </div>

      <p className="muted" data-testid="test-plan-roles">
        Planner: {modelLabel || "Clockwork agent"} · Browser agent: Kane CLI (runs only approved phases after approval)
      </p>

      {errors.length > 0 && (
        <div className="ai-play-error" role="alert" data-testid="test-plan-errors">
          <strong>The plan was rejected:</strong>
          <ul>
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}

      {draft && (
        <article className="ai-attempt" data-testid="test-plan-draft">
          <header>
            <strong>{draft.approval ? "APPROVED PLAN" : "DRAFT PLAN"}</strong>
            <span>rev {draft.revisions.length} · {draft.phases.length} phase{draft.phases.length === 1 ? "" : "s"}</span>
          </header>
          <p data-testid="test-plan-goal-copy"><em>Goal:</em> {draft.userGoal}</p>
          {stale && (
            <p className="ai-play-error" data-testid="test-plan-stale">
              This draft targets revision {draft.sourceRevision}, but the project is at {document.revision}. Approve is
              disabled; ask the agent for a fresh plan.
            </p>
          )}
          <ol>
            {draft.phases.map((phase) => {
              const result = phaseResults[phase.id];
              const running = runningPhaseId === phase.id;
              return (
                <li key={phase.id} data-testid={`test-plan-phase-${phase.id}`}>
                  <strong>{phase.purpose}</strong>
                  <div className="muted">{phase.kaneObjective}</div>
                  <div className="muted">
                    Controls: {phase.allowedControlIds.join(", ")} · {phase.assertions.length} assertion
                    {phase.assertions.length === 1 ? "" : "s"}
                  </div>
                  <div className="ai-play-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Play size={12} />}
                      data-testid={`test-plan-run-${phase.id}`}
                      disabled={!draft.approval || stale || Boolean(runningPhaseId) || (budgetExhausted && !result)}
                      onClick={() => void runPhase({ draft, document, profile, phaseId: phase.id })}
                      title={budgetExhausted && !result ? "The approved session has used its Kane phase budget." : undefined}
                    >
                      {running ? (cancelling ? "Stopping…" : "Running…") : result ? "Replay saved result" : "Run phase"}
                    </Button>
                    {running && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<X size={12} />}
                        data-testid="test-plan-cancel-phase"
                        disabled={cancelling}
                        onClick={() => void cancelPhase()}
                      >
                        {cancelling ? "Stopping…" : "Stop phase"}
                      </Button>
                    )}
                  </div>
                  {result && (
                    <div className="ai-attempt" data-testid={`test-plan-result-${phase.id}`} data-verdict={result.verdict}>
                      <header>
                        <strong>{result.verdict.toUpperCase()}</strong>
                        <span>{result.failureKind === "none" ? "verified" : result.failureKind}</span>
                      </header>
                      <p>{result.reason}</p>
                      <ul>
                        {result.checks.map((check) => (
                          <li key={check.id} data-check-status={check.status}>
                            {check.observationId} {check.operator} {String(check.expected)} · observed {check.actual ?? "none"} ·{" "}
                            {check.status}
                          </li>
                        ))}
                      </ul>
                      <div className="muted">
                        Accepted inputs: {result.acceptedInputs ?? "unknown"} · frames: {result.framesAdvanced ?? "unknown"} ·{" "}
                        {(result.durationMs / 1000).toFixed(1)}s
                      </div>
                      {result.evidenceUrl && (
                        <a href={result.evidenceUrl} data-testid={`test-plan-evidence-${phase.id}`}>Evidence</a>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {report && report.phases.some((phase) => phase.ran) && (
            <article
              className="ai-attempt"
              data-testid="test-plan-report"
              data-report-verdict={report.verdict}
              aria-label="Final test report"
            >
              <header>
                <strong>FINAL REPORT · {report.verdict.toUpperCase()}</strong>
                <span>
                  {report.criteria.filter((criterion) => criterion.status === "passed").length}/{report.criteria.length} criteria
                </span>
              </header>
              <p data-testid="test-plan-report-reason">{report.reason}</p>
              <div className="muted" data-testid="test-plan-report-meta">
                Plan rev {report.reproducibility.planRevision} · project rev {report.reproducibility.projectRevision} · seed{" "}
                {report.reproducibility.seed} · scene {report.reproducibility.sceneId}
                {report.reproducibility.scenarioId ? ` · scenario ${report.reproducibility.scenarioId}` : ""}
              </div>
              <div className="muted" data-testid="test-plan-report-versions">
                Planner {report.reproducibility.modelLabel} · Kane CLI {report.reproducibility.kaneCliVersion ?? "version not reported"}
                {" · "}{report.reproducibility.budget.maxKanePhases} phase budget · {report.reproducibility.budget.maxFramesPerPhase} frames/phase
              </div>
              <section data-testid="test-plan-report-assessment">
                <p><strong>Engine agent inferred:</strong> {report.assessment.inferred}</p>
                <p><strong>Kane directly observed:</strong> {report.assessment.observed}</p>
              </section>
              <ul>
                {report.criteria.map((criterion) => (
                  <li
                    key={`${criterion.phaseId}:${criterion.assertionId}`}
                    data-testid={`test-plan-report-${criterion.assertionId}`}
                    data-status={criterion.status}
                  >
                    <strong>{criterion.status.toUpperCase()}</strong> · {criterion.phaseId} · {criterion.observationId}{" "}
                    {criterion.operator} {String(criterion.expected)} · observed {criterion.actual ?? "none"}
                    {criterion.note ? <span className="muted"> — {criterion.note}</span> : null}
                  </li>
                ))}
              </ul>
              {report.evidenceRefs.length > 0 && (
                <div className="ai-play-actions">
                  {report.evidenceRefs.map((ref, index) => (
                    <a key={`${ref.phaseId}:${ref.url}`} href={ref.url} data-testid={`test-plan-report-evidence-${index}`}>
                      Evidence {index + 1} · {ref.phaseId}{ref.runId ? ` · run ${ref.runId}` : ""}
                    </a>
                  ))}
                </div>
              )}
              <section data-testid="test-plan-report-followups">
                <h4>Follow-up actions</h4>
                <ul>
                  {report.followUps.map((followUp) => <li key={followUp}>{followUp}</li>)}
                </ul>
              </section>
              <section data-testid="test-plan-report-limitations">
                <h4>Limitations</h4>
                <ul>
                  {report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                </ul>
              </section>
            </article>
          )}
          {phaseError && <div className="ai-play-error" role="alert" data-testid="test-plan-phase-error">{phaseError}</div>}
          {estimate && (
            <div className="muted" data-testid="test-plan-budget">
              {estimate.kaneRuns} Kane run{estimate.kaneRuns === 1 ? "" : "s"} · ~{estimate.typicalSeconds}s typical ·{" "}
              {estimate.worstCaseSeconds}s worst case · ≤{estimate.framesPerPhase} frames/phase
              <br />Running a phase uses the signed-in Kane CLI and consumes TestMu AI credits.
            </div>
          )}
          <div className="muted" data-testid="test-plan-revisions">
            {draft.revisions.map((revision) => `rev ${revision.revision}: ${revision.reason}`).join(" · ")}
          </div>
          <footer className="ai-play-actions">
            <Button
              variant="violet"
              size="sm"
              icon={<Play size={12} />}
              data-testid="test-plan-approve"
              disabled={stale || Boolean(draft.approval)}
              onClick={approve}
            >
              {draft.approval ? "Approved" : "Approve plan"}
            </Button>
            {draft.approval && (
              <span className="muted" data-testid="test-plan-approval">
                {draft.approval.by} · {new Date(draft.approval.at).toLocaleString()}
              </span>
            )}
          </footer>
        </article>
      )}

      {notice && <div className="ai-play-objective" data-testid="test-plan-notice">{notice}</div>}
    </section>
  );
}
