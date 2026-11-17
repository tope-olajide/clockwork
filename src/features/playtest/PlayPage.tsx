import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Application } from "pixi.js";
import { ArrowLeft, Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { Button } from "../../components/ui";
import { readAssetBlob } from "../../engine/persistence/indexeddb";
import { ensureTexture, getTexture } from "../../engine/render/texture-cache";
import { SceneRenderer } from "../../engine/render/scene-renderer";
import { InputManager } from "../../engine/runtime/input";
import { FIXED_DT, Runtime } from "../../engine/runtime/runtime";
import { playSceneMusic, setSceneMusicVolume, stopSceneMusic, unlockAudio } from "../../engine/runtime/audio";
import { useEngineStore } from "../../engine/store/engine-store";

function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function PlayPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const document = useEngineStore((state) => state.document);
  const activeProjectId = useEngineStore((state) => state.activeProjectId);
  const loadProject = useEngineStore((state) => state.loadProject);
  const storageError = useEngineStore((state) => state.storageError);
  const setPlaytestRunning = useEngineStore((state) => state.setPlaytestRunning);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const pausedRef = useRef(false);
  const seedRef = useRef(1234);
  const textureVersionRef = useRef(0);
  const perfRef = useRef({ step: 0, render: 0 });
  const [paused, setPaused] = useState(false);
  const [debug, setDebug] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [fps, setFps] = useState(0);
  const [, setTick] = useState(0);

  const current = document?.id === projectId ? document : null;

  useEffect(() => {
    if (activeProjectId !== projectId || (!current && !storageError)) void loadProject(projectId);
  }, [activeProjectId, current, loadProject, projectId, storageError]);

  useEffect(() => {
    if (!current) return;
    const params = new URLSearchParams(window.location.search);
    const seed = Number(params.get("seed") ?? 1234) || 1234;
    seedRef.current = seed;
    const runtime = new Runtime(current, undefined, seed);
    runtimeRef.current = runtime;
    setPlaytestRunning(true);
    const input = new InputManager(current.settings.inputMap);
    input.attach();
    inputRef.current = input;
    pausedRef.current = false;
    setPaused(false);

    const unlock = () => void unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      input.detach();
      runtimeRef.current = null;
      inputRef.current = null;
      setPlaytestRunning(false);
      stopSceneMusic();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [current, setPlaytestRunning]);

  useEffect(() => {
    if (!current) return;
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();
    const renderer = new SceneRenderer();
    void app.init({ background: "#0b0c0f", antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 }).then(() => {
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      const rect = host.getBoundingClientRect();
      app.renderer.resize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      app.canvas.style.display = "block";
      host.appendChild(app.canvas);
      renderer.attach(app);
      appRef.current = app;
      rendererRef.current = renderer;

      let accumulator = 0;
      let last = performance.now();
      let frames = 0;
      let fpsStarted = last;
      let raf = 0;
      const loop = () => {
        if (disposed) return;
        const now = performance.now();
        const delta = Math.min(0.1, (now - last) / 1000);
        last = now;
        const runtime = runtimeRef.current;
        const input = inputRef.current;
        if (runtime && input) {
          const stepStarted = performance.now();
          if (!pausedRef.current && runtime.status === "running") {
            accumulator += delta;
            let guard = 0;
            while (accumulator >= FIXED_DT && guard < 8) {
              runtime.step(input.snapshot());
              accumulator -= FIXED_DT;
              guard += 1;
              if (runtime.status !== "running") break;
            }
          }
          const renderStarted = performance.now();
          const width = host.clientWidth;
          const height = host.clientHeight;
          runtime.setViewport(width, height);
          const scene = runtime.renderScene();
          const musicVolume = (current.settings.audio.masterVolume ?? 1) * (current.settings.audio.musicVolume ?? 1) * (scene.audio?.volume ?? 1);
          if (scene.audio?.musicAssetId) {
            void playSceneMusic(scene.audio.musicAssetId, musicVolume, scene.audio.loop ?? true);
            setSceneMusicVolume(musicVolume);
          } else {
            stopSceneMusic();
          }
          renderer.render(scene, current, textureVersionRef.current);
          renderer.applyCamera(scene, runtime.camera);
          renderer.root.position.set(width / 2 - runtime.camera.x * runtime.camera.zoom, height / 2 - runtime.camera.y * runtime.camera.zoom);
          renderer.root.scale.set(runtime.camera.zoom);
          perfRef.current = { step: renderStarted - stepStarted, render: performance.now() - renderStarted };
        }
        frames += 1;
        if (now - fpsStarted >= 500) {
          const nextFps = Math.round((frames * 1000) / (now - fpsStarted));
          setFps(nextFps);
          runtime?.recordFps(nextFps);
          frames = 0;
          fpsStarted = now;
          setTick((value) => value + 1);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      const observer = new ResizeObserver(() => {
        const rect = host.getBoundingClientRect();
        app.renderer.resize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
      });
      observer.observe(host);

      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          navigate(`/project/${projectId}`);
        } else if (event.key === "F1") {
          event.preventDefault();
          setDebug((value) => !value);
        } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          togglePause();
        }
      };
      window.addEventListener("keydown", onKey);
      (app as unknown as { __cleanup?: () => void }).__cleanup = () => {
        window.removeEventListener("keydown", onKey);
        observer.disconnect();
        cancelAnimationFrame(raf);
      };
    });

    return () => {
      disposed = true;
      const cleanup = (app as unknown as { __cleanup?: () => void }).__cleanup;
      cleanup?.();
      appRef.current?.destroy(true, { children: true });
      rendererRef.current?.destroy();
      appRef.current = null;
      rendererRef.current = null;
    };
    // The loop reads the runtime and input refs, so it only needs the project identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    void (async () => {
      for (const asset of current.assets.filter((candidate) => candidate.kind === "image" || candidate.kind === "tileset")) {
        if (cancelled) return;
        if (getTexture(asset.id)) continue;
        const blob = await readAssetBlob(asset.id);
        if (!blob || cancelled) continue;
        const url = URL.createObjectURL(blob);
        const texture = await ensureTexture(asset.id, url);
        if (texture && !cancelled) textureVersionRef.current += 1;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current]);

  function togglePause() {
    const runtime = runtimeRef.current;
    if (!runtime || (runtime.status !== "running" && runtime.status !== "paused")) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    runtime.status = next ? "paused" : "running";
  }

  function stepOnce() {
    const runtime = runtimeRef.current;
    const input = inputRef.current;
    if (!runtime || !input || (runtime.status !== "running" && runtime.status !== "paused")) return;
    runtime.status = "running";
    runtime.step(input.snapshot());
    runtime.status = "paused";
    pausedRef.current = true;
    setPaused(true);
    setTick((value) => value + 1);
  }

  function reset() {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.reset();
    pausedRef.current = false;
    setPaused(false);
    setTick((value) => value + 1);
  }

  const runtime = runtimeRef.current;
  const scene = runtime?.scene ?? current?.scenes.find((candidate) => candidate.id === current.startSceneId) ?? current?.scenes[0] ?? null;
  const hud = current?.settings.ui.hud ?? [];
  const snapshot = runtime?.snapshot();

  if (!current) {
    return (
      <div
        className="player-page"
        data-playtest={paused ? "paused" : (snapshot?.status ?? "running")}
        data-scene-id={scene?.id ?? ""}
        data-frame={snapshot?.frame ?? 0}
        data-fps={fps}
        data-variables={JSON.stringify(snapshot?.variables ?? {})}
        data-player={JSON.stringify(runtime?.player() ? { x: runtime.player()!.x, y: runtime.player()!.y, vx: runtime.player()!.vx, vy: runtime.player()!.vy, grounded: runtime.player()!.grounded } : null)}
        data-step-ms={perfRef.current.step.toFixed(2)}
        data-render-ms={perfRef.current.render.toFixed(2)}
      >
        <header className="player-bar">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft size={13} /> Back
          </Button>
          <span className="project-meta">Loading playtest…</span>
        </header>
        <main className="player-stage">
          <div className="player-placeholder">
            <h1>{storageError ?? "Loading project"}</h1>
            <p>{storageError ? "The project could not be opened." : "Preparing the runtime…"}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      className="player-page"
      data-playtest={paused ? "paused" : (snapshot?.status ?? "running")}
      data-scene-id={scene?.id ?? ""}
      data-frame={snapshot?.frame ?? 0}
      data-fps={fps}
      data-variables={JSON.stringify(snapshot?.variables ?? {})}
      data-player={JSON.stringify(runtime?.player() ? { x: runtime.player()!.x, y: runtime.player()!.y, vx: runtime.player()!.vx, vy: runtime.player()!.vy, grounded: runtime.player()!.grounded } : null)}
      data-step-ms={perfRef.current.step.toFixed(2)}
      data-render-ms={perfRef.current.render.toFixed(2)}
    >
      <header className="player-bar">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}`)}>
          <ArrowLeft size={13} /> Editor
        </Button>
        <span className="chip violet">
          {paused ? "PAUSED" : snapshot?.status === "won" ? "WON" : snapshot?.status === "stopped" ? "ERROR" : "PLAYING"}
        </span>
        <span className="project-meta">
          {scene?.name ?? "Scene"} · seed {seedRef.current} · {formatTime(snapshot?.elapsed ?? 0)}
        </span>
        <span className="chip">Read-only</span>
        <Button variant="secondary" size="sm" onClick={togglePause}>
          {paused ? <Play size={13} /> : <Pause size={13} />} {paused ? "Resume" : "Pause"}
        </Button>
        <Button variant="secondary" size="sm" onClick={stepOnce}>
          <StepForward size={13} /> Step
        </Button>
        <Button variant="secondary" size="sm" onClick={reset}>
          <RotateCcw size={13} /> Reset
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}`)}>
          Stop
        </Button>
      </header>

      <main className="player-stage play-stage">
        <div className="play-viewport" ref={hostRef}>
          <div className="play-hud">
            {hud.filter((widget) => widget.visible !== false).map((widget) => {
              const value = snapshot?.variables[widget.variable];
              return (
                <div key={widget.id} className={`play-hud-widget ${widget.corner}`}>
                  <span>{widget.label}</span>
                  {widget.style === "bar" ? (
                    <span className="play-hud-bar" aria-label={`${widget.label} ${String(value ?? 0)} of ${widget.max ?? 1}`}>
                      <span style={{ width: `${Math.min(100, (Number(value ?? 0) / (widget.max ?? 1)) * 100)}%` }} />
                    </span>
                  ) : (
                    <strong>{String(value ?? 0)}</strong>
                  )}
                </div>
              );
            })}
            {snapshot?.messages.map((message) => (
              <div
                key={message.id}
                className="play-message"
                style={{
                  color: current.settings.ui.message.color,
                  background: current.settings.ui.message.background,
                  fontSize: `${current.settings.ui.message.fontSize}px`,
                }}
              >
                {message.text}
              </div>
            ))}
          </div>
          {debug && (
            <div className="play-debug">
              <span>FPS {fps} · avg {Math.round(runtime?.averageFps() ?? 0)}</span>
              <span>Step {perfRef.current.step.toFixed(2)} ms · render {perfRef.current.render.toFixed(2)} ms</span>
              <span>Objects {runtime?.objects.filter((object) => object.active).length ?? 0}</span>
              <span>Bodies {runtime?.objects.filter((object) => object.active && object.source.body).length ?? 0}</span>
              <span>Cam {Math.round(runtime?.camera.x ?? 0)}, {Math.round(runtime?.camera.y ?? 0)}</span>
              <span>Frame {snapshot?.frame ?? 0}</span>
            </div>
          )}
          {runtime?.lastError && <div className="play-error">Runtime error: {runtime.lastError}</div>}
        </div>
      </main>

      <section className={`play-console${consoleOpen ? " open" : ""}`}>
        <button className="play-console-toggle" onClick={() => setConsoleOpen((value) => !value)}>
          Console · {snapshot?.events.length ?? 0} events {consoleOpen ? "▾" : "▴"}
        </button>
        {consoleOpen && (
          <div className="play-console-list">
            {[...(snapshot?.events ?? [])].slice(-40).reverse().map((event, index) => (
              <div key={`${event.frame}-${index}`} className={`play-console-row ${event.type}`}>
                <span className="input-mono">{event.frame}</span>
                <span>{event.type}</span>
                <span>{event.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
