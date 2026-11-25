import { useRef, useState } from "react";
import type { GameTestProfile } from "../../engine/model/game-test-profile";
import type { ProjectDocument } from "../../engine/model/schema";
import type { TestAdvanceResult, TestController } from "../../engine/runtime/test-controller";
import { acceptedInputCount, observationValue, statusToken } from "../../engine/runtime/test-observations";
import { startCheckStep, stepLabels } from "../../engine/runtime/kane-check-runner";
import type { KaneCheckStepSpec } from "@shared/kane-check";

interface TestModeHudProps {
  document: ProjectDocument;
  profile: GameTestProfile;
  controller: TestController;
  seed: number;
  /** Scenario applied to the loaded document before frame zero, if any. */
  scenarioId: string | null;
  /** Steps of a structured Kane check; each renders as one RUN STEP button. */
  plannedSteps?: KaneCheckStepSpec[];
  onChanged: () => void;
}

export function TestModeHud(props: TestModeHudProps) {
  if (props.plannedSteps && props.plannedSteps.length > 0) return <CheckModeHud {...props} plannedSteps={props.plannedSteps} />;
  return <ManualTestModeHud {...props} />;
}

type StepPhase = "ready" | "running" | "done";

/**
 * Layout for a structured Kane check: one column, nothing overlapping, the
 * step buttons first. Manual controls are hidden so a click cannot land on a
 * toggle that only queues input (which is what made the first live run stand
 * still). A step plays one frame per animation frame, so the character is
 * seen walking; the result equals advancing all frames at once.
 */
function CheckModeHud({ document, profile, controller, seed, scenarioId, plannedSteps, onChanged }: TestModeHudProps & { plannedSteps: KaneCheckStepSpec[] }) {
  const labels = stepLabels(profile, plannedSteps);
  const [phases, setPhases] = useState<StepPhase[]>(() => plannedSteps.map(() => "ready"));
  const playing = useRef(false);
  const doneCount = phases.filter((phase) => phase === "done").length;
  const running = phases.indexOf("running");
  const statusLine = running >= 0
    ? `STEP ${running + 1} RUNNING`
    : doneCount === 0
      ? "NO STEP RUN YET"
      : doneCount === plannedSteps.length
        ? `ALL ${plannedSteps.length} STEP${plannedSteps.length === 1 ? "" : "S"} DONE`
        : `STEP ${doneCount} DONE`;

  function run(index: number) {
    const step = plannedSteps[index];
    // In order, once each: a repeated click is a no-op, but the button stays
    // enabled so the browser agent never reads it as "not interactable".
    if (!step || playing.current || index !== doneCount) return;
    playing.current = true;
    startCheckStep(controller, profile, step);
    setPhases((current) => current.map((phase, i) => (i === index ? "running" : phase)));
    // Time-based, not requestAnimationFrame: Chrome stops rAF entirely in a
    // hidden or occluded window, which froze a step at "RUNNING" forever.
    // Timers keep firing (throttled), and each tick catches up on the frames
    // that wall time says are due. Frames are still stepped one at a time, so
    // the outcome is identical to advancing them all at once.
    let remaining = step.frames;
    const startedAt = performance.now();
    let played = 0;
    const tick = () => {
      const due = Math.min(step.frames, Math.floor(((performance.now() - startedAt) / 1000) * 60) + 1);
      while (played < due && remaining > 0 && controller.status === "running") {
        controller.advance(1);
        remaining -= 1;
        played += 1;
      }
      onChanged();
      if (remaining > 0 && controller.status === "running") {
        window.setTimeout(tick, 16);
        return;
      }
      playing.current = false;
      setPhases((current) => current.map((phase, i) => (i === index ? "done" : phase)));
      onChanged();
    };
    window.setTimeout(tick, 0);
  }

  return (
    <div
      className="ai-play-hud test-check-hud-root"
      data-testid="test-mode-hud"
      data-test-mode="step"
      data-frame={controller.frame}
      data-status={statusToken(controller)}
      data-seed={seed}
      data-scenario={scenarioId ?? ""}
      data-steps-done={doneCount}
      data-accepted-inputs={acceptedInputCount(controller)}
      aria-label="Kane test mode"
    >
      <div className="ai-hud-column test-check-hud">
        <section className="ai-hud-readout" aria-label="Test mode state" data-testid="test-hud-state">
          <header><span className="ai-hud-dot" />KANE TEST MODE · {statusToken(controller)}</header>
          <dl>
            <div><dt>STATUS</dt><dd data-testid="test-hud-status">{statusToken(controller)}</dd></div>
            <div><dt>FRAME</dt><dd data-testid="test-hud-frame">{controller.frame}</dd></div>
            <div className="ai-hud-error"><dt>LAST ERROR</dt><dd data-testid="test-hud-last-error">{controller.runtime.lastError ?? "none"}</dd></div>
          </dl>
        </section>

        <section className="ai-hud-readout" aria-label="Check steps" data-testid="test-planned-steps" data-steps-done={doneCount}>
          <header><span className="ai-hud-dot" />CHECK STEPS</header>
          <div className="test-check-steps">
            {labels.map((label, index) => (
              <button
                key={label}
                type="button"
                className={`ai-hud-button test-check-step${phases[index] === "done" ? " on" : ""}`}
                data-testid={`test-run-step-${index + 1}`}
                data-step-state={phases[index]}
                onClick={() => run(index)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="test-check-status" role="status" aria-live="polite" data-testid="test-step-status">CHECK STATUS: {statusLine}</p>
        </section>

        <section className="ai-hud-readout" aria-label="Observations" data-testid="test-observations">
          <header><span className="ai-hud-dot" />OBSERVATIONS</header>
          <dl>
            {profile.observations.map((observation) => (
              <div key={observation.id}>
                <dt>{observation.label}</dt>
                <dd data-testid={`test-observation-${observation.id}`}>{String(observationValue(controller, observation) ?? "none")}</dd>
              </div>
            ))}
            <div>
              <dt>ACCEPTED INPUTS</dt>
              <dd data-testid="test-observation-accepted_inputs">{acceptedInputCount(controller)}</dd>
            </div>
          </dl>
          <footer>{document.name}</footer>
        </section>
      </div>
    </div>
  );
}

function ManualTestModeHud({ document, profile, controller, seed, scenarioId, onChanged }: TestModeHudProps) {
  const [frames, setFrames] = useState(1);
  const [lastAdvance, setLastAdvance] = useState<TestAdvanceResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const down = new Set(controller.activeControlIds());
  const receipts = lastAdvance?.receipts ?? controller.receipts;
  const acceptedInputs = acceptedInputCount(controller);

  function press(controlId: string, mode: "hold" | "pulse", action: GameTestProfile["controls"][number]["action"]) {
    const receipt = controller.enqueue({ controlId, action, mode, frames: mode === "pulse" ? 1 : undefined });
    setNotice(receipt.accepted ? null : `${controlId}: ${receipt.reason ?? "rejected"}`);
    onChanged();
  }

  function release(controlId: string) {
    controller.release(controlId);
    setNotice(null);
    onChanged();
  }

  function advance() {
    const result = controller.advance(frames);
    setLastAdvance(result);
    setNotice(result.reason ?? (result.clamped ? `Clamped to ${result.advancedFrames} frames by the session budget.` : null));
    onChanged();
  }

  function reset() {
    controller.reset();
    setLastAdvance(null);
    setNotice(null);
    onChanged();
  }

  return (
    <div
      className="ai-play-hud"
      data-testid="test-mode-hud"
      data-test-mode="step"
      data-frame={controller.frame}
      data-status={statusToken(controller)}
      data-seed={seed}
      data-scenario={scenarioId ?? ""}
      data-receipts={JSON.stringify(receipts)}
      data-input-accepted={String(receipts.at(-1)?.accepted ?? "")}
      data-accepted-inputs={acceptedInputs}
      aria-label="Kane test mode"
    >
      <div className="ai-hud-column">
      <section className="ai-hud-readout" aria-label="Test mode state" aria-live="polite" data-testid="test-hud-state">
        <header><span className="ai-hud-dot" />KANE TEST MODE · {statusToken(controller)}</header>
        <dl>
          <div><dt>STATUS</dt><dd data-testid="test-hud-status">{statusToken(controller)}</dd></div>
          <div><dt>FRAME</dt><dd data-testid="test-hud-frame">{controller.frame}</dd></div>
          <div><dt>FRAME LIMIT</dt><dd data-testid="test-hud-frame-limit">{controller.maxFramesPerPhase}</dd></div>
          <div><dt>SEED</dt><dd data-testid="test-hud-seed">{seed}</dd></div>
          <div><dt>SCENE</dt><dd data-testid="test-hud-scene">{controller.runtime.scene.name}</dd></div>
          <div><dt>SCENARIO</dt><dd data-testid="test-hud-scenario">{scenarioId ? `${scenarioId} (setup applied)` : "none"}</dd></div>
          <div><dt>TEMPLATE</dt><dd data-testid="test-hud-template">{document.templateOrigin}</dd></div>
          <div className="ai-hud-error"><dt>LAST ERROR</dt><dd data-testid="test-hud-last-error">{controller.runtime.lastError ?? "none"}</dd></div>
        </dl>
        <footer>{document.name} · {profile.controls.length} profile controls · {profile.objectives.length} objectives</footer>
      </section>

      <section className="ai-hud-readout" aria-label="Observations" data-testid="test-observations">
        <header><span className="ai-hud-dot" />OBSERVATIONS</header>
        <dl>
          {profile.observations.map((observation) => (
            <div key={observation.id}>
              <dt>{observation.label}</dt>
              <dd data-testid={`test-observation-${observation.id}`}>{String(observationValue(controller, observation) ?? "none")}</dd>
            </div>
          ))}
          <div>
            <dt>ACCEPTED INPUTS</dt>
            <dd data-testid="test-observation-accepted_inputs">{acceptedInputs}</dd>
          </div>
        </dl>
      </section>

      <div className="ai-hud-readout" data-testid="test-receipts" aria-live="polite">
        <header><span className="ai-hud-dot" />INPUT RECEIPTS</header>
        <ul>
          {receipts.slice(-4).map((receipt, index) => (
            <li key={`${receipt.controlId}-${index}`} data-accepted={String(receipt.accepted)}>
              {receipt.controlId} · {receipt.action} · {receipt.mode} ·{" "}
              {receipt.accepted ? `accepted frames ${receipt.pressFrame ?? "?"}–${receipt.releaseFrame ?? "?"}` : `rejected: ${receipt.reason ?? "unknown"}`}
            </li>
          ))}
          {receipts.length === 0 ? <li>No input yet.</li> : null}
        </ul>
        {notice ? <p className="ai-hud-error" data-testid="test-notice">{notice}</p> : null}
      </div>
      </div>

      <div className="ai-hud-dock">
      <div className="ai-hud-controls" role="group" aria-label="Test mode controls">
        {profile.controls.map((control) => (
          control.mode === "hold" ? (
            <button
              key={control.id}
              type="button"
              className={`ai-hud-button${down.has(control.id) ? " on" : ""}`}
              data-testid={`test-control-${control.id}`}
              aria-pressed={down.has(control.id)}
              aria-label={`${control.label} (${control.mode})`}
              title={control.description}
              onClick={() => (down.has(control.id) ? release(control.id) : press(control.id, "hold", control.action))}
            >
              {control.label} <span>{down.has(control.id) ? "ON" : "OFF"}</span>
            </button>
          ) : (
            <button
              key={control.id}
              type="button"
              className="ai-hud-button jump"
              data-testid={`test-control-${control.id}`}
              aria-label={`${control.label} (${control.mode})`}
              title={control.description}
              onClick={() => press(control.id, "pulse", control.action)}
            >
              {control.label}
            </button>
          )
        ))}
      </div>

      <div className="ai-hud-controls ai-hud-advance" role="group" aria-label="Frame advancement">
        <label className="player-state">
          ADVANCE
          <input
            type="number"
            min={1}
            max={controller.maxFramesPerAdvance}
            value={frames}
            data-testid="test-advance-frames"
            aria-label="Frames to advance"
            onChange={(event) => setFrames(Math.max(1, Math.min(controller.maxFramesPerAdvance, Number(event.target.value) || 1)))}
          />
        </label>
        <button type="button" className="ai-hud-button" data-testid="test-advance" onClick={advance}>
          STEP
        </button>
        <button type="button" className="ai-hud-button" data-testid="test-advance-10" onClick={() => { const step = Math.min(10, controller.maxFramesPerAdvance); setFrames(step); const result = controller.advance(step); setLastAdvance(result); setNotice(result.reason ?? null); onChanged(); }}>
          STEP 10
        </button>
        <button type="button" className="ai-hud-button stop" data-testid="test-reset" onClick={reset}>
          RESET
        </button>
      </div>
      </div>
    </div>
  );
}
