import type { GameObject, ProjectDocument, Rule, Scene } from "../model/schema";
import { ruleReferenceIssues } from "../model/references";
import { playAssetSound } from "./audio";
import { emptyInput, type InputFrame } from "./input";

function effectiveVolume(master: number, channel: number): number {
  return Math.max(0, Math.min(1, master * channel));
}

export const FIXED_DT = 1 / 60;

export interface RuntimeEvent {
  time: number;
  frame: number;
  type: string;
  message: string;
  objectId?: string;
}

export interface RuntimeMessage {
  id: number;
  text: string;
  remainingMs: number;
}

export interface RuntimeObject {
  source: GameObject;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  vx: number;
  vy: number;
  grounded: boolean;
  active: boolean;
  spawnX: number;
  spawnY: number;
  airJumps: number;
  coyoteMs: number;
  jumpBufferMs: number;
  timerMs: number;
  animationKey: string;
  animationTime: number;
  animationFrame?: number;
}

export interface RuntimeSnapshot {
  variables: Record<string, number | string | boolean>;
  events: RuntimeEvent[];
  messages: RuntimeMessage[];
  frame: number;
  elapsed: number;
  status: "running" | "paused" | "won" | "stopped";
  camera: { x: number; y: number; zoom: number };
}

export interface Solid {
  left: number;
  top: number;
  right: number;
  bottom: number;
  oneWay: boolean;
}

function numberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolParam(params: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

function stringParam(params: Record<string, unknown>, key: string, fallback: string): string {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}

function bodyDims(object: GameObject): { w: number; h: number } {
  if (object.body) return { w: object.body.width, h: object.body.height };
  if (object.visual?.kind === "rect") return { w: object.visual.width, h: object.visual.height };
  if (object.visual?.kind === "sprite") return { w: object.visual.width ?? 32, h: object.visual.height ?? 32 };
  if (object.visual?.kind === "tilemap") return { w: object.visual.cols * object.visual.tileSize, h: object.visual.rows * object.visual.tileSize };
  if (object.visual?.kind === "text") {
    return { w: Math.max(40, object.visual.text.length * object.visual.style.size * 0.58), h: object.visual.style.size * 1.3 };
  }
  return { w: 24, h: 24 };
}

function boxOf(object: RuntimeObject): { left: number; top: number; right: number; bottom: number } {
  const dims = bodyDims(object.source);
  const offsetX = object.source.body?.offsetX ?? 0;
  const offsetY = object.source.body?.offsetY ?? 0;
  return {
    left: object.x + offsetX - dims.w / 2,
    top: object.y + offsetY - dims.h / 2,
    right: object.x + offsetX + dims.w / 2,
    bottom: object.y + offsetY + dims.h / 2,
  };
}

function overlaps(a: RuntimeObject, b: RuntimeObject): boolean {
  const boxA = boxOf(a);
  const boxB = boxOf(b);
  return boxA.left < boxB.right && boxA.right > boxB.left && boxA.top < boxB.bottom && boxA.bottom > boxB.top;
}

export function tilemapRowSpans(object: GameObject, x = object.transform.x, y = object.transform.y): Solid[] {
  if (object.visual?.kind !== "tilemap") return [];
  const visual = object.visual;
  const spans: Solid[] = [];
  for (let row = 0; row < visual.rows; row += 1) {
    let spanStart = -1;
    for (let col = 0; col <= visual.cols; col += 1) {
      const filled = col < visual.cols && (visual.data[row * visual.cols + col] ?? 0) !== 0;
      if (filled && spanStart < 0) {
        spanStart = col;
      } else if (!filled && spanStart >= 0) {
        spans.push({
          left: x + spanStart * visual.tileSize,
          top: y + row * visual.tileSize,
          right: x + col * visual.tileSize,
          bottom: y + (row + 1) * visual.tileSize,
          oneWay: false,
        });
        spanStart = -1;
      }
    }
  }
  return spans;
}

function hasBehavior(object: GameObject, type: string): boolean {
  return object.behaviors.some((behavior) => behavior.enabled && behavior.type === type);
}

function behaviorOf(object: GameObject, type: string) {
  return object.behaviors.find((behavior) => behavior.enabled && behavior.type === type);
}

export class Runtime {
  readonly document: ProjectDocument;
  readonly seed: number;
  scene: Scene;
  objects: RuntimeObject[] = [];
  variables: Record<string, number | string | boolean> = {};
  events: RuntimeEvent[] = [];
  messages: RuntimeMessage[] = [];
  recordedInputs: InputFrame[] = [];
  fpsSamples: number[] = [];
  frame = 0;
  elapsed = 0;
  status: "running" | "paused" | "won" | "stopped" = "running";
  camera = { x: 0, y: 0, zoom: 1 };
  viewport = { width: 1280, height: 720 };
  checkpoint = { x: 0, y: 0 };
  lastError: string | null = null;
  private firedRules = new Set<string>();
  private blockedRules = new Set<string>();
  private timers = new Map<string, number>();
  private lastCheckpointId: string | null = null;
  private messageId = 0;

  constructor(document: ProjectDocument, sceneId?: string, seed = 1234) {
    this.document = document;
    this.seed = seed;
    this.scene = document.scenes.find((scene) => scene.id === sceneId) ?? document.scenes.find((scene) => scene.id === document.startSceneId) ?? document.scenes[0]!;
    this.viewport = { width: document.settings.width, height: document.settings.height };
    this.reset();
  }

  reset(options: { preserveVariables?: boolean; preserveEvents?: boolean; preserveFiredRules?: boolean; preserveInputs?: boolean } = {}): void {
    this.objects = this.scene.objects.map((source) => ({
      source: structuredClone(source),
      x: source.transform.x,
      y: source.transform.y,
      rotation: source.transform.rotation,
      scaleX: source.transform.scaleX,
      scaleY: source.transform.scaleY,
      vx: 0,
      vy: 0,
      grounded: false,
      active: true,
      spawnX: source.transform.x,
      spawnY: source.transform.y,
      airJumps: 0,
      coyoteMs: 0,
      jumpBufferMs: 0,
      timerMs: 0,
      animationKey: "",
      animationTime: 0,
      animationFrame: undefined,
    }));
    const previousVariables = this.variables;
    this.variables = {};
    for (const variable of this.document.variables) this.variables[variable.name] = previousVariables[variable.name] ?? variable.initial;
    if (!options.preserveVariables) {
      for (const variable of this.document.variables) this.variables[variable.name] = variable.initial;
    }
    const player = this.player();
    this.checkpoint = player ? { x: player.x, y: player.y } : { x: 0, y: 0 };
    this.camera = { x: player?.x ?? this.scene.camera.x, y: player?.y ?? this.scene.camera.y, zoom: this.scene.camera.zoom };
    this.clampCamera();
    this.frame = 0;
    this.elapsed = 0;
    this.status = "running";
    if (!options.preserveEvents) this.events = [];
    this.messages = [];
    if (!options.preserveInputs) this.recordedInputs = [];
    if (!options.preserveFiredRules) this.firedRules.clear();
    this.blockedRules.clear();
    this.timers.clear();
    this.lastCheckpointId = null;
    this.lastError = null;
    this.event("start", `Started ${this.scene.name}`);
  }

  player(): RuntimeObject | undefined {
    return this.objects.find((object) => object.active && (object.source.tags.includes("player") || hasBehavior(object.source, "platformer-controller") || hasBehavior(object.source, "top-down-controller")));
  }

  private event(type: string, message: string, objectId?: string): void {
    if (this.events.length >= 500) this.events.shift();
    this.events.push({ time: this.elapsed, frame: this.frame, type, message, objectId });
  }

  private message(text: string, durationMs = 2000): void {
    this.messages.push({ id: this.messageId++, text, remainingMs: durationMs });
  }

  private setVariable(name: string, op: "set" | "add" | "toggle", value: number | string | boolean): void {
    if (op === "set") {
      this.variables[name] = value;
    } else if (op === "add") {
      const current = typeof this.variables[name] === "number" ? (this.variables[name] as number) : 0;
      this.variables[name] = current + (typeof value === "number" ? value : 0);
    } else {
      this.variables[name] = !Boolean(this.variables[name]);
    }
    this.event("variable", `${name} = ${String(this.variables[name])}`);
    if (name === "won" && this.variables[name] === true) this.status = "won";
  }

  private solids(): Solid[] {
    const result: Solid[] = [];
    for (const object of this.objects) {
      if (!object.active) continue;
      if (object.source.body?.type === "static" || object.source.body?.type === "kinematic") {
        const dims = bodyDims(object.source);
        const offsetX = object.source.body.offsetX;
        const offsetY = object.source.body.offsetY;
        result.push({
          left: object.x + offsetX - dims.w / 2,
          top: object.y + offsetY - dims.h / 2,
          right: object.x + offsetX + dims.w / 2,
          bottom: object.y + offsetY + dims.h / 2,
          oneWay: object.source.body.oneWay,
        });
      }
      result.push(...tilemapRowSpans(object.source, object.x, object.y));
    }
    return result;
  }

  step(input: InputFrame = emptyInput()): void {
    if (this.status !== "running") return;
    try {
      this.recordedInputs.push({ ...input });
      this.frame += 1;
      this.elapsed += FIXED_DT;
      this.updateBehaviors(input);
      this.integratePhysics();
      this.checkInteractions();
      this.evaluateRules(input);
      this.updateAnimations();
      this.updateCamera();
      this.updateMessages();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Runtime error";
      const object = this.player();
      this.lastError = `${this.scene.name} (${this.scene.id})${object ? ` · ${object.source.name} (${object.source.id})` : ""}: ${message}`;
      this.event("error", this.lastError, object?.source.id);
      this.status = "stopped";
    }
  }

  private updateBehaviors(input: InputFrame): void {
    for (const object of this.objects) {
      if (!object.active) continue;
      const controller = behaviorOf(object.source, "platformer-controller");
      if (controller) {
        const params = controller.params;
        const speed = numberParam(params, "speed", 280);
        const jumpVelocity = numberParam(params, "jumpVelocity", numberParam(params, "jump", 640));
        const doubleJump = boolParam(params, "doubleJump", false);
        const coyoteMs = numberParam(params, "coyoteMs", 100);
        const bufferMs = numberParam(params, "bufferMs", 120);
        const gravityScale = numberParam(params, "gravityScale", 1);
        const maxFallSpeed = numberParam(params, "maxFallSpeed", 1400);
        object.vx = input.left ? -speed : input.right ? speed : 0;
        if (object.grounded) {
          object.coyoteMs = coyoteMs;
          object.airJumps = doubleJump ? 1 : 0;
        } else {
          object.coyoteMs = Math.max(0, object.coyoteMs - FIXED_DT * 1000);
        }
        if (input.jumpPressed) object.jumpBufferMs = bufferMs;
        else object.jumpBufferMs = Math.max(0, object.jumpBufferMs - FIXED_DT * 1000);
        if (object.jumpBufferMs > 0) {
          if (object.grounded || object.coyoteMs > 0) {
            object.vy = -jumpVelocity;
            object.grounded = false;
            object.coyoteMs = 0;
            object.jumpBufferMs = 0;
            object.airJumps = doubleJump ? 1 : 0;
            this.event("jump", `${object.source.name} jumped`, object.source.id);
          } else if (object.airJumps > 0) {
            object.vy = -jumpVelocity;
            object.airJumps -= 1;
            object.jumpBufferMs = 0;
            this.event("double-jump", `${object.source.name} double jumped`, object.source.id);
          }
        }
        object.vy = Math.min(maxFallSpeed, object.vy + this.document.settings.gravity.y * gravityScale * FIXED_DT);
      }

      if (hasBehavior(object.source, "top-down-controller")) {
        const params = behaviorOf(object.source, "top-down-controller")!.params;
        const speed = numberParam(params, "speed", 250);
        object.vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        object.vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (object.vx !== 0 && object.vy !== 0) {
          object.vx *= 0.7071;
          object.vy *= 0.7071;
        }
        object.vx *= speed;
        object.vy *= speed;
      }

      const patrol = behaviorOf(object.source, "patrol");
      if (patrol) {
        const params = patrol.params;
        const distance = numberParam(params, "distance", 220);
        const speed = numberParam(params, "speed", 70);
        const axis = stringParam(params, "axis", "x") === "y" ? "y" : "x";
        const period = (distance * 2) / Math.max(1, speed);
        const phase = (this.elapsed % period) / period;
        const offset = phase <= 0.5 ? phase * 2 * distance : (1 - phase) * 2 * distance;
        if (axis === "x") object.x = object.spawnX + offset;
        else object.y = object.spawnY + offset;
        object.vx = 0;
        object.vy = 0;
      }

      const follow = behaviorOf(object.source, "follow");
      if (follow) {
        const params = follow.params;
        const target = this.objects.find((candidate) => candidate.active && (candidate.source.id === stringParam(params, "targetId", "") || (stringParam(params, "targetId", "") === "" && this.player() === candidate)));
        if (target) {
          const speed = numberParam(params, "speed", 120);
          const stopDistance = numberParam(params, "stopDistance", 12);
          const dx = target.x - object.x;
          const dy = target.y - object.y;
          const length = Math.hypot(dx, dy);
          if (length > stopDistance) {
            object.x += (dx / length) * speed * FIXED_DT;
            object.y += (dy / length) * speed * FIXED_DT;
          }
        }
      }

      const timer = behaviorOf(object.source, "timer");
      if (timer) {
        const duration = numberParam(timer.params, "durationMs", 1000);
        object.timerMs += FIXED_DT * 1000;
        if (object.timerMs >= duration) {
          object.timerMs = 0;
          this.event("timer", `${object.source.name} timer`, object.source.id);
          if (!boolParam(timer.params, "repeat", true)) timer.enabled = false;
        }
      }
    }
  }

  private integratePhysics(): void {
    const solids = this.solids();
    for (const object of this.objects) {
      if (!object.active || object.source.body?.type !== "dynamic") continue;
      const dims = bodyDims(object.source);
      const offsetX = object.source.body.offsetX;
      const offsetY = object.source.body.offsetY;
      object.grounded = false;

      // Split fast movement into small steps so a body cannot tunnel through a
      // thin collider between two fixed steps. Deterministic from velocities.
      const maxSpeed = Math.max(Math.abs(object.vx), Math.abs(object.vy));
      const minCollider = Math.max(4, Math.min(dims.w, dims.h) * 0.5);
      const substeps = Math.max(1, Math.min(8, Math.ceil((maxSpeed * FIXED_DT) / minCollider)));
      let stepX = (object.vx * FIXED_DT) / substeps;
      let stepY = (object.vy * FIXED_DT) / substeps;

      for (let substep = 0; substep < substeps; substep += 1) {
        if (stepX !== 0) {
          object.x += stepX;
          for (const solid of solids) {
            if (solid.oneWay) continue;
            const box = boxOf(object);
            if (box.left < solid.right && box.right > solid.left && box.top < solid.bottom && box.bottom > solid.top) {
              if (stepX > 0) object.x = solid.left - offsetX - dims.w / 2;
              else object.x = solid.right - offsetX + dims.w / 2;
              object.vx = 0;
              stepX = 0;
              break;
            }
          }
        }

        if (stepY !== 0) {
          const previousBottom = boxOf(object).bottom;
          object.y += stepY;
          for (const solid of solids) {
            const box = boxOf(object);
            if (box.left < solid.right && box.right > solid.left && box.top < solid.bottom && box.bottom > solid.top) {
              if (solid.oneWay && (stepY <= 0 || previousBottom > solid.top + 1)) continue;
              if (stepY > 0) {
                object.y = solid.top - offsetY - dims.h / 2;
                object.vy = 0;
                object.grounded = true;
              } else {
                object.y = solid.bottom - offsetY + dims.h / 2;
                object.vy = 0;
              }
              stepY = 0;
              break;
            }
          }
        }
      }

      if (object.source.body.collideWorldBounds) {
        const box = boxOf(object);
        if (box.left < 0) object.x = 0 - offsetX + dims.w / 2;
        if (box.right > this.scene.size.w) object.x = this.scene.size.w - offsetX - dims.w / 2;
        if (box.top < 0) object.y = 0 - offsetY + dims.h / 2;
        if (box.bottom > this.scene.size.h) {
          object.y = this.scene.size.h - offsetY - dims.h / 2;
          object.vy = 0;
          object.grounded = true;
        }
      }
      object.rotation = object.source.transform.rotation;
    }
  }

  private checkInteractions(): void {
    const player = this.player();
    if (!player) return;
    for (const object of this.objects) {
      if (!object.active || object === player) continue;
      const collectible = behaviorOf(object.source, "collectible");
      if (collectible && overlaps(player, object)) {
        const params = collectible.params;
        const variable = stringParam(params, "variable", "coins");
        const amount = numberParam(params, "amount", 1);
        this.setVariable(variable, "add", amount);
        if (boolParam(params, "destroyOnCollect", true)) object.active = false;
        const sfx = stringParam(params, "sfxAssetId", "");
        if (sfx) void playAssetSound(sfx, effectiveVolume(this.document.settings.audio.masterVolume, this.document.settings.audio.sfxVolume));
        this.event("collect", `${object.source.name} collected`, object.source.id);
        continue;
      }
      const hazard = behaviorOf(object.source, "hazard");
      if (hazard && overlaps(player, object)) {
        if (boolParam(hazard.params, "respawn", true)) {
          player.x = this.checkpoint.x;
          player.y = this.checkpoint.y;
          player.vx = 0;
          player.vy = 0;
          this.event("respawn", `${player.source.name} respawned`, player.source.id);
        }
        continue;
      }
      const checkpoint = behaviorOf(object.source, "checkpoint");
      if (checkpoint && overlaps(player, object) && !object.source.tags.includes("goal")) {
        this.checkpoint = { x: player.x, y: player.y };
        if (this.lastCheckpointId !== object.source.id) {
          this.lastCheckpointId = object.source.id;
          this.event("checkpoint", `${object.source.name} reached`, object.source.id);
        }
      }
    }
  }

  private resolveObject(condition: { objectId?: string; tag?: string }): RuntimeObject[] {
    return this.objects.filter(
      (object) =>
        object.active &&
        ((condition.objectId && object.source.id === condition.objectId) ||
          (condition.tag && object.source.tags.includes(condition.tag)) ||
          (!condition.objectId && !condition.tag)),
    );
  }

  private conditionMet(condition: Rule["when"][number], input: InputFrame): boolean {
    if (condition.kind === "variable") {
      const value = this.variables[condition.name];
      switch (condition.op) {
        case "==":
          return value === condition.value;
        case "!=":
          return value !== condition.value;
        case ">":
          return Number(value) > Number(condition.value);
        case ">=":
          return Number(value) >= Number(condition.value);
        case "<":
          return Number(value) < Number(condition.value);
        case "<=":
          return Number(value) <= Number(condition.value);
      }
    }
    if (condition.kind === "overlap") {
      const left = this.resolveObject({ objectId: condition.objectId, tag: condition.tag });
      const right = this.resolveObject({ objectId: condition.otherId, tag: condition.otherTag });
      return left.some((a) => right.some((b) => a !== b && overlaps(a, b)));
    }
    if (condition.kind === "input") {
      if (condition.mode === "pressed") return condition.action === "jump" ? input.jumpPressed : condition.action === "action" ? input.actionPressed : false;
      if (condition.mode === "down") return input[condition.action as keyof InputFrame] === true;
      return false;
    }
    if (condition.kind === "scene-start") return this.frame <= 1;
    if (condition.kind === "timer") return (this.timers.get(condition.timerId) ?? 0) > 0;
    return false;
  }

  private evaluateRules(input: InputFrame): void {
    let budget = 100;
    for (const rule of this.scene.rules) {
      if (!rule.enabled || budget <= 0) continue;
      if (rule.once && this.firedRules.has(rule.id)) continue;
      const issues = ruleReferenceIssues(this.document, this.scene, rule);
      if (issues.length > 0) {
        if (!this.blockedRules.has(rule.id)) {
          this.blockedRules.add(rule.id);
          this.event("rule-blocked", `${rule.name}: ${issues[0]!.message}`);
        }
        continue;
      }
      if (!rule.when.every((condition) => this.conditionMet(condition, input))) continue;
      if (rule.once) this.firedRules.add(rule.id);
      this.event("rule", `${rule.name} fired`);
      for (const action of rule.do) {
        if (budget <= 0) break;
        budget -= 1;
        if (action.kind === "set-variable") this.setVariable(action.name, action.op, action.value);
        else if (action.kind === "show-message") this.message(action.text, action.durationMs ?? 2000);
        else if (action.kind === "play-sound") {
          const volume = action.volume ?? this.document.settings.audio.sfxVolume;
          void playAssetSound(action.assetId, effectiveVolume(this.document.settings.audio.masterVolume, volume));
        }
        else if (action.kind === "log") this.event("log", action.message);
        else if (action.kind === "destroy") {
          const target = action.target === "object" && action.objectId ? this.objects.find((object) => object.source.id === action.objectId) : undefined;
          if (target) target.active = false;
        } else if (action.kind === "spawn") {
          this.spawnPrefab(action.prefabId, action.x, action.y);
        } else if (action.kind === "set-behavior-param") {
          const object = this.objects.find((candidate) => candidate.source.id === action.objectId);
          const behavior = object?.source.behaviors.find((candidate) => candidate.id === action.behaviorId);
          if (behavior) behavior.params[action.param] = action.value;
        } else if (action.kind === "go-scene") {
          const next = this.document.scenes.find((scene) => scene.id === action.sceneId);
          if (next) this.transition(next.id);
        }
      }
    }
  }

  private spawnPrefab(prefabId: string, x: number, y: number): void {
    const prefab = this.document.prefabs.find((candidate) => candidate.id === prefabId);
    if (!prefab) return;
    const sources = [prefab.root, ...prefab.objects];
    const ids = new Map<string, string>();
    const instanceId = `pinst_${this.frame}_${this.objects.length}`;
    const dx = x - prefab.root.transform.x;
    const dy = y - prefab.root.transform.y;
    for (const source of sources) {
      const clone = structuredClone(source);
      clone.id = `obj_${this.frame}_${this.objects.length}_${ids.size}`;
      ids.set(source.id, clone.id);
      clone.transform = { ...clone.transform, x: clone.transform.x + dx, y: clone.transform.y + dy };
      clone.prefabId = prefab.id;
      clone.prefabInstanceId = instanceId;
      clone.prefabSlot = source.id === prefab.root.id ? "root" : `obj:${prefab.objects.indexOf(source)}`;
      this.objects.push({
        source: clone,
        x: clone.transform.x,
        y: clone.transform.y,
        rotation: clone.transform.rotation,
        scaleX: clone.transform.scaleX,
        scaleY: clone.transform.scaleY,
        vx: 0,
        vy: 0,
        grounded: false,
        active: true,
        spawnX: clone.transform.x,
        spawnY: clone.transform.y,
        airJumps: 0,
        coyoteMs: 0,
        jumpBufferMs: 0,
        timerMs: 0,
        animationKey: "",
        animationTime: 0,
        animationFrame: undefined,
      });
    }
    for (const object of this.objects) {
      if (object.source.prefabInstanceId !== instanceId || !object.source.parentId) continue;
      object.source.parentId = ids.get(object.source.parentId) ?? undefined;
      if (!object.source.parentId) delete object.source.parentId;
    }
    this.event("spawn", `${prefab.name} spawned`);
  }

  transition(sceneId: string): void {
    const next = this.document.scenes.find((scene) => scene.id === sceneId);
    if (!next) return;
    this.scene = next;
    this.reset({ preserveVariables: true, preserveEvents: true, preserveFiredRules: true, preserveInputs: true });
    if (this.variables.won === true) this.status = "won";
  }

  setViewport(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.viewport = { width, height };
    this.clampCamera();
  }

  private clampCamera(): void {
    const halfW = this.viewport.width / 2;
    const halfH = this.viewport.height / 2;
    this.camera.x = Math.max(halfW, Math.min(this.scene.size.w - halfW, this.camera.x));
    this.camera.y = Math.max(halfH, Math.min(this.scene.size.h - halfH, this.camera.y));
  }

  private updateCamera(): void {
    const player = this.player();
    for (const object of this.objects) {
      if (!object.active) continue;
      const follow = behaviorOf(object.source, "camera-follow");
      if (!follow) continue;
      const params = follow.params;
      const target = this.objects.find((candidate) => candidate.active && candidate.source.id === stringParam(params, "targetId", "")) ?? player;
      if (!target) continue;
      const deadzoneX = numberParam(params, "deadzoneX", 80);
      const deadzoneY = numberParam(params, "deadzoneY", 60);
      const lerp = numberParam(params, "lerp", numberParam(params, "damping", 0.12));
      const offsetY = numberParam(params, "offsetY", 0);
      if (Math.abs(target.x - this.camera.x) > deadzoneX) {
        this.camera.x += (target.x - this.camera.x) * lerp;
      }
      if (Math.abs(target.y + offsetY - this.camera.y) > deadzoneY) {
        this.camera.y += (target.y + offsetY - this.camera.y) * lerp;
      }
      if (boolParam(params, "clampToWorld", true)) this.clampCamera();
      this.camera.zoom = this.scene.camera.zoom;
    }
  }

  private updateMessages(): void {
    for (const message of this.messages) message.remainingMs -= FIXED_DT * 1000;
    this.messages = this.messages.filter((message) => message.remainingMs > 0);
  }

  private updateAnimations(): void {
    for (const object of this.objects) {
      if (!object.active) continue;
      const assignments = object.source.animations;
      if (!assignments || object.source.visual?.kind !== "sprite") continue;
      const key = !object.grounded ? "jump" : Math.abs(object.vx) > 1 ? "run" : "idle";
      const animationId = assignments[key as keyof typeof assignments] ?? assignments.idle;
      if (!animationId) continue;
      const visual = object.source.visual;
      if (visual.kind !== "sprite") continue;
      const asset = this.document.assets.find((candidate) => candidate.id === visual.assetId);
      const clip = asset?.animations?.find((candidate) => candidate.id === animationId);
      if (!clip || clip.frameIndices.length === 0) continue;
      if (object.animationKey !== animationId) {
        object.animationKey = animationId;
        object.animationTime = 0;
      }
      object.animationTime += FIXED_DT;
      const rawIndex = Math.floor(object.animationTime * clip.fps);
      const index = clip.loop ? rawIndex % clip.frameIndices.length : Math.min(clip.frameIndices.length - 1, rawIndex);
      object.animationFrame = clip.frameIndices[index] ?? clip.frameIndices[0];
    }
  }

  renderScene(): Scene {
    return {
      ...this.scene,
      objects: this.objects
        .filter((object) => object.active)
        .map((object) => {
          const visual =
            object.source.visual?.kind === "sprite" && object.animationFrame !== undefined
              ? { ...object.source.visual, frame: object.animationFrame }
              : object.source.visual;
          return {
            ...object.source,
            visual,
            transform: {
              ...object.source.transform,
              x: object.x,
              y: object.y,
              rotation: object.rotation,
              scaleX: object.scaleX,
              scaleY: object.scaleY,
            },
          };
        }),
    };
  }

  variable(name: string): number | string | boolean | undefined {
    return this.variables[name];
  }

  recordFps(fps: number): void {
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 500) this.fpsSamples.shift();
  }

  averageFps(): number {
    if (this.fpsSamples.length === 0) return 0;
    return this.fpsSamples.reduce((sum, value) => sum + value, 0) / this.fpsSamples.length;
  }

  snapshot(): RuntimeSnapshot {
    return {
      variables: { ...this.variables },
      events: [...this.events],
      messages: this.messages.map((message) => ({ ...message })),
      frame: this.frame,
      elapsed: this.elapsed,
      status: this.status,
      camera: { ...this.camera },
    };
  }

  replay(inputs: InputFrame[]): RuntimeSnapshot {
    this.reset();
    for (const input of inputs) this.step(input);
    return this.snapshot();
  }
}
