import type { AiPlayResult } from "@shared/protocol/kane";
import type { KaneCheckRequest } from "@shared/kane-check";
import type { GameTestProfile } from "../../engine/model/game-test-profile";
import type { ProjectDocument } from "../../engine/model/schema";
import { compileCheck, parseCheckSpec, rehearseCheck, type CheckSpec, type Rehearsal } from "../../engine/runtime/kane-check-runner";

/**
 * verify_with_kane orchestration: validate → free simulator rehearsal → one
 * paid Kane run → a typed verdict with a deterministic next step.
 *
 * The budget is what stops retry loops: per user message the agent gets at
 * most `maxKaneRuns` browser runs and `maxRehearsals` simulator runs, and an
 * identical check at the same revision is answered from cache, never re-run.
 */

export const KANE_TURN_LIMITS = { maxKaneRuns: 2, maxRehearsals: 6 } as const;

export class KaneTurnBudget {
  kaneRuns = 0;
  rehearsals = 0;
  private readonly seen = new Map<string, KaneCheckPayload>();

  get kaneRunsLeft(): number {
    return Math.max(0, KANE_TURN_LIMITS.maxKaneRuns - this.kaneRuns);
  }

  cached(fingerprint: string): KaneCheckPayload | undefined {
    return this.seen.get(fingerprint);
  }

  remember(fingerprint: string, payload: KaneCheckPayload): void {
    this.seen.set(fingerprint, payload);
  }
}

export interface KaneCheckRow {
  readout: string;
  label: string;
  rule: string;
  start: string;
  simulator: string;
  /** What Kane read in the browser; absent when Kane did not run. */
  browser?: string | null;
  passed: boolean;
}

export interface KaneCheckPayload {
  stage: "simulator" | "kane";
  status: "passed" | "failed" | "error" | "cancelled" | "not-run";
  title: string;
  checks: KaneCheckRow[];
  simulator: { passed: boolean; status: string; lastError: string | null; acceptedInputs: number; frames: number; readouts: Record<string, string> };
  kane?: {
    runId: string;
    status: AiPlayResult["status"];
    kaneStatus?: AiPlayResult["status"];
    reason?: string;
    summary: string;
    durationMs: number;
    evidenceUrl?: string;
    testUrl?: string;
    steps: AiPlayResult["steps"];
  };
  snapshotId?: string;
  /** What the agent must do next. Deterministic, so it cannot talk itself into a loop. */
  nextStep: string;
  runsLeftThisTurn: number;
  repeat?: boolean;
}

export type KaneCheckOutcome =
  | { ok: true; payload: KaneCheckPayload }
  | { ok: false; error: string; code: "invalid-check" | "kane-budget" | "kane-unavailable"; nextStep: string };

export interface KaneCheckDeps {
  document: ProjectDocument;
  profile: GameTestProfile;
  budget: KaneTurnBudget;
  sceneId?: string;
  seed?: number;
  /** Null when Kane cannot run; the reason is returned to the agent. */
  kaneUnavailable?: string | null;
  onStage?: (message: string) => void;
  runKane: (check: KaneCheckRequest, sceneId: string | undefined) => Promise<AiPlayResult & { snapshotId?: string }>;
}

function fingerprintOf(spec: CheckSpec, revision: number, sceneId: string | undefined): string {
  return JSON.stringify({ revision, sceneId: sceneId ?? null, steps: spec.steps, expect: spec.expect });
}

function rows(rehearsal: Rehearsal, browser?: Map<string, string | null>): KaneCheckRow[] {
  return rehearsal.expectations.map((expectation) => {
    const seen = browser?.get(expectation.readout);
    return {
      readout: expectation.readout,
      label: expectation.label,
      rule: expectation.rule,
      start: expectation.before,
      simulator: expectation.after,
      ...(browser ? { browser: seen ?? null } : {}),
      passed: expectation.passed && (browser ? seen !== undefined && seen !== null && seen.toLowerCase() === expectation.after.toLowerCase() : true),
    };
  });
}

function simulatorSummary(rehearsal: Rehearsal): KaneCheckPayload["simulator"] {
  return {
    passed: rehearsal.passed,
    status: rehearsal.status,
    lastError: rehearsal.lastError,
    acceptedInputs: rehearsal.acceptedInputs,
    frames: rehearsal.framesAdvanced,
    readouts: rehearsal.readouts,
  };
}

export async function runKaneCheck(callArgs: Record<string, unknown>, deps: KaneCheckDeps): Promise<KaneCheckOutcome> {
  const parsed = parseCheckSpec(callArgs, deps.profile);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "invalid-check",
      error: parsed.errors.join(" "),
      nextStep: "Fix the listed fields using ids from context.kane.testMode, then call verify_with_kane once more.",
    };
  }
  const spec = parsed.spec;
  const sceneId = deps.sceneId && deps.document.scenes.some((scene) => scene.id === deps.sceneId) ? deps.sceneId : undefined;
  const fingerprint = fingerprintOf(spec, deps.document.revision, sceneId);
  const previous = deps.budget.cached(fingerprint);
  if (previous) {
    return {
      ok: true,
      payload: {
        ...previous,
        repeat: true,
        runsLeftThisTurn: deps.budget.kaneRunsLeft,
        nextStep: "This exact check already ran at this revision; nothing was re-run. Report the result above. Only change the game or the check if you have a concrete reason it will now differ.",
      },
    };
  }
  if (deps.budget.rehearsals >= KANE_TURN_LIMITS.maxRehearsals) {
    return {
      ok: false,
      code: "kane-budget",
      error: `The simulator limit for this message (${KANE_TURN_LIMITS.maxRehearsals} checks) is used.`,
      nextStep: "Stop testing. Tell the user what passed, what failed with the observed values, and what you would change next.",
    };
  }

  deps.onStage?.("Rehearsing in the engine simulator");
  deps.budget.rehearsals += 1;
  const rehearsal = rehearseCheck(deps.document, deps.profile, spec, { seed: deps.seed ?? 1234, sceneId });
  const simulator = simulatorSummary(rehearsal);

  if (!rehearsal.passed) {
    const failed = rehearsal.expectations.filter((expectation) => !expectation.passed);
    const detail = failed.map((expectation) => `${expectation.label} was ${expectation.before} at the start and ${expectation.after} after the steps (wanted ${expectation.rule})`).join("; ");
    const payload: KaneCheckPayload = {
      stage: "simulator",
      status: "failed",
      title: spec.title,
      checks: rows(rehearsal),
      simulator,
      nextStep: [
        rehearsal.lastError ? `The game raised a runtime error: ${rehearsal.lastError}.` : "",
        detail ? `${detail}.` : "",
        "Kane was not run because the engine itself does not produce this result.",
        rehearsal.acceptedInputs === 0 && spec.steps.length ? "No input reached the game: check the control id." : "",
        collectDiagnosis(deps.profile, rehearsal, failed),
        "Either fix the game (apply_commands) and verify again, or adjust the check if it asked for the wrong thing (more frames, add a jump). If you cannot see why, stop and report these values.",
      ].filter(Boolean).join(" "),
      runsLeftThisTurn: deps.budget.kaneRunsLeft,
    };
    deps.budget.remember(fingerprint, payload);
    return { ok: true, payload };
  }

  if (deps.kaneUnavailable) {
    return {
      ok: false,
      code: "kane-unavailable",
      error: `The simulator passed (${rows(rehearsal).map((row) => `${row.label}=${row.simulator}`).join(", ")}), but Kane cannot run: ${deps.kaneUnavailable}`,
      nextStep: "Report the simulator pass and that browser verification is unavailable. Do not call Kane tools again this message.",
    };
  }
  if (deps.budget.kaneRuns >= KANE_TURN_LIMITS.maxKaneRuns) {
    return {
      ok: false,
      code: "kane-budget",
      error: `The simulator passed, but this message already used its ${KANE_TURN_LIMITS.maxKaneRuns} Kane runs.`,
      nextStep: "Stop. Report the simulator pass and the earlier Kane results; the user can ask for another browser run.",
    };
  }

  const compiled = compileCheck(deps.profile, spec, rehearsal);
  deps.budget.kaneRuns += 1;
  deps.onStage?.("Starting Kane in a real browser");
  let result: AiPlayResult & { snapshotId?: string };
  try {
    result = await deps.runKane(compiled, sceneId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kane run failed.";
    const payload: KaneCheckPayload = {
      stage: "kane",
      status: "error",
      title: spec.title,
      checks: rows(rehearsal),
      simulator,
      nextStep: `Kane could not run (${message}). The simulator passed, so the game logic works. Do not retry; report this to the user.`,
      runsLeftThisTurn: deps.budget.kaneRunsLeft,
    };
    deps.budget.remember(fingerprint, payload);
    return { ok: true, payload };
  }

  const browser = new Map<string, string | null>((result.check?.outcomes ?? []).map((outcome) => [outcome.id, outcome.actual]));
  const status = result.status;
  const nextStep = status === "passed"
    ? "Verified in a real browser. Report each check with its start and final value and the evidence link. Do not run Kane again for this."
    : status === "failed"
      ? `The simulator produced the expected values but Kane's browser run did not (${result.check?.reason ?? result.summary}). Because the engine logic works, this points at browser input or reading. Report both sets of values and the evidence link. Do not retry with the same check.`
      : `Kane did not reach a verdict (${result.check?.reason ?? result.summary}). The simulator passed. This is an infrastructure problem, not a game bug. Report it; do not retry automatically.`;
  const payload: KaneCheckPayload = {
    stage: "kane",
    status,
    title: spec.title,
    checks: rows(rehearsal, browser),
    simulator,
    kane: {
      runId: result.runId,
      status,
      ...(result.check ? { kaneStatus: result.check.kaneStatus, reason: result.check.reason } : {}),
      summary: result.summary,
      durationMs: result.durationMs,
      ...(result.evidenceUrl ? { evidenceUrl: result.evidenceUrl } : {}),
      ...(result.testUrl ? { testUrl: result.testUrl } : {}),
      steps: result.steps.filter((step) => step.status !== "running").slice(-8),
    },
    ...(result.snapshotId ? { snapshotId: result.snapshotId } : {}),
    nextStep,
    runsLeftThisTurn: deps.budget.kaneRunsLeft,
  };
  deps.budget.remember(fingerprint, payload);
  return { ok: true, payload };
}

/**
 * Points at the two common causes when a collectible check fails: the player
 * never touched anything (moved too little), or something was collected but it
 * added to a different variable than the one asserted.
 */
function collectDiagnosis(profile: GameTestProfile, rehearsal: Rehearsal, failed: Rehearsal["expectations"]): string {
  const collected = Number(rehearsal.readouts["collect-events"] ?? 0);
  const failedVariables = failed.filter((expectation) =>
    profile.observations.some((observation) => observation.id === expectation.readout && observation.source === "variable"));
  if (!failedVariables.length) return "";
  const playerX = rehearsal.readouts["player-x"];
  if (collected === 0) {
    return `Nothing was collected (COLLECTED stayed 0${playerX ? `; PLAYER X ended at ${playerX}` : ""}): the player may not reach the item in these frames, or the item has no collectible behaviour.`;
  }
  return `COLLECTED rose to ${collected} but ${failedVariables.map((expectation) => expectation.label).join(", ")} did not change: the collectible behaviour adds to a different variable. Set its params.variable to the variable you assert (it defaults to "coins").`;
}

/** The no-LLM smoke check behind the Test with Kane button. */
export function smokeCheckArgs(profile: GameTestProfile): Record<string, unknown> {
  const hasPlayerX = profile.observations.some((observation) => observation.id === "player-x");
  const move = profile.controls.find((control) => control.id === "move-right") ?? profile.controls.find((control) => control.mode === "hold");
  return {
    title: "Smoke check: the game loads and responds to input",
    steps: move ? [{ control: move.id, frames: 60 }] : [{ control: "wait", frames: 60 }],
    expect: hasPlayerX && move ? [{ readout: "player-x", changed: true }] : [{ readout: "status", equals: "PAUSED" }],
  };
}
