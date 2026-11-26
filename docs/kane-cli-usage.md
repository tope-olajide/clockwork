# How Kane CLI tests Clockwork games

What Kane does in this project, what it actually verifies, and what was learned
while making a slow browser agent test a fast real-time game.

## Four ways this project uses Kane

1. **AI Testing:** reviewed, approved phases (`run_kane_test_phase` or the review panel).
2. **AI Play:** a one-off snapshot probe with an AI HUD and optional deterministic repair.
3. **Saved engine E2E:** `pnpm kane:engine-e2e` and `.testmuai/tests/engine-template-e2e_test.md`.
4. **Agent verification tools in chat:** `verify_with_kane`, `run_ai_play` and `run_kane_test_phase`.

The table below lists the entry points for engine QA and game testing. They intentionally produce different artifacts:

| Layer | Entry point | What runs | Where evidence lands |
|---|---|---|---|
| Engine QA | `scripts/kane/engine-e2e.mjs` | A saved `testmd` test creates a game from a starter, edits and undoes a value, runs Play, restarts it and returns to the editor | `.testmuai/runs/engine-template-e2e.*`, `.testmuai/evidence/engine-template-e2e.evidence`, Test Manager link when Kane returns one |
| Engine QA, one command | `scripts/kane/engine-e2e-dev.mjs` | Starts or reuses the app, waits for Vite and `/api/health`, then runs the same saved test | `.testmuai/runs/engine-e2e-dev.log` plus the engine E2E artifacts |
| Game testing | AI Testing phase panel or `kane-cli run` objectives | The game itself: Test Mode input/frame/observation assertions, or the AI Play loop | `.data/ai-play/<runId>/` for the in-app phase path; `.testmuai/runs/` for terminal objectives |

The engine test is saved at `.testmuai/tests/engine-template-e2e_test.md`. Run it with:

```bash
npm run kane:engine-e2e
# or, for machine-readable stdout without npm's banner:
node scripts/kane/engine-e2e.mjs --url http://localhost:5173
```

To start the app first and run the same test in one command:

```bash
npm run kane:engine-e2e:dev
```

That wrapper reuses an already-running app, otherwise starts `npm run dev`, waits for Vite and `GET /api/health`, then runs the saved test. It writes app logs to `.testmuai/runs/engine-e2e-dev.log` and tears down only the app processes it started. Its stdout is still the same single JSON result.

The runner prints one JSON object with `status`, `summary`, `durationSeconds`, `steps`, `finalState`, `testUrl`, `sessionId`, `evidencePath`, and the raw/result file paths. Exit code `0` means the saved test passed; `1` means it ran and failed; `2` means it could not start. The coding agent should read `status`, not just the exit code, and can inspect `.testmuai/runs/engine-template-e2e.ndjson` for every step.

First authored pass (2026-11-24, session `aceb577f-0a26-456e-a2d7-944652113935`): `status: passed`, 1/1 steps, 286 s. It created `Engine E2E Platformer` from the Platform Jumper starter, passed canvas/hierarchy/Inspector and Object Y edit-undo checks, ran Play with `LIVES 3`, restarted with R, and finished back on the project scene. The one-command cold-start path then passed in 89 s with 1/1 replayed steps (session `e547a290-4de8-4797-af91-19efb79ce3af`) and stopped the app it started. The latest result is `.testmuai/runs/engine-template-e2e.result.json` and the 3.8 MB evidence pack is `.testmuai/evidence/engine-template-e2e.evidence`; both are gitignored. The replayed run did not create a new Test Manager share link, so `testUrl` is `null` in the latest result.

This is deliberately separate from the in-app agent. The terminal runner has no model loop and does not call the built-in chat agent; it returns typed feedback to whoever invoked it. The reviewed phase path is the one that requires human plan approval and feeds `run_kane_test_phase` results back into the in-app agent.

## The core idea

A real-time game runs at 60 frames per second. A browser agent like Kane needs
seconds per action: load a page, read the screen, decide, click, wait. You cannot
win that race, so Clockwork does not run it. Instead, the game is frozen and
**time itself becomes an explicit, budgeted resource**:

- Kane opens an **immutable snapshot** of the approved project revision — never
  the live editor document — with a fixed seed and scene.
- The snapshot player runs in **Test Mode**: pressing a control only *queues* an
  input. Nothing moves until Kane sets an `ADVANCE` frame count and clicks `STEP`.
- Kane reads an **OBSERVATIONS panel** (status, score, hull, positions, object
  counts, event counters, accepted-input receipts, frame counter), stores each
  value under an exact id, and ends the run.
- The server joins Kane's verdict with delivered-input counts, reported frames,
  per-assertion values and an evidence bundle into one **typed phase result**:
  `passed`, `failed`, `inconclusive` or `cancelled` — with the causal chain
  spelled out.

Kane never plays fast. It plays *frozen time in bounded chunks*, which turns out
to be a stronger test than real-time play: every frame is accounted for.

## What a real run looks like

The first passing Space Shooter phase, driven by the in-app agent (run `b967bbdd`, 79.7 s). It is a different run from the two phases approved through the review panel (`98e21783`, 94.7 s, and `ea1bb3b3`, 78.1 s). All three are real passes with the same observations (shots-fired 3, projectiles 3, accepted inputs 1, 45 frames):

1. Navigate to the snapshot URL (`ai=1&testMode=step&seed=1234&maxAdvance=45…`).
2. Toggle `SHOOT` on.
3. Type `45` into Frames to advance, click `STEP`.
4. Toggle `SHOOT` off.
5. Read and store four values: `shots-fired = 3`, `projectiles = 3`,
   `accepted_inputs = 1`, `frames_advanced = 45`.
6. End the run. `run_end.status: passed`.

The server then verified: Kane passed, both assertions matched observed values,
1 input was actually delivered to a runtime frame, 45 frames were within budget,
no runtime errors, evidence bundle present → phase verdict `passed`. The agent
cited all of it against the original goal in the same conversation and the run
is linked from the Test Manager dashboard.

## What Kane actually verifies

Not pixels — **mechanics**, through a versioned game-test profile per template:

| Layer | Example (Space Shooter) |
|---|---|
| Controls | `SHOOT` hold, `MOVE LEFT/RIGHT` hold — labelled buttons Kane can see |
| Observations | `SHOTS FIRED`, `PROJECTILES`, `SCORE`, `HULL`, `ENEMIES`, `DESTROYED` |
| Objectives | input-creates-projectile → shoot-destroys-enemy → survive-encounter |
| Scenarios | `shooting-range` spawns one Raider in the lane so a kill is reachable |

A scenario may only *place* actors at frame zero. It can never write variables,
health or score — so a scenario can never manufacture the outcome it sets up.
That rule is what keeps a "ranged" test honest.

## Cool discoveries

**Kane tests the test harness, not just the game.** The failures were the most
valuable part. Kane's own failure reports diagnosed our setup: a first-paint bug
that rendered Test Mode `UNAVAILABLE`, an overlapping `SHOOT`/`STEP 10` button
row, a 6-step budget exhausted by retyped frame values. Each one became a real
product fix before the first pass.

**Shorter instructions beat bigger budgets.** Two runs died at exactly
budget-plus-grace (60→66 s, 140→146 s). The fix was never more wall time — it
was a compact 5-step sequence, a shorter objective, and telling Kane to end
immediately after the final read. The passing run used 79.7 s of a 240 s budget.

**Honest verdicts are a feature.** The system classifies missing observations,
undelivered input, over-budget frames, timeouts and missing evidence as
`INCONCLUSIVE` — never a pass, never a product failure. An exit code alone can
never produce a pass; only a terminal `run_end` plus matching evidence can.

**Input delivery is proven, not assumed.** Every control press produces a
receipt with the exact frames that carried it. `accepted_inputs = 0` means "the
input never reached the game," which is an automation failure, not a game bug.
That distinction saved an entire debugging rabbit hole.

**Runs are accountable.** Every phase records duration, credits consumed, Kane
CLI version, seed, budget, evidence bundle and a Test Manager dashboard link.
Approved plans are idempotent by content fingerprint: re-running an identical
approved plan replays the stored result instead of billing a second run.

**Credit exhaustion is explicit.** With Kane mandatory (no feature flags), a zero
balance returns a clear `kane-credits` message instead of a mysterious failure.

## Worked example: the chat agent closes the loop (run `a20a4b28`)

Run `a20a4b28-5387-4849-a978-a5ca5aa499c3` (2026-11-25) on a Meadow Sandbox project. The user asked the in-app agent to add coins tagged `coin`, give +1 score per coin, add a SCORE HUD, then verify with Kane. The agent applied the changes (6 coins, a score variable, a Score HUD widget), ran a headless preflight, then called `verify_with_kane`. The check ran first in the engine simulator, then once in a real browser. It PASSED at project revision 9: SCORE 0 → 1, COIN COUNT 6 → 5, COLLECTED 0 → 1, PLAYER X 240 → 473.67 after holding MOVE RIGHT for 45 frames. The simulator and browser agreed on every readout. Evidence is at `/api/kane/runs/a20a4b28-5387-4849-a978-a5ca5aa499c3/evidence` on the local server.

One caveat: the user had to send a follow-up message before Kane ran, because the agent ran out of its 8-step budget. The budget is now 12 steps with the last 3 reserved for a requested Kane check, and the agent now sees HUD widgets (it had re-added one it could not see).

## By the numbers (run `b967bbdd`)

- 8 Kane steps, 79.7 seconds
- 1 accepted input, 45 frames advanced
- 3 shots fired, 3 live projectiles, 0 runtime errors
- 2/2 assertions passed, evidence + Test Manager links attached

## What's next

The proven ladder continues: input-creates-projectile → **shoot-destroys-enemy**
(a fired projectile kills the scenario Raider, a death is recorded, score hits
100) → survive-encounter — then the same treatment for the remaining genre starters. Saved-test replay for
phases is wired in (`POST /api/kane/phase` accepts `replayTestKey`), but no phase
replay speedup has been measured yet.
