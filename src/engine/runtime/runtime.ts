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
  /** Per-behavior timers, so one object can run several spawners or shooters. */
  behaviorTimers: Record<string, number>;
  hp?: number;
  invulnMs: number;
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
  status: "running" | "paused" | "won" | "lost" | "stopped";
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
  if (object.visual?.kind === "shape") return { w: object.visual.width, h: object.visual.height };
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

function behaviorsOf(object: GameObject, type: string) {
  return object.behaviors.filter((behavior) => behavior.enabled && behavior.type === type);
}

function tagList(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
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
  status: "running" | "paused" | "won" | "lost" | "stopped" = "running";
  camera = { x: 0, y: 0, zoom: 1 };
  viewport = { width: 1280, height: 720 };
  checkpoint = { x: 0, y: 0 };
  lastError: string | null = null;
  private firedRules = new Set<string>();
  private blockedRules = new Set<string>();
  private timers = new Map<string, number>();
  private lastCheckpointId: string | null = null;
  private messageId = 0;
  private rngState = 0;
  private formationDirections = new Map<string, number>();

  constructor(document: ProjectDocument, sceneId?: string, seed = 1234) {
    this.document = document;
    this.seed = seed;
    this.scene = document.scenes.find((scene) => scene.id === sceneId) ?? document.scenes.find((scene) => scene.id === document.startSceneId) ?? document.scenes[0]!;
    this.viewport = { width: document.settings.width, height: document.settings.height };
    this.rngState = (seed >>> 0) || 1;
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
      behaviorTimers: {},
      invulnMs: 0,
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
    this.formationDirections.clear();
    this.lastError = null;
    this.rngState = (this.seed >>> 0) || 1;
    this.initializeHealth(options.preserveVariables === true);
    this.event("start", `Started ${this.scene.name}`);
  }

  /** Deterministic float in [0, 1) for spawners and enemy fire. */
  random(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private initializeHealth(preserveVariables: boolean): void {
    for (const object of this.objects) {
      const health = behaviorOf(object.source, "health");
      if (!health) continue;
      const max = Math.max(1, numberParam(health.params, "max", 1));
      const variable = stringParam(health.params, "variable", "");
      const carried = preserveVariables && variable ? Number(this.variables[variable]) : NaN;
      object.hp = Number.isFinite(carried) && carried > 0 ? carried : max;
      if (variable) this.variables[variable] = object.hp;
    }
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
    if (name === "lost" && this.variables[name] === true) this.status = "lost";
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
      this.checkProjectileHits();
      this.checkDamageContacts();
      this.checkInteractions();
      this.evaluateRules(input);
      this.pruneInactiveSpawned();
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
    const deltaMs = FIXED_DT * 1000;
    for (const object of this.objects) {
      if (!object.active) continue;
      object.invulnMs = Math.max(0, object.invulnMs - deltaMs);
      const controller = behaviorOf(object.source, "platformer-controller");
      if (controller) {
        const params = controller.params;
        const speed = numberParam(params, "speed", 280);
        const jumpVelocity = numberParam(params, "jumpVelocity", numberParam(params, "jump", 640));
        const airJumpCount = Math.max(0, Math.round(numberParam(params, "maxAirJumps", boolParam(params, "doubleJump", false) ? 1 : 0)));
        const coyoteMs = numberParam(params, "coyoteMs", 100);
        const bufferMs = numberParam(params, "bufferMs", 120);
        const gravityScale = numberParam(params, "gravityScale", 1);
        const maxFallSpeed = numberParam(params, "maxFallSpeed", 1400);
        object.vx = input.left ? -speed : input.right ? speed : 0;
        if (object.grounded) {
          object.coyoteMs = coyoteMs;
          object.airJumps = airJumpCount;
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
            object.airJumps = airJumpCount;
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
        const lockAxis = stringParam(params, "lockAxis", "none");
        object.vx = lockAxis === "x" ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
        object.vy = lockAxis === "y" ? 0 : (input.down ? 1 : 0) - (input.up ? 1 : 0);
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
        object.timerMs += deltaMs;
        if (object.timerMs >= duration) {
          object.timerMs = 0;
          this.event("timer", `${object.source.name} timer`, object.source.id);
          if (!boolParam(timer.params, "repeat", true)) timer.enabled = false;
        }
      }

      this.updateMover(object, deltaMs);
      if (!object.active) continue;
      this.updateRotateThrust(object, input);
      this.updateProjectile(object, deltaMs);
      this.updateShooter(object, input, deltaMs);
      this.updateSpawner(object);
      this.updateCountdown(object);
      this.updatePaddle(object, input);
      this.updateAiPaddle(object, deltaMs);
      this.updateBall(object, input, deltaMs);
      this.updateFlap(object, input);
    }
    this.updateFormations();
  }

  private updatePaddle(object: RuntimeObject, input: InputFrame): void {
    const behavior = behaviorOf(object.source, "paddle");
    if (!behavior) return;
    const params = behavior.params;
    const axis = stringParam(params, "axis", "x") === "y" ? "y" : "x";
    const halfSize = bodyDims(object.source)[axis === "x" ? "w" : "h"] / 2;
    const min = numberParam(params, "min", halfSize);
    const max = numberParam(params, "max", (axis === "x" ? this.scene.size.w : this.scene.size.h) - halfSize);
    const direction = axis === "x"
      ? Number(input.right) - Number(input.left)
      : Number(input.down) - Number(input.up);
    const speed = Math.max(0, numberParam(params, "speed", 480));
    if (axis === "x") {
      object.x = Math.max(min, Math.min(max, object.x + direction * speed * FIXED_DT));
      object.vx = 0;
      object.vy = 0;
    } else {
      object.y = Math.max(min, Math.min(max, object.y + direction * speed * FIXED_DT));
      object.vx = 0;
      object.vy = 0;
    }
  }

  private updateAiPaddle(object: RuntimeObject, deltaMs: number): void {
    const behavior = behaviorOf(object.source, "ai-paddle");
    if (!behavior) return;
    const params = behavior.params;
    const axis = stringParam(params, "axis", "y") === "x" ? "x" : "y";
    const targetTag = stringParam(params, "targetTag", "ball");
    const target = this.objects.find((candidate) => candidate.active && candidate.source.tags.includes(targetTag));
    if (!target) return;

    const reactionKey = `${behavior.id}:reaction`;
    const errorKey = `${behavior.id}:error`;
    const reactionMs = Math.max(0, numberParam(params, "reactionMs", 220));
    let remaining = object.behaviorTimers[reactionKey] ?? 0;
    if (object.behaviorTimers[errorKey] === undefined || remaining <= 0) {
      const error = Math.max(0, numberParam(params, "error", 36));
      object.behaviorTimers[errorKey] = (this.random() * 2 - 1) * error;
      remaining = reactionMs;
    }
    remaining = Math.max(0, remaining - deltaMs);
    object.behaviorTimers[reactionKey] = remaining;

    const targetPosition = (axis === "x" ? target.x : target.y) + (object.behaviorTimers[errorKey] ?? 0);
    const currentPosition = axis === "x" ? object.x : object.y;
    const maxStep = Math.max(0, numberParam(params, "speed", 240)) * FIXED_DT;
    const nextPosition = currentPosition + Math.max(-maxStep, Math.min(maxStep, targetPosition - currentPosition));
    const min = numberParam(params, "min", 0);
    const max = numberParam(params, "max", axis === "x" ? this.scene.size.w : this.scene.size.h);
    if (axis === "x") {
      object.x = Math.max(min, Math.min(max, nextPosition));
      object.vx = 0;
      object.vy = 0;
    } else {
      object.y = Math.max(min, Math.min(max, nextPosition));
      object.vx = 0;
      object.vy = 0;
    }
  }

  private updateBall(object: RuntimeObject, input: InputFrame, deltaMs: number): void {
    const behavior = behaviorOf(object.source, "ball");
    if (!behavior) return;
    const params = behavior.params;
    const stateKey = `${behavior.id}:state`;
    const waitKey = `${behavior.id}:wait`;
    const directionKey = `${behavior.id}:serve-direction`;
    const hitsKey = `${behavior.id}:hits`;
    const initialDirection = stringParam(params, "serveDirection", "up");
    if (object.behaviorTimers[stateKey] === undefined) {
      object.behaviorTimers[stateKey] = 1;
      object.behaviorTimers[waitKey] = 0;
      object.behaviorTimers[hitsKey] = 0;
      object.behaviorTimers[directionKey] = initialDirection === "left" ? -1 : initialDirection === "right" ? 1 : 0;
    }

    if (object.behaviorTimers[stateKey] === 1) {
      object.vx = 0;
      object.vy = 0;
      const attachTag = stringParam(params, "attachToTag", "");
      const attached = attachTag
        ? this.objects.find((candidate) => candidate.active && candidate !== object && candidate.source.tags.includes(attachTag))
        : undefined;
      if (attached) {
        object.x = attached.x + numberParam(params, "offsetX", 0);
        object.y = attached.y + numberParam(params, "offsetY", 0);
      } else {
        object.x = this.scene.size.w / 2;
        object.y = this.scene.size.h / 2;
      }

      const waited = (object.behaviorTimers[waitKey] ?? 0) + deltaMs;
      object.behaviorTimers[waitKey] = waited;
      if (waited < Math.max(0, numberParam(params, "serveDelayMs", 350))) return;
      const trigger = stringParam(params, "serveTrigger", "jump");
      const pressed =
        trigger === "auto" ||
        (trigger === "jump" && (input.jumpPressed || input.jump)) ||
        (trigger === "action" && (input.actionPressed || input.action)) ||
        (trigger === "any" && (input.jumpPressed || input.jump || input.actionPressed || input.action));
      if (!pressed) return;

      this.serveBall(object, behavior.id, initialDirection, directionKey);
      return;
    }

    const size = bodyDims(object.source);
    const halfW = size.w / 2;
    const halfH = size.h / 2;
    const maxStep = Math.max(4, Math.min(size.w, size.h) / 2);
    const substeps = Math.max(1, Math.min(32, Math.ceil(Math.max(Math.abs(object.vx), Math.abs(object.vy)) * FIXED_DT / maxStep)));
    const substepDt = FIXED_DT / substeps;
    const paddleTag = stringParam(params, "paddleTag", "paddle");
    const targetTags = tagList(stringParam(params, "targetTags", ""));
    const damaged = new Set<string>();

    const countHit = () => {
      const hits = (object.behaviorTimers[hitsKey] ?? 0) + 1;
      object.behaviorTimers[hitsKey] = hits;
      const speedUpEvery = Math.max(0, Math.round(numberParam(params, "speedUpEvery", 0)));
      const speedUpBy = Math.max(0, numberParam(params, "speedUpBy", 0));
      if (speedUpEvery === 0 || speedUpBy === 0 || hits % speedUpEvery !== 0) return;
      const speed = Math.hypot(object.vx, object.vy);
      const nextSpeed = Math.min(Math.max(1, numberParam(params, "maxSpeed", 620)), speed + speedUpBy);
      if (speed > 0) {
        object.vx = (object.vx / speed) * nextSpeed;
        object.vy = (object.vy / speed) * nextSpeed;
      }
    };

    const collide = (axis: "x" | "y", delta: number): boolean => {
      const candidate = this.objects.find((other) =>
        other.active &&
        other !== object &&
        (other.source.body?.type === "static" || other.source.body?.type === "kinematic") &&
        overlaps(object, other),
      );
      if (!candidate) return false;
      const ballBox = boxOf(object);
      const targetBox = boxOf(candidate);
      if (axis === "x") {
        object.x += delta > 0 ? targetBox.left - ballBox.right : targetBox.right - ballBox.left;
      } else {
        object.y += delta > 0 ? targetBox.top - ballBox.bottom : targetBox.bottom - ballBox.top;
      }

      const isPaddle = paddleTag.length > 0 && candidate.source.tags.includes(paddleTag);
      if (isPaddle) {
        const angleLimit = Math.min(80, Math.max(0, numberParam(params, "bounceAngle", 58))) * Math.PI / 180;
        const speed = Math.min(
          Math.max(1, numberParam(params, "maxSpeed", 620)),
          Math.max(1, Math.hypot(object.vx, object.vy)),
        );
        if (axis === "x") {
          const ratio = Math.max(-1, Math.min(1, (object.y - candidate.y) / Math.max(1, bodyDims(candidate.source).h / 2)));
          const angle = ratio * angleLimit;
          object.vx = -Math.sign(delta) * speed * Math.cos(angle);
          object.vy = speed * Math.sin(angle);
        } else {
          const ratio = Math.max(-1, Math.min(1, (object.x - candidate.x) / Math.max(1, bodyDims(candidate.source).w / 2)));
          const angle = ratio * angleLimit;
          object.vy = -Math.sign(delta) * speed * Math.cos(angle);
          object.vx = speed * Math.sin(angle);
        }
        countHit();
      } else {
        if (axis === "x") object.vx = -object.vx;
        else object.vy = -object.vy;
        if (
          candidate.hp !== undefined &&
          candidate.hp > 0 &&
          !damaged.has(candidate.source.id) &&
          (targetTags.length === 0 ? !candidate.source.tags.includes(paddleTag) : targetTags.some((tag) => candidate.source.tags.includes(tag)))
        ) {
          damaged.add(candidate.source.id);
          this.damageObject(candidate, Math.max(1, numberParam(params, "damage", 1)));
          countHit();
        }
      }
      return true;
    };

    for (let index = 0; index < substeps; index += 1) {
      const stepX = object.vx * substepDt;
      object.x += stepX;
      collide("x", stepX);
      const stepY = object.vy * substepDt;
      object.y += stepY;
      collide("y", stepY);

      if (object.x + halfW < 0 && stringParam(params, "missLeftVariable", "")) {
        this.missBall(object, params, "left", directionKey, stateKey, waitKey, hitsKey);
        return;
      }
      if (object.x - halfW > this.scene.size.w && stringParam(params, "missRightVariable", "")) {
        this.missBall(object, params, "right", directionKey, stateKey, waitKey, hitsKey);
        return;
      }
      if (object.y + halfH > this.scene.size.h && stringParam(params, "missBottomVariable", "")) {
        this.missBall(object, params, "bottom", directionKey, stateKey, waitKey, hitsKey);
        return;
      }
      if (object.x - halfW < 0) {
        object.x = halfW;
        object.vx = Math.abs(object.vx);
      } else if (object.x + halfW > this.scene.size.w) {
        object.x = this.scene.size.w - halfW;
        object.vx = -Math.abs(object.vx);
      }
      if (object.y - halfH < 0) {
        object.y = halfH;
        object.vy = Math.abs(object.vy);
      } else if (object.y + halfH > this.scene.size.h) {
        object.y = this.scene.size.h - halfH;
        object.vy = -Math.abs(object.vy);
      }
    }
  }

  private serveBall(object: RuntimeObject, behaviorId: string, initialDirection: string, directionKey: string): void {
    const params = behaviorOf(object.source, "ball")?.params ?? {};
    const speed = Math.max(1, numberParam(params, "speed", 390));
    const direction = object.behaviorTimers[directionKey] ?? 0;
    const horizontal = direction !== 0 || initialDirection === "left" || initialDirection === "right";
    const serveDirection = direction !== 0 ? direction : initialDirection === "left" ? -1 : initialDirection === "right" ? 1 : 0;
    const sign = serveDirection || (this.random() < 0.5 ? -1 : 1);
    const angleRange = Math.min(65, Math.max(0, numberParam(params, "bounceAngle", 58))) * Math.PI / 180 * 0.35;
    const angle = (this.random() * 2 - 1) * angleRange;
    if (horizontal) {
      object.vx = sign * speed * Math.cos(angle);
      object.vy = speed * Math.sin(angle);
    } else {
      const vertical = initialDirection === "down" ? 1 : -1;
      object.vx = sign * speed * Math.sin(angle);
      object.vy = vertical * speed * Math.cos(angle);
    }
    object.behaviorTimers[`${behaviorId}:state`] = 2;
    object.behaviorTimers[`${behaviorId}:wait`] = 0;
    const size = bodyDims(object.source);
    if (!stringParam(params, "attachToTag", "")) {
      object.x = this.scene.size.w / 2;
      object.y = this.scene.size.h / 2;
    } else {
      object.y = Math.max(size.h / 2, Math.min(this.scene.size.h - size.h / 2, object.y));
    }
    this.event("serve", `${object.source.name} served`, object.source.id);
  }

  private missBall(
    object: RuntimeObject,
    params: Record<string, unknown>,
    side: "left" | "right" | "bottom",
    directionKey: string,
    stateKey: string,
    waitKey: string,
    hitsKey: string,
  ): void {
    const variable = stringParam(params, `miss${side[0]!.toUpperCase()}${side.slice(1)}Variable`, "");
    if (variable) this.setVariable(variable, "add", numberParam(params, "missAmount", 1));
    if (side === "left") object.behaviorTimers[directionKey] = 1;
    else if (side === "right") object.behaviorTimers[directionKey] = -1;
    else object.behaviorTimers[directionKey] = 0;
    object.behaviorTimers[stateKey] = 1;
    object.behaviorTimers[waitKey] = 0;
    object.behaviorTimers[hitsKey] = 0;
    object.vx = 0;
    object.vy = 0;
    if (!stringParam(params, "attachToTag", "")) {
      object.x = this.scene.size.w / 2;
      object.y = this.scene.size.h / 2;
    }
    this.event("miss", `${object.source.name} missed at the ${side}`, object.source.id);
  }

  private updateFlap(object: RuntimeObject, input: InputFrame): void {
    const behavior = behaviorOf(object.source, "flap");
    if (!behavior) return;
    const params = behavior.params;
    const trigger = stringParam(params, "trigger", "jump");
    const flap =
      (trigger === "jump" && input.jumpPressed) ||
      (trigger === "action" && input.actionPressed) ||
      (trigger === "any" && (input.jumpPressed || input.actionPressed));
    if (flap) {
      object.vy = -Math.max(0, numberParam(params, "impulse", 320));
      this.event("flap", `${object.source.name} flapped`, object.source.id);
    }
    if (boolParam(params, "lockX", true)) {
      object.x = object.spawnX;
      object.vx = 0;
    }
    const gravityScale = Math.max(0, numberParam(params, "gravityScale", 1));
    const maxFallSpeed = Math.max(0, numberParam(params, "maxFallSpeed", 560));
    object.vy = Math.min(maxFallSpeed, object.vy + this.document.settings.gravity.y * gravityScale * FIXED_DT);

    const dims = bodyDims(object.source);
    const halfW = dims.w / 2;
    const halfH = dims.h / 2;
    const nextX = object.x + object.vx * FIXED_DT;
    const nextY = object.y + object.vy * FIXED_DT;
    const nextBox = {
      left: nextX - halfW,
      right: nextX + halfW,
      top: nextY - halfH,
      bottom: nextY + halfH,
    };
    const hazardTags = tagList(stringParam(params, "hazardTags", "hazard,pipe,ground"));
    const hitHazard = this.objects.some((candidate) => {
      if (!candidate.active || candidate === object || !hazardTags.some((tag) => candidate.source.tags.includes(tag))) return false;
      const box = boxOf(candidate);
      return nextBox.left < box.right && nextBox.right > box.left && nextBox.top < box.bottom && nextBox.bottom > box.top;
    });
    const ceiling = numberParam(params, "ceiling", 0);
    const floor = numberParam(params, "floor", this.scene.size.h);
    const hitBounds = nextBox.top <= ceiling || nextBox.bottom >= floor;
    if ((hitHazard || hitBounds) && this.variables[stringParam(params, "loseVariable", "lost")] !== true) {
      this.setVariable(stringParam(params, "loseVariable", "lost"), "set", true);
    }
  }

  private updateRotateThrust(object: RuntimeObject, input: InputFrame): void {
    const behavior = behaviorOf(object.source, "rotate-thrust");
    if (!behavior) return;
    const params = behavior.params;
    const turn = (Number(input.right) - Number(input.left)) * numberParam(params, "turnSpeed", 210);
    object.rotation = (object.rotation + turn * FIXED_DT + 360) % 360;
    if (input.jump) {
      const radians = (object.rotation * Math.PI) / 180;
      const thrust = numberParam(params, "thrust", 360) * FIXED_DT;
      object.vx += Math.sin(radians) * thrust;
      object.vy -= Math.cos(radians) * thrust;
    }
    const drag = Math.max(0, numberParam(params, "drag", 0.35));
    const dragScale = Math.max(0, 1 - drag * FIXED_DT);
    object.vx *= dragScale;
    object.vy *= dragScale;
    const maxSpeed = Math.max(0, numberParam(params, "maxSpeed", 420));
    const speed = Math.hypot(object.vx, object.vy);
    if (speed > maxSpeed && speed > 0) {
      object.vx = (object.vx / speed) * maxSpeed;
      object.vy = (object.vy / speed) * maxSpeed;
    }
    object.x += object.vx * FIXED_DT;
    object.y += object.vy * FIXED_DT;
    if (boolParam(params, "wrap", true)) {
      const dims = bodyDims(object.source);
      if (object.x < -dims.w / 2) object.x = this.scene.size.w + dims.w / 2;
      else if (object.x > this.scene.size.w + dims.w / 2) object.x = -dims.w / 2;
      if (object.y < -dims.h / 2) object.y = this.scene.size.h + dims.h / 2;
      else if (object.y > this.scene.size.h + dims.h / 2) object.y = -dims.h / 2;
    }
  }

  private updateFormations(): void {
    const groups = new Map<string, { members: RuntimeObject[]; config: RuntimeObject }>();
    for (const object of this.objects) {
      if (!object.active) continue;
      const behavior = behaviorOf(object.source, "formation");
      if (!behavior) continue;
      const groupId = stringParam(behavior.params, "groupId", "default");
      const groupTag = stringParam(behavior.params, "groupTag", "");
      const members = groupTag
        ? this.objects.filter((candidate) => candidate.active && candidate.source.tags.includes(groupTag))
        : this.objects.filter((candidate) => {
            const candidateBehavior = behaviorOf(candidate.source, "formation");
            return candidate.active && candidateBehavior && stringParam(candidateBehavior.params, "groupId", "default") === groupId;
          });
      if (members.length > 0 && !groups.has(groupId)) groups.set(groupId, { members, config: object });
    }

    for (const [groupId, group] of groups) {
      const members = group.members;
      const behavior = behaviorOf(group.config.source, "formation")!;
      const params = behavior.params;
      const margin = Math.max(0, numberParam(params, "edgeMargin", 40));
      const left = Math.min(...members.map((object) => object.x - bodyDims(object.source).w / 2));
      const right = Math.max(...members.map((object) => object.x + bodyDims(object.source).w / 2));
      let direction = this.formationDirections.get(groupId) ?? 1;
      const speed = numberParam(params, "speed", 70);
      const nextLeft = left + direction * speed * FIXED_DT;
      const nextRight = right + direction * speed * FIXED_DT;
      if ((direction > 0 && nextRight > this.scene.size.w - margin) || (direction < 0 && nextLeft < margin)) {
        direction *= -1;
        this.formationDirections.set(groupId, direction);
        const drop = Math.max(0, numberParam(params, "dropDistance", 24));
        for (const member of members) member.y += drop;
      } else {
        this.formationDirections.set(groupId, direction);
      }
      const deltaX = direction * speed * FIXED_DT;
      for (const member of members) member.x += deltaX;

      const breachY = numberParam(params, "breachY", this.scene.size.h);
      const breachVariable = stringParam(params, "breachVariable", "");
      if (breachVariable && members.some((member) => member.y + bodyDims(member.source).h / 2 >= breachY)) {
        this.setVariable(breachVariable, "set", true);
      }
    }
  }

  private behaviorTimer(object: RuntimeObject, behaviorId: string, deltaMs: number): number {
    const next = (object.behaviorTimers[behaviorId] ?? 0) + deltaMs;
    object.behaviorTimers[behaviorId] = next;
    return next;
  }

  private updateMover(object: RuntimeObject, deltaMs: number): void {
    for (const mover of behaviorsOf(object.source, "mover")) {
      const params = mover.params;
      const timer = this.behaviorTimer(object, mover.id, deltaMs);
      const lifetimeMs = numberParam(params, "lifetimeMs", 0);
      if (lifetimeMs > 0 && timer >= lifetimeMs) {
        object.active = false;
        continue;
      }
      object.x += numberParam(params, "vx", 0) * FIXED_DT;
      object.y += numberParam(params, "vy", 0) * FIXED_DT;
      const spin = numberParam(params, "spin", 0);
      if (spin !== 0) object.rotation = (object.rotation + spin * FIXED_DT) % 360;

      const passX = params.passX;
      const passVariable = stringParam(params, "passVariable", "");
      if (typeof passX === "number" && passVariable && !object.behaviorTimers[`${mover.id}:passed`]) {
        const previousX = object.x - numberParam(params, "vx", 0) * FIXED_DT;
        if (previousX > passX && object.x <= passX) {
          object.behaviorTimers[`${mover.id}:passed`] = 1;
          this.setVariable(passVariable, "add", numberParam(params, "passAmount", 1));
        }
      }

      const dims = bodyDims(object.source);
      if (boolParam(params, "wrap", false)) {
        const margin = 24;
        if (object.x < -dims.w / 2 - margin) object.x = this.scene.size.w + dims.w / 2;
        else if (object.x > this.scene.size.w + dims.w / 2 + margin) object.x = -dims.w / 2;
        if (object.y < -dims.h / 2 - margin) object.y = this.scene.size.h + dims.h / 2;
        else if (object.y > this.scene.size.h + dims.h / 2 + margin) object.y = -dims.h / 2;
      } else if (boolParam(params, "destroyOffscreen", true)) {
        const margin = 120;
        if (
          object.x < -dims.w - margin ||
          object.x > this.scene.size.w + dims.w + margin ||
          object.y < -dims.h - margin ||
          object.y > this.scene.size.h + dims.h + margin
        ) {
          object.active = false;
        }
      }
    }
  }

  private updateProjectile(object: RuntimeObject, deltaMs: number): void {
    for (const projectile of behaviorsOf(object.source, "projectile")) {
      const params = projectile.params;
      const timer = this.behaviorTimer(object, projectile.id, deltaMs);
      if (object.vx === 0 && object.vy === 0) {
        const speed = numberParam(params, "speed", 640);
        const direction = stringParam(params, "direction", "up");
        const aim = direction === "aim" ? (object.rotation * Math.PI) / 180 : undefined;
        object.vx = aim !== undefined ? Math.sin(aim) * speed : direction === "left" ? -speed : direction === "right" ? speed : 0;
        object.vy = aim !== undefined ? -Math.cos(aim) * speed : direction === "up" ? -speed : direction === "down" ? speed : 0;
      }
      object.x += object.vx * FIXED_DT;
      object.y += object.vy * FIXED_DT;
      const lifetimeMs = numberParam(params, "lifetimeMs", 0);
      if (lifetimeMs > 0 && timer >= lifetimeMs) object.active = false;
      const dims = bodyDims(object.source);
      if (
        object.x < -dims.w - 120 ||
        object.x > this.scene.size.w + dims.w + 120 ||
        object.y < -dims.h - 120 ||
        object.y > this.scene.size.h + dims.h + 120
      ) {
        object.active = false;
      }
    }
  }

  private updateShooter(object: RuntimeObject, input: InputFrame, deltaMs: number): void {
    for (const shooter of behaviorsOf(object.source, "shooter")) {
      const params = shooter.params;
      const timer = this.behaviorTimer(object, shooter.id, deltaMs);
      const cooldown = Math.max(16, numberParam(params, "cooldownMs", 250));
      if (timer < cooldown) continue;
      const trigger = stringParam(params, "trigger", "jump");
      let wants = false;
      if (trigger === "jump") wants = input.jump || input.jumpPressed;
      else if (trigger === "action") wants = input.action || input.actionPressed;
      else if (trigger === "any") wants = input.jump || input.jumpPressed || input.action || input.actionPressed;
      else if (trigger === "auto") wants = this.random() <= Math.max(0, Math.min(1, numberParam(params, "chance", 1)));
      if (!wants) continue;
      const prefabId = stringParam(params, "prefabId", "");
      if (!prefabId) continue;
      const maxAlive = Math.max(0, Math.round(numberParam(params, "maxAlive", 0)));
      if (maxAlive > 0) {
        const alive = this.objects.filter((candidate) => candidate.active && candidate.source.prefabId === prefabId).length;
        if (alive >= maxAlive) continue;
      }
      object.behaviorTimers[shooter.id] = 0;
      const speed = numberParam(params, "speed", 640);
      const direction = stringParam(params, "direction", "up");
      const aim = direction === "aim" ? (object.rotation * Math.PI) / 180 : undefined;
      const vx = aim !== undefined ? Math.sin(aim) * speed : direction === "left" ? -speed : direction === "right" ? speed : 0;
      const vy = aim !== undefined ? -Math.cos(aim) * speed : direction === "up" ? -speed : direction === "down" ? speed : 0;
      const spawned = this.spawnPrefab(
        prefabId,
        object.x + (aim !== undefined ? Math.sin(aim) * Math.hypot(numberParam(params, "offsetX", 0), numberParam(params, "offsetY", 0)) : numberParam(params, "offsetX", 0)),
        object.y + (aim !== undefined ? -Math.cos(aim) * Math.hypot(numberParam(params, "offsetX", 0), numberParam(params, "offsetY", 0)) : numberParam(params, "offsetY", 0)),
      );
      for (const bullet of spawned) {
        if (bullet.source.prefabSlot !== "root") continue;
        bullet.vx = vx;
        bullet.vy = vy;
        bullet.rotation = aim !== undefined ? object.rotation : vy < 0 ? 0 : vy > 0 ? 180 : vx < 0 ? -90 : 90;
      }
      this.event("shoot", `${object.source.name} fired`, object.source.id);
    }
  }

  private updateSpawner(object: RuntimeObject): void {
    for (const spawner of behaviorsOf(object.source, "spawner")) {
      const params = spawner.params;
      if (this.elapsed * 1000 < numberParam(params, "startDelayMs", 0)) continue;
      const interval = Math.max(16, numberParam(params, "intervalMs", 1000));
      const timer = (object.behaviorTimers[spawner.id] ?? 0) + FIXED_DT * 1000;
      if (timer < interval) {
        object.behaviorTimers[spawner.id] = timer;
        continue;
      }
      object.behaviorTimers[spawner.id] = 0;
      const prefabId = stringParam(params, "prefabId", "");
      if (!prefabId) continue;
      const limit = Math.max(1, Math.round(numberParam(params, "limit", 20)));
      const alive = this.objects.filter((candidate) => candidate.active && candidate.source.prefabId === prefabId).length;
      if (alive >= limit) continue;
      const minX = numberParam(params, "minX", 0);
      const maxX = numberParam(params, "maxX", this.scene.size.w);
      const minY = numberParam(params, "minY", 0);
      const maxY = numberParam(params, "maxY", 0);
      const x = minX + this.random() * Math.max(0, maxX - minX);
      const y = minY + this.random() * Math.max(0, maxY - minY);
      this.spawnPrefab(prefabId, x, y);
    }
  }

  private updateCountdown(object: RuntimeObject): void {
    for (const countdown of behaviorsOf(object.source, "countdown")) {
      const params = countdown.params;
      const durationMs = Math.max(0, numberParam(params, "durationMs", 60000));
      const variable = stringParam(params, "variable", "timeLeft");
      const remaining = Math.max(0, durationMs - this.elapsed * 1000);
      const value = Math.ceil(remaining / 1000);
      if (this.variables[variable] !== value) this.setVariable(variable, "set", value);
    }
  }

  private checkProjectileHits(): void {
    for (const bullet of this.objects) {
      if (!bullet.active) continue;
      const projectile = behaviorOf(bullet.source, "projectile");
      if (!projectile) continue;
      const targetTags = tagList(stringParam(projectile.params, "targetTags", ""));
      if (targetTags.length === 0) continue;
      const damage = numberParam(projectile.params, "damage", 1);
      const target = this.objects.find(
        (candidate) =>
          candidate.active &&
          candidate !== bullet &&
          candidate.hp !== undefined &&
          targetTags.some((tag) => candidate.source.tags.includes(tag)) &&
          overlaps(bullet, candidate),
      );
      if (!target) continue;
      this.damageObject(target, damage);
      if (boolParam(projectile.params, "destroyOnHit", true)) bullet.active = false;
    }
  }

  private checkDamageContacts(): void {
    for (const object of this.objects) {
      if (!object.active || object.hp === undefined || object.hp <= 0 || object.invulnMs > 0) continue;
      const health = behaviorOf(object.source, "health");
      if (!health) continue;
      const damageTags = tagList(stringParam(health.params, "damageTags", ""));
      if (damageTags.length === 0) continue;
      const source = this.objects.find(
        (candidate) =>
          candidate.active &&
          candidate !== object &&
          damageTags.some((tag) => candidate.source.tags.includes(tag)) &&
          overlaps(object, candidate),
      );
      if (!source) continue;
      this.damageObject(object, numberParam(health.params, "contactDamage", 1));
    }
  }

  private damageObject(object: RuntimeObject, amount: number): void {
    const health = behaviorOf(object.source, "health");
    if (!health || amount <= 0) return;
    object.hp = Math.max(0, (object.hp ?? numberParam(health.params, "max", 1)) - amount);
    object.invulnMs = Math.max(0, numberParam(health.params, "invulnMs", 0));
    const variable = stringParam(health.params, "variable", "");
    if (variable) this.variables[variable] = object.hp;
    this.event("damage", `${object.source.name} took ${amount} damage (${object.hp} left)`, object.source.id);
    if (object.hp > 0) return;
    this.event("death", `${object.source.name} destroyed`, object.source.id);
    const scoreVariable = stringParam(health.params, "scoreVariable", "");
    if (scoreVariable) this.setVariable(scoreVariable, "add", numberParam(health.params, "scoreOnDeath", 0));
    const deathVariable = stringParam(health.params, "deathVariable", "");
    if (deathVariable) this.setVariable(deathVariable, "add", numberParam(health.params, "deathAmount", -1));
    if (boolParam(health.params, "respawnOnHit", false) && deathVariable && Number(this.variables[deathVariable]) > 0) {
      object.active = true;
      object.hp = Math.max(1, numberParam(health.params, "max", 1));
      object.x = object.spawnX;
      object.y = object.spawnY;
      object.vx = 0;
      object.vy = 0;
      object.invulnMs = Math.max(0, numberParam(health.params, "invulnMs", 0));
      if (variable) this.variables[variable] = object.hp;
      this.event("respawn", `${object.source.name} respawned`, object.source.id);
      return;
    }
    object.active = false;
    const deathPrefabId = stringParam(health.params, "deathPrefabId", "");
    if (deathPrefabId) {
      const count = Math.max(1, Math.round(numberParam(health.params, "deathSpawnCount", 1)));
      if (deathVariable) this.setVariable(deathVariable, "add", count);
      for (let index = 0; index < count; index += 1) {
        const spread = numberParam(health.params, "spawnSpread", 0);
        const offsetX = spread > 0 ? (this.random() - 0.5) * spread : 0;
        const offsetY = spread > 0 ? (this.random() - 0.5) * spread : 0;
        this.spawnPrefab(deathPrefabId, object.x + offsetX, object.y + offsetY);
      }
    }
  }

  private pruneInactiveSpawned(): void {
    if (this.frame % 120 !== 0 || this.objects.length < 400) return;
    this.objects = this.objects.filter((object) => object.active || !object.source.prefabInstanceId);
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
      if (!hasBehavior(object.source, "rotate-thrust")) object.rotation = object.source.transform.rotation;
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

  private spawnPrefab(prefabId: string, x: number, y: number): RuntimeObject[] {
    const prefab = this.document.prefabs.find((candidate) => candidate.id === prefabId);
    if (!prefab) return [];
    const sources = [prefab.root, ...prefab.objects];
    const ids = new Map<string, string>();
    const instanceId = `pinst_${this.frame}_${this.objects.length}`;
    const dx = x - prefab.root.transform.x;
    const dy = y - prefab.root.transform.y;
    const created: RuntimeObject[] = [];
    for (const source of sources) {
      const clone = structuredClone(source);
      clone.id = `obj_${this.frame}_${this.objects.length}_${ids.size}`;
      ids.set(source.id, clone.id);
      clone.transform = { ...clone.transform, x: clone.transform.x + dx, y: clone.transform.y + dy };
      clone.prefabId = prefab.id;
      clone.prefabInstanceId = instanceId;
      clone.prefabSlot = source.id === prefab.root.id ? "root" : `obj:${prefab.objects.indexOf(source)}`;
      const health = behaviorOf(clone, "health");
      const maxHealth = health ? Math.max(1, numberParam(health.params, "max", 1)) : undefined;
      const runtimeObject: RuntimeObject = {
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
        behaviorTimers: {},
        hp: maxHealth,
        invulnMs: 0,
        animationKey: "",
        animationTime: 0,
        animationFrame: undefined,
      };
      this.objects.push(runtimeObject);
      created.push(runtimeObject);
    }
    for (const object of this.objects) {
      if (object.source.prefabInstanceId !== instanceId || !object.source.parentId) continue;
      object.source.parentId = ids.get(object.source.parentId) ?? undefined;
      if (!object.source.parentId) delete object.source.parentId;
    }
    this.event("spawn", `${prefab.name} spawned`);
    return created;
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
