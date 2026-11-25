import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { KaneCliStatus } from "@shared/protocol/kane";
import { Button } from "../../../components/ui";

/** Why a Kane run cannot start from the sheet, or null when it can. */
export function kaneUnavailableReason(input: { status: KaneCliStatus | null; isBusy: boolean }): string | null {
  if (!input.status) return "Checking Kane CLI status…";
  if (!input.status.installed) return input.status.reason ?? "Kane CLI is not installed.";
  if (!input.status.authenticated) return input.status.reason ?? "Kane CLI is not signed in. Run `kane-cli login`.";
  if (input.status.reason && /credits/i.test(input.status.reason)) return input.status.reason;
  if (input.isBusy) return "Wait for the agent to finish its current turn.";
  return null;
}

export function KaneTestSheet({
  unavailableReason,
  canAskAgent,
  onSmoke,
  onAsk,
  onClose,
}: {
  unavailableReason: string | null;
  /** False when no tool-capable model is configured. */
  canAskAgent: boolean;
  onSmoke: () => void;
  onAsk: (description: string) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const trimmed = description.trim();
  return (
    <section className="kane-sheet" data-testid="kane-test-sheet" aria-label="Test with Kane">
      <div className="kane-sheet-title"><FlaskConical size={13} /> Test with Kane</div>
      <p className="kane-sheet-meta">
        Every check runs free in the engine simulator first. Kane only opens a real browser when the simulator agrees, then clicks through paused Test Mode and reads the result.
      </p>
      {unavailableReason && <div className="kane-sheet-reason" data-testid="kane-unavailable" role="status">{unavailableReason}</div>}
      <div className="kane-sheet-actions">
        <Button variant="primary" size="sm" data-testid="kane-smoke" disabled={Boolean(unavailableReason)} onClick={onSmoke}>Run smoke check</Button>
        <span className="kane-sheet-meta">Loads the game, moves right for one second, checks the player moved.</span>
      </div>
      <label className="kane-sheet-label" htmlFor="kane-description">Or describe what to verify</label>
      <textarea
        id="kane-description"
        data-testid="kane-description"
        value={description}
        rows={3}
        maxLength={600}
        placeholder="e.g. collecting a coin raises the score by one and the coin disappears"
        onChange={(event) => setDescription(event.target.value)}
      />
      {!canAskAgent && <div className="kane-sheet-reason">Choose a tool-capable model to let the agent plan a check.</div>}
      <div className="kane-sheet-actions">
        <Button variant="secondary" size="sm" data-testid="kane-ask" disabled={Boolean(unavailableReason) || !canAskAgent || !trimmed} onClick={() => onAsk(trimmed)}>Ask agent to check this</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </section>
  );
}
