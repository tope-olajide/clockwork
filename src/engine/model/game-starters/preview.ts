import type { GameObject, ProjectDocument, ShapePrimitive, Visual } from "../schema";

const W = 320;
const H = 180;

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function primitive(shape: ShapePrimitive, width: number, height: number, scaleX: number, scaleY: number): string {
  const x = (shape.x + width / 2) * scaleX;
  const y = (shape.y + height / 2) * scaleY;
  const w = shape.width * scaleX;
  const h = shape.height * scaleY;
  const fill = escape(shape.color);
  const stroke = shape.stroke ? ` stroke="${escape(shape.stroke)}" stroke-width="${Math.max(0.5, shape.strokeWidth * scaleX)}"` : "";
  const rotate = shape.rotation ? ` transform="rotate(${shape.rotation} ${x} ${y})"` : "";
  if (shape.kind === "circle") {
    return `<ellipse cx="${x}" cy="${y}" rx="${w / 2}" ry="${h / 2}" fill="${fill}"${stroke}${rotate}/>`;
  }
  if (shape.kind === "line") {
    return `<line x1="${x - w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y}" stroke="${escape(shape.stroke ?? shape.color)}" stroke-width="${Math.max(0.5, (shape.strokeWidth || shape.height) * scaleY)}"${rotate}/>`;
  }
  if (shape.kind === "triangle") {
    const points = `${x},${y - h / 2} ${x + w / 2},${y + h / 2} ${x - w / 2},${y + h / 2}`;
    return `<polygon points="${points}" fill="${fill}"${stroke}${rotate}/>`;
  }
  if (shape.kind === "polygon" && shape.points) {
    const points = shape.points.map((point) => `${x + (point.x * w) / 2},${y + (point.y * h) / 2}`).join(" ");
    return `<polygon points="${points}" fill="${fill}"${stroke}${rotate}/>`;
  }
  return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" fill="${fill}"${stroke}${rotate}/>`;
}

function objectSvg(object: GameObject, sceneWidth: number, sceneHeight: number): string {
  const scaleX = W / sceneWidth;
  const scaleY = H / sceneHeight;
  const visual: Visual | undefined = object.visual;
  if (!visual) return "";
  if (visual.kind === "shape") {
    return visual.shapes
      .map((shape) => primitive(shape, visual.width, visual.height, scaleX, scaleY))
      .join("");
  }
  if (visual.kind === "rect") {
    return `<rect x="${(object.transform.x - visual.width / 2) * scaleX}" y="${(object.transform.y - visual.height / 2) * scaleY}" width="${visual.width * scaleX}" height="${visual.height * scaleY}" fill="${escape(visual.color)}"/>`;
  }
  if (visual.kind === "sprite" || visual.kind === "tilemap") return "";
  return "";
}

/** Builds a picker thumbnail from the same primitives the runtime draws. */
export function previewDataUrl(document: ProjectDocument): string {
  const scene = document.scenes.find((candidate) => candidate.id === document.startSceneId) ?? document.scenes[0];
  if (!scene) return "";
  const order = new Map(scene.layers.map((layer) => [layer.id, layer.order]));
  const objects = [...scene.objects].sort((a, b) => (order.get(a.layerId) ?? 0) - (order.get(b.layerId) ?? 0));
  const art = objects
    .filter((object) => !object.tags.includes("ui") && !object.tags.includes("director"))
    .map((object) => objectSvg(object, scene.size.w, scene.size.h))
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${escape(scene.background.color)}"/>${art}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
