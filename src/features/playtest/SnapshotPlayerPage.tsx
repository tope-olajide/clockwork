import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Application } from "pixi.js";
import { RotateCcw } from "lucide-react";
import { Button } from "../../components/ui";
import { readSnapshot, SnapshotError } from "../../engine/io/snapshot";
import { migrateDocument, type ProjectDocument } from "../../engine/model/schema";
import { ensureTexture } from "../../engine/render/texture-cache";
import { SceneRenderer } from "../../engine/render/scene-renderer";
import { InputManager } from "../../engine/runtime/input";
import { FIXED_DT, Runtime } from "../../engine/runtime/runtime";
import { TestController } from "../../engine/runtime/test-controller";
import { gameTestProfileForDocument } from "../../engine/model/game-test-profile";
import {
  applyScenarioToDocument,
  getGameTestScenario,
  validateScenarioSetup,
} from "../../engine/model/game-test-scenarios";
import { AiPlayHud } from "../../play/ai/AiPlayHud";
import { TestModeHud } from "../../play/ai/TestModeHud";

interface LoadState {
  document: ProjectDocument | null;
  error: string | null;
}

export function SnapshotPlayerPage() {
  const { snapshotId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const aiMode = searchParams.get("ai") === "1";
  const seed = Number(searchParams.get("seed") ?? 1234) || 1234;
  // Opt-in only, and only meaningful on the server-created snapshot route: `/play`
  // keeps its real-time loop untouched.
  const testModeRequested = aiMode && searchParams.get("testMode") === "step";
  const requestedScenario = searchParams.get("scenario");
  const requestedSceneId = searchParams.get("scene");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const controllerRef = useRef<TestController | null>(null);
  const renderRef = useRef<(() => void) | null>(null);
  const documentRef = useRef<ProjectDocument | null>(null);
  const [state, setState] = useState<LoadState>({ document: null, error: null });
  const [appliedScenarioId, setAppliedScenarioId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const aiStop = () => {
    const runtime = runtimeRef.current;
    inputRef.current?.clearVirtual();
    if (!runtime) return;
    if (runtime.status === "running") runtime.status = "paused";
    setTick((value) => value + 1);
  };
  const aiRestart = () => {
    inputRef.current?.clearVirtual();
    runtimeRef.current?.reset();
    setTick((value) => value + 1);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await readSnapshot(snapshotId);
        let document = migrateDocument(snapshot.document);
        await Promise.all((snapshot.assets ?? []).map(async (asset) => {
          if (asset.dataUrl) await ensureTexture(asset.id, asset.dataUrl);
        }));
        if (cancelled) return;
        // A scenario is a fixed, code-registered setup: apply it to the document
        // before the first frame so restarts rebuild the same starting state and
        // the setup can never write an outcome itself.
        let appliedScenario: string | null = null;
        if (testModeRequested && requestedScenario) {
          const profile = gameTestProfileForDocument(document);
          const scenario = getGameTestScenario(requestedScenario);
          if (profile && scenario && profile.scenarioIds.includes(scenario.id)) {
            const sceneId = requestedSceneId && document.scenes.some((candidate) => candidate.id === requestedSceneId)
              ? requestedSceneId
              : document.startSceneId;
            if (validateScenarioSetup(scenario, document, sceneId).length === 0) {
              document = applyScenarioToDocument(scenario, document, sceneId);
              appliedScenario = scenario.id;
            }
          }
        }
        setAppliedScenarioId(appliedScenario);
        documentRef.current = document;
        setState({ document, error: null });
      } catch (error) {
        if (cancelled) return;
        setState({ document: null, error: error instanceof SnapshotError ? error.message : "Snapshot could not be opened." });
      }
    })();
    return () => { cancelled = true; };
  }, [snapshotId, testModeRequested, requestedScenario, requestedSceneId]);

  useEffect(() => {
    const document = state.document;
    const host = hostRef.current;
    if (!document || !host) return;
    let disposed = false;
    const app = new Application();
    const renderer = new SceneRenderer();
    const profile = testModeRequested ? gameTestProfileForDocument(document) : undefined;
    const testMode = testModeRequested && profile !== undefined;
    // Test Mode installs a deterministic clock. When a test-mode URL is requested
    // but the template has no profile, the page still refuses to run real time:
    // it stays at frame zero rather than quietly behaving like normal Play.
    const sceneId = requestedSceneId && document.scenes.some((candidate) => candidate.id === requestedSceneId)
      ? requestedSceneId
      : document.startSceneId;
    const controller = testMode ? new TestController(document, { seed, sceneId }) : null;
    controllerRef.current = controller;
    const runtime = controller?.runtime ?? new Runtime(document, undefined, seed);
    runtimeRef.current = runtime;
    const input = testModeRequested ? null : new InputManager(document.settings.inputMap);
    inputRef.current = input;
    input?.attach();
    let accumulator = 0;
    let last = performance.now();
    let raf = 0;
    let frames = 0;
    let fpsStarted = last;

    void app.init({ background: document.settings.background, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 }).then(() => {
      if (disposed) { app.destroy(true, { children: true }); return; }
      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        app.renderer.resize(width, height);
        runtime.setViewport(width, height);
      };
      resize();
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      app.canvas.style.display = "block";
      host.appendChild(app.canvas);
      input?.attachPointer(app.canvas);
      renderer.attach(app);
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      const draw = () => {
        const width = host.clientWidth;
        const height = host.clientHeight;
        runtime.setViewport(width, height);
        const scene = runtime.renderScene();
        renderer.render(scene, document);
        renderer.applyCamera(scene, runtime.camera);
        renderer.root.position.set(width / 2 - runtime.camera.x * runtime.camera.zoom, height / 2 - runtime.camera.y * runtime.camera.zoom);
        renderer.root.scale.set(runtime.camera.zoom);
      };
      renderRef.current = draw;
      const loop = () => {
        if (disposed) return;
        const now = performance.now();
        const delta = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (runtime.status === "running") {
          accumulator += delta;
          let guard = 0;
          while (accumulator >= FIXED_DT && guard < 8) {
            runtime.step(input!.snapshot());
            accumulator -= FIXED_DT;
            guard += 1;
            if (runtime.status !== "running") break;
          }
        }
        draw();
        frames += 1;
        if (now - fpsStarted >= 500) {
          frames = 0;
          fpsStarted = now;
          setTick((value) => value + 1);
        }
        raf = requestAnimationFrame(loop);
      };
      // A test-mode URL never starts the real-time loop, even when the profile is
      // missing: the initial scene is drawn once at frame zero and stays there.
      if (testModeRequested) draw();
      else raf = requestAnimationFrame(loop);
      (app as unknown as { __cleanup?: () => void }).__cleanup = () => {
        observer.disconnect();
        cancelAnimationFrame(raf);
      };
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "r" || event.key === "R") {
        if (controller) controller.reset();
        else runtime.reset();
        accumulator = 0;
        renderRef.current?.();
        setTick((value) => value + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      input?.detach();
      inputRef.current = null;
      controllerRef.current?.releaseAll("test mode closed");
      controllerRef.current = null;
      renderRef.current = null;
      window.removeEventListener("keydown", onKey);
      (app as unknown as { __cleanup?: () => void }).__cleanup?.();
      app.destroy(true, { children: true });
      renderer.destroy();
      runtimeRef.current = null;
    };
  }, [state.document, seed, testModeRequested, requestedSceneId]);

  const document = state.document;
  const runtime = runtimeRef.current;
  const testProfile = document && testModeRequested ? gameTestProfileForDocument(document) : undefined;
  const scenarioId = appliedScenarioId && testProfile && testProfile.scenarioIds.includes(appliedScenarioId) ? appliedScenarioId : null;
  const snapshot = runtime?.snapshot();
  const testStatus = controllerRef.current?.status === "won"
    ? "WON"
    : controllerRef.current?.status === "lost" || controllerRef.current?.status === "stopped"
      ? "LOST"
      : "PAUSED";
  const stateLabel = testModeRequested ? testStatus : pausedLabel(snapshot?.status);
  const scene = runtime?.scene ?? document?.scenes.find((item) => item.id === document.startSceneId) ?? document?.scenes[0] ?? null;
  void tick;

  if (state.error) {
    return (
      <div className="player-page">
        <main className="player-stage">
          <div className="player-placeholder">
            <h1>Snapshot unavailable</h1>
            <p>{state.error}</p>
          </div>
        </main>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="player-page">
        <main className="player-stage"><div className="player-placeholder"><h1>Loading snapshot…</h1></div></main>
      </div>
    );
  }

  return (
    <div
      className="player-page snapshot-player"
      data-playtest={stateLabel}
      data-ai-play={aiMode ? "on" : "off"}
      data-test-mode={testModeRequested ? (testProfile ? "step" : "unavailable") : "off"}
      data-seed={seed}
      data-scenario={scenarioId ?? ""}
      data-scene-id={scene?.id ?? ""}
      data-frame={snapshot?.frame ?? 0}
      data-variables={JSON.stringify(snapshot?.variables ?? {})}
      data-player={JSON.stringify(runtime?.player() ? { x: runtime.player()!.x, y: runtime.player()!.y, vx: runtime.player()!.vx, vy: runtime.player()!.vy, grounded: runtime.player()!.grounded } : null)}
    >
      <a className="snapshot-badge" href="/" aria-label="Made with Clockwork">Made with Clockwork</a>
      <div className="play-viewport snapshot-viewport" ref={hostRef}>
        <div className="play-hud">
          {document.settings.ui.hud.filter((widget) => widget.visible !== false).map((widget) => {
            const value = snapshot?.variables[widget.variable];
            return (
              <div key={widget.id} className={`play-hud-widget ${widget.corner}`}>
                <span>{widget.label}</span>
                {widget.style === "bar" ? (
                  <span className="play-hud-bar" aria-label={`${widget.label} ${String(value ?? 0)} of ${widget.max ?? 1}`}>
                    <span style={{ width: `${Math.min(100, (Number(value ?? 0) / (widget.max ?? 1)) * 100)}%` }} />
                  </span>
                ) : <strong>{String(value ?? 0)}</strong>}
              </div>
            );
          })}
          {snapshot?.messages.map((message) => (
            <div key={message.id} className="play-message" style={{ color: document.settings.ui.message.color, background: document.settings.ui.message.background, fontSize: `${document.settings.ui.message.fontSize}px` }}>
              {message.text}
            </div>
          ))}
        </div>
        {aiMode && testModeRequested && document ? (
          testProfile && controllerRef.current ? (
            <TestModeHud
              document={document}
              profile={testProfile}
              controller={controllerRef.current}
              seed={seed}
              scenarioId={scenarioId}
              onChanged={() => { renderRef.current?.(); setTick((value) => value + 1); }}
            />
          ) : (
            <div className="ai-play-hud" data-testid="test-mode-unavailable" data-test-mode="unavailable">
              <section className="ai-hud-readout" aria-label="Test mode unavailable">
                <header><span className="ai-hud-dot" />TEST MODE UNAVAILABLE</header>
                <p>
                  No game-test profile is registered for “{document.templateOrigin}”. The run stays paused at frame zero
                  instead of approximating controls it cannot verify.
                </p>
              </section>
            </div>
          )
        ) : aiMode && runtime ? (
          <AiPlayHud
            document={document}
            runtime={runtime}
            sceneName={scene?.name ?? ""}
            seed={seed}
            onMove={(direction, held) => { inputRef.current?.setAction(direction, held); setTick((value) => value + 1); }}
            onJump={() => { inputRef.current?.tapAction("jump"); setTick((value) => value + 1); }}
            onAction={() => { inputRef.current?.tapAction("action"); setTick((value) => value + 1); }}
            onStop={aiStop}
            onRestart={aiRestart}
          />
        ) : null}
      </div>
      <div className="snapshot-controls">
        <span className="player-state">{stateLabel}</span>
        <Button variant="secondary" size="sm" onClick={() => { const controller = controllerRef.current; if (controller) controller.reset(); else runtimeRef.current?.reset(); renderRef.current?.(); setTick((value) => value + 1); }}>
          <RotateCcw size={13} /> Restart
        </Button>
      </div>
    </div>
  );
}

function pausedLabel(status: string | undefined): string {
  if (status === "won") return "WON";
  if (status === "lost") return "LOST";
  if (status === "stopped") return "STOPPED";
  if (status === "paused") return "PAUSED";
  return "PLAYING";
}
