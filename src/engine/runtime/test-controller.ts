import { emptyInput, type InputFrame, type LogicalAction } from "./input";
import { Runtime } from "./runtime";
import type { ProjectDocument } from "../model/schema";

/**
 * Deterministic test clock for a snapshot run.
 *
 * Nothing here advances on wall time: the caller asks for an exact frame count,
 * and every queued control has a planned press/release frame. That is what lets a
 * browser agent reason between actions without the game moving underneath it.
 * Normal Play and the real-time snapshot player never construct this class.
 */
export const TEST_MODE_LIMITS = {
  /** Frames one advance request may contain. */
  maxFramesPerAdvance: 600,
  /** Frames a whole test session may advance. */
  maxFramesPerPhase: 3600,
  /** Simultaneously queued controls. */
  maxQueuedInputs: 16,
  /** A pulse longer than this is a hold request, not an impulse. */
  maxPulseFrames: 6,
} as const;

export type TestControlMode = "hold" | "pulse";

export interface TestInputRequest {
  controlId: string;
  action: LogicalAction;
  mode: TestControlMode;
  /** Pulse: frames held (default 1, capped at 6). Hold: optional frame cap. */
  frames?: number;
}

export interface TestInputReceipt {
  controlId: string;
  action: LogicalAction;
  mode: TestControlMode;
  /** Planned frames; null for an uncapped hold. */
  requestedFrames: number | null;
  accepted: boolean;
  /** First runtime frame whose InputFrame carried the action (1-based step). */
  pressFrame?: number;
  /** Last runtime frame that carried it. */
  releaseFrame?: number;
  reason?: string;
}

export interface TestAdvanceResult {
  fromFrame: number;
  toFrame: number;
  advancedFrames: number;
  requestedFrames: number;
  status: string;
  /** True when the session frame budget shortened the request. */
  clamped: boolean;
  receipts: TestInputReceipt[];
  reason?: string;
}

interface PendingInput {
  receipt: TestInputReceipt;
  startFrame: number;
  endFrame: number | null;
  /** Set once a step actually carried the action. */
  applied: boolean;
}

function clampInteger(value: unknown, min: number, max: number): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

export class TestController {
  readonly runtime: Runtime;
  readonly seed: number;
  private readonly maxFrames: number;
  private readonly maxAdvance: number;
  private pending: PendingInput[] = [];
  private receiptsList: TestInputReceipt[] = [];
  private active = new Set<LogicalAction>();
  private advanced = 0;

  constructor(
    document: ProjectDocument,
    options: { seed?: number; sceneId?: string; maxFramesPerPhase?: number; maxFramesPerAdvance?: number } = {},
  ) {
    this.seed = options.seed ?? 1234;
    this.maxFrames = options.maxFramesPerPhase ?? TEST_MODE_LIMITS.maxFramesPerPhase;
    this.maxAdvance = Math.min(options.maxFramesPerAdvance ?? TEST_MODE_LIMITS.maxFramesPerAdvance, this.maxFrames);
    this.runtime = new Runtime(document, options.sceneId, this.seed);
  }

  /** The frame the last step produced; 0 means nothing has stepped yet. */
  get frame(): number {
    return this.runtime.frame;
  }

  get status(): string {
    return this.runtime.status;
  }

  get framesAdvanced(): number {
    return this.advanced;
  }

  get framesRemaining(): number {
    return Math.max(0, this.maxFrames - this.advanced);
  }

  get maxFramesPerAdvance(): number {
    return this.maxAdvance;
  }

  get maxFramesPerPhase(): number {
    return this.maxFrames;
  }

  get receipts(): TestInputReceipt[] {
    return this.receiptsList.map((receipt) => ({ ...receipt }));
  }

  /** Controls currently down, whether held or inside their pulse window. */
  activeControlIds(): string[] {
    return this.pending.map((input) => input.receipt.controlId);
  }

  /**
   * Queues one control. A pulse is active for a fixed number of frames and then
   * releases on its own; a hold stays down until `release` or its frame cap.
   */
  enqueue(request: TestInputRequest): TestInputReceipt {
    const reject = (reason: string): TestInputReceipt => {
      const receipt: TestInputReceipt = {
        controlId: request.controlId,
        action: request.action,
        mode: request.mode,
        requestedFrames: request.frames ?? null,
        accepted: false,
        reason,
      };
      this.receiptsList.push(receipt);
      return receipt;
    };

    if (this.runtime.status !== "running") return reject("runtime is not running");
    if (this.pending.length >= TEST_MODE_LIMITS.maxQueuedInputs) return reject("too many queued controls");
    if (this.pending.some((input) => input.receipt.controlId === request.controlId)) {
      return reject(`control "${request.controlId}" is already down`);
    }
    if (this.framesRemaining === 0) return reject("frame budget exhausted");

    const startFrame = this.runtime.frame + 1;
    let requestedFrames: number | null = null;
    let endFrame: number | null = null;

    if (request.mode === "pulse") {
      const frames = clampInteger(request.frames ?? 1, 1, TEST_MODE_LIMITS.maxPulseFrames);
      if (frames === null) return reject("pulse frames must be a number");
      requestedFrames = frames;
      endFrame = startFrame + frames - 1;
    } else if (request.frames !== undefined) {
      const frames = clampInteger(request.frames, 1, this.maxFrames);
      if (frames === null) return reject("hold frames must be a number");
      requestedFrames = frames;
      endFrame = startFrame + frames - 1;
    }

    const receipt: TestInputReceipt = {
      controlId: request.controlId,
      action: request.action,
      mode: request.mode,
      requestedFrames,
      // pressFrame is only set by advance() when a real InputFrame carries it.
      accepted: true,
    };
    this.receiptsList.push(receipt);
    this.pending.push({ receipt, startFrame, endFrame, applied: false });
    return { ...receipt };
  }

  /** Ends a queued control on the next frame; one released before it ran never applied. */
  release(controlId: string): void {
    const input = this.pending.find((candidate) => candidate.receipt.controlId === controlId);
    if (!input) return;
    if (!input.applied) {
      this.pending = this.pending.filter((candidate) => candidate !== input);
      input.receipt.pressFrame = undefined;
      input.receipt.reason = "released before the next frame";
      return;
    }
    input.endFrame = this.runtime.frame;
  }

  /** Releases everything (stop, reset, unmount, terminal status). */
  releaseAll(reason?: string): void {
    for (const input of this.pending) {
      if (input.applied) input.endFrame = this.runtime.frame;
      else input.receipt.pressFrame = undefined;
      if (reason) input.receipt.reason = reason;
    }
    this.pending = [];
    this.active.clear();
  }

  /**
   * Advances exactly `requested` frames (or fewer when the session budget is
   * short), applying queued inputs at their planned frames.
   */
  advance(requested: number): TestAdvanceResult {
    const fromFrame = this.runtime.frame;
    const wanted = clampInteger(requested, 1, this.maxAdvance);
    if (wanted === null) {
      return { fromFrame, toFrame: fromFrame, advancedFrames: 0, requestedFrames: requested, status: this.runtime.status, clamped: false, receipts: this.receipts, reason: "frames must be a number" };
    }
    if (this.runtime.status !== "running") {
      this.releaseAll("released because the runtime is not running");
      return { fromFrame, toFrame: fromFrame, advancedFrames: 0, requestedFrames: wanted, status: this.runtime.status, clamped: false, receipts: this.receipts, reason: "runtime is not running" };
    }
    const frames = Math.min(wanted, this.framesRemaining);
    if (frames === 0) {
      return { fromFrame, toFrame: fromFrame, advancedFrames: 0, requestedFrames: wanted, status: this.runtime.status, clamped: true, receipts: this.receipts, reason: "frame budget exhausted" };
    }
    const asked = Math.trunc(Number(requested));

    let advancedFrames = 0;
    for (let index = 0; index < frames; index += 1) {
      const frame = this.runtime.frame + 1;
      const active = new Set<LogicalAction>();
      for (const input of this.pending) {
        if (frame < input.startFrame) continue;
        if (input.endFrame !== null && frame > input.endFrame) continue;
        active.add(input.receipt.action);
        input.applied = true;
        input.receipt.pressFrame = input.receipt.pressFrame ?? frame;
        input.receipt.releaseFrame = frame;
      }

      const input: InputFrame = {
        ...emptyInput(),
        left: active.has("left"),
        right: active.has("right"),
        up: active.has("up"),
        down: active.has("down"),
        jump: active.has("jump"),
        action: active.has("action"),
        jumpPressed: active.has("jump") && !this.active.has("jump"),
        actionPressed: active.has("action") && !this.active.has("action"),
        jumpReleased: !active.has("jump") && this.active.has("jump"),
        actionReleased: !active.has("action") && this.active.has("action"),
      };
      this.runtime.step(input);
      this.active = active;
      advancedFrames += 1;
      this.advanced += 1;

      // Pulse windows and capped holds end after their last applied frame.
      this.pending = this.pending.filter((queued) => queued.endFrame === null || frame < queued.endFrame);
      if (this.runtime.status !== "running") {
        this.releaseAll("released because the runtime stopped");
        break;
      }
    }

    return {
      fromFrame,
      toFrame: this.runtime.frame,
      advancedFrames,
      requestedFrames: wanted,
      status: this.runtime.status,
      clamped: Number.isFinite(asked) && frames < asked,
      receipts: this.receipts,
    };
  }

  /** Restores the exact frame-zero state for the same document and seed. */
  reset(): void {
    this.runtime.reset();
    this.pending = [];
    this.receiptsList = [];
    this.active.clear();
    this.advanced = 0;
  }

  countTag(tag: string): number {
    return this.runtime.objects.filter((object) => object.active && object.source.tags.includes(tag)).length;
  }

  countEvents(type: string): number {
    return this.runtime.events.filter((event) => event.type === type).length;
  }
}
