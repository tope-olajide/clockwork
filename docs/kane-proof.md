# Kane evidence ledger

This file records real Kane CLI runs (0.10.5–0.10.6) against a local Clockwork server at
`http://localhost:5173`. Fixture output is labelled as fixture output. Runs are identified by
Kane run and session IDs; evidence packs and raw NDJSON stay local under the untracked `.data/`
and `.testmuai/` folders, so artifact paths here are relative.

The longer run-by-run log — including the interim failures hit while each flow was being built —
is preserved in this file's git history.

## What Kane proved

| Flow | Run / record | Result | Time |
|---|---|---|---|
| K1 editor persistence: select object, move ×2, undo ×2, reload | session `010fb663` | **passed**, `object_x: "160"` after reload | 303.6 s |
| K2 agent double jump: agent edit → Play → undo | session `bded0577` | **passed**, Air jumps `0 → 1 → 0`, second mid-air jump observed | 372.9 s |
| K3a agent repair → play to win, one flow | `k3a.ndjson` | **passed**, `COINS 3`, win message, `command_rejected: "false"` | 282.1 s |
| K3b agent edit → undo → redo, one flow | `k3b-undo-redo.ndjson` | **passed**, undo/redo counters `1/0 → 0/1 → 1/0` | 218.9 s |
| K4 in-app `verify_with_kane` card | run `8ea17992` | **PASSED · ENGINE QA · 12 steps**, `COIN_COUNT: 2` | 65.2 s |
| K4 terminal agent ↔ Kane handshake | `k4-terminal2.ndjson` | **passed**, single flow, verdict/steps/duration/evidence all present | 206.7 s |
| K5 AI Play fail → auto-fix → pass (Neon Runner) | attempts 1–2 | **failed** then **passed**, `COINS 3`, `STATUS WON` | 81.5 s + 81.1 s |
| Negative control: unsatisfiable win rule | `b050f47c` → `52baa697` | **failed** then **passed** after the rule fix | 94.1 s + 81.6 s |
| Reduced one-coin AI Play fixture | `c062a3d4` → `159ac555` | **failed** (buried coin) then **passed** after repair | 154.6 s + 109.2 s |
| Chat agent + `verify_with_kane` on Meadow Sandbox | run `a20a4b28` | **PASSED** at revision 9, simulator and browser agreed | — |
| Saved engine E2E (`pnpm kane:engine-e2e`) | sessions `aceb577f`, `e547a290`, `55efd401` | **passed** when authored, then **passed** from cold start with 1/1 replayed step (re-confirmed `55efd401`, 1/1 replayed) | 286 s, 89 s, 164 s |
| Panel-approved AI Testing phase (Approve button) | `98e21783`, `ea1bb3b3` | **PASSED**, typed per-criterion verdict + evidence bundle | 94.7 s, 78.1 s |

The Meadow Sandbox closed loop is the headline result: the user asked the in-app agent for coins
tagged `coin`, +1 score per coin and a SCORE HUD, then a Kane check. The agent applied 6 coins, a
score variable and a Score HUD, ran a headless preflight, then called `verify_with_kane`. Kane ran
the check in the engine simulator and then in a real browser; both agreed.

| Readout | Before | After |
|---|---|---|
| SCORE | 0 | 1 |
| COIN COUNT | 6 | 5 |
| COLLECTED | 0 | 1 |
| PLAYER X | 240 | 473.67 (after holding MOVE RIGHT for 45 frames) |

## Game-starter browser runs

| Scenario | Result | Time |
|---|---|---|
| Space Invaders: create, play, immediate R restart (`RUNNING`, `SCORE 0`, `SHIPS 3`, `INVADERS 24`) | **passed** | 91.1 s |
| Asteroid Field: create, HUD, A/W/E inputs, restart (`SCORE 0`, `SHIPS 3`, `ROCKS 6`) | **passed** | 117.1 s |
| Asteroid Field editor tuning → Play (turn speed 220 → 0, ship stays pointed up) | **passed** | 127.8 s |
| Space Invaders: play + console-clean assertion | **partial** — console extraction timed out; one `favicon.ico` 404, no gameplay error claimed | 270.9 s |
| Space Shooter: loss then R restart | restart proven by screenshot and `SCORE 0`; final checkpoint contradicted the screenshot, so no clean pass | 352.2 s |

No browser-only Space Shooter score proof was obtained: those attempts expired on step limits or
observed `LOST` before firing could be attributed to Kane, and none are counted as scoring passes.

## Defects Kane caught (all fixed)

- **K2 — the no-model request path.** With no tool-capable model selected, the app still let a
  Build request through and surfaced a raw fetch error. Fixed with the single-provider `env`
  provider, a client-side preflight block and actionable guidance.
- **K2 — undo history lost after Play.** Stopping Play and returning to the editor remounted the
  page, which reloaded the project from storage and cleared the undo stack, so the agent's change
  could no longer be reverted. The editor now only reloads when the project actually changes
  (`src/features/editor/EditorPage.tsx`). Found by run 3 of session `f53eafe8`; run `bded0577`
  then passed with `Air jumps 1 → 0` restored by one Undo.
- **K1 — editor usability.** Selecting an object at 1366 px left the inspector collapsed, and
  hierarchy rows were generic buttons containing a nested Delete button. Rows are now `treeitem`s
  labelled `Select <name>`, and selection opens the inspector.
- **K3d — rejected agent edit shape.** `apply_commands` never exposed command arguments, so the
  model guessed a nested structure and the edit was rejected. Fixed with a schema-derived command
  reference, a `list_commands` read tool and `Expected args:` hints on rejection.
- **K4 — incomplete Kane card.** The card showed verdict, steps, summary and evidence but no
  duration. Fixed by forwarding `durationMs` and rendering it.
- **Attempt footer.** Failed or auth-failed runs displayed `0 steps`; it now counts every settled
  step.
- **Change-set summary.** Nested Immer paths were treated as scene-level, so `changedIds` was empty
  and no plan ghost or agent presence could resolve.
- **Toolbar agent button.** A single click only opened the menu; the split button now opens the
  drawer in Build with the selection attached.
- **Shooter input.** A quick key press could be released before the simulation frame that sampled
  it; shooters now also respond to the captured press edge, with a one-frame regression test.

## Honest limits

- **K2's earlier post-fix runs never reached a verdict.** Three runs on a 1366 px, memory-tight
  machine died in Kane's own browser ("browser target stopped running during screenshot capture")
  right after selecting Player, with no product error in NDJSON. On 2026-11-26 the objective was
  hardened (explicit Dismiss on the "Verify it with Kane?" offer, `?demoReset=1` in the start URL,
  and an Undo re-check) and K2 passed in session `bded0577`. The three failed runs remain part of
  the record; the environment diagnosis was never proven more precisely than the crash text.
- **No saved-test replay speedup has been measured.** The replay path is implemented and verified
  against the documented stream contract, and the engine E2E did replay 1/1 steps, but the phase
  and AI Play replay attempts authored their steps instead of replaying them. `--push`, which would
  commit the recordings, needs lock-API credentials this environment does not have. Do not claim a
  replay speedup until a run reports `replay_decisions > 0`.
- **K5's failure record does not name the inaccessible coin.** Kane ended on its own
  final-verification assertion with empty `final_state`; the embedded `Core A` was identified by the
  product's deterministic repair, and the passing attempt's `coins: "3"` proves the move was
  required.
- **Time budgets are tuned, not generous.** In-app engine QA needs `KANE_TIMEOUT_SECONDS=300`
  (default 180); AI Play fits in 140 s / 8 steps; approved phases use the plan budget, capped at
  600 s. Several early runs failed on caps that were too small rather than on gameplay.
- **Server phase state is in memory** and is cleared on restart.
- **Panel plan drafting** was seeded by the harness in Phase 7 because the local planner was mock;
  model-driven drafting is not claimed there. The replay-based phase run was correctly typed
  `inconclusive` because its values came from recordings rather than fresh observation.

## Reproduction

```bash
# Real engine QA (fastest current objective)
sh scripts/kane/run-objective.sh scripts/kane/objectives/k1-editor-smoke.txt http://localhost:5173

# Real AI Play fail → repair → pass on the reduced fixture
node --import tsx scripts/kane/ai-play-smoke.ts

# Independent negative control: unsatisfiable win rule, fail → repair → pass
node --import tsx scripts/kane/negative-control.ts

# Saved engine E2E
pnpm kane:engine-e2e

# Full demo two-attempt loop (real)
# http://localhost:5173/?demoReset=1 → Neon Runner → AI Play
# needs a signed-in Kane CLI; no feature flag. KANE_TIMEOUT_SECONDS=140 KANE_MAX_STEPS=8
```

## Where the rest lives

- `docs/FEATURE_VERIFICATION.md` — per-feature verification table.
- `docs/demo-readiness-evidence.md` — phase-route and panel evidence with byte-level artifacts.
- `docs/kane-setup.md`, `docs/kane-cli-usage.md` — install, flags and operating notes.
- `docs/ai-play.md` — HUD contract, objective format and retry policy.
