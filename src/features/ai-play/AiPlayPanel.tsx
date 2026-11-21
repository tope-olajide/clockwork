import { useState } from "react";
import { CheckCircle2, Clipboard, ExternalLink, Loader2, Play, RotateCcw, Square, Sparkles, X, XCircle } from "lucide-react";
import type { AiPlayResult } from "@shared/protocol/kane";
import type { KanePhaseResult } from "@shared/protocol/game-testing";
import { Button } from "../../components/ui";
import type { ProjectDocument } from "../../engine/model/schema";
import type { useAiPlay } from "./useAiPlay";
import { TestPlanPanel } from "./TestPlanPanel";

type AiPlay = ReturnType<typeof useAiPlay>;

interface AiPlayPanelProps {
  open: boolean;
  onClose: () => void;
  aiPlay: AiPlay;
  modelLabel: string;
  document: ProjectDocument;
  onRequestPlan: (goal: string) => void;
  onPhaseResult: (result: KanePhaseResult) => void;
  onUndoFix: () => void;
}

function statusLabel(result: AiPlayResult | null): string {
  if (!result) return "READY";
  if (result.status === "passed") return "KANE VERIFIED";
  if (result.status === "failed") return "KANE FAILED";
  if (result.status === "cancelled") return "CANCELLED";
  return "KANE ERROR";
}

function finalStateEntries(result: AiPlayResult | null): Array<[string, string]> {
  if (!result) return [];
  return Object.entries(result.finalState);
}

export function AiPlayPanel({ open, onClose, aiPlay, modelLabel, document, onRequestPlan, onPhaseResult, onUndoFix }: AiPlayPanelProps) {
  const [copied, setCopied] = useState(false);
  const latest = aiPlay.result;
  const busy = aiPlay.phase === "preparing" || aiPlay.phase === "running" || aiPlay.phase === "fixing";
  if (!open) return null;

  async function copyObjective() {
    if (!aiPlay.objective) return;
    try {
      await navigator.clipboard.writeText(aiPlay.objective);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <>
      <aside className="ai-play-panel" data-testid="ai-play-panel" aria-label="AI Play panel">
        <header className="ai-play-head">
          <div>
            <span className="ai-play-kicker"><Sparkles size={12} /> CLOSED LOOP</span>
            <h2>KANE PLAY</h2>
          </div>
          <button className="icon-button" aria-label="Close AI Play" onClick={onClose}><X size={15} /></button>
        </header>

        <div className="ai-play-meta">
          <span className={`chip ${latest?.status === "passed" ? "success" : latest?.status === "failed" ? "danger" : "violet"}`} data-testid="verdict-badge">
            {busy ? <Loader2 size={11} className="spin" /> : latest?.status === "passed" ? <CheckCircle2 size={11} /> : latest?.status ? <XCircle size={11} /> : <Sparkles size={11} />}
            {statusLabel(latest)}
          </span>
          <span className="chip">{!modelLabel || /^no model$/i.test(modelLabel) ? "Clockwork agent" : modelLabel}</span>
          {aiPlay.status?.user && <span className="chip">KANE · {aiPlay.status.user}</span>}
        </div>

        <TestPlanPanel document={document} modelLabel={modelLabel} onRequestPlan={onRequestPlan} onPhaseResult={onPhaseResult} />

        <label className="ai-play-autofix">
          <input type="checkbox" checked={aiPlay.autoFix} onChange={(event) => aiPlay.setAutoFix(event.target.checked)} disabled={busy} />
          Auto-fix an embedded collectible after a failed attempt (max 2 attempts)
        </label>

        <div className="ai-play-actions">
          {busy ? (
            <Button variant="danger" size="sm" icon={<Square size={12} />} onClick={aiPlay.stop}>Stop AI Play</Button>
          ) : (
            <Button variant="violet" size="sm" icon={<Play size={12} />} onClick={() => void aiPlay.begin(aiPlay.autoFix)}>Run AI Play</Button>
          )}
          <Button variant="secondary" size="sm" icon={<RotateCcw size={12} />} onClick={() => void aiPlay.begin(aiPlay.autoFix)} disabled={busy}>Retry</Button>
          {latest?.evidenceUrl && (
            <a className="button button-ghost button-sm" href={latest.evidenceUrl} target="_blank" rel="noreferrer" data-testid="ai-play-evidence">
              <ExternalLink size={12} /> Open evidence
            </a>
          )}
          <Button variant="ghost" size="sm" icon={<Clipboard size={12} />} onClick={() => void copyObjective()} disabled={!aiPlay.objective}>{copied ? "Copied" : "Copy objective"}</Button>
          {aiPlay.phase === "failed" && aiPlay.attempts.length > 1 && (
            <Button variant="ghost" size="sm" onClick={onUndoFix}>Undo AI fixes</Button>
          )}
        </div>

        {aiPlay.error && <div className="ai-play-error" role="alert">{aiPlay.error}</div>}

        <section className="ai-play-objective">
          <h3>Objective</h3>
          <pre>{aiPlay.objective || "The objective is generated from this scene's HUD and win condition."}</pre>
        </section>

        <section className="ai-play-attempts">
          <h3>Attempts</h3>
          {aiPlay.attempts.length === 0 && <p className="muted">Run AI Play to send Kane into the snapshot player.</p>}
          {aiPlay.attempts.map(({ attempt, result }) => (
            <article className={`ai-attempt ${result.status}`} key={`${attempt}-${result.runId}`}>
              <header>
                <strong>Attempt {attempt}</strong>
                <span>{result.status === "passed" ? "PASSED" : result.status === "failed" ? "FAILED" : result.status.toUpperCase()}</span>
              </header>
              <p>{result.summary}</p>
              <dl>
                {finalStateEntries(result).map(([key, value]) => (
                  <div key={key}><dt>{key.replace(/_/g, " ")}</dt><dd>{value}</dd></div>
                ))}
              </dl>
              <footer>
                <span>{Math.round(result.durationMs / 1000)}s · {(() => {
                  const count = result.steps.filter((step) => step.status !== "running").length;
                  return `${count} ${count === 1 ? "step" : "steps"}`;
                })()}</span>
                {result.evidenceUrl && <a href={result.evidenceUrl} target="_blank" rel="noreferrer">evidence</a>}
              </footer>
            </article>
          ))}
        </section>

        <section className="ai-play-steps">
          <h3>Live run <span>{aiPlay.phase.toUpperCase()}</span></h3>
          <ol>
            {aiPlay.steps.slice(-14).map((step, index) => (
              <li key={`${step.step}-${index}`} className={step.status}>
                <span>{step.step}</span>
                <p>{step.remark}</p>
              </li>
            ))}
            {aiPlay.steps.length === 0 && <li className="muted"><p>No Kane steps yet.</p></li>}
          </ol>
        </section>
      </aside>

      {aiPlay.consentOpen && (
        <div className="ai-consent-backdrop" role="presentation">
          <div className="ai-consent" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
            <h2 id="ai-consent-title">Let Kane play this snapshot?</h2>
            <p>AI Play uses your signed-in Kane CLI, opens a real Chrome browser, and consumes TestMu AI credits. The run uploads to your Test Manager project unless your Kane configuration says otherwise. It runs against an immutable snapshot, never the editor.</p>
            <div className="ai-consent-actions">
              <Button variant="violet" size="sm" onClick={() => void aiPlay.acceptConsent(false)}>Run once</Button>
              <Button variant="secondary" size="sm" onClick={() => void aiPlay.acceptConsent(true)}>Don't ask again this session</Button>
              <Button variant="ghost" size="sm" onClick={() => aiPlay.setConsentOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
