import { Application } from "pixi.js";
import { migrateDocument, type ProjectDocument } from "../engine/model/schema";
import { SceneRenderer } from "../engine/render/scene-renderer";
import { ensureTexture } from "../engine/render/texture-cache";
import { FIXED_DT, Runtime } from "../engine/runtime/runtime";
import { InputManager } from "../engine/runtime/input";
import { playSceneMusic, setSceneMusicVolume, stopSceneMusic, unlockAudio } from "../engine/runtime/audio";
import type { SnapshotAsset } from "@shared/snapshot";

interface ExportPayload {
  project: unknown;
  assets: SnapshotAsset[];
}

const root = document.body;
const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const fallback = document.getElementById("fallback") as HTMLDivElement | null;

function fail(message: string): never {
  if (fallback) {
    fallback.hidden = false;
    fallback.textContent = message;
  }
  throw new Error(message);
}

function installHud(): HTMLDivElement {
  const hud = document.createElement("div");
  hud.id = "clockwork-hud";
  hud.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:1;font-family:Inter,system-ui,sans-serif;";
  root.appendChild(hud);
  return hud;
}

async function boot(): Promise<void> {
  if (!canvas) fail("The exported game is missing its canvas.");
  let payload: ExportPayload;
  try {
    const response = await fetch("./project.json");
    if (!response.ok) throw new Error(`project.json returned ${response.status}`);
    payload = (await response.json()) as ExportPayload;
  } catch (error) {
    fail(`Could not load project.json. Serve this folder over HTTP. ${error instanceof Error ? error.message : ""}`);
  }

  let project: ProjectDocument;
  try {
    project = migrateDocument(payload.project);
  } catch (error) {
    fail(`The exported project is invalid: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  await Promise.all((payload.assets ?? []).map(async (asset) => {
    if (asset.dataUrl) await ensureTexture(asset.id, asset.dataUrl);
  }));

  const app = new Application();
  await app.init({ background: project.settings.background, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  app.canvas.style.width = "100%";
  app.canvas.style.height = "100%";
  app.canvas.style.display = "block";
  canvas.replaceWith(app.canvas);
  canvas.id = "game";
  app.canvas.id = "game";
  const renderer = new SceneRenderer();
  renderer.attach(app);

  const runtime = new Runtime(project, undefined, 1234);
  const input = new InputManager(project.settings.inputMap);
  input.attach();
  input.attachPointer(app.canvas);
  const hud = installHud();

  const resize = () => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    app.renderer.resize(width, height);
    runtime.setViewport(width, height);
  };
  resize();
  window.addEventListener("resize", resize);

  const unlock = () => void unlockAudio();
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  function restart(): void {
    runtime.reset();
    stopSceneMusic();
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "r" || event.key === "R") restart();
  });

  let accumulator = 0;
  let last = performance.now();
  let frames = 0;
  let fpsStarted = last;
  let fps = 0;

  function renderHud(): void {
    const snapshot = runtime.snapshot();
    hud.replaceChildren();
    for (const widget of project.settings.ui.hud.filter((item) => item.visible !== false)) {
      const value = snapshot.variables[widget.variable];
      const element = document.createElement("div");
      element.style.cssText = `position:absolute;${widget.corner.includes("top") ? "top:16px" : "bottom:16px"};${widget.corner.includes("left") ? "left:16px" : "right:16px"};background:rgba(11,13,18,.72);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:7px 10px;color:#f1f0ed;font-size:12px;display:flex;gap:8px;align-items:center;`;
      const label = document.createElement("span");
      label.textContent = widget.label;
      label.style.opacity = "0.7";
      const valueElement = document.createElement("strong");
      valueElement.textContent = widget.style === "bar" ? `${String(value ?? 0)} / ${widget.max ?? 1}` : String(value ?? 0);
      element.append(label, valueElement);
      hud.appendChild(element);
    }
    for (const message of snapshot.messages) {
      const element = document.createElement("div");
      element.textContent = message.text;
      element.style.cssText = `position:absolute;left:50%;bottom:18%;transform:translateX(-50%);background:${project.settings.ui.message.background};color:${project.settings.ui.message.color};font-size:${project.settings.ui.message.fontSize}px;padding:8px 12px;border-radius:8px;`;
      hud.appendChild(element);
    }
    const activeCanvas = app.canvas;
    activeCanvas.dataset.playtest = snapshot.status;
    activeCanvas.dataset.sceneId = runtime.scene.id;
    activeCanvas.dataset.frame = String(snapshot.frame);
    activeCanvas.dataset.fps = String(fps);
    activeCanvas.dataset.variables = JSON.stringify(snapshot.variables);
    const player = runtime.player();
    activeCanvas.dataset.player = JSON.stringify(player ? { x: player.x, y: player.y, vx: player.vx, vy: player.vy, grounded: player.grounded } : null);
  }

  const loop = () => {
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
    const width = window.innerWidth;
    const height = window.innerHeight;
    runtime.setViewport(width, height);
    const scene = runtime.renderScene();
    const musicVolume = (project.settings.audio.masterVolume ?? 1) * (project.settings.audio.musicVolume ?? 1) * (scene.audio?.volume ?? 1);
    if (scene.audio?.musicAssetId) {
      void playSceneMusic(scene.audio.musicAssetId, musicVolume, scene.audio.loop ?? true);
      setSceneMusicVolume(musicVolume);
    } else {
      stopSceneMusic();
    }
    renderer.render(scene, project);
    renderer.applyCamera(scene, runtime.camera);
    renderer.root.position.set(width / 2 - runtime.camera.x * runtime.camera.zoom, height / 2 - runtime.camera.y * runtime.camera.zoom);
    renderer.root.scale.set(runtime.camera.zoom);
    frames += 1;
    if (now - fpsStarted >= 500) {
      fps = Math.round((frames * 1000) / (now - fpsStarted));
      frames = 0;
      fpsStarted = now;
      renderHud();
    }
    requestAnimationFrame(loop);
  };
  renderHud();
  requestAnimationFrame(loop);
}

void boot();
