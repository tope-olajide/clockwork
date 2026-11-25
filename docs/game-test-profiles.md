# Game-test profiles and plans

Phase 1 of the AI testing plan gives the built-in agent a safe, versioned vocabulary
for what a browser agent may press, observe and assert in a game. Gameplay is
untouched: a profile is metadata, not logic.

## Where profiles live

- `src/engine/model/game-test-profile.ts` — Zod schema and the registry keyed by
  `templateOrigin`.
- `src/engine/model/game-test-profiles.ts` — the 13 built-in profiles.
- `src/engine/model/derived-test-profile.ts` — the profile derived from the project
  itself for every game without a built-in one.
- `src/engine/model/game-test-scenarios.ts` — code-registered derived setups.
- `src/engine/model/game-test-plan.ts` — the bounded `TestPlan` schema and validator.

Profiles are **not** part of `ProjectDocument`. A document without a profile still
parses, imports and round-trips at `schemaVersion: 1`, and a profile cannot drift
per project copy. The agent reads the active profile through the read-only
`get_game_test_profile` tool.

## `GameTestProfile` v1

```ts
interface GameTestProfile {
  version: 1;
  controls: Array<{ id; label; action: InputAction; mode: "hold" | "pulse"; description }>;
  observations: Array<{ id; label; source; key? }>;
  objectives: Array<{ id; title; description; assertionIds }>;
  scenarioIds: string[];
}
```

Rules enforced by `validateGameTestProfile`:

- `action` must be one of the six existing logical actions and may be used by only
  one control; a profile can relabel an action ("jump" as **SHOOT**), never invent one.
- `source` is one of `status`, `variable`, `player`, `event-count`, `tag-count`.
  `status` takes no key. `player` keys are limited to
  `x y rotation vx vy grounded active hp`; `event-count` keys come from the engine's
  known event types.
- With a document supplied, every `variable` key must exist in `document.variables`
  and every `tag-count` key must be carried by an object or prefab.
- Ids are unique across controls, observations and objectives.
- Every `scenarioId` must be registered and belong to the same template.

## Built-in profiles

There are 13 built-in profiles: every genre starter except Meadow Sandbox. Each names
only the actions its authored behaviors actually read, plus observations that exist in
that starter's document.

| Starter | Controls (action, mode) | Representative objectives |
|---|---|---|
| `space-shooter` | MOVE LEFT/RIGHT (`left`/`right`, hold), SHOOT (`jump`, hold) | input→projectile, shot→enemy+score, survive |
| `space-invaders` | MOVE LEFT/RIGHT, FIRE (`jump`, hold) | fire→bolt, destroy invader+score, hold the line |
| `asteroid-field` | TURN LEFT/RIGHT, THRUST (`jump`, hold), FIRE (`action`, hold) | fire→shot, destroy rock+score, survive |
| `ping-pong` | MOVE UP/DOWN (`up`/`down`, hold) | score a point, paddle follows input |
| `brick-breaker` | MOVE LEFT/RIGHT, SERVE (`jump`, hold) | serve→ball, break brick+score, board loses bricks |
| `flappy-flyer` | FLAP (`jump`, pulse) | flap registers, pass gate→score, survive flight |
| `platform-jumper` | MOVE LEFT/RIGHT, JUMP (`jump`) | jump registers, collect core, keep health |
| `meadow-run` (Clockwork Meadows) | MOVE LEFT/RIGHT (`left`/`right`, hold), JUMP (`jump`, pulse) | jump registers, collect shard→score, stomp dragon |
| `endless-runner` | JUMP (`jump`), DUCK (`down`, hold) | jump registers, collect core, survive run |
| `arena-survival` | MOVE LEFT/RIGHT/UP/DOWN, ATTACK (`action`) | attack connects, moves right, survive wave |
| `falling-objects` | MOVE LEFT/RIGHT | catch bonus, dodge meteor, moves right |
| `maze-escape` | MOVE LEFT/RIGHT/UP/DOWN | collect dot, open exit, moves right |
| `snake` | TURN LEFT/RIGHT/UP/DOWN (all pulse) | head moves right, eat→score+length, stay alive |

### Derived profiles

Any other game gets a profile derived from the project itself
(`gameTestProfileForDocument` falls back to `deriveGameTestProfile`), so every game has
a Test Mode. That covers Meadow Sandbox, the classic templates (Platformer, Top-down,
Puzzle), Blank and user projects. The derived profile offers MOVE LEFT/RIGHT/UP/DOWN,
JUMP and ACTION, and exposes status, player X/Y, every variable (up to 10), up to 6
object-tag counts and the event counts COLLECTED, DESTROYED, DAMAGE EVENTS and SHOTS
FIRED. Meadow Sandbox deliberately has no built-in profile, so readouts for a score or
coins added later appear automatically.

Each profile records the underlying variable/tag/event for every observation, so a
criterion can be traced to real runtime state rather than to pixels. Space Shooter is
the only profile with a registered scenario (`shooting-range`); the other starters'
criteria are reachable from their authored starting scene.

Mode is a runtime fact, not a preference. Cooldown-gated actions (all three shooters'
fire and Brick Breaker's serve) are declared as **hold** because the runtime only fires
after 190–400 ms, while a Test Mode pulse lasts at most 6 frames. Ping Pong has no
serve control at all: its ball auto-serves. `tests/game-test-lockstep.test.ts` drives
every control family through `TestController` to keep these declarations honest.

## Scenarios

A scenario may only add prefab instances at fixed positions — never write variables,
health, score, status or existing transforms — so it cannot manufacture an outcome.

| Id | Template | Setup |
|---|---|---|
| `shooting-range` | `space-shooter` | one `pfb_shooter_enemy` at (640, 150) |

`validateScenarioSetup` re-checks the prefab and every spawn point against the real
document and scene bounds.

## `TestPlan` v1

`validateTestPlan(plan, { document, profile })` rejects a plan with explicit errors
when:

- the plan targets another project or a stale `sourceRevision`, or names a missing scene;
- a phase lists an unknown control or observation, or repeats a control/stop condition;
- assertion ids or phase ids collide;
- `increased` has a non-numeric or non-positive expected amount, or `gt`/`gte`/`lt`/`lte`
  is applied to a non-numeric observation;
- a phase claims a profile objective without asserting all of its `assertionIds`;
- the scenario is unregistered, belongs to another template, or has an invalid setup;
- any text field contains a URL, `javascript:` or markup;
- the budget exceeds the hard caps (`maxKanePhases` 3, `maxKaneStepsPerPhase` 12,
  `maxWallTimeSecondsPerPhase` 600, `maxFramesPerAdvance` 600, `maxFramesPerPhase` 3600),
  phases exceed `maxKanePhases`, or `maxFramesPerAdvance > maxFramesPerPhase`;
- the object carries unknown keys (strict schemas) — nothing executable rides along.

Example accepted plan:

```json
{
  "version": 1,
  "sessionId": "session-fixture",
  "projectId": "prj_example",
  "sourceRevision": 1,
  "snapshotId": "snapshot-fixture",
  "sceneId": "scn_example",
  "seed": 1234,
  "userGoal": "Check that shooting works and enemies can be destroyed.",
  "scenarioId": "shooting-range",
  "phases": [
    {
      "id": "input-projectile",
      "objectiveId": "shoot-destroys-enemy",
      "purpose": "An accepted SHOOT pulse creates a projectile that destroys the target.",
      "kaneObjective": "Click SHOOT once, advance the frame batch, then read the AI state panel.",
      "allowedControlIds": ["shoot", "move-right"],
      "assertions": [
        { "id": "projectiles-increased", "observationId": "projectiles", "operator": "increased", "expected": 1 },
        { "id": "enemy-count-decreased", "observationId": "enemies", "operator": "eq", "expected": 0 },
        { "id": "score-increased", "observationId": "score", "operator": "increased", "expected": 100 }
      ],
      "stopWhen": ["passed", "failed", "budget-exhausted"]
    }
  ],
  "budget": {
    "maxKanePhases": 2,
    "maxKaneStepsPerPhase": 4,
    "maxWallTimeSecondsPerPhase": 120,
    "maxFramesPerAdvance": 300,
    "maxFramesPerPhase": 1800
  }
}
```

`validateTestPlan` checks plan vocabulary and budgets only; it never runs anything.
Test Mode frame advancement and input receipts are covered in `docs/testing-hooks.md`,
and "Phase execution" below describes how one approved phase runs at a time.

## Plan authoring and review (Phase 3)

`src/engine/model/game-test-draft.ts` wraps the validated plan in a reviewable draft:

- `createDraft` validates a model proposal against the profile, the open project and
  its revision, and records revision 1 with a reason.
- `reviseDraft` requires a non-empty reason for every change, appends it to the
  revision history and **drops any prior approval**. `userGoal` is immutable: a
  revision cannot replace what the user asked for.
- `approveDraft` records the approving identity only after re-validating, and rejects
  a draft whose `sourceRevision` no longer matches the document.
- Drafts persist per project in `localStorage` (`clockwork:test-plan:<projectId>`),
  and corrupt or unknown-version payloads load as `null` rather than crashing.

Agent flow: `get_game_test_profile` → `propose_test_plan`. The tool returns
`{ accepted, draft, estimate }` or `{ accepted: false, errors }`; its only side effect
is placing the accepted draft in the review store. It cannot run Kane, create a
session or edit the project.

UI flow (`TestPlanPanel` inside the AI Play panel): enter or pick a suggested goal →
**Draft plan with agent** → review phases, controls, assertions, budget, revision
reasons and the measured cost estimate (85 s typical / 140 s hard cap per phase) →
**Approve** or **Discard**. The panel names the planner model and states that the Kane
runner has not started.

**Approval does not execute anything.** An approved draft is a reviewed artifact; a
separate action has to run a phase.

## Phase execution (Phase 4)

`run_kane_test_phase` takes only `{ phaseId }`. The client (`phase-runner.ts`) checks
that the draft is approved and current, makes a read-only snapshot, and sends
`KanePhaseRequest`: session id, snapshot id, the plan, observation labels and frame-zero
baselines for `increased` assertions. It never sends a URL, objective or command.

`server/kane/phase.ts` re-validates everything against the snapshot document (project,
revision, scene, phase, budget), composes the objective itself with explicit "store X as
'id'" clauses, and runs Kane against
`/s/<snapshotId>?ai=1&testMode=step&seed=<seed>` (plus `&scene=<id>` for the plan's
scene and `&scenario=<id>` when it names a registered scenario) with the plan's step and
wall-clock caps. The player starts the runtime in that scene rather than silently
falling back to the start scene.

A scenario is a fixed, code-registered setup, never gameplay logic: the player applies
it to a copy of the snapshot document before frame zero, so a restart rebuilds the same
starting objects and the setup can only add prefab instances at fixed positions. A
scenario that fails validation against the run's start scene is not applied, and the
HUD reports the scenario it actually applied.

A phase verdict is strict: `passed` requires a Kane pass, every assertion matched,
at least one input actually delivered to a runtime frame for a phase that uses controls,
a reported frame count within budget, and an evidence bundle. Otherwise the result is
`failed` (`product`), `inconclusive` (`input`, `observation`, `evidence`, `budget`,
`timeout`, `infrastructure`) or `cancelled`, with a reason, per-assertion actual values
and the delivered-input/frame counts. The result is returned as a tool message in the
same agent conversation and shown in the review panel.

Session state and idempotency are held in memory on the server (`server/kane/phase-session.ts`) and are cleared on restart. Repeating an
identical approved plan fingerprint replays the stored result instead of paying for a
second run. The key is derived server-side, so changing
the client session id cannot reset the phase budget. The client persists returned phase
results in `localStorage` under
`clockwork:test-plan-runs:<projectId>:<sessionId>:<planFingerprint>`, so revising the plan
does not show a previous plan's results.

Once a phase has run, `buildTestReport` (`src/engine/model/game-test-report.ts`)
produces a per-criterion report from the approved assertions and the stored results. A
criterion is PASS only when its assertion matched, the phase verdict is `passed`, and
the phase has an evidence bundle; it is FAIL or INCONCLUSIVE otherwise (an unrun
phase's criteria are INCONCLUSIVE, never PASS). Phase
verdict failures also fail the report, so an input that never reached the game cannot
produce a green report from unrelated matching observations. The panel shows this report
with its evidence links.
