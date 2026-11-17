export interface CameraState {
  /** World coordinate shown at the centre of the viewport. */
  x: number;
  y: number;
  zoom: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function clampCamera(camera: CameraState): CameraState {
  return { x: camera.x, y: camera.y, zoom: clampZoom(camera.zoom) };
}

export function worldToScreen(camera: CameraState, viewport: ViewportSize, point: { x: number; y: number }) {
  return {
    x: (point.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (point.y - camera.y) * camera.zoom + viewport.height / 2,
  };
}

export function screenToWorld(camera: CameraState, viewport: ViewportSize, point: { x: number; y: number }) {
  return {
    x: (point.x - viewport.width / 2) / camera.zoom + camera.x,
    y: (point.y - viewport.height / 2) / camera.zoom + camera.y,
  };
}

/** Zoom keeping the world point under the cursor fixed on screen. */
export function zoomAt(
  camera: CameraState,
  viewport: ViewportSize,
  screenPoint: { x: number; y: number },
  nextZoom: number,
): CameraState {
  const zoom = clampZoom(nextZoom);
  const before = screenToWorld(camera, viewport, screenPoint);
  const x = before.x - (screenPoint.x - viewport.width / 2) / zoom;
  const y = before.y - (screenPoint.y - viewport.height / 2) / zoom;
  return { x, y, zoom };
}

/** Fit a world rect inside the viewport with a small margin. */
export function fitCamera(
  viewport: ViewportSize,
  world: { w: number; h: number },
  margin = 0.94,
): CameraState {
  if (viewport.width <= 0 || viewport.height <= 0 || world.w <= 0 || world.h <= 0) {
    return { x: world.w / 2, y: world.h / 2, zoom: 1 };
  }
  const zoom = clampZoom(Math.min(viewport.width / world.w, viewport.height / world.h) * margin);
  return { x: world.w / 2, y: world.h / 2, zoom };
}

export function panBy(camera: CameraState, dxScreen: number, dyScreen: number): CameraState {
  return { x: camera.x - dxScreen / camera.zoom, y: camera.y - dyScreen / camera.zoom, zoom: camera.zoom };
}
