import type { GameTestProfile, ProfileControl } from "../model/game-test-profile";
import type { ProjectDocument } from "../model/schema";
import {
  KANE_CHECK_LIMITS,
  stepButtonLabel,
  type KaneCheckRequest,
  type KaneCheckStepSpec,
} from "../../../shared/kane-check";
import { TestController, type TestAdvanceResult } from "./test-controller";
import { observationValue } from "./test-observations";

/**
 * One planned step, executed the same way by the Test Mode button Kane clicks
 * and by the headless rehearsal: real InputFrames through the real Runtime.
 * Hold controls stay down for `frames`; pulse controls are pressed once and
 * the game then runs `frames`.
 */
export function runCheckStep(controller: TestController, profile: GameTestProfile, step: KaneCheckStepSpec): TestAdvanceResult {
  startCheckStep(controller, profile, step);
  return controller.advance(step.frames);
}

/**
 * Presses the step's controls without advancing. The browser then calls
 * `controller.advance(1)` once per animation frame so the step plays visibly;
 * the frame-by-frame result is identical to `advance(step.frames)`.
 */
export function startCheckStep(controller: TestController, profile: GameTestProfile, step: KaneCheckStepSpec): void {
  const control = profile.controls.find((candidate) => candidate.id === step.control);
  if (control) {
    controller.enqueue({
      controlId: control.id,
      action: control.action,
      mode: control.mode,
      frames: control.mode === "hold" ? step.frames : 1,
    });
  }
  for (const extraId of step.with ?? []) {
    const extra = profile.controls.find((candidate) => candidate.id === extraId);
    if (extra && extra.id !== control?.id) controller.enqueue({ controlId: extra.id, action: extra.action, mode: "pulse", frames: 1 });
  }
}

function controlLabel(profile: GameTestProfile, id: string): string {
  if (id === "wait") return "WAIT";
  return profile.controls.find((control) => control.id === id)?.label ?? id.toUpperCase();
}

export function stepLabels(profile: GameTestProfile, steps: KaneCheckStepSpec[]): string[] {
  return steps.map((step, index) => stepButtonLabel(index, controlLabel(profile, step.control), step.frames, (step.with ?? []).map((id) => controlLabel(profile, id))));
}

/** What the model may ask for. Values are compared after the steps run. */
export interface CheckExpectation {
  readout: string;
  equals?: string | number | boolean;
  atLeast?: number;
  atMost?: number;
  /** true: must differ from frame zero; false: must stay the same. */
  changed?: boolean;
}

export interface CheckSpec {
  title: string;
  steps: KaneCheckStepSpec[];
  expect: CheckExpectation[];
}

export interface ExpectationResult {
  readout: string;
  label: string;
  rule: string;
  before: string;
  after: string;
  passed: boolean;
}

export interface Rehearsal {
  passed: boolean;
  expectations: ExpectationResult[];
  /** Every readout after the steps, for the agent's diagnosis. */
  readouts: Record<string, string>;
  lastError: string | null;
  status: string;
  acceptedInputs: number;
  framesAdvanced: number;
}

const asText = (value: unknown) => (value === null || value === undefined ? "none" : String(value));

/** Normalizes and validates tool arguments against the project's profile. */
export function parseCheckSpec(input: Record<string, unknown>, profile: GameTestProfile): { ok: true; spec: CheckSpec } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const controlIds = new Set(profile.controls.map((control) => control.id));
  const pulseIds = new Set(profile.controls.filter((control) => control.mode === "pulse").map((control) => control.id));
  const readoutIds = new Set(profile.observations.map((observation) => observation.id));
  const title = String(input.title ?? input.objective ?? "").trim().slice(0, 200) || "Kane check";
  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  const rawExpect = Array.isArray(input.expect) ? input.expect : [];

  if (rawSteps.length > KANE_CHECK_LIMITS.maxSteps) errors.push(`Use at most ${KANE_CHECK_LIMITS.maxSteps} steps.`);
  const steps: KaneCheckStepSpec[] = [];
  let total = 0;
  rawSteps.slice(0, KANE_CHECK_LIMITS.maxSteps).forEach((raw: any, index) => {
    const control = typeof raw?.control === "string" ? raw.control.trim() : "";
    if (control !== "wait" && !controlIds.has(control)) errors.push(`steps[${index}].control "${control}" is not a control. Use one of: ${[...controlIds, "wait"].join(", ")}.`);
    const frames = Math.trunc(Number(raw?.frames));
    if (!Number.isFinite(frames) || frames < 1 || frames > KANE_CHECK_LIMITS.maxFramesPerStep) errors.push(`steps[${index}].frames must be 1-${KANE_CHECK_LIMITS.maxFramesPerStep} (60 frames = 1 second).`);
    const extra = Array.isArray(raw?.with) ? raw.with.filter((id: unknown): id is string => typeof id === "string") : [];
    for (const id of extra) if (!pulseIds.has(id)) errors.push(`steps[${index}].with "${id}" must be a press control: ${[...pulseIds].join(", ")}.`);
    total += Number.isFinite(frames) ? frames : 0;
    steps.push({ control, frames, ...(extra.length ? { with: extra.slice(0, 2) } : {}) });
  });
  if (total > KANE_CHECK_LIMITS.maxTotalFrames) errors.push(`Total frames must be at most ${KANE_CHECK_LIMITS.maxTotalFrames}.`);

  if (rawExpect.length < 1) errors.push("expect needs at least one readout check, e.g. {\"readout\":\"score\",\"equals\":1}.");
  if (rawExpect.length > KANE_CHECK_LIMITS.maxReadouts) errors.push(`Use at most ${KANE_CHECK_LIMITS.maxReadouts} expectations.`);
  const expect: CheckExpectation[] = [];
  rawExpect.slice(0, KANE_CHECK_LIMITS.maxReadouts).forEach((raw: any, index) => {
    const readout = typeof raw?.readout === "string" ? raw.readout.trim() : "";
    if (!readoutIds.has(readout)) {
      errors.push(`expect[${index}].readout "${readout}" is not a readout. Use one of: ${[...readoutIds].join(", ")}.`);
      return;
    }
    const entry: CheckExpectation = { readout };
    if (raw.equals !== undefined && raw.equals !== null) entry.equals = raw.equals;
    if (Number.isFinite(Number(raw.atLeast)) && raw.atLeast !== null && raw.atLeast !== undefined) entry.atLeast = Number(raw.atLeast);
    if (Number.isFinite(Number(raw.atMost)) && raw.atMost !== null && raw.atMost !== undefined) entry.atMost = Number(raw.atMost);
    if (typeof raw.changed === "boolean") entry.changed = raw.changed;
    if (entry.equals === undefined && entry.atLeast === undefined && entry.atMost === undefined && entry.changed === undefined) {
      errors.push(`expect[${index}] needs equals, atLeast, atMost or changed.`);
      return;
    }
    expect.push(entry);
  });
  return errors.length ? { ok: false, errors } : { ok: true, spec: { title, steps, expect } };
}

function ruleText(expectation: CheckExpectation): string {
  const parts: string[] = [];
  if (expectation.equals !== undefined) parts.push(`= ${String(expectation.equals)}`);
  if (expectation.atLeast !== undefined) parts.push(`>= ${expectation.atLeast}`);
  if (expectation.atMost !== undefined) parts.push(`<= ${expectation.atMost}`);
  if (expectation.changed !== undefined) parts.push(expectation.changed ? "changes" : "stays the same");
  return parts.join(" and ");
}

function evaluate(expectation: CheckExpectation, before: string, after: string): boolean {
  if (expectation.equals !== undefined && after.toLowerCase() !== String(expectation.equals).toLowerCase()) return false;
  const numeric = Number(after);
  if (expectation.atLeast !== undefined && !(Number.isFinite(numeric) && numeric >= expectation.atLeast)) return false;
  if (expectation.atMost !== undefined && !(Number.isFinite(numeric) && numeric <= expectation.atMost)) return false;
  if (expectation.changed !== undefined && (before !== after) !== expectation.changed) return false;
  return true;
}

/** Runs the check in the same deterministic Test Mode runtime the browser uses. Free and instant. */
export function rehearseCheck(
  document: ProjectDocument,
  profile: GameTestProfile,
  spec: CheckSpec,
  options: { seed?: number; sceneId?: string } = {},
): Rehearsal {
  const controller = new TestController(document, { seed: options.seed ?? 1234, sceneId: options.sceneId ?? document.startSceneId });
  const read = () => {
    const values: Record<string, string> = {};
    for (const observation of profile.observations) values[observation.id] = asText(observationValue(controller, observation));
    return values;
  };
  const before = read();
  for (const step of spec.steps) {
    if (controller.status !== "running") break;
    runCheckStep(controller, profile, step);
  }
  const after = read();
  const labels = new Map(profile.observations.map((observation) => [observation.id, observation.label]));
  const expectations = spec.expect.map((expectation) => {
    const prior = before[expectation.readout] ?? "none";
    const now = after[expectation.readout] ?? "none";
    return { readout: expectation.readout, label: labels.get(expectation.readout) ?? expectation.readout, rule: ruleText(expectation), before: prior, after: now, passed: evaluate(expectation, prior, now) };
  });
  const lastError = controller.runtime.lastError ?? null;
  return {
    passed: expectations.every((expectation) => expectation.passed) && !lastError,
    expectations,
    readouts: after,
    lastError,
    status: controller.status,
    acceptedInputs: controller.receipts.filter((receipt) => receipt.accepted && receipt.pressFrame !== undefined).length,
    framesAdvanced: controller.framesAdvanced,
  };
}

/** The request the server needs; expected values are the rehearsal's exact readings. */
export function compileCheck(profile: GameTestProfile, spec: CheckSpec, rehearsal: Rehearsal): KaneCheckRequest {
  const seen = new Set<string>();
  const readouts = spec.expect
    .filter((expectation) => !seen.has(expectation.readout) && seen.add(expectation.readout))
    .map((expectation) => ({
      id: expectation.readout,
      label: profile.observations.find((observation) => observation.id === expectation.readout)?.label ?? expectation.readout.toUpperCase(),
      expected: rehearsal.readouts[expectation.readout] ?? "none",
    }));
  return { title: spec.title, steps: spec.steps, stepLabels: stepLabels(profile, spec.steps), readouts };
}

export function controlSummary(profile: GameTestProfile): Array<Pick<ProfileControl, "id" | "label" | "mode">> {
  return profile.controls.map(({ id, label, mode }) => ({ id, label, mode }));
}
