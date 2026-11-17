import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "../../components/ui";

const STORAGE_KEY = "clockwork:coach:v1";

const STEPS = [
  {
    title: "Pick a workspace",
    body: "Scene is the live canvas. Content holds assets and prefabs. Logic is for rules, and Presentation controls look, animation, audio and HUD.",
  },
  {
    title: "Edit with the hierarchy",
    body: "Select an object on the canvas or in the hierarchy. Drag to move, use the handles to scale, and press ⌘Z to undo one gesture at a time.",
  },
  {
    title: "Ask the Game Director",
    body: "Press ⌘J or Ask agent. Use Ask to inspect, Build to make one undoable change set, and Plan to preview changes as violet ghosts.",
  },
  {
    title: "Play, then ship",
    body: "Play runs the same runtime as the editor. When it feels right, use Ship to export a zip or create a read-only share link.",
  },
];

export function CoachTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function finish() {
    setVisible(false);
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
  }

  if (!visible) return null;
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <div className="coach-tour" role="dialog" aria-modal="false" aria-labelledby="coach-title" aria-describedby="coach-body">
      <div className="coach-tour-head">
        <span className="coach-tour-step">Step {step + 1} of {STEPS.length}</span>
        <button className="tiny-icon" aria-label="Skip tour" onClick={finish}><X size={13} /></button>
      </div>
      <h2 id="coach-title">{current.title}</h2>
      <p id="coach-body">{current.body}</p>
      <div className="coach-tour-actions">
        <Button variant="ghost" size="sm" onClick={finish}>Skip</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => (last ? finish() : setStep((value) => value + 1))}
          icon={last ? undefined : <ArrowRight size={12} />}
        >
          {last ? "Start building" : "Next"}
        </Button>
      </div>
    </div>
  );
}
