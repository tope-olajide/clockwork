import { FIXED_DT, Runtime, type RuntimeEvent } from "./runtime";
import { emptyInput, type InputFrame, type LogicalAction } from "./input";
import type { ProjectDocument } from "../model/schema";

export interface PlaytestInput {
  atMs: number;
  action: LogicalAction;
  phase: "press" | "release";
}

export interface PlaytestOptions {
  sceneId?: string;
  seed?: number;
  durationMs?: number;
  inputs?: PlaytestInput[];
}

export interface PlaytestResult {
  passed: boolean;
  sceneId: string;
  seed: number;
  frames: number;
  elapsedMs: number;
  status: "won" | "stopped" | "timeout";
  variables: Record<string, unknown>;
  events: Array<{ frame: number; type: string; message: string; objectId?: string }>;
  lastError: string | null;
  error?: { sceneName: string; objectName: string; message: string };
  headless: true;
  note: string;
}

const MAX_DURATION_MS = 15000;

function inputAt(frame: number, events: PlaytestInput[], state: { jump: boolean; action: boolean }, frameStates: Array<{ jumpPressed: boolean; jumpReleased: boolean; actionPressed: boolean; actionReleased: boolean }>): InputFrame {
  const base = emptyInput();
  const edges = frameStates[frame];
  if (edges) {
    base.jumpPressed = edges.jumpPressed;
    base.jumpReleased = edges.jumpReleased;
    base.actionPressed = edges.actionPressed;
    base.actionReleased = edges.actionReleased;
  }
  const held = state;
  base.jump = held.jump;
  base.action = held.action;
  for (const event of events) {
    if (Math.floor((event.atMs / 1000) * 60) !== frame) continue;
    if (event.action === "jump") held.jump = event.phase === "press";
    else if (event.action === "action") held.action = event.phase === "press";
    else base[event.action] = event.phase === "press";
  }
  return base;
}

/**
 * Deterministic, headless simulation of a scene. This does not render or
 * navigate; it uses exactly the same Runtime and fixed timestep as manual Play.
 */
export function runHeadlessPlaytest(document: ProjectDocument, options: PlaytestOptions = {}): PlaytestResult {
  const requested = Number(options.durationMs ?? 4000);
  const durationMs = Number.isFinite(requested) ? Math.max(0, Math.min(MAX_DURATION_MS, requested)) : 4000;
  const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : 1234;
  const runtime = new Runtime(document, options.sceneId, seed);
  const framesWanted = Math.max(1, Math.round(durationMs / 1000 / FIXED_DT));
  const inputs = Array.isArray(options.inputs)
    ? options.inputs
        .filter((input) => input && typeof input.atMs === "number" && ["left", "right", "up", "down", "jump", "action"].includes(input.action))
        .sort((a, b) => a.atMs - b.atMs)
    : [];

  const frameStates: Array<{ jumpPressed: boolean; jumpReleased: boolean; actionPressed: boolean; actionReleased: boolean }> = [];
  for (const input of inputs) {
    const frame = Math.max(0, Math.min(framesWanted - 1, Math.floor((input.atMs / 1000) * 60)));
    const state = frameStates[frame] ?? { jumpPressed: false, jumpReleased: false, actionPressed: false, actionReleased: false };
    if (input.action === "jump") {
      if (input.phase === "press") state.jumpPressed = true;
      else state.jumpReleased = true;
    }
    if (input.action === "action") {
      if (input.phase === "press") state.actionPressed = true;
      else state.actionReleased = true;
    }
    frameStates[frame] = state;
  }

  const held = { jump: false, action: false };
  let thrown: string | null = null;
  let frame = 0;
  while (frame < framesWanted) {
    if (runtime.status !== "running") break;
    try {
      runtime.step(inputAt(frame, inputs, held, frameStates));
    } catch (error) {
      thrown = error instanceof Error ? error.message : "Runtime error";
      break;
    }
    frame += 1;
  }

  const status: PlaytestResult["status"] = runtime.status === "won" ? "won" : runtime.status === "stopped" ? "stopped" : "timeout";
  const errorEvent = [...runtime.events].reverse().find((event) => event.type === "error");
  const lastError = thrown ?? runtime.lastError ?? errorEvent?.message ?? null;
  const sceneName = runtime.scene.name;
  let objectName = "unknown object";
  const errorObjectId = errorEvent?.objectId;
  if (errorObjectId) {
    objectName = runtime.scene.objects.find((object) => object.id === errorObjectId)?.name ?? errorObjectId;
  } else if (runtime.player()) {
    objectName = runtime.player()!.source.name;
  }

  const events: PlaytestResult["events"] = runtime.events.slice(-200).map((event: RuntimeEvent) => ({
    frame: event.frame,
    type: event.type,
    message: event.message,
    objectId: event.objectId,
  }));

  return {
    passed: status === "won" || (status === "stopped" && !lastError),
    sceneId: runtime.scene.id,
    seed,
    frames: runtime.frame,
    elapsedMs: Math.round(runtime.elapsed * 1000),
    status,
    variables: { ...runtime.variables },
    events,
    lastError,
    error: lastError ? { sceneName, objectName, message: lastError } : undefined,
    headless: true,
    note: "Headless simulation using the same fixed-step Runtime as manual Play; it does not render a canvas.",
  };
}
