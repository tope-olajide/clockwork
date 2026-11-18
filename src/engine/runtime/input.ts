import type { ProjectSettings } from "../model/schema";

export type LogicalAction = "left" | "right" | "up" | "down" | "jump" | "action";

export interface InputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  action: boolean;
  jumpPressed: boolean;
  actionPressed: boolean;
  jumpReleased: boolean;
  actionReleased: boolean;
}

const EMPTY: InputFrame = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  action: false,
  jumpPressed: false,
  actionPressed: false,
  jumpReleased: false,
  actionReleased: false,
};

const GAMEPAD_DEADZONE = 0.35;

/**
 * Maps keyboard, pointer/tap and the first standard-mapping gamepad to logical
 * actions. `snapshot()` is the per-fixed-step boundary: pressed and released
 * edges are consumed there, while held-down state persists.
 */
export class InputManager {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private map: Record<LogicalAction, string[]>;
  private pointerDown = false;
  private pointerPressed = false;
  private pointerReleased = false;
  private pointerTarget: HTMLElement | null = null;
  private virtualDown = new Set<LogicalAction>();
  private virtualPressed = new Set<LogicalAction>();
  private virtualReleased = new Set<LogicalAction>();
  private gamepadPrevious = { jump: false, action: false };
  private onKeyDown: (event: KeyboardEvent) => void;
  private onKeyUp: (event: KeyboardEvent) => void;
  private onPointerDown: (event: PointerEvent) => void;
  private onPointerUp: (event: PointerEvent) => void;

  constructor(inputMap: ProjectSettings["inputMap"]) {
    this.map = inputMap as Record<LogicalAction, string[]>;
    this.onKeyDown = (event) => {
      const target = event.target as HTMLElement | null;
      if (typeof target?.matches === "function" && target.matches("input, textarea, select, [contenteditable='true']")) return;
      if (!this.down.has(event.code)) this.pressed.add(event.code);
      this.down.add(event.code);
      if (this.actionCodes().some((codes) => codes.includes(event.code))) event.preventDefault();
    };
    this.onKeyUp = (event) => {
      if (this.down.delete(event.code)) this.released.add(event.code);
    };
    this.onPointerDown = (event) => {
      if (event.button !== 0 || this.pointerDown) return;
      this.pointerDown = true;
      this.pointerPressed = true;
      event.preventDefault();
    };
    this.onPointerUp = (event) => {
      if (event.button !== 0 || !this.pointerDown) return;
      this.pointerDown = false;
      this.pointerReleased = true;
    };
  }

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  /** Call with the play canvas once it exists; pointer/tap is scoped to it. */
  attachPointer(target: HTMLElement): void {
    this.detachPointer();
    this.pointerTarget = target;
    target.addEventListener("pointerdown", this.onPointerDown);
    target.addEventListener("pointerup", this.onPointerUp);
    target.addEventListener("pointercancel", this.onPointerUp);
    target.addEventListener("pointerleave", this.onPointerUp);
  }

  detachPointer(): void {
    if (!this.pointerTarget) return;
    this.pointerTarget.removeEventListener("pointerdown", this.onPointerDown);
    this.pointerTarget.removeEventListener("pointerup", this.onPointerUp);
    this.pointerTarget.removeEventListener("pointercancel", this.onPointerUp);
    this.pointerTarget.removeEventListener("pointerleave", this.onPointerUp);
    this.pointerTarget = null;
    this.pointerDown = false;
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.detachPointer();
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
    this.pointerPressed = false;
    this.pointerReleased = false;
    this.clearVirtual();
    this.gamepadPrevious = { jump: false, action: false };
  }

  private actionCodes(): string[][] {
    return Object.values(this.map);
  }

  private active(action: LogicalAction): boolean {
    return this.virtualDown.has(action) || (this.map[action] ?? []).some((code) => this.down.has(code));
  }

  private wasPressed(action: LogicalAction): boolean {
    return this.virtualPressed.has(action) || (this.map[action] ?? []).some((code) => this.pressed.has(code));
  }

  private wasReleased(action: LogicalAction): boolean {
    return this.virtualReleased.has(action) || (this.map[action] ?? []).some((code) => this.released.has(code));
  }

  /** DOM controls call this for held actions (movement toggles). */
  setAction(action: LogicalAction, held: boolean): void {
    if (held) {
      if (!this.virtualDown.has(action)) this.virtualPressed.add(action);
      this.virtualDown.add(action);
    } else if (this.virtualDown.delete(action)) {
      this.virtualReleased.add(action);
    }
  }

  /** An impulse control: down for one short frame, then released. */
  tapAction(action: LogicalAction): void {
    this.setAction(action, true);
    window.setTimeout(() => this.setAction(action, false), 90);
  }

  clearVirtual(): void {
    this.virtualDown.clear();
    this.virtualPressed.clear();
    this.virtualReleased.clear();
  }

  private gamepad(): { left: boolean; right: boolean; up: boolean; down: boolean; jump: boolean; action: boolean } {
    const state = { left: false, right: false, up: false, down: false, jump: false, action: false };
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return state;
    const pad = [...navigator.getGamepads()].find((candidate) => candidate && candidate.connected);
    if (!pad) return state;
    const axisX = pad.axes[0] ?? 0;
    const axisY = pad.axes[1] ?? 0;
    const pressed = (index: number) => pad.buttons[index]?.pressed === true;
    state.left = axisX < -GAMEPAD_DEADZONE || pressed(14);
    state.right = axisX > GAMEPAD_DEADZONE || pressed(15);
    state.up = axisY < -GAMEPAD_DEADZONE || pressed(12);
    state.down = axisY > GAMEPAD_DEADZONE || pressed(13);
    state.jump = pressed(0);
    state.action = pressed(2);
    return state;
  }

  snapshot(): InputFrame {
    const gamepad = this.gamepad();
    const keyboardJumpless = this.down.size === 0 && this.pressed.size === 0 && this.released.size === 0
      && this.virtualDown.size === 0 && this.virtualPressed.size === 0 && this.virtualReleased.size === 0;
    if (keyboardJumpless && !this.pointerDown && !this.pointerPressed && !this.pointerReleased && !gamepad.left && !gamepad.right && !gamepad.up && !gamepad.down && !gamepad.jump && !gamepad.action) {
      const previous = this.gamepadPrevious;
      this.gamepadPrevious = { jump: gamepad.jump, action: gamepad.action };
      return {
        ...EMPTY,
        jumpReleased: previous.jump,
        actionReleased: previous.action,
      };
    }
    const frame: InputFrame = {
      left: this.active("left") || gamepad.left,
      right: this.active("right") || gamepad.right,
      up: this.active("up") || gamepad.up,
      down: this.active("down") || gamepad.down,
      jump: this.active("jump") || gamepad.jump,
      action: this.active("action") || this.pointerDown || gamepad.action,
      jumpPressed: this.wasPressed("jump") || (gamepad.jump && !this.gamepadPrevious.jump),
      actionPressed: this.wasPressed("action") || this.pointerPressed || (gamepad.action && !this.gamepadPrevious.action),
      jumpReleased: this.wasReleased("jump") || (!gamepad.jump && this.gamepadPrevious.jump),
      actionReleased: this.wasReleased("action") || this.pointerReleased || (!gamepad.action && this.gamepadPrevious.action),
    };
    this.gamepadPrevious = { jump: gamepad.jump, action: gamepad.action };
    this.pressed.clear();
    this.released.clear();
    this.virtualPressed.clear();
    this.virtualReleased.clear();
    this.pointerPressed = false;
    this.pointerReleased = false;
    return frame;
  }
}

export function emptyInput(): InputFrame {
  return { ...EMPTY };
}
