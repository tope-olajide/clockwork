import { z } from "zod";
import { INPUT_ACTIONS, type ProjectDocument, type TemplateOrigin } from "./schema";
import { getGameTestScenario } from "./game-test-scenarios";
import { BUILT_IN_PROFILES } from "./game-test-profiles";

/**
 * Versioned, read-only test vocabulary for a template.
 *
 * Profiles are a normalized registry keyed by `templateOrigin`, not part of
 * `ProjectDocument`: imported and hand-edited projects stay valid without a
 * migration, and a profile can never drift per project revision. They describe
 * what a browser agent may press and observe; they carry no gameplay.
 */
export const GAME_TEST_PROFILE_VERSION = 1 as const;

/** Read-only player projections a profile may observe. */
export const PLAYER_OBSERVATION_FIELDS = [
  "x",
  "y",
  "rotation",
  "vx",
  "vy",
  "grounded",
  "active",
  "hp",
] as const;

/** Runtime event types the engine emits today; `RuntimeEvent.type` is a free string. */
export const RUNTIME_EVENT_TYPES = [
  "start",
  "spawn",
  "shoot",
  "damage",
  "death",
  "collect",
  "respawn",
  "checkpoint",
  "jump",
  "double-jump",
  "melee",
  "serve",
  "miss",
  "flap",
  "timer",
  "variable",
  "rule",
  "rule-blocked",
  "error",
  "log",
] as const;

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, digits and dashes");

export const controlModeSchema = z.enum(["hold", "pulse"]);

export const profileControlSchema = z.strictObject({
  id: idSchema,
  label: z.string().min(1).max(24),
  /** A profile relabels an existing logical action; it cannot invent one. */
  action: z.enum(INPUT_ACTIONS),
  mode: controlModeSchema,
  description: z.string().min(1).max(200),
});

export const observationSourceSchema = z.enum([
  "status",
  "variable",
  "player",
  "event-count",
  "tag-count",
]);

export const profileObservationSchema = z
  .strictObject({
    id: idSchema,
    label: z.string().min(1).max(32),
    source: observationSourceSchema,
    key: z.string().min(1).max(80).optional(),
  })
  .superRefine((observation, ctx) => {
    if (observation.source === "status") {
      if (observation.key !== undefined) {
        ctx.addIssue({ code: "custom", message: "status observations must not declare a key", path: ["key"] });
      }
      return;
    }
    if (observation.key === undefined) {
      ctx.addIssue({ code: "custom", message: `${observation.source} observations need a key`, path: ["key"] });
      return;
    }
    if (observation.source === "player" && !(PLAYER_OBSERVATION_FIELDS as readonly string[]).includes(observation.key)) {
      ctx.addIssue({
        code: "custom",
        message: `unknown player field "${observation.key}"; allowed: ${PLAYER_OBSERVATION_FIELDS.join(", ")}`,
        path: ["key"],
      });
    }
    if (observation.source === "event-count" && !(RUNTIME_EVENT_TYPES as readonly string[]).includes(observation.key)) {
      ctx.addIssue({
        code: "custom",
        message: `unknown runtime event "${observation.key}"; allowed: ${RUNTIME_EVENT_TYPES.join(", ")}`,
        path: ["key"],
      });
    }
  });

export const profileObjectiveSchema = z.strictObject({
  id: idSchema,
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(240),
  /** Criterion ids a plan must cover when it runs this objective. */
  assertionIds: z.array(idSchema).min(1).max(12),
});

export const gameTestProfileSchema = z
  .strictObject({
    version: z.literal(GAME_TEST_PROFILE_VERSION),
    controls: z.array(profileControlSchema).min(1).max(12),
    observations: z.array(profileObservationSchema).min(1).max(24),
    objectives: z.array(profileObjectiveSchema).min(1).max(8),
    scenarioIds: z.array(idSchema).max(8),
  })
  .superRefine((profile, ctx) => {
    const seen = new Set<string>();
    const check = (kind: string, ids: string[]) => {
      for (const id of ids) {
        if (seen.has(id)) {
          ctx.addIssue({ code: "custom", message: `duplicate ${kind} id "${id}"` });
        }
        seen.add(id);
      }
    };
    check("control", profile.controls.map((control) => control.id));
    check("observation", profile.observations.map((observation) => observation.id));
    check("objective", profile.objectives.map((objective) => objective.id));

    const actions = new Set<string>();
    for (const control of profile.controls) {
      if (actions.has(control.action)) {
        ctx.addIssue({
          code: "custom",
          message: `action "${control.action}" is mapped by more than one control`,
        });
      }
      actions.add(control.action);
    }
  });

export type GameTestProfile = z.infer<typeof gameTestProfileSchema>;
export type ProfileControl = z.infer<typeof profileControlSchema>;
export type ProfileObservation = z.infer<typeof profileObservationSchema>;
export type ProfileObjective = z.infer<typeof profileObjectiveSchema>;

export function getGameTestProfile(origin: TemplateOrigin): GameTestProfile | undefined {
  return BUILT_IN_PROFILES[origin];
}

export function gameTestProfileForDocument(document: ProjectDocument): GameTestProfile | undefined {
  return getGameTestProfile(document.templateOrigin);
}

export function profileScenarios(profile: GameTestProfile) {
  return profile.scenarioIds
    .map((id) => getGameTestScenario(id))
    .filter((scenario): scenario is NonNullable<typeof scenario> => scenario !== undefined);
}

function documentTags(document: ProjectDocument): Set<string> {
  const tags = new Set<string>();
  for (const scene of document.scenes) {
    for (const object of scene.objects) for (const tag of object.tags) tags.add(tag);
  }
  for (const prefab of document.prefabs) {
    for (const object of [prefab.root, ...prefab.objects]) for (const tag of object.tags) tags.add(tag);
  }
  return tags;
}

export type ProfileValidation =
  | { ok: true; profile: GameTestProfile }
  | { ok: false; errors: string[] };

/**
 * Structural validation plus, when a document is supplied, reference validation:
 * every variable, tag, event and player field an observation names must exist.
 */
export function validateGameTestProfile(
  input: unknown,
  context: { document?: ProjectDocument } = {},
): ProfileValidation {
  const parsed = gameTestProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(profile)"}: ${issue.message}`),
    };
  }
  const profile = parsed.data;
  const errors: string[] = [];

  for (const scenarioId of profile.scenarioIds) {
    const scenario = getGameTestScenario(scenarioId);
    if (!scenario) {
      errors.push(`scenarioIds: "${scenarioId}" is not a registered scenario`);
      continue;
    }
    if (context.document && scenario.templateOrigin !== context.document.templateOrigin) {
      errors.push(
        `scenarioIds: "${scenarioId}" belongs to template "${scenario.templateOrigin}", not "${context.document.templateOrigin}"`,
      );
    }
  }

  const document = context.document;
  if (document) {
    const variables = new Set(document.variables.map((variable) => variable.name));
    const tags = documentTags(document);
    for (const observation of profile.observations) {
      if (observation.source === "variable" && observation.key && !variables.has(observation.key)) {
        errors.push(`observations.${observation.id}: variable "${observation.key}" does not exist in this project`);
      }
      if (observation.source === "tag-count" && observation.key && !tags.has(observation.key)) {
        errors.push(`observations.${observation.id}: no object or prefab carries tag "${observation.key}"`);
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, profile };
}
