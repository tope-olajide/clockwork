import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Image as ImageIcon, Loader2, Wrench } from "lucide-react";
import type { AgentToolCard } from "../useAgentSession";
import { phaseCardView } from "../phase-continuation";

const LABELS: Record<string, string> = {
  list_scenes: "Listing scenes",
  get_scene: "Inspecting scene",
  search_entities: "Searching entities",
  get_object: "Inspecting object",
  query_project: "Searching the project",
  inspect_entity: "Inspecting entity",
  get_variables: "Reading variables",
  get_selection: "Reading selection",
  capture_viewport: "Capturing viewport",
  apply_commands: "Applying changes",
  preview_commands: "Preparing a preview",
  select_entities: "Selecting objects",
  open_panel: "Opening a panel",
  start_playtest: "Running a playtest",
  undo_last_agent_change: "Undoing the last change",
  verify_with_kane: "Verifying with Kane",
  run_ai_play: "Kane is playing",
  propose_test_plan: "Drafting a test plan",
  get_game_test_profile: "Reading the game-test profile",
  run_kane_test_phase: "Running a Kane phase",
};

export function ToolActivity({ card }: { card: AgentToolCard }) {
  const [open, setOpen] = useState(false);
  const label = LABELS[card.name] ?? card.name.replace(/_/g, " ");
  const result = card.result;
  const data = (result?.ok ? result.data : null) as Record<string, any> | null;
  return (
    <div className={`chat-tool ${card.status}`}>
      <button type="button" className="chat-tool-head" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="chat-tool-icon" aria-hidden="true">
          {card.status === "running" ? <Loader2 size={13} className="spin" />
            : card.status === "error" ? <CircleAlert size={13} />
              : card.status === "canceled" ? <Wrench size={13} />
                : <CheckCircle2 size={13} />}
        </span>
        <span className="chat-tool-label">{label}</span>
        <span className="chat-tool-status">
          {card.status === "running" ? "working" : card.status}
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>
      {data && card.name === "run_kane_test_phase" && (() => {
        const view = phaseCardView(data);
        if (!view) return null;
        return (
          <div className="kane-run-card" data-testid="kane-phase-card">
            <div className="kane-run-head">
              <span className={`chip ${view.verdictTone === "success" ? "success" : view.verdictTone === "danger" ? "danger" : "violet"}`} data-testid="kane-phase-verdict">{view.verdictLabel}</span>
              <strong>KANE PHASE · {view.phaseId}</strong>
              <span data-testid="kane-phase-failure">{view.failureLabel}</span>
            </div>
            <p>{view.reason}</p>
            <ul data-testid="kane-phase-checks">
              {view.checks.map((check) => (
                <li key={check.id} data-check-status={check.status}>{check.text} · {check.status}</li>
              ))}
            </ul>
            <div className="kane-run-state" data-testid="kane-phase-totals">
              Accepted inputs: {view.inputsLabel} · Frames: {view.framesLabel}
            </div>
            {typeof data.durationMs === "number" && (data.durationMs as number) > 0 && (
              <span data-testid="kane-phase-duration">{view.durationLabel}</span>
            )}
            {view.evidenceUrl && <a href={view.evidenceUrl} target="_blank" rel="noreferrer">Open evidence</a>}
          </div>
        );
      })()}
      {data && (card.name === "verify_with_kane" || card.name === "run_ai_play") && (
        <div className="kane-run-card" data-testid="kane-run-card">
          <div className="kane-run-head">
            <span className={`chip ${data.status === "passed" ? "success" : "danger"}`} data-testid="verdict-badge">{String(data.status ?? "unknown").toUpperCase()}</span>
            <strong>{card.name === "run_ai_play" ? "KANE PLAY" : "ENGINE QA"}</strong>
            <span>{data.steps?.length ?? 0} steps</span>
            {typeof data.durationMs === "number" && data.durationMs > 0 && (
              <span data-testid="kane-run-duration">{(data.durationMs / 1000).toFixed(1)}s</span>
            )}
          </div>
          <p>{String(data.summary ?? "")}</p>
          {data.finalState && <div className="kane-run-state">{Object.entries(data.finalState as Record<string, unknown>).map(([key, value]) => `${key.toUpperCase()}: ${String(value)}`).join(" · ")}</div>}
          {data.evidenceUrl && <a href={String(data.evidenceUrl)} target="_blank" rel="noreferrer">Open evidence</a>}
        </div>
      )}
      {open && (
        <div className="chat-tool-body">
          <div className="chat-tool-key">Input</div>
          <pre>{JSON.stringify(card.args, null, 2)}</pre>
          {result && <>
            <div className="chat-tool-key">Result</div>
            <pre>{JSON.stringify({ ok: result.ok, error: result.error, revision: result.revision, preview: result.preview, changeSet: result.changeSet, data: result.imageDataUrl ? { ...(result.data ?? {}), image: "[png]" } : result.data }, null, 2)}</pre>
          </>}
          {result?.imageDataUrl && <div className="chat-tool-image"><div className="chat-tool-key"><ImageIcon size={12} /> Captured viewport</div><img src={result.imageDataUrl} alt="Viewport capture" /></div>}
        </div>
      )}
    </div>
  );
}
