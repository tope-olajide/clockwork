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
};

export class InputManager {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private map: Record<LogicalAction, string[]>;
  private onKeyDown: (event: KeyboardEvent) => void;
  private onKeyUp: (event: KeyboardEvent) => void;

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
      this.down.delete(event.code);
    };
  }

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.down.clear();
    this.pressed.clear();
  }

  private actionCodes(): string[][] {
    return Object.values(this.map);
  }

  private active(action: LogicalAction): boolean {
    return (this.map[action] ?? []).some((code) => this.down.has(code));
  }

  private wasPressed(action: LogicalAction): boolean {
    return (this.map[action] ?? []).some((code) => this.pressed.has(code));
  }

  snapshot(): InputFrame {
    if (this.down.size === 0 && this.pressed.size === 0) return { ...EMPTY };
    const frame: InputFrame = {
      left: this.active("left"),
      right: this.active("right"),
      up: this.active("up"),
      down: this.active("down"),
      jump: this.active("jump"),
      action: this.active("action"),
      jumpPressed: this.wasPressed("jump"),
      actionPressed: this.wasPressed("action"),
    };
    this.pressed.clear();
    return frame;
  }
}

export function emptyInput(): InputFrame {
  return { ...EMPTY };
}
