export type ViewportCapture = () => string | null;

let capture: ViewportCapture | null = null;

export function registerViewportCapture(fn: ViewportCapture | null): void {
  capture = fn;
}

export function captureViewportImage(): string | null {
  return capture?.() ?? null;
}
