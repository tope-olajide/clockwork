export type ViewportCapture = () => string | null;

let capture: ViewportCapture | null = null;

export function registerViewportCapture(fn: ViewportCapture | null): void {
  capture = fn;
}

export function captureViewportImage(): string | null {
  return capture?.() ?? null;
}

/** Downscale the current viewport to a 640×360 cover for project cards. */
export async function captureViewportCover(): Promise<string | null> {
  const source = capture?.() ?? null;
  if (!source) return null;
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#0b0c0f";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}
