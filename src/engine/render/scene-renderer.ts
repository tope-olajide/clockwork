import { Application, Container, Graphics, Sprite, Text, Texture, type ColorSource } from "pixi.js";
import type { GameObject, Layer, ProjectDocument, Scene } from "../model/schema";
import type { CameraState } from "./camera";

export interface ObjectBounds {
  id: string;
  /** Left/top/right/bottom in world units (axis aligned). */
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotation: number;
}

interface ObjectNode {
  root: Container;
  body: Container;
  kind: GameObject["visual"] extends undefined ? "rect" : string;
  signature: string;
  bounds: ObjectBounds;
}

interface LayerNode {
  root: Container;
  graphics: Graphics;
  key: string;
}

function colorToNumber(color: string): number {
  const hex = color.trim().replace("#", "");
  if (hex.length === 3) {
    return Number.parseInt(hex.split("").map((char) => char + char).join(""), 16);
  }
  const parsed = Number.parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed : 0xffffff;
}

export function objectDims(object: GameObject): { w: number; h: number } {
  if (object.body) return { w: object.body.width, h: object.body.height };
  if (object.visual?.kind === "rect") return { w: object.visual.width, h: object.visual.height };
  if (object.visual?.kind === "sprite") return { w: object.visual.width ?? 32, h: object.visual.height ?? 32 };
  if (object.visual?.kind === "tilemap") {
    return { w: object.visual.cols * object.visual.tileSize, h: object.visual.rows * object.visual.tileSize };
  }
  if (object.visual?.kind === "text") {
    const longest = object.visual.text.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
    return {
      w: Math.max(40, longest * object.visual.style.size * 0.58),
      h: Math.max(object.visual.style.size, object.visual.text.split("\n").length * object.visual.style.size * 1.3),
    };
  }
  return { w: 24, h: 24 };
}

function boundsOf(object: GameObject): ObjectBounds {
  const { w, h } = objectDims(object);
  const originX = object.transform.originX ?? 0.5;
  const originY = object.transform.originY ?? 0.5;
  const width = Math.abs(w * (object.transform.scaleX || 1));
  const height = Math.abs(h * (object.transform.scaleY || 1));
  const centerX = object.transform.x;
  const centerY = object.transform.y;
  const left = centerX - width * originX;
  const top = centerY - height * originY;
  return { id: object.id, left, top, right: left + width, bottom: top + height, centerX, centerY, width, height, rotation: object.transform.rotation };
}

function signatureOf(object: GameObject): string {
  const visual = object.visual;
  return JSON.stringify({
    n: object.name,
    v: visual,
    d: objectDims(object),
    t: [object.transform.rotation, object.transform.scaleX, object.transform.scaleY, object.transform.originX, object.transform.originY],
    b: object.body ? [object.body.type] : null,
  });
}

function makeRect(width: number, height: number, color: string, alpha = 1): Sprite {
  const sprite = new Sprite(Texture.WHITE);
  sprite.width = width;
  sprite.height = height;
  sprite.tint = color;
  sprite.alpha = alpha;
  return sprite;
}

function makeObjectVisual(object: GameObject): Container {
  const visual = object.visual;
  if (visual?.kind === "text") {
    const text = new Text({
      text: visual.text,
      style: {
        fill: visual.style.color,
        fontSize: visual.style.size,
        fontFamily: visual.style.font === "mono" ? "JetBrains Mono, monospace" : "Inter, sans-serif",
        align: visual.style.align,
      },
    });
    text.anchor.set(0.5, 0.5);
    return text;
  }

  const { w, h } = objectDims(object);
  if (visual?.kind === "rect") {
    const body = new Container();
    if (visual.stroke) {
      body.addChild(makeRect(visual.width, visual.height, visual.stroke));
      const inner = makeRect(Math.max(0, visual.width - 2), Math.max(0, visual.height - 2), visual.color);
      inner.position.set(1, 1);
      body.addChild(inner);
    } else {
      body.addChild(makeRect(visual.width, visual.height, visual.color));
    }
    return body;
  }
  if (visual?.kind === "sprite") {
    // Textures arrive with the asset pipeline (Slice 3). Draw a placeholder block tinted by the sprite.
    const body = new Container();
    body.addChild(makeRect(w, h, visual.tint ?? "#a9b4ff", 0.9));
    body.addChild(makeRect(w, h, "#0b0d12", 0.12));
    return body;
  }

  const graphics = new Graphics();
  if (visual?.kind === "tilemap") {
    const { tileSize, cols, rows, data } = visual;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const tile = data[row * cols + col] ?? 0;
        if (tile <= 0) continue;
        graphics.rect(col * tileSize, row * tileSize, tileSize, tileSize).fill({ color: 0x39466a, alpha: 0.9 });
        graphics.rect(col * tileSize, row * tileSize, tileSize, tileSize).stroke({ width: 1, color: 0x1a2238, alpha: 0.8 });
      }
    }
    if (cols === 0 || rows === 0) graphics.rect(0, 0, w, h).fill({ color: 0x39466a });
  } else {
    graphics.rect(0, 0, w, h).fill({ color: 0x8a94ad });
  }
  return graphics;
}

function applyObjectTransform(node: ObjectNode, object: GameObject): void {
  const { w, h } = objectDims(object);
  node.root.position.set(object.transform.x, object.transform.y);
  node.root.rotation = (object.transform.rotation * Math.PI) / 180;
  node.root.scale.set(object.transform.scaleX, object.transform.scaleY);
  node.root.pivot.set(w * (object.transform.originX ?? 0.5), h * (object.transform.originY ?? 0.5));
  node.bounds = boundsOf(object);
}

/**
 * Reconciles the editor document into Pixi display objects. The renderer keeps
 * a container per layer (for opacity/parallax) and one per object (keyed by id),
 * so revisions only rebuild the display objects that actually changed.
 */
export class SceneRenderer {
  readonly root = new Container();
  private layerNodes = new Map<string, LayerNode>();
  private objectNodes = new Map<string, ObjectNode>();
  private background = new Graphics();
  private backgroundKey = "";
  private sceneKey = "";

  constructor() {
    this.root.sortableChildren = true;
    this.root.addChild(this.background);
  }

  attach(app: Application): void {
    app.stage.addChild(this.root);
  }

  private layerContainer(layer: Layer, index: number): LayerNode {
    const existing = this.layerNodes.get(layer.id);
    if (existing) {
      existing.root.zIndex = layer.order;
      return existing;
    }
    const root = new Container();
    const graphics = new Graphics();
    root.addChild(graphics);
    root.zIndex = layer.order;
    root.label = `layer:${layer.name}:${index}`;
    this.root.addChild(root);
    const node: LayerNode = { root, graphics, key: "" };
    this.layerNodes.set(layer.id, node);
    return node;
  }

  render(scene: Scene, document: ProjectDocument): void {
    const backgroundKey = `${scene.id}:${scene.size.w}x${scene.size.h}:${scene.background.color}`;
    if (backgroundKey !== this.backgroundKey) {
      this.backgroundKey = backgroundKey;
      this.background.clear();
      this.background.rect(0, 0, scene.size.w, scene.size.h).fill({ color: colorToNumber(scene.background.color) });
      this.background.zIndex = -1;
    }

    const sceneKey = scene.id;
    if (sceneKey !== this.sceneKey) {
      this.sceneKey = sceneKey;
      for (const node of this.objectNodes.values()) node.root.destroy({ children: true });
      this.objectNodes.clear();
      for (const node of this.layerNodes.values()) node.root.destroy({ children: true });
      this.layerNodes.clear();
      this.root.addChild(this.background);
    }

    const layerOrder = [...scene.layers].sort((a, b) => a.order - b.order);
    const liveLayers = new Set(layerOrder.map((layer) => layer.id));
    for (const [id, node] of this.layerNodes) {
      if (!liveLayers.has(id)) {
        node.root.destroy({ children: true });
        this.layerNodes.delete(id);
      }
    }
    const liveObjects = new Set(scene.objects.map((object) => object.id));
    for (const [id, node] of this.objectNodes) {
      if (!liveObjects.has(id)) {
        node.root.destroy({ children: true });
        this.objectNodes.delete(id);
      }
    }

    layerOrder.forEach((layer) => {
      const node = this.layerContainer(layer, layerOrder.indexOf(layer));
      node.root.visible = layer.visible;
      node.root.alpha = layer.opacity;
      // Parallax and world frame are applied by the stage via these fields.
      node.root.label = `layer:${layer.name}`;
      (node.root as unknown as { parallax?: { x: number; y: number } }).parallax = layer.parallax;
    });

    let z = 0;
    for (const layer of layerOrder) {
      const layerNode = this.layerNodes.get(layer.id);
      if (!layerNode) continue;
      for (const object of scene.objects) {
        if (object.layerId !== layer.id) continue;
        let node = this.objectNodes.get(object.id);
        const signature = signatureOf(object);
        if (!node) {
          const root = new Container();
          const body = makeObjectVisual(object);
          root.addChild(body as Container);
          layerNode.root.addChild(root);
          node = { root, body, kind: object.visual?.kind ?? "empty", signature, bounds: boundsOf(object) };
          this.objectNodes.set(object.id, node);
        } else if (node.signature !== signature) {
          node.root.removeChildren().forEach((child) => child.destroy({ children: true }));
          const body = makeObjectVisual(object);
          node.root.addChild(body as Container);
          node.body = body;
          node.signature = signature;
          node.kind = object.visual?.kind ?? "empty";
        }
        if (node.root.parent !== layerNode.root) layerNode.root.addChild(node.root);
        node.root.zIndex = z;
        applyObjectTransform(node, object);
        z += 1;
      }
    }

    void document;
  }

  /** Apply parallax offsets for a camera so layers move at their configured factors. */
  applyCamera(scene: Scene, camera: CameraState): void {
    const centerX = scene.size.w / 2;
    const centerY = scene.size.h / 2;
    for (const layer of scene.layers) {
      const node = this.layerNodes.get(layer.id);
      if (!node) continue;
      const factorX = layer.id === scene.layers[0]?.id ? 1 : layer.parallax.x;
      const factorY = layer.id === scene.layers[0]?.id ? 1 : layer.parallax.y;
      const dx = (camera.x - centerX) * (1 - factorX);
      const dy = (camera.y - centerY) * (1 - factorY);
      node.root.position.set(dx, dy);
    }
  }

  /** Apply transient gesture transforms without touching the document. */
  previewTransforms(
    preview: Record<string, Partial<{ x: number; y: number; rotation: number; scaleX: number; scaleY: number }>>,
    scene: Scene,
  ): void {
    for (const object of scene.objects) {
      const patch = preview[object.id];
      const node = this.objectNodes.get(object.id);
      if (!patch || !node) continue;
      const { w, h } = objectDims(object);
      const x = patch.x ?? object.transform.x;
      const y = patch.y ?? object.transform.y;
      const rotation = patch.rotation ?? object.transform.rotation;
      const scaleX = patch.scaleX ?? object.transform.scaleX;
      const scaleY = patch.scaleY ?? object.transform.scaleY;
      node.root.position.set(x, y);
      node.root.rotation = (rotation * Math.PI) / 180;
      node.root.scale.set(scaleX, scaleY);
      node.root.pivot.set(w * (object.transform.originX ?? 0.5), h * (object.transform.originY ?? 0.5));
    }
  }

  getBounds(id: string): ObjectBounds | null {
    return this.objectNodes.get(id)?.bounds ?? null;
  }

  hitTest(world: { x: number; y: number }, scene: Scene): GameObject | null {
    const layers = [...scene.layers].sort((a, b) => a.order - b.order);
    const candidates: GameObject[] = [];
    for (const layer of layers) {
      if (!layer.visible || layer.locked) continue;
      for (const object of scene.objects) {
        if (object.layerId === layer.id) candidates.push(object);
      }
    }
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const object = candidates[index];
      if (!object) continue;
      const bounds = this.objectNodes.get(object.id)?.bounds;
      if (!bounds) continue;
      if (
        world.x >= bounds.left &&
        world.x <= bounds.right &&
        world.y >= bounds.top &&
        world.y <= bounds.bottom
      ) {
        return object;
      }
    }
    return null;
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.layerNodes.clear();
    this.objectNodes.clear();
  }
}

export type { ColorSource };
