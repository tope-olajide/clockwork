import { Application, Graphics } from "pixi.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, CornerDownRight, Sparkles, Trash2 } from "lucide-react";
import { useToast } from "../../components/ui";
import type { GameObject, Scene } from "../model/schema";
import { useEngineStore } from "../store/engine-store";
import {
  fitCamera,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type CameraState,
  type ViewportSize,
} from "./camera";
import { SceneRenderer, objectDims } from "./scene-renderer";

type TransformPatch = {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
};

type HandleName = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface GestureMove {
  kind: "move";
  startWorld: { x: number; y: number };
  ids: string[];
  origins: Map<string, { x: number; y: number }>;
  moved: boolean;
  preview: Record<string, TransformPatch>;
}

interface GestureScale {
  kind: "scale";
  handle: HandleName;
  objectId: string;
  fixed: { x: number; y: number };
  dims: { w: number; h: number };
  preview: Record<string, TransformPatch>;
}

interface GestureRotate {
  kind: "rotate";
  objectId: string;
  center: { x: number; y: number };
  startAngle: number;
  startRotation: number;
  preview: Record<string, TransformPatch>;
}

interface GesturePan {
  kind: "pan";
  lastX: number;
  lastY: number;
}

interface GestureMarquee {
  kind: "marquee";
  startScreen: { x: number; y: number };
}

type Gesture = GestureMove | GestureScale | GestureRotate | GesturePan | GestureMarquee;

const HANDLE_SIZE = 7;
const ROTATE_OFFSET = 26;

interface ContextMenuState {
  x: number;
  y: number;
  objectId: string | null;
}

export function EngineViewport() {
  const document = useEngineStore((state) => state.document);
  const activeSceneId = useEngineStore((state) => state.activeSceneId);
  const selection = useEngineStore((state) => state.selection);
  const setSelection = useEngineStore((state) => state.setSelection);
  const dispatch = useEngineStore((state) => state.dispatch);
  const snapGrid = useEngineStore((state) => state.snapGrid);
  const toast = useToast();

  const scene: Scene | null =
    document?.scenes.find((candidate) => candidate.id === activeSceneId) ?? document?.scenes[0] ?? null;
  const readOnly = Boolean(document?.archivedAt);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const overlayRef = useRef<Graphics | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const spaceRef = useRef(false);
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
  const viewportRef = useRef<ViewportSize>({ width: 0, height: 0 });
  const sceneRef = useRef<Scene | null>(scene);
  const [ready, setReady] = useState(false);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });
  const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, TransformPatch>>({});
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [fps, setFps] = useState(0);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);

  sceneRef.current = scene;

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // Create the Pixi application once, and keep it sized to the canvas host.
  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();
    const renderer = new SceneRenderer();
    void app
      .init({ backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 })
      .then(() => {
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }
        app.canvas.style.width = "100%";
        app.canvas.style.height = "100%";
        app.canvas.style.display = "block";
        app.canvas.style.touchAction = "none";
        host.appendChild(app.canvas);
        const overlay = new Graphics();
        renderer.attach(app);
        app.stage.addChild(overlay);
        appRef.current = app;
        rendererRef.current = renderer;
        overlayRef.current = overlay;

        const rect = host.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        app.renderer.resize(width, height);
        setViewport({ width, height });

        const onLost = (event: Event) => event.preventDefault();
        app.canvas.addEventListener("webglcontextlost", onLost);

        let frames = 0;
        let last = performance.now();
        const tick = () => {
          frames += 1;
          const now = performance.now();
          if (now - last >= 500) {
            setFps(Math.round((frames * 1000) / (now - last)));
            frames = 0;
            last = now;
          }
        };
        app.ticker.add(tick);
        (app as unknown as { __onLost?: (event: Event) => void }).__onLost = onLost;
        setReady(true);
      })
      .catch(() => {
        toast.push("Renderer unavailable", "WebGL could not start. The document is still editable from the docks.");
      });

    const observer = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      setViewport({ width, height });
      if (app.renderer) app.renderer.resize(width, height);
    });
    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
      const current = appRef.current;
      const currentRenderer = rendererRef.current;
      if (current) {
        const onLost = (current as unknown as { __onLost?: (event: Event) => void }).__onLost;
        if (onLost) current.canvas.removeEventListener("webglcontextlost", onLost);
        current.destroy(true, { children: true });
      }
      currentRenderer?.destroy();
      appRef.current = null;
      rendererRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile the document into Pixi whenever the scene, revision, or camera changes.
  useEffect(() => {
    const renderer = rendererRef.current;
    const app = appRef.current;
    if (!ready || !renderer || !app || !scene || !document) return;
    renderer.render(scene, document);
    renderer.applyCamera(scene, camera);
    renderer.root.position.set(viewport.width / 2 - camera.x * camera.zoom, viewport.height / 2 - camera.y * camera.zoom);
    renderer.root.scale.set(camera.zoom);
    renderer.previewTransforms(preview, scene);

    const overlay = overlayRef.current;
    if (overlay) drawOverlay(overlay, scene, camera, viewport, selection, hoverId, marquee, guides);
  }, [ready, scene, document, camera, viewport, selection, hoverId, marquee, guides, preview]);

  // Fit the scene when it changes or when the viewport first becomes measurable.
  useEffect(() => {
    if (!scene || viewport.width === 0 || viewport.height === 0) return;
    setCamera(fitCamera(viewport, scene.size));
  }, [scene?.id, viewport.width > 0, viewport.height > 0]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.code === "Space") {
        spaceRef.current = true;
        if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        event.preventDefault();
      }
      const state = useEngineStore.getState();
      if (event.key === "0") {
        const active = sceneRef.current;
        if (active) setCamera(fitCamera(viewportRef.current, active.size));
      } else if (event.key === "1") {
        setCamera((current) => ({ ...current, zoom: 1 }));
      } else if (event.key === "Escape") {
        setMenu(null);
      } else if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") &&
        state.selection.length > 0 &&
        !state.document?.archivedAt
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        const active = sceneRef.current;
        if (!active) return;
        const transforms = state.selection
          .map((id) => active.objects.find((object) => object.id === id))
          .filter((object): object is GameObject => Boolean(object))
          .map((object) => ({ objectId: object.id, transform: { x: object.transform.x + dx, y: object.transform.y + dy } }));
        if (transforms.length > 0) state.dispatch("objects.applyTransforms", { sceneId: active.id, transforms });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spaceRef.current = false;
        if (canvasRef.current) canvasRef.current.style.cursor = "";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const onWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const host = canvasRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setCamera((current) => zoomAt(current, { width: rect.width, height: rect.height }, point, current.zoom * Math.exp(-event.deltaY * 0.0015)));
  }, []);

  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  function localPoint(event: { clientX: number; clientY: number }) {
    const host = canvasRef.current;
    if (!host) return { x: 0, y: 0 };
    const rect = host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pointToWorld(local: { x: number; y: number }) {
    return screenToWorld(cameraRef.current, viewportRef.current, local);
  }

  function snapValue(value: number, grid: number): number {
    if (!grid) return value;
    return Math.round(value / grid) * grid;
  }

  function beginScale(handle: HandleName, objectId: string, object: GameObject): void {
    const dims = objectDims(object);
    const halfW = (dims.w * object.transform.scaleX) / 2;
    const halfH = (dims.h * object.transform.scaleY) / 2;
    const cx = object.transform.x;
    const cy = object.transform.y;
    const fixed = {
      x: handle.includes("w") ? cx + halfW : handle.includes("e") ? cx - halfW : cx,
      y: handle.includes("n") ? cy + halfH : handle.includes("s") ? cy - halfH : cy,
    };
    gestureRef.current = { kind: "scale", handle, objectId, fixed, dims, preview: {} };
  }

  function handlePoints(rect: { x: number; y: number; w: number; h: number }) {
    const { x, y, w, h } = rect;
    return {
      nw: { x, y },
      n: { x: x + w / 2, y },
      ne: { x: x + w, y },
      e: { x: x + w, y: y + h / 2 },
      se: { x: x + w, y: y + h },
      s: { x: x + w / 2, y: y + h },
      sw: { x, y: y + h },
      w: { x, y: y + h / 2 },
    } as Record<HandleName, { x: number; y: number }>;
  }

  function screenRectOf(object: GameObject) {
    const bounds = rendererRef.current?.getBounds(object.id);
    if (!bounds) return null;
    const topLeft = worldToScreen(cameraRef.current, viewportRef.current, { x: bounds.left, y: bounds.top });
    const bottomRight = worldToScreen(cameraRef.current, viewportRef.current, { x: bounds.right, y: bounds.bottom });
    return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (menu) setMenu(null);
    const host = canvasRef.current;
    if (!host) return;
    try {
      host.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers (tests, some pen drivers) cannot be captured; the gesture still works.
    }
    const local = localPoint(event);
    if (event.button === 1 || spaceRef.current) {
      gestureRef.current = { kind: "pan", lastX: local.x, lastY: local.y };
      host.style.cursor = "grabbing";
      return;
    }
    if (event.button !== 0 || !scene) return;
    if (readOnly) return;

    const selectionState = useEngineStore.getState().selection;
    if (selectionState.length === 1) {
      const only = scene.objects.find((object) => object.id === selectionState[0]);
      if (only) {
        const rect = screenRectOf(only);
        if (rect) {
          const points = handlePoints(rect);
          for (const [name, point] of Object.entries(points) as Array<[HandleName, { x: number; y: number }]>) {
            if (Math.abs(point.x - local.x) <= HANDLE_SIZE && Math.abs(point.y - local.y) <= HANDLE_SIZE) {
              beginScale(name, only.id, only);
              return;
            }
          }
          const rotatePoint = { x: rect.x + rect.w / 2, y: rect.y - ROTATE_OFFSET };
          if (Math.hypot(rotatePoint.x - local.x, rotatePoint.y - local.y) <= 8) {
            const center = { x: only.transform.x, y: only.transform.y };
            const world = pointToWorld(local);
            gestureRef.current = {
              kind: "rotate",
              objectId: only.id,
              center,
              startAngle: Math.atan2(world.y - center.y, world.x - center.x),
              startRotation: only.transform.rotation,
              preview: {},
            };
            return;
          }
        }
      }
    }

    const world = pointToWorld(local);
    const hit = rendererRef.current?.hitTest(world, scene) ?? null;
    if (hit) {
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      let nextSelection: string[];
      if (additive) {
        nextSelection = selectionState.includes(hit.id)
          ? selectionState.filter((id) => id !== hit.id)
          : [...selectionState, hit.id];
      } else if (selectionState.includes(hit.id)) {
        nextSelection = selectionState;
      } else {
        nextSelection = [hit.id];
      }
      setSelection(nextSelection);
      const ids = nextSelection.includes(hit.id) ? nextSelection : [hit.id];
      const origins = new Map<string, { x: number; y: number }>();
      for (const id of ids) {
        const object = scene.objects.find((candidate) => candidate.id === id);
        if (object) origins.set(id, { x: object.transform.x, y: object.transform.y });
      }
      gestureRef.current = { kind: "move", startWorld: world, ids, origins, moved: false, preview: {} };
      return;
    }

    if (!event.shiftKey) setSelection([]);
    gestureRef.current = { kind: "marquee", startScreen: local };
    setMarquee({ x1: local.x, y1: local.y, x2: local.x, y2: local.y });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const host = canvasRef.current;
    if (!host) return;
    const local = localPoint(event);
    const world = pointToWorld(local);
    setCursorWorld(world);
    const gesture = gestureRef.current;

    if (!gesture) {
      if (scene) setHoverId(rendererRef.current?.hitTest(world, scene)?.id ?? null);
      return;
    }

    if (gesture.kind === "pan") {
      setCamera((current) => panBy(current, local.x - gesture.lastX, local.y - gesture.lastY));
      gesture.lastX = local.x;
      gesture.lastY = local.y;
      return;
    }

    if (gesture.kind === "marquee") {
      setMarquee({ x1: gesture.startScreen.x, y1: gesture.startScreen.y, x2: local.x, y2: local.y });
      return;
    }

    if (gesture.kind === "move") {
      const dx = world.x - gesture.startWorld.x;
      const dy = world.y - gesture.startWorld.y;
      if (!gesture.moved && Math.hypot(dx, dy) * cameraRef.current.zoom < 2) return;
      gesture.moved = true;
      const next: Record<string, TransformPatch> = {};
      const guideX: number[] = [];
      const guideY: number[] = [];
      for (const [id, origin] of gesture.origins) {
        let x = origin.x + dx;
        let y = origin.y + dy;
        if (snapGrid) {
          const snappedX = snapValue(x, snapGrid);
          const snappedY = snapValue(y, snapGrid);
          if (Math.abs(snappedX - x) * cameraRef.current.zoom <= 6) {
            x = snappedX;
            guideX.push(x);
          }
          if (Math.abs(snappedY - y) * cameraRef.current.zoom <= 6) {
            y = snappedY;
            guideY.push(y);
          }
        }
        next[id] = { x, y };
      }
      gesture.preview = next;
      setPreview(next);
      setGuides({ x: guideX, y: guideY });
      return;
    }

    if (gesture.kind === "scale") {
      const object = sceneRef.current?.objects.find((candidate) => candidate.id === gesture.objectId);
      if (!object) return;
      let px = world.x;
      let py = world.y;
      if (snapGrid) {
        px = snapValue(px, snapGrid);
        py = snapValue(py, snapGrid);
      }
      const newW = Math.max(4, Math.abs(px - gesture.fixed.x));
      const newH = Math.max(4, Math.abs(py - gesture.fixed.y));
      let scaleX = newW / gesture.dims.w;
      let scaleY = newH / gesture.dims.h;
      if (event.shiftKey) {
        const uniform = Math.max(scaleX, scaleY);
        scaleX = uniform;
        scaleY = uniform;
      }
      const x = gesture.fixed.x + ((px - gesture.fixed.x) / Math.abs(px - gesture.fixed.x || 1)) * (newW / 2);
      const y = gesture.fixed.y + ((py - gesture.fixed.y) / Math.abs(py - gesture.fixed.y || 1)) * (newH / 2);
      gesture.preview = { [gesture.objectId]: { x, y, scaleX, scaleY } };
      setPreview({ ...gesture.preview });
      return;
    }

    if (gesture.kind === "rotate") {
      const angle = Math.atan2(world.y - gesture.center.y, world.x - gesture.center.x);
      let rotation = gesture.startRotation + ((angle - gesture.startAngle) * 180) / Math.PI;
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      gesture.preview = { [gesture.objectId]: { rotation } };
      setPreview({ ...gesture.preview });
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const host = canvasRef.current;
    if (host?.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    if (host) host.style.cursor = spaceRef.current ? "grab" : "";
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || !scene) return;

    if (gesture.kind === "marquee") {
      const start = pointToWorld(gesture.startScreen);
      const end = pointToWorld(localPoint(event));
      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      const top = Math.min(start.y, end.y);
      const bottom = Math.max(start.y, end.y);
      const renderer = rendererRef.current;
      if (renderer && (right - left > 2 || bottom - top > 2)) {
        const ids = scene.objects
          .filter((object) => {
            const bounds = renderer.getBounds(object.id);
            return bounds && bounds.right >= left && bounds.left <= right && bounds.bottom >= top && bounds.top <= bottom;
          })
          .map((object) => object.id);
        if (ids.length > 0) setSelection(ids);
      }
      setMarquee(null);
      return;
    }

    if (gesture.kind === "move") {
      if (gesture.moved) {
        const transforms = Object.keys(gesture.preview).map((id) => ({ objectId: id, transform: gesture.preview[id] }));
        if (transforms.length > 0) {
          const result = dispatch("objects.applyTransforms", { sceneId: scene.id, transforms });
          if (!result.ok) toast.push("Move rejected", result.error);
        }
      }
      setPreview({});
      setGuides({ x: [], y: [] });
      return;
    }

    if (gesture.kind === "scale" || gesture.kind === "rotate") {
      const transforms = Object.keys(gesture.preview).map((id) => ({ objectId: id, transform: gesture.preview[id] }));
      if (transforms.length > 0) {
        const result = dispatch("objects.applyTransforms", { sceneId: scene.id, transforms });
        if (!result.ok) toast.push("Transform rejected", result.error);
      }
      setPreview({});
      setGuides({ x: [], y: [] });
    }
  }

  function onDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!scene) return;
    const local = localPoint(event);
    const world = pointToWorld(local);
    const hit = rendererRef.current?.hitTest(world, scene);
    if (!hit) return;
    const children = scene.objects.filter((object) => object.parentId === hit.id);
    if (children.length > 0) {
      const child = children.find((candidate) => {
        const bounds = rendererRef.current?.getBounds(candidate.id);
        return bounds && world.x >= bounds.left && world.x <= bounds.right && world.y >= bounds.top && world.y <= bounds.bottom;
      });
      setSelection([(child ?? children[0]!).id]);
      return;
    }
    if (hit.parentId) {
      setSelection([hit.parentId]);
      return;
    }
    setSelection([hit.id]);
  }

  function onContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!scene) return;
    const local = localPoint(event);
    const world = pointToWorld(local);
    const hit = rendererRef.current?.hitTest(world, scene);
    if (hit && !selection.includes(hit.id)) setSelection([hit.id]);
    setMenu({ x: local.x, y: local.y, objectId: hit?.id ?? null });
  }

  function contextAction(action: "duplicate" | "delete" | "forward" | "backward" | "ask") {
    if (!scene) return;
    const objectId = menu?.objectId;
    setMenu(null);
    if (!objectId) return;
    if (action === "duplicate") {
      const result = dispatch("object.duplicate", { sceneId: scene.id, objectId });
      if (!result.ok) toast.push("Duplicate failed", result.error);
    } else if (action === "delete") {
      const object = scene.objects.find((candidate) => candidate.id === objectId);
      if (!window.confirm(`Delete “${object?.name ?? "object"}”?`)) return;
      const result = dispatch("object.delete", { sceneId: scene.id, objectId });
      if (result.ok) setSelection([]);
      else toast.push("Delete failed", result.error);
    } else if (action === "forward" || action === "backward") {
      const object = scene.objects.find((candidate) => candidate.id === objectId);
      if (!object) return;
      const siblings = scene.objects.filter((candidate) => candidate.layerId === object.layerId);
      const index = siblings.indexOf(object);
      const toIndex = action === "forward" ? index + 1 : Math.max(0, index - 1);
      const result = dispatch("object.reorder", { sceneId: scene.id, objectId, toIndex });
      if (!result.ok) toast.push("Reorder failed", result.error);
    } else {
      toast.push("Ask agent", "The live agent arrives in Slice 6.");
    }
  }

  const debug = new URLSearchParams(window.location.search).get("debug") === "1";
  const zoomLabel = `${Math.round(camera.zoom * 100)}%`;

  const rulerStep = useMemo(() => {
    const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    return steps.find((step) => step * camera.zoom >= 70) ?? 10000;
  }, [camera.zoom]);

  const rulerTicks = useMemo(() => {
    if (!scene) return [];
    const left = camera.x - viewport.width / 2 / camera.zoom;
    const right = camera.x + viewport.width / 2 / camera.zoom;
    const ticks: Array<{ world: number; screen: number; major: boolean }> = [];
    const start = Math.floor(left / rulerStep) * rulerStep;
    for (let world = start; world <= right; world += rulerStep) {
      const screen = (world - camera.x) * camera.zoom + viewport.width / 2;
      ticks.push({ world, screen, major: world % (rulerStep * 5) === 0 || world === 0 });
    }
    return ticks;
  }, [scene, camera, viewport.width, rulerStep]);

  const rulerTicksY = useMemo(() => {
    if (!scene) return [];
    const top = camera.y - viewport.height / 2 / camera.zoom;
    const bottom = camera.y + viewport.height / 2 / camera.zoom;
    const ticks: Array<{ world: number; screen: number; major: boolean }> = [];
    const start = Math.floor(top / rulerStep) * rulerStep;
    for (let world = start; world <= bottom; world += rulerStep) {
      const screen = (world - camera.y) * camera.zoom + viewport.height / 2;
      ticks.push({ world, screen, major: world % (rulerStep * 5) === 0 || world === 0 });
    }
    return ticks;
  }, [scene, camera, viewport.height, rulerStep]);

  if (!document || !scene) {
    return (
      <div className="workspace-placeholder">
        <h2>No scene</h2>
        <p>Open a scene to see it here.</p>
      </div>
    );
  }

  return (
    <div className="viewport">
      <div className="viewport-toolstrip">
        <div className="zoom-cluster" aria-label="Zoom controls">
          <button className="icon-button" aria-label="Fit scene" title="Fit scene (0)" onClick={() => setCamera(fitCamera(viewport, scene.size))}>
            ⌂
          </button>
          <span className="zoom-value">{zoomLabel}</span>
          <button className="icon-button" aria-label="Reset zoom" title="100% (1)" onClick={() => setCamera((current) => ({ ...current, zoom: 1 }))}>
            1:1
          </button>
        </div>
        <span className="viewport-coords input-mono">
          {cursorWorld ? `${Math.round(cursorWorld.x)}, ${Math.round(cursorWorld.y)}` : "—"}
        </span>
        {snapGrid > 0 && <span className="chip">Snap {snapGrid}</span>}
        {readOnly && <span className="chip archived">Read-only</span>}
      </div>

      <div className="viewport-stage">
        <div className="ruler-corner" />
        <div className="ruler-h" aria-hidden="true">
          {rulerTicks.map((tick) => (
            <span key={tick.world} className={`ruler-h-tick${tick.major ? " major" : ""}`} style={{ left: tick.screen }}>
              {tick.major && <span className="ruler-h-label">{Math.round(tick.world)}</span>}
            </span>
          ))}
          {cursorWorld && (
            <span
              className="ruler-cursor"
              style={{ left: (cursorWorld.x - camera.x) * camera.zoom + viewport.width / 2 }}
            />
          )}
        </div>
        <div className="ruler-v" aria-hidden="true">
          {rulerTicksY.map((tick) => (
            <span key={tick.world} className={`ruler-v-tick${tick.major ? " major" : ""}`} style={{ top: tick.screen }}>
              {tick.major && <span className="ruler-v-label">{Math.round(tick.world)}</span>}
            </span>
          ))}
        </div>
        <div
          ref={canvasRef}
          className="viewport-canvas"
          data-viewport-canvas
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHoverId(null)}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
        />

        {menu && (
          <div className="canvas-menu" style={{ left: menu.x + 8, top: menu.y + 8 }} role="menu">
            <button role="menuitem" onClick={() => contextAction("duplicate")} disabled={!menu.objectId}>
              <Copy size={12} /> Duplicate
            </button>
            <button role="menuitem" onClick={() => contextAction("forward")} disabled={!menu.objectId}>
              <CornerDownRight size={12} /> Bring forward
            </button>
            <button role="menuitem" onClick={() => contextAction("backward")} disabled={!menu.objectId}>
              <CornerDownRight size={12} style={{ transform: "scaleY(-1)" }} /> Send backward
            </button>
            <button role="menuitem" onClick={() => contextAction("ask")} disabled={!menu.objectId}>
              <Sparkles size={12} /> Ask agent about selection
            </button>
            <div className="canvas-menu-sep" />
            <button role="menuitem" className="danger" onClick={() => contextAction("delete")} disabled={!menu.objectId}>
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}

        {debug && (
          <div className="viewport-debug" aria-label="Renderer diagnostics">
            <span>FPS {fps}</span>
            <span>Objects {scene.objects.length}</span>
            <span>Layers {scene.layers.length}</span>
            <span>Cam {Math.round(camera.x)}, {Math.round(camera.y)} · {zoomLabel}</span>
            <span>Sel {selection.length}</span>
            <span className="muted">r{document.revision}</span>
          </div>
        )}
      </div>

      <div className="viewport-hint">
        <span>
          {readOnly
            ? "Archived project · read-only"
            : "Drag to move · handles to scale · wheel to zoom · Space/⌘ drag to pan · right-click for actions"}
        </span>
        <span className="right">
          {scene.size.w} × {scene.size.h}
        </span>
      </div>
    </div>
  );
}

function drawOverlay(
  overlay: Graphics,
  scene: Scene,
  camera: CameraState,
  viewport: ViewportSize,
  selection: string[],
  hoverId: string | null,
  marquee: { x1: number; y1: number; x2: number; y2: number } | null,
  guides: { x: number[]; y: number[] },
): void {
  overlay.clear();
  const screen = (x: number, y: number) => worldToScreen(camera, viewport, { x, y });
  const topLeft = screen(0, 0);
  const bottomRight = screen(scene.size.w, scene.size.h);
  overlay.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y).stroke({ width: 1, color: 0xff856f, alpha: 0.5 });

  const objects = scene.objects;
  if (hoverId && !selection.includes(hoverId)) {
    const object = objects.find((candidate) => candidate.id === hoverId);
    if (object) drawOutline(overlay, object, camera, viewport, 0xffffff, 0.5, 1);
  }

  for (const id of selection) {
    const object = objects.find((candidate) => candidate.id === id);
    if (!object) continue;
    drawOutline(overlay, object, camera, viewport, 0xff856f, 1, 1.5);
  }

  // Handles and rotation ring for a single selection.
  if (selection.length === 1) {
    const object = objects.find((candidate) => candidate.id === selection[0]);
    if (object) {
      const halfW = (objectDims(object).w * object.transform.scaleX) / 2;
      const halfH = (objectDims(object).h * object.transform.scaleY) / 2;
      const cx = object.transform.x;
      const cy = object.transform.y;
      const tl = screen(cx - halfW, cy - halfH);
      const br = screen(cx + halfW, cy + halfH);
      const rect = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
      const points = {
        nw: { x: rect.x, y: rect.y },
        n: { x: rect.x + rect.w / 2, y: rect.y },
        ne: { x: rect.x + rect.w, y: rect.y },
        e: { x: rect.x + rect.w, y: rect.y + rect.h / 2 },
        se: { x: rect.x + rect.w, y: rect.y + rect.h },
        s: { x: rect.x + rect.w / 2, y: rect.y + rect.h },
        sw: { x: rect.x, y: rect.y + rect.h },
        w: { x: rect.x, y: rect.y + rect.h / 2 },
      };
      for (const point of Object.values(points)) {
        overlay.rect(point.x - HANDLE_SIZE / 2, point.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE).fill({ color: 0xf1f0ed }).stroke({ width: 1, color: 0xff856f });
      }
      const rotatePoint = { x: rect.x + rect.w / 2, y: rect.y - ROTATE_OFFSET };
      overlay.moveTo(rotatePoint.x, rect.y).lineTo(rotatePoint.x, rotatePoint.y + 4).stroke({ width: 1, color: 0xff856f, alpha: 0.8 });
      overlay.circle(rotatePoint.x, rotatePoint.y, 5).fill({ color: 0x0b0d12 }).stroke({ width: 1.5, color: 0xff856f });
    }
  }

  if (marquee) {
    const x = Math.min(marquee.x1, marquee.x2);
    const y = Math.min(marquee.y1, marquee.y2);
    const w = Math.abs(marquee.x2 - marquee.x1);
    const h = Math.abs(marquee.y2 - marquee.y1);
    overlay.rect(x, y, w, h).fill({ color: 0xa9b4ff, alpha: 0.08 }).stroke({ width: 1, color: 0xa9b4ff, alpha: 0.9 });
  }

  for (const gx of guides.x) {
    const point = screen(gx, 0);
    overlay.moveTo(point.x, 0).lineTo(point.x, viewport.height).stroke({ width: 1, color: 0xf4c56a, alpha: 0.8 });
  }
  for (const gy of guides.y) {
    const point = screen(0, gy);
    overlay.moveTo(0, point.y).lineTo(viewport.width, point.y).stroke({ width: 1, color: 0xf4c56a, alpha: 0.8 });
  }

  void scene;
}

function drawOutline(
  overlay: Graphics,
  object: GameObject,
  camera: CameraState,
  viewport: ViewportSize,
  color: number,
  alpha: number,
  width: number,
): void {
  const dims = objectDims(object);
  const halfW = (dims.w * object.transform.scaleX) / 2;
  const halfH = (dims.h * object.transform.scaleY) / 2;
  const tl = worldToScreen(camera, viewport, { x: object.transform.x - halfW, y: object.transform.y - halfH });
  const br = worldToScreen(camera, viewport, { x: object.transform.x + halfW, y: object.transform.y + halfH });
  overlay
    .rect(tl.x, tl.y, Math.max(1, br.x - tl.x), Math.max(1, br.y - tl.y))
    .stroke({ width, color, alpha });
}

