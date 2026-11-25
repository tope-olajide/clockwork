import type { AiPlayResult } from "./protocol/kane";

/**
 * A compiled Kane check: what the browser agent clicks and what it must read.
 *
 * The chat agent never writes Kane prose. It names controls and readouts from
 * the project's Test Mode profile; the client compiles that into this shape
 * (after a free simulator rehearsal), and the server turns it into a fixed
 * store-then-assert objective and judges Kane's stored values itself.
 */

export const KANE_CHECK_LIMITS = {
  maxSteps: 6,
  maxReadouts: 6,
  maxFramesPerStep: 600,
  maxTotalFrames: 3600,
} as const;

export interface KaneCheckStepSpec {
  /** Control id from the profile, or "wait" to only advance frames. */
  control: string;
  frames: number;
  /** Pulse controls pressed at the start of the step (e.g. jump while running). */
  with?: string[];
}

export interface KaneCheckReadout {
  /** Readout id in the profile. */
  id: string;
  /** Label shown in the Test Mode OBSERVATIONS panel. */
  label: string;
  /** Exact value the simulator produced with the same inputs. */
  expected: string;
}

/** Body of POST /api/kane/qa when the run is a structured check. */
export interface KaneCheckRequest {
  title: string;
  steps: KaneCheckStepSpec[];
  /** Button label per step, as rendered by the snapshot player. */
  stepLabels: string[];
  readouts: KaneCheckReadout[];
}

export interface KaneCheckOutcome {
  id: string;
  label: string;
  expected: string;
  /** Value Kane stored from the page, or null when it stored nothing. */
  actual: string | null;
  passed: boolean;
}

const LABEL = /^[A-Z0-9 _:+-]{1,64}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VALUE = /^[A-Za-z0-9 ._:-]{0,64}$/;

/** Label of the one-click button that runs a planned step in Test Mode. */
export function stepButtonLabel(index: number, controlLabel: string, frames: number, withLabels: string[] = []): string {
  const extra = withLabels.length ? ` + ${withLabels.join(" + ")}` : "";
  return `RUN STEP ${index + 1}: ${controlLabel}${extra} ${frames} FRAMES`;
}

/** Compact URL form: `move-right:90:jump|action,wait:30`. */
export function encodeCheckSteps(steps: KaneCheckStepSpec[]): string {
  return steps.map((step) => [step.control, String(step.frames), ...(step.with?.length ? [step.with.join("|")] : [])].join(":")).join(",");
}

export function decodeCheckSteps(value: string | null): KaneCheckStepSpec[] {
  if (!value || !/^[a-z0-9:,|-]{1,400}$/.test(value)) return [];
  const steps: KaneCheckStepSpec[] = [];
  for (const part of value.split(",").slice(0, KANE_CHECK_LIMITS.maxSteps)) {
    const [control, frames, extra] = part.split(":");
    const count = Math.trunc(Number(frames));
    if (!control || !ID.test(control) || !Number.isFinite(count) || count < 1) return [];
    steps.push({
      control,
      frames: Math.min(KANE_CHECK_LIMITS.maxFramesPerStep, count),
      ...(extra ? { with: extra.split("|").filter((id) => ID.test(id)) } : {}),
    });
  }
  return steps;
}

/**
 * The key Kane is asked to store a readout under. Derived from the visible
 * label ("COLLECTED" -> "collected"), because Kane names stored values after
 * what it reads on the page: asking for the internal id ("collect_events")
 * made it store "collected" and the judge miss a value Kane had read.
 */
export function storeKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "value";
}

/** Keys the judge accepts for one readout: the label-based key and the id-based one. */
function storeKeysFor(readout: KaneCheckReadout): string[] {
  return [...new Set([storeKey(readout.label), readout.id.replace(/-/g, "_")])];
}

export function validateCheckRequest(input: unknown): { ok: true; check: KaneCheckRequest } | { ok: false; error: string } {
  const body = input as Partial<KaneCheckRequest> | null;
  if (!body || typeof body !== "object") return { ok: false, error: "check must be an object" };
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return { ok: false, error: "check.title is required" };
  const steps = Array.isArray(body.steps) ? body.steps : [];
  const stepLabels = Array.isArray(body.stepLabels) ? body.stepLabels : [];
  const readouts = Array.isArray(body.readouts) ? body.readouts : [];
  if (steps.length > KANE_CHECK_LIMITS.maxSteps) return { ok: false, error: `at most ${KANE_CHECK_LIMITS.maxSteps} steps` };
  if (steps.length !== stepLabels.length) return { ok: false, error: "every step needs a button label" };
  if (readouts.length < 1 || readouts.length > KANE_CHECK_LIMITS.maxReadouts) {
    return { ok: false, error: `between 1 and ${KANE_CHECK_LIMITS.maxReadouts} readouts` };
  }
  let total = 0;
  for (const [index, step] of steps.entries()) {
    if (!step || typeof step.control !== "string" || !ID.test(step.control)) return { ok: false, error: `steps[${index}].control is invalid` };
    const frames = Math.trunc(Number(step.frames));
    if (!Number.isFinite(frames) || frames < 1 || frames > KANE_CHECK_LIMITS.maxFramesPerStep) {
      return { ok: false, error: `steps[${index}].frames must be 1-${KANE_CHECK_LIMITS.maxFramesPerStep}` };
    }
    total += frames;
    if (step.with !== undefined && (!Array.isArray(step.with) || step.with.some((id) => typeof id !== "string" || !ID.test(id)))) {
      return { ok: false, error: `steps[${index}].with is invalid` };
    }
    if (typeof stepLabels[index] !== "string" || !LABEL.test(stepLabels[index]!)) return { ok: false, error: `stepLabels[${index}] is invalid` };
  }
  if (total > KANE_CHECK_LIMITS.maxTotalFrames) return { ok: false, error: `total frames must be at most ${KANE_CHECK_LIMITS.maxTotalFrames}` };
  for (const [index, readout] of readouts.entries()) {
    if (!readout || typeof readout.id !== "string" || !ID.test(readout.id)) return { ok: false, error: `readouts[${index}].id is invalid` };
    if (typeof readout.label !== "string" || !LABEL.test(readout.label)) return { ok: false, error: `readouts[${index}].label is invalid` };
    if (typeof readout.expected !== "string" || !VALUE.test(readout.expected)) return { ok: false, error: `readouts[${index}].expected is invalid` };
  }
  return {
    ok: true,
    check: {
      title,
      steps: steps.map((step) => ({ control: step.control, frames: Math.trunc(Number(step.frames)), ...(step.with?.length ? { with: step.with } : {}) })),
      stepLabels: stepLabels as string[],
      readouts: readouts.map((readout) => ({ id: readout.id, label: readout.label, expected: readout.expected })),
    },
  };
}

/**
 * The fixed objective Kane runs. One click per step, then store-then-assert
 * against labels in the OBSERVATIONS panel: the shape Kane finishes fastest.
 */
export function composeCheckObjective(check: KaneCheckRequest): string {
  const total = check.stepLabels.length;
  const lines = [
    "This page is Clockwork Kane Test Mode. The game is paused and only moves when you click a RUN STEP button in the CHECK STEPS panel. Click each RUN STEP button exactly once, in order. Do not click Restart.",
  ];
  check.stepLabels.forEach((label, index) => {
    const seconds = Math.ceil((check.steps[index]?.frames ?? 60) / 60) + 2;
    const done = index === total - 1 ? `ALL ${total} STEP${total === 1 ? "" : "S"} DONE` : `STEP ${index + 1} DONE`;
    lines.push(`Click the button "${label}" once, then wait ${seconds} seconds until the text "CHECK STATUS: ${done}" is shown.`);
  });
  const stores = [
    ...check.readouts.map((readout) => `store the value next to "${readout.label}" in the OBSERVATIONS panel as '${storeKey(readout.label)}'`),
    `store the LAST ERROR value as 'last_error'`,
  ];
  lines.push(`${stores.join(", ")}.`.replace(/^s/, "S"));
  const asserts = [
    ...check.readouts.map((readout) => `the stored ${storeKey(readout.label)} is "${readout.expected}"`),
    `the stored last_error is "none"`,
  ];
  lines.push(`Assert ${asserts.join(" and ")}.`);
  return lines.join("\n");
}

const normalize = (value: unknown) => String(value ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase();

/**
 * Joins Kane's stored values to the expected readouts. A check passes only when
 * Kane itself reported `passed` *and* every stored value matches; Kane's prose
 * verdict alone is never enough.
 */
export function judgeCheck(result: AiPlayResult, check: KaneCheckRequest): { status: AiPlayResult["status"]; outcomes: KaneCheckOutcome[]; reason: string } {
  const state = result.finalState ?? {};
  const outcomes: KaneCheckOutcome[] = check.readouts.map((readout) => {
    const raw = storeKeysFor(readout).map((key) => state[key]).find((value) => value !== undefined);
    const actual = raw === undefined ? null : String(raw);
    return { id: readout.id, label: readout.label, expected: readout.expected, actual, passed: actual !== null && normalize(actual) === normalize(readout.expected) };
  });
  if (result.status !== "passed") {
    return { status: result.status, outcomes, reason: result.status === "failed" ? "Kane reported a failed assertion." : "Kane did not reach a verdict." };
  }
  const missing = outcomes.filter((outcome) => outcome.actual === null);
  const wrong = outcomes.filter((outcome) => outcome.actual !== null && !outcome.passed);
  if (wrong.length) return { status: "failed", outcomes, reason: `Kane read ${wrong.map((o) => `${o.label}=${o.actual} (expected ${o.expected})`).join(", ")}.` };
  if (missing.length) {
    // Kane passed its own assertions but did not persist the value; the pass
    // cannot be confirmed independently.
    return { status: "error", outcomes, reason: `Kane passed but did not store ${missing.map((o) => o.label).join(", ")}, so the result cannot be confirmed.` };
  }
  return { status: "passed", outcomes, reason: "Every readout matched in the browser." };
}
