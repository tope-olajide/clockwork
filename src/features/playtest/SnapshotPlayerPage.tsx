import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Application } from "pixi.js";
import { RotateCcw } from "lucide-react";
import { Button } from "../../components/ui";
import { readSnapshot, SnapshotError } from "../../engine/io/snapshot";
import { migrateDocument, type ProjectDocument } from "../../engine/model/schema";
import { ensureTexture } from "../../engine/render/texture-cache";
import { SceneRenderer } from "../../engine/render/scene-renderer";
import { InputManager } from "../../engine/runtime/input";
import { FIXED_DT, Runtime } from "../../engine/runtime/runtime";

interface LoadState {
  document: ProjectDocument | null;
  error: string | null;
}

export function SnapshotPlayerPage() {
  const { snapshotId = "" } = useParams();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const documentRef = useRef<ProjectDocument | null>(null);
  const [state, setState] = useState<LoadState>({ document: null, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await readSnapshot(snapshotId);
        const document = migrateDocument(snapshot.document);
        await Promise.all((snapshot.assets ?? []).map(async (asset) => {
          if (asset.dataUrl) await ensureTexture(asset.id, asset.dataUrl);
        }));
        if (cancelled) return;
        documentRef.current = document;
        setState({ document, error: null });
      } catch (error) {
        if (cancelled) return;
        setState({ document: null, error: error instanceof SnapshotError ? error.message : "Snapshot could not be opened." });
      }
    })();
    return () => { cancelled = true; };
  }, [snapshotId]);

  useEffect(() => {
    const document = state.document;
    const host = hostRef.current;
    if (!document || !host) return;
    let disposed = false;
    const app = new Application();
    const renderer = new SceneRenderer();
    const runtime = new Runtime(document, undefined, 1234);
    runtimeRef.current = runtime;
    const input = new InputManager(document.settings.inputMap);
    input.attach();
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
      input.attachPointer(app.canvas);
      renderer.attach(app);
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      const loop = () => {
        if (disposed) return;
        const now = performance.now();
        const delta = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (runtime.status === "running") {
          accumulator += delta;
          let guard = 0;
          while (accumulator >= FIXED_DT && guard < 8) {
            runtime.step(input.snapshot());
            accumulator -= FIXED_DT;
            guard += 1;
            if (runtime.status !== "running") break;
          }
        }
        const width = host.clientWidth;
        const height = host.clientHeight;
        runtime.setViewport(width, height);
        const scene = runtime.renderScene();
        renderer.render(scene, document);
        renderer.applyCamera(scene, runtime.camera);
        renderer.root.position.set(width / 2 - runtime.camera.x * runtime.camera.zoom, height / 2 - runtime.camera.y * runtime.camera.zoom);
        renderer.root.scale.set(runtime.camera.zoom);
        frames += 1;
        if (now - fpsStarted >= 500) {
          frames = 0;
          fpsStarted = now;
          setTick((value) => value + 1);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      (app as unknown as { __cleanup?: () => void }).__cleanup = () => {
        observer.disconnect();
        cancelAnimationFrame(raf);
      };
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "r" || event.key === "R") {
        runtime.reset();
        accumulator = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      input.detach();
      window.removeEventListener("keydown", onKey);
      (app as unknown as { __cleanup?: () => void }).__cleanup?.();
      app.destroy(true, { children: true });
      renderer.destroy();
      runtimeRef.current = null;
    };
  }, [state.document]);

  const document = state.document;
  const runtime = runtimeRef.current;
  const snapshot = runtime?.snapshot();
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
      data-playtest={pausedLabel(snapshot?.status)}
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
      </div>
      <div className="snapshot-controls">
        <span className="player-state">{pausedLabel(snapshot?.status)}</span>
        <Button variant="secondary" size="sm" onClick={() => { runtimeRef.current?.reset(); setTick((value) => value + 1); }}>
          <RotateCcw size={13} /> Restart
        </Button>
      </div>
    </div>
  );
}

function pausedLabel(status: string | undefined): string {
  if (status === "won") return "WON";
  if (status === "stopped") return "STOPPED";
  if (status === "paused") return "PAUSED";
  return "PLAYING";
}
