import { readAssetBlob } from "../persistence/indexeddb";

let context: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return null;
    context = new Constructor();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

export async function unlockAudio(): Promise<void> {
  audioContext();
}

export async function playAssetSound(assetId: string, volume = 0.8): Promise<void> {
  const ctx = audioContext();
  if (!ctx) return;
  let buffer = buffers.get(assetId);
  if (!buffer) {
    const blob = await readAssetBlob(assetId);
    if (!blob) return;
    try {
      buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      buffers.set(assetId, buffer);
    } catch {
      return;
    }
  }
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume));
  source.buffer = buffer;
  source.connect(gain).connect(ctx.destination);
  source.start();
}

export function clearAudioCache(): void {
  buffers.clear();
}
