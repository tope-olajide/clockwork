import { useState } from "react";
import type { ProjectDocument } from "../../engine/model/schema";
import type { Runtime } from "../../engine/runtime/runtime";

interface AiPlayHudProps {
  document: ProjectDocument;
  runtime: Runtime;
  sceneName: string;
  seed: number;
  onMove: (direction: "left" | "right", held: boolean) => void;
  onJump: () => void;
  onAction: () => void;
  onStop: () => void;
  onRestart: () => void;
}

function statusToken(runtime: Runtime): string {
  if (runtime.lastError) return "ERROR";
  if (runtime.status === "won") return "WON";
  if (runtime.status === "stopped") return "LOST";
  if (runtime.status === "paused") return "PAUSED";
  return "PLAYING";
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function AiPlayHud({
  document,
  runtime,
  sceneName,
  seed,
  onMove,
  onJump,
  onAction,
  onStop,
  onRestart,
}: AiPlayHudProps) {
  const [moving, setMoving] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const coins = runtime.variables.coins ?? 0;
  const status = statusToken(runtime);

  function toggle(direction: "left" | "right") {
    const next = !moving[direction];
    const nextMoving = { left: false, right: false, [direction]: next };
    setMoving(nextMoving);
    onMove("left", nextMoving.left);
    onMove("right", nextMoving.right);
  }

  function stop() {
    setMoving({ left: false, right: false });
    onMove("left", false);
    onMove("right", false);
    onStop();
  }

  function restart() {
    setMoving({ left: false, right: false });
    onMove("left", false);
    onMove("right", false);
    onRestart();
  }

  return (
    <div className="ai-play-hud" data-testid="ai-play-hud">
      <section className="ai-hud-readout" aria-label="AI Play state" aria-live="polite" data-testid="ai-hud-state">
        <header><span className="ai-hud-dot" />AI PLAY</header>
        <dl>
          <div><dt>STATUS</dt><dd data-testid="ai-hud-status">{status}</dd></div>
          <div><dt>SCENE</dt><dd data-testid="ai-hud-scene">{sceneName || "none"}</dd></div>
          <div><dt>COINS</dt><dd data-testid="ai-hud-coins">{String(coins)}</dd></div>
          <div><dt>HEALTH</dt><dd data-testid="ai-hud-health">{String(runtime.variables.health ?? "none")}</dd></div>
          <div><dt>TIME</dt><dd data-testid="ai-hud-time">{formatTime(runtime.snapshot().elapsed)}</dd></div>
          <div><dt>SEED</dt><dd data-testid="ai-hud-seed">{seed}</dd></div>
          <div className="ai-hud-error"><dt>LAST ERROR</dt><dd data-testid="ai-hud-last-error">{runtime.lastError ?? "none"}</dd></div>
        </dl>
        <footer>{document.name} · snapshot player</footer>
      </section>

      <div className="ai-hud-controls" role="group" aria-label="AI Play controls">
        <button
          type="button"
          className={`ai-hud-button${moving.left ? " on" : ""}`}
          data-testid="ai-hud-move-left"
          aria-pressed={moving.left}
          onClick={() => toggle("left")}
        >
          MOVE LEFT <span>{moving.left ? "ON" : "OFF"}</span>
        </button>
        <button
          type="button"
          className={`ai-hud-button${moving.right ? " on" : ""}`}
          data-testid="ai-hud-move-right"
          aria-pressed={moving.right}
          onClick={() => toggle("right")}
        >
          MOVE RIGHT <span>{moving.right ? "ON" : "OFF"}</span>
        </button>
        <button type="button" className="ai-hud-button jump" data-testid="ai-hud-jump" onClick={onJump}>
          JUMP
        </button>
        <button type="button" className="ai-hud-button" data-testid="ai-hud-action" onClick={onAction}>
          ACTION
        </button>
        <button type="button" className="ai-hud-button stop" data-testid="ai-hud-stop" onClick={stop}>
          STOP
        </button>
        <button type="button" className="ai-hud-button" data-testid="ai-hud-restart" onClick={restart}>
          RESTART
        </button>
      </div>
    </div>
  );
}
