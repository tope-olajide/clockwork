import { z } from "zod";
import type { ProjectDocument } from "./schema";
import type { GameTestProfile } from "./game-test-profile";
import { getGameTestScenario, validateScenarioSetup } from "./game-test-scenarios";

/**
 * Hard ceilings for a bounded Kane test session. The planner may ask for less;
 * it can never ask for more, and the server re-checks every value.
 */
export const TEST_PLAN_LIMITS = {
  maxPhases: 3,
  maxStepsPerPhase: 8,
  maxWallTimeSecondsPerPhase: 140,
  maxFramesPerAdvance: 600,
  maxFramesPerPhase: 3600,
  maxAssertionsPerPhase: 12,
  maxUserGoalChars: 1000,
} as const;

export const ASSERTION_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "increased"] as const;
export const STOP_CONDITIONS = ["passed", "failed", "lost", "won", "budget-exhausted"] as const;

/** Blocks code and remote fetches in model-authored prose, not ordinary words. */
const UNSAFE_TEXT = /(javascript:|data:text\/html|<script|https?:\/\/)/i;

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, digits and dashes");

const textSchema = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !UNSAFE_TEXT.test(value), "must not contain URLs, code or markup");

export const testAssertionSchema = z.strictObject({
  id: idSchema,
  observationId: idSchema,
  operator: z.enum(ASSERTION_OPERATORS),
  expected: z.union([textSchema(500), z.number().finite(), z.boolean()]),
});

export const testPhaseSchema = z.strictObject({
  id: idSchema,
  /** Profile objective this phase is working toward, when it has one. */
  objectiveId: idSchema.optional(),
  purpose: textSchema(200),
  kaneObjective: textSchema(400),
  allowedControlIds: z.array(idSchema).min(1).max(12),
  assertions: z.array(testAssertionSchema).min(1).max(TEST_PLAN_LIMITS.maxAssertionsPerPhase),
  stopWhen: z.array(z.enum(STOP_CONDITIONS)).min(1).max(STOP_CONDITIONS.length),
});

export const testPlanBudgetSchema = z.strictObject({
  maxKanePhases: z.number().int().min(1).max(TEST_PLAN_LIMITS.maxPhases),
  maxKaneStepsPerPhase: z.number().int().min(1).max(TEST_PLAN_LIMITS.maxStepsPerPhase),
  maxWallTimeSecondsPerPhase: z.number().int().min(30).max(TEST_PLAN_LIMITS.maxWallTimeSecondsPerPhase),
  maxFramesPerAdvance: z.number().int().min(1).max(TEST_PLAN_LIMITS.maxFramesPerAdvance),
  maxFramesPerPhase: z.number().int().min(1).max(TEST_PLAN_LIMITS.maxFramesPerPhase),
});

export const testPlanSchema = z.strictObject({
  version: z.literal(1),
  sessionId: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64),
  sourceRevision: z.number().int().nonnegative(),
  snapshotId: z.string().min(1).max(64),
  sceneId: z.string().min(1).max(64),
  seed: z.number().int().nonnegative(),
  /** The immutable root instruction; later phases may narrow it, never replace it. */
  userGoal: textSchema(TEST_PLAN_LIMITS.maxUserGoalChars),
  scenarioId: idSchema.optional(),
  phases: z.array(testPhaseSchema).min(1).max(TEST_PLAN_LIMITS.maxPhases),
  budget: testPlanBudgetSchema,
});

export type TestPlan = z.infer<typeof testPlanSchema>;
export type TestPlanPhase = z.infer<typeof testPhaseSchema>;
export type TestPlanAssertion = z.infer<typeof testAssertionSchema>;
export type TestPlanBudget = z.infer<typeof testPlanBudgetSchema>;

export type TestPlanValidation =
  | { ok: true; plan: TestPlan }
  | { ok: false; errors: string[] };

export interface TestPlanContext {
  document: ProjectDocument;
  profile: GameTestProfile;
}

/**
 * Validates a proposed plan structurally, then against the profile, the project
 * document and the server budget. A rejected plan is rejected explicitly: accept
 * only what the current profile can actually express.
 */
export function validateTestPlan(input: unknown, context: TestPlanContext): TestPlanValidation {
  const parsed = testPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(plan)"}: ${issue.message}`),
    };
  }
  const plan = parsed.data;
  const { document, profile } = context;
  const errors: string[] = [];
  const fail = (path: string, message: string) => errors.push(`${path}: ${message}`);

  if (plan.projectId !== document.id) {
    fail("projectId", `plan is for project "${plan.projectId}" but the open document is "${document.id}"`);
  }
  if (plan.sourceRevision !== document.revision) {
    fail("sourceRevision", `plan targets revision ${plan.sourceRevision} but the document is at ${document.revision}`);
  }
  if (!document.scenes.some((scene) => scene.id === plan.sceneId)) {
    fail("sceneId", `scene "${plan.sceneId}" does not exist`);
  }
  if (plan.phases.length > plan.budget.maxKanePhases) {
    fail("budget.maxKanePhases", `plan has ${plan.phases.length} phases but its budget allows ${plan.budget.maxKanePhases}`);
  }
  if (plan.budget.maxFramesPerAdvance > plan.budget.maxFramesPerPhase) {
    fail("budget.maxFramesPerAdvance", "cannot exceed budget.maxFramesPerPhase");
  }

  const controls = new Map(profile.controls.map((control) => [control.id, control]));
  const observations = new Map(profile.observations.map((observation) => [observation.id, observation]));
  const objectives = new Map(profile.objectives.map((objective) => [objective.id, objective]));

  const phaseIds = new Set<string>();
  const assertionIds = new Set<string>();
  for (const [index, phase] of plan.phases.entries()) {
    const path = `phases[${index}]`;
    if (phaseIds.has(phase.id)) fail(`${path}.id`, `duplicate phase id "${phase.id}"`);
    phaseIds.add(phase.id);

    if (new Set(phase.allowedControlIds).size !== phase.allowedControlIds.length) {
      fail(`${path}.allowedControlIds`, "lists the same control more than once");
    }
    for (const controlId of phase.allowedControlIds) {
      if (!controls.has(controlId)) {
        fail(`${path}.allowedControlIds`, `unknown control "${controlId}" for profile "${document.templateOrigin}"`);
      }
    }
    if (phase.stopWhen.length !== new Set(phase.stopWhen).size) {
      fail(`${path}.stopWhen`, "lists the same condition more than once");
    }
    const objective = phase.objectiveId ? objectives.get(phase.objectiveId) : undefined;
    if (phase.objectiveId && !objective) {
      fail(`${path}.objectiveId`, `unknown objective "${phase.objectiveId}"`);
    }

    for (const [assertionIndex, assertion] of phase.assertions.entries()) {
      const assertionPath = `${path}.assertions[${assertionIndex}]`;
      if (assertionIds.has(assertion.id)) fail(`${assertionPath}.id`, `duplicate assertion id "${assertion.id}"`);
      assertionIds.add(assertion.id);

      const observation = observations.get(assertion.observationId);
      if (!observation) {
        fail(`${assertionPath}.observationId`, `unknown observation "${assertion.observationId}"`);
      } else if (assertion.operator === "increased") {
        if (typeof assertion.expected !== "number") {
          fail(`${assertionPath}.expected`, `"increased" needs a numeric expected amount`);
        } else if (assertion.expected <= 0) {
          fail(`${assertionPath}.expected`, `"increased" needs a positive expected amount`);
        }
      } else if (assertion.operator === "gt" || assertion.operator === "gte" || assertion.operator === "lt" || assertion.operator === "lte") {
        const numericSource = observation?.source === "variable" || observation?.source === "player"
          || observation?.source === "event-count" || observation?.source === "tag-count";
        if (!numericSource) {
          fail(`${assertionPath}.operator`, `"${assertion.operator}" needs a numeric observation, not "${observation?.source}"`);
        }
      }
    }

    // A phase that names an objective must assert every criterion it claims.
    if (objective) {
      const covered = new Set(phase.assertions.map((assertion) => assertion.id));
      for (const required of objective.assertionIds) {
        if (!covered.has(required)) {
          fail(`${path}.assertions`, `objective "${objective.id}" requires assertion "${required}"`);
        }
      }
    }
  }

  if (plan.scenarioId !== undefined) {
    if (!profile.scenarioIds.includes(plan.scenarioId)) {
      fail("scenarioId", `scenario "${plan.scenarioId}" is not allowed by profile "${document.templateOrigin}"`);
    } else {
      const scenario = getGameTestScenario(plan.scenarioId);
      if (!scenario) {
        fail("scenarioId", `scenario "${plan.scenarioId}" is not registered`);
      } else if (scenario.templateOrigin !== document.templateOrigin) {
        fail("scenarioId", `scenario "${plan.scenarioId}" belongs to template "${scenario.templateOrigin}"`);
      } else {
        for (const error of validateScenarioSetup(scenario, document, plan.sceneId)) fail("scenarioId", error);
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, plan };
}
