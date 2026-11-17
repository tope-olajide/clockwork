import { readAssetBlob } from "../persistence/indexeddb";

let context: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const urlCache = new Map<string, string>();
let musicElement: HTMLAudioElement | null = null;
let musicAssetId: string | null = null;
let musicGain = 1;
let musicBase = 1;

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
  if (musicElement) {
    try {
      await musicElement.play();
    } catch {
      // browser may still block until user interaction
    }
  }
}

async function assetUrl(assetId: string): Promise<string | null> {
  const cached = urlCache.get(assetId);
  if (cached) return cached;
  const blob = await readAssetBlob(assetId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(assetId, url);
  return url;
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

export async function playSceneMusic(assetId: string | undefined, volume = 0.6, loop = true): Promise<void> {
  if (typeof window === "undefined") return;
  musicGain = Math.max(0, Math.min(1, volume));
  if (!assetId) {
    stopSceneMusic();
    return;
  }
  if (musicAssetId === assetId && musicElement) {
    musicBase = 1;
    musicElement.loop = loop;
    musicElement.volume = musicGain;
    if (musicElement.paused) {
      try {
        await musicElement.play();
      } catch {
        // ignored
      }
    }
    return;
  }
  stopSceneMusic();
  const url = await assetUrl(assetId);
  if (!url) return;
  musicElement = new Audio(url);
  musicElement.loop = loop;
  musicElement.volume = musicGain;
  musicAssetId = assetId;
  musicBase = 1;
  try {
    await musicElement.play();
  } catch {
    // unlocked later
  }
}

export function setSceneMusicVolume(volume: number): void {
  musicGain = Math.max(0, Math.min(1, volume));
  if (musicElement) musicElement.volume = musicGain * musicBase;
}

export function stopSceneMusic(): void {
  if (musicElement) {
    musicElement.pause();
    musicElement.src = "";
  }
  musicElement = null;
  musicAssetId = null;
}

export function clearAudioCache(): void {
  buffers.clear();
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
  stopSceneMusic();
}
