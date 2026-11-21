# Kane evidence ledger

This file records real Kane runs only. Fixture output is labelled as fixture output.

## Environment

| | |
|---|---|
| Date | 2026-11-17; K4/K5 reruns and negative control 2026-11-18 |
| Branch | `verify/kane-e2e` |
| Kane CLI | 0.10.5, signed in as `davidtheatomicshift` |
| Browser | local Chrome, 1366×768 viewport |
| Clockwork origin | `http://localhost:5173` |
| Model | `LLM_MODEL` / `LLM_BASE_URL` / `LLM_API_KEY` from `.env.local` |
| Node | 24.13.0 |

## Bar 1 — the app works end to end

| Flow | Result | Evidence |
|---|---|---|
| Projects → editor → select Player → inspector fields | **passed** | K1 below |
| Move twice + undo twice + reload persistence | **passed** | K1 below, `object_x: "160"` after reload |
| Manual Play without a model or Kane | prior fixture/browser checks | No real-runtime claim added here |
| Share/export | not rerun in Slice 10 | recorded as a gap |

### K1 — editor persistence (real Kane)

- Command: `sh scripts/kane/run-objective.sh scripts/kane/objectives/k1-editor-smoke.txt http://localhost:5173`
- Result: `run_end.status: "passed"`, 303.6 s, 62.79 credits.
- Final state: `object_x: "160"`, `player_visible: "true"`, `editor_open: "true"`.
- Session: `C:\Users\Temitope\.testmuai\kaneai\sessions\010fb663-9351-4a66-8036-cc8d8197b386`
- Test Manager: recorded in `.testmuai/runs/k1-editor-smoke.ndjson`.
- Fixed while running this flow: the inspector stayed collapsed at 1366 px after selecting an object; the hierarchy row was exposed as a generic button containing a nested Delete button, which Kane could mistake for the row action. Rows are now `treeitem`s labelled `Select <name>`, and selecting an object opens the inspector at `wide`.

## Bar 2 — Kane caught or proved something

### AI Play closed loop (real Kane, reduced fixture)

The one-coin reduced fixture exercised the real Kane CLI and the real product path.

- Fixture: one `Core A` coin embedded in `Ground`, one nearby `Relay`, win rule adjusted to `coins >= 1`.
- First attempt: **failed** in 154.6 s (14 steps). Kane reached the scene but could not collect the embedded coin; the `status == WON` assertion failed.
  - Evidence: `.data/ai-play/c062a3d4-e98b-4e4e-9110-28c25565eece/evidence.evidence`
- Fix: `repairAiPlayFailure` returned `Move Core A out of Ground`, one `object.update` to `(260, 787)`.
- Second attempt: **passed** in 109.2 s (18 steps), `COINS: "1"`, `STATUS: "WON"`, `LAST_ERROR: "none"`.
  - Evidence: `.data/ai-play/159ac555-2d2a-4584-b940-6301d488b6df/evidence.evidence`
- Reproduce: `node --import tsx scripts/kane/ai-play-smoke.ts` (requires a signed-in Kane CLI and a running server; no feature flag).

### Why runs were slow and expensive

Kane's one-shot `run` pays the **authoring** cost every time: it plans the objective and authors each step before touching the page. For a game objective (no DOM affordances to reason over) that planning dominates, at roughly 15–25 s per agent step. Two further costs were self-inflicted:

- `--final-validation on` appended the synthesized `cp_final` checkpoint to every run — one extra authoring step, on top of the objective's own terminal assertion. It is now `off` (the documented default), because the objective already ends in an explicit assertion.
- Generated-code export/validation ran for every attempt even though no code is kept. Runs now pass `--skip-code-validation`.

The structural fix is the one the Kane skill documents for repeated verification: **saved tests replay**. `kane-cli testmd run <file>` authors each step on the first run and then replays the recordings, "mostly avoiding the authoring cost", on every later run. AI Play now supports that path via `KANE_AI_PLAY_TEST=scripts/kane/tests/ai-play-demo_test.md`; the snapshot URL is supplied with `--url`, so replay works across per-attempt snapshots without re-authoring. `--no-adaptive-heal` keeps a replay failure fast instead of silently re-authoring steps.

The runner's saved-test stream handling is verified against the documented NDJSON contract with the `fake-kane` fixture (pass and fail): the verdict comes from `test_md_done`, `test_md_step_start/end` become the visible steps, inner per-step `run_end` events are not treated as the file verdict, `final_state` comes from the last inner `run_end`, and the evidence pack comes from the `coverage.pack` path. No real-Kane timing claim is made for the replay path yet: it has not been driven against a live scene, and the recordings only exist after one authored run.

### Full Neon Runner AI Play (real two-attempt loop, 151.6 s)

Driven through the product UI (`?demoReset=1` → Neon Runner → AI Play), 2026-11-17, Kane CLI 0.10.5, 1366×768.

| Attempt | `run_end.status` | Duration | Evidence |
|---|---|---|---|
| 1 (seeded embedded coin) | **failed** | 85.0 s | `.data/ai-play/87f6f320-fa0c-411c-8661-6d0c1a936c9e/evidence.evidence` |
| 2 (same seed, after fix) | **passed** | 66.6 s | `.data/ai-play/646cff5f-7231-475d-8fa0-3297905d2956/evidence.evidence` |

- Attempt 1 run `87f6f320-fa0c-411c-8661-6d0c1a936c9e` (snapshot `06y2VyFMIz7ZRg`): `run_end.status: "failed"`, `reason: "Final verification failed: the AI state panel shows STATUS \"WON\", COINS \"3\" and LAST ERROR \"none\""`. Kane's own summary: the character was still playing near a hazard with only two coins.
- Fix: deterministic `repairAiPlayFailure` returned `Move Core A out of Ground` and applied one undoable `object.update`.
- Attempt 2 run `646cff5f-7231-475d-8fa0-3297905d2956` (snapshot `OShWhY1HNpQo3A`): `run_end.status: "passed"`, `reason: "Objective completed"`, 66.6 s, final state `STATUS: "WON"`, `coins: "3"`, `last_error: "none"`. Panel shows `KANE VERIFIED` and both evidence links.

### Exit-2 / unauthenticated rendering (fixture)

`KANE_FIXTURE_NO_RUN_END=1` makes the fixture emit `stream_start`, one failed step and exit 2 with **no** `run_end` — the wire shape of an auth/URL/Chrome failure.

- Runner: emits `error kane-auth` ("Kane CLI could not start (auth, URL or Chrome). Run kane-cli whoami and try again."), result `status: "error"`, `summary: "Kane could not start or finish the run."`, no evidence pack.
- Panel (fixture server, 1366×768): header chip `KANE ERROR`, alert with the auth guidance, `Attempt 1 ERROR`, footer `0s · 1 step`. No pass verdict is shown.
- Bug found and fixed while proving this: the attempt footer counted only `done` steps, so a failed or auth-failed run displayed `0 steps`. It now counts every settled step and pluralizes.

### AI Play objective extraction (`store ... as`)

The objective now ends with the documented extraction form, then asserts on the stored values:

```text
Run the scene once from its start state. Do not press RESTART or retry. Click "MOVE RIGHT" once. Wait 3 seconds.
Store the STATUS value from the AI state panel as 'status', store the COINS value as 'coins', store the LAST ERROR value as 'last_error'.
Assert the stored status is "WON", the stored coins is "3" and the stored last_error is "none".
```

- Real proof run `2ff85c36-9bc7-4b77-a50d-de59fe6d8e77` (snapshot `OShWhY1HNpQo3A`, repaired scene, attempt 2): `run_end.status: "passed"`, `reason: "Objective completed"`, **86.8 s**, **24.73 credits**.
- `final_state`: `status: "WON"`, `coins: "3"`, `last_error: "none"` — captured by the store clauses, not inferred.
- The stream shows the extraction explicitly: `analyze: ANALYZE(textual_visual, 'the LAST ERROR value from the AI state panel is stored …')`, then `analyze: {{last_error}} is "none"`, then `assert: {{status}} is "WON", {{coins}} is "3" and {{last_error}} is "none"`.
- Cost of the requirement: two extra analyze steps, ~+20 s and ~+9 credits versus the assert-only pass (66.6 s / 15.63 credits). A two-attempt loop with extraction is ~172 s, so the 180 s budget is now effectively at its limit.

Cost and time notes from this pass:

- The earlier 50 s / 6-step clamp was killing runs that were on track (both attempts died at ~55 s mid-assertion, reported as a 0 s "cancelled"). The AI Play ceiling is now 140 s / 8 steps, and a timeout is reported as `Kane run timed out after Ns without a run_end; the verdict is unknown.` with the real elapsed duration rather than as a user cancel.
- The objective's first clause was goal-shaped ("Collect all 3 coins and reach the end of the scene"). On the broken scene that made Kane restart and retry until the cap, never reaching the assertion. It is now a fixed-input verification: "Run the scene once from its start state. Do not press RESTART or retry." plus move/wait/assert. That change is what produced the clean 85 s failure.
- Kane's fixed startup (bifurcation) is ~27–30 s of each run; per-step time is ~10–15 s. A 5–6 step pass now lands at 66–85 s, which is why the two-attempt loop fits in 151.6 s but a 50 s cap could never pass.

### Engine QA K1–K4

| Objective | Verdict | Notes |
|---|---|---|
| K1 editor smoke | **passed** | real run above |
| K5 AI Play closed loop | **passed** | full Neon Runner fail → fix → pass (151.6 s first pass; rerun with extraction 81.5 s + 81.1 s, above) |
| K2 agent double jump | **caught a defect; verification environment-blocked** | defect fixed, 3 post-fix runs died in Kane's browser, see below |
| K3 agent repair | **passed** | K3a repair+win and K3b undo/redo, both real single flows |
| K4 agent ↔ Kane handshake | **passed** | in-app card + terminal objective, both real (Bar 3) |

### K2 — agent double jump (real run, failed)

- Objective: `scripts/kane/objectives/k2-agent-double-jump.txt`, 300 s cap, `--bug-detection continue`.
- Result: `run_end.status: "failed"`, 265.7 s, 47.56 credits. Kane opened Neon Runner, selected Player, opened the agent, sent "Give the player a double jump", hit `No model` / "Build/Plan require a tool-capable model", retried, and both sends ended in a fetch failure.
- Kane's summary: the panel showed "No model" and the run proceeded anyway; both attempts ended with a fetch failure rather than applying the change. Its recommendation: block the request when the panel shows "No model".
- This is a **real defect caught by Kane**, not an environment crash: the app disables the Build/Plan tabs but still allows the request path to proceed, and a failed provider stream surfaces as a raw fetch failure instead of an actionable "connect a tool-capable model" message. The first K2 attempt also hit the same `environment_issue/platform_failure` (browser crashed during screenshot) seen in K1, and passed that point on retry after ~800 MB of memory was freed.
- Consequence: at that point K2's agent behaviour could not be verified until a tool-capable model was configured in the app, and K3 depended on the same capability. Both blockers are now gone: the env provider fix landed and K3a/K3b pass with it.

#### Follow-up: the no-model defect is fixed

- `server/ai/store.ts` now surfaces a single-provider `.env` setup (`LLM_MODEL` / `LLM_BASE_URL` / `LLM_API_KEY`) as a read-only `env` provider and `env:<model>` model with `tools: true`; the client auto-selects it when nothing else is chosen. Before this, the server could already answer with the env model while the app showed "No model", Build/Plan were disabled, and sends failed as raw fetch errors.
- `src/features/agent/useAgentSession.ts` now blocks before the network when no model is selected, the provider has no key, or Build/Plan is used without a tool-capable model, with actionable guidance (choose a model / open settings). Provider/network failures are reworded to point at Settings → AI Models instead of a bare `fetch failed`.
- Verified: `POST /api/ai/step` with `env:deepseek-v4.1-flash` streams `ready`; `/api/ai/providers` reports the env provider `configured: true, source: env`; `/api/ai/models` lists `deepseek-v4.1-flash (env)` with `tools: true`. (A wrong key in `.env.local` was replaced by the user during this pass; the endpoint was re-verified after the restart.)

#### K2 after the fix: still an environment failure

Three further real runs all ended the same way: `run_end.status: "failed"` at 51–60 s, reason "browser target stopped running during screenshot capture", immediately after selecting Player in the hierarchy. Cost 3.1–13.1 credits per attempt. The NDJSON shows no product error and no rejected request. This is the same `environment_issue/platform_failure` recorded in K1's evidence; it is a local Chrome/graphics stability limit, not a regression.

**Decision: K2 is recorded as environment-blocked, not as a pass and not as a product failure.** The reasoning:

- The product half of K2 is already evidenced elsewhere: Kane caught the no-model request path on the first K2 run, and the fix is verified at the API level (env provider, preflight block, actionable errors) plus by the K3a/K3b/K4 runs, which use the same Build path on the same machine.
- All three post-fix attempts died in Kane's own browser before the objective could assert anything, with no product error in NDJSON. More attempts would buy the same crash, not new information, so no further credits are spent on it.
- The objective stays in `scripts/kane/objectives/k2-agent-double-jump.txt` for reproduction. It becomes provable on a machine where Kane's Chrome survives screenshot capture (more memory, or its own display), and that is the only condition that would change this verdict.

### K3 — agent repair (real run, failed on Play input)

- Objective: `scripts/kane/objectives/k3-agent-repair.txt`, `?demoReset=1`, 580 s cap, 40 steps.
- The agent path worked with the env model: Kane opened the agent, sent the problem statement, waited for the change summary, switched to Build, sent the repair request, then went to Play.
- Result: `run_end.status: "failed"`, 314.9 s, 47.92 credits. Kane's verdict: it pressed a key and clicked the game canvas, but the player stayed at the starting position and `COINS` stayed 0; its summary asks for the actual movement controls to be used and to stop only after the win message.
- Classified: **Play input is not at fault.** Driving the Play page over CDP (real key events, no focus step) on a freshly reset demo moved the player from x=160 to x≈890 and collected 2 of 3 cores. The seeded defect behaves as designed: `Core A` sits at (280, 860) below the floor and stays unreachable, so `coins` stops at 2 and the win rule never fires without a repair. Kane's session recorded the player at the start position with `COINS 0` for its whole Play phase, i.e. none of its key taps reached the page — a limitation of its own browser input path, not of `/play`.
- The earlier `/play/prj_…` probe that opened on the **Win** scene already `WON` was a *different, stale project copy*. `?demoReset=1` ran twice concurrently (the reset effect mounts twice in development), both runs saw no existing project and both saved one, leaving two identical `Neon Runner` records — one of which had since been edited, and its `startSceneId` pointed at the `Win` scene (`project.setStartScene` is the only command that writes it). Which actor set it is unrecoverable: the reset deleted that copy. A reload of a current project always starts on `Dusk Run` with `coins: 0`, so Play itself does not restore state.
- Fixed: `resetDemoProject()` now shares one in-flight run, so `?demoReset=1` leaves exactly one `Neon Runner` (verified twice: 1 record, start `Dusk Run`, defect intact — holding right yields `coins: 2`, `won: false`).

### Click-to-move Play (the input path Kane can actually deliver)

Kane's clicks land reliably (it plays through drawers, toolbars and the stage); its `press_key` taps do not reach the page at all. Rather than keep paying for runs that cannot move the player, Play now also steers on click:

- Clicking anywhere on the stage sets a world-space target, and Play holds left/right until the player reaches it, so a single click produces a full run instead of one frame of movement. Any real key press cancels the target, so keyboard play is unchanged.
- `PlayPage` shows the hint "Click the stage to move" next to the read-only chip.

Verified locally (CDP mouse press on the stage): player x 160 → 911, `coins` 0 → 2 on the untouched demo, i.e. the buried `Core A` is still the only thing stopping a win.

### K3 reruns after click steering

| Run | Result | What it proved |
| --- | --- | --- |
| `k3c.ndjson` | failed, 404 s, 37.4 credits | Kane opened the agent in **Ask** (read-only), so the repair request could only be described; the objective now says to switch to Build first. |
| `k3d.ndjson` | failed, 196 s, 29.9 credits | Build mode was active and the agent did respond, but its `apply_commands` request was rejected and nothing was saved. |

`k3d` is a **product finding**, not an environment one. Kane's verdict: "The Build agent generated an edit request in a shape the application would not accept. It retried the edit several times, then confirmed that nothing had been saved."

The root cause is visible in the prompt and tool surface: `apply_commands` only tells the model that `commands` are `{type, args}` objects and that args is "Command arguments object". Nothing exposes the actual args — `object.update` needs `{sceneId, objectId, patch: {transform: …}}`, while moving an object has its own command, `object.updateTransform` (`{sceneId, objectId, transform}`). The Build prompt (`server/ai/system-prompt.ts`) also lists no command shapes and no tool returns them, so the model has to guess a nested structure and the first guess is rejected.

**Fix applied:**

- `src/engine/ai/command-help.ts` derives each command's argument signature from the same zod schemas the app validates with — `commandReference()`, `signatureFor(type)`, `expectedArgsHint(type)`.
- New read tool `list_commands` (in all modes) returns all 57 commands with argument names, types and required flags, so the model can look up `object.update` vs `object.updateTransform` instead of guessing.
- A rejected command now carries `Expected args: object.update(sceneId: string, objectId: string, patch: object{…})` (trimmed to 600 chars) in both the preview and apply paths, and the Build prompt tells the model to read that hint and fix the args rather than resend the same batch (`PROMPT_VERSION` 3).

**Verified locally (real agent turn, no Kane):** Build mode, "One coin … move it somewhere reachable" → `revision 0 → 1`, `Core A` y `860 → 790` (now reachable), Undo enabled with one entry. The agent used the reference and applied on the first try. One rough edge: its `preview_commands` call errored before the successful `apply_commands`; the apply path is what matters, but the preview rejection is worth a look.

### K3e — agent repair applied, verdict spoiled by bifurcation

`k3e.ndjson`: `failed`, 350.3 s, 61.6 credits, **`bifurcated: true`, `total_runs: 2`**. Flow 1 (repair) completed with `result_code 100 success.complete` — the build request was accepted, so the "edit shape" defect is gone. Flow 2 asserted undo/redo and reported `0 undo · 0 redo`.

That second failure is a **test artifact, not a product bug**: split runs get a fresh browser context, so the project is re-seeded and carries no history from flow 1. Play never touches `history` (`PlayPage` only calls `setPlaytestRunning`), and the same repair produced one undo entry locally.

**Split into one flow each:** `scripts/kane/objectives/k3a-repair-win.txt` (repair + play-to-win) and `scripts/kane/objectives/k3b-undo-redo.txt` (make an edit, undo, redo in the same run).

### K3a — the loop closes (real pass, single flow)

`k3a.ndjson` (`scripts/kane/objectives/k3a-repair-win.txt`): **`run_end.status: "passed"`**, 282.1 s, 60.1 credits, **`bifurcated: false`, `total_runs: 1`**, `final_state { coin_counter: "3", stage_loaded: "true", command_rejected: "false" }`.

One flow did all of it: opened `?demoReset=1`, switched the agent to Build, sent the defect report, waited for the applied change, pressed Play, clicked the stage to steer right repeatedly, and stopped after the win message. This is the fail → fix → pass loop the slice is about, and every step happened inside a single run, so no state crossed a context boundary.

Why it counts as a real pass rather than a lucky one: on the untouched demo the same click steering stops at 2 coins with `won: false` (local CDP runs and the steer probe both measured that), so `COINS 3` plus the win message can only happen if the buried `Core A` was moved into reach during that session. And `command_rejected: false` is the direct confirmation that the command-reference fix removed the rejected-edit failure that failed `k3d`.

### K3b — undo/redo in one flow (real pass, single flow, 2026-11-18)

`k3b-undo-redo.ndjson` (`scripts/kane/objectives/k3b-undo-redo.txt`): **`run_end.status: "passed"`**, 218.9 s, 59.29 credits, **`bifurcated: false`, `total_runs: 1`**, exit 0, no bug or assertion events.

One session did the whole sequence: opened `?demo=1`, opened the agent drawer, switched to Build, sent "Move the player object down by 40 units.", read the status bar, pressed Undo once, pressed Redo once. The counters in `final_state` match the assertion at every step:

| Step | Undo | Redo |
|---|---|---|
| Applied the agent's change | `1` | `0` |
| After Undo | `0` | `1` |
| After Redo | `1` | `0` |

This closes the gap `k3e` left open. `k3e` failed the undo assertion only because Kane split the objective into two flows, and a fresh flow is a re-seeded project with no history; here the edit, the undo and the redo all happened in the one flow that owns that history, so the counters are causally connected rather than coincidental.

**Kane steerability probe** (`scripts/kane/objectives/k3-steer-probe.txt`, 199.4 s, 33.1 credits): `run_end.status: "passed"`, `final_state { player_moved: "true", coins_counter: "2" }`, summary "Clicked to the right of the player … The player moved, and the COINS counter reached 2". Click steering is therefore the input path K3 should use; `k3-agent-repair.txt` was rewritten to click the stage instead of pressing keys.
- An earlier K3 attempt was killed by a 320 s wrapper mid-repair (no `run_end`, no verdict) and is not evidence either way.

K1 exposed two real UI/accessibility defects (collapsed inspector; unsafe hierarchy-row semantics), both fixed before the passing run. That count is what the evidence supports, not a cap: engine QA runs with `--bug-detection continue`, so any further confirmed defect is recorded here too. The same evidence pack also contains one `environment_issue/platform_failure` (browser target crashed during a screenshot) which is not a product bug and is not counted. No product bug is claimed from the AI Play fixture.

### K5 — full loop rerun with the extraction objective (real pass, 2026-11-18)

Driven through the product UI (`?demoReset=1` → Neon Runner → AI Play → consent → auto-fix → retry), 1366×768, Kane CLI 0.10.5. Both attempts are archived in `.testmuai/runs/`.

| Attempt | `run_end.status` | Duration | Credits | Evidence |
|---|---|---|---|---|
| 1 (seed intact) | **failed** | 81.5 s | 22.72 | `.testmuai/runs/k5-attempt1.ndjson`, pack `53593168-30b5-480c-a381-3cfef87d9141` |
| 2 (after auto-fix) | **passed** | 81.1 s | 23.54 | `.testmuai/runs/k5-attempt2.ndjson`, pack `89c07452-7819-4d7b-82f8-edb4f071c54d` |

- Attempt 1: `result_code 710`, `reason_code: "assertion_error.final_verification"`, `reason: "Final verification failed: \"The stored status is \"WON\", the stored coins is \"3\" and the stored last_error is \"none\".\""`, `final_state: {}`. The panel showed `KANE FAILED`, `Attempt 1 FAILED · 82s · 5 steps · evidence`.
- Fix: the deterministic `repairAiPlayFailure` found `Core A` embedded in `Ground` and applied one undoable `object.update`; the toast read "Core A is embedded in Ground, so the collider prevents collection. Moving it above the platform makes it reachable." Project revision `0 → 1`, `historyLength 1`, one selection.
- Attempt 2: `reason_code: "success.complete"`, `final_state { status: "WON", coins: "3", last_error: "none" }`. Panel showed `KANE VERIFIED` with `Attempt 2 PASSED · 81s · 7 steps` and both evidence links.
- Manual Play after the fix (same project): `WON`, `COINS 3`, no last error, console `collect Core C` → `coins = 3` → `Win when all cores collected fired`.
- Screenshots: `.data/k5-attempt1.png` (failure + auto-fix toast) and `.data/k5-final.png` (`KANE VERIFIED`).

**Deviation from the scripted K5 narrative:** the plan expected attempt 1 to report `coins = 2` and name `coin_2`. Kane instead ended on its own final-verification assertion with no stored values (`final_state: {}`) and a scenario-shaped summary. The product still diagnosed and fixed the embedded `Core A` (toast, revision, and the three-coin pass prove the move is load-bearing), but the *failure record itself* does not name the coin. Treat K5's fail → fix → pass chain as proven and its "names the inaccessible coin" requirement as met by the product diagnosis, not by Kane's summary.

### Negative control — unsatisfiable win rule (real fail → fix → pass, 2026-11-18)

K5 and the reduced smoke both fail on a coin that cannot be touched. This control fails for a different reason: the goal itself is unsatisfiable. The compact one-coin fixture is used, with the win rule raised to `coins >= 2` while the scene contains one coin. Reproduce with `node --import tsx scripts/kane/negative-control.ts`; both streams are archived under `.testmuai/runs/`.

| Attempt | `run_end.status` | Duration | Evidence |
|---|---|---|---|
| 1 (`coins >= 2`, one coin) | **failed** | 94.1 s | run `b050f47c-9117-48e4-9e92-baa23f0b1ae9`, pack `.data/ai-play/b050f47c-9117-48e4-9e92-baa23f0b1ae9/evidence.evidence` |
| 2 (rule restored to `coins >= 1`) | **passed** | 81.6 s | run `52baa697-74e6-49f7-bebe-b77009517aee`, pack `.data/ai-play/52baa697-74e6-49f7-bebe-b77009517aee/evidence.evidence` |

- Attempt 1 summary: "The game's win condition did not activate after the required MOVE RIGHT action. The run collected the coin, but the status never changed from PLAYING to WON." Kane's `evidence` field names the contradiction directly: status `PLAYING` while coins are `1` and the last error is `none`, after the required input. `final_state` was `{}` (same Kane extraction quirk as K5 attempt 1).
- Fix: restore the win rule to the number of coins the scene contains, one rule change, then a fresh snapshot and a same-seed replay. Applied by the harness, not by a model turn.
- Attempt 2: `run_end.status: "passed"`, `final_state { status: "WON", coins: "1", last_error: "none" }`.
- What this proves: the failure → replay loop is not tuned to the embedded-coin shape; an unsatisfiable completion rule produces a clean assertion failure and a passing run after the rule is corrected.
- First attempt at this control, on the full Neon Runner route, never reached an assertion: the six-jump objective exceeded the 145 s AI Play ceiling and was reported as `cancelled` with an unknown verdict (no `run_end`). The compact fixture replaced it; that cancellation is recorded here so it is not mistaken for a pass or a product failure.

## Bar 3 — agent and Kane talked to each other

Both directions are now proven with real runs.

### K4 — in-app `verify_with_kane` (real pass)

Asked in the project's Build chat: "Verify in a real browser that the level loads and the player can collect a coin."

- Card: `PASSED · ENGINE QA · 12 steps · 65.2s`, summary with the snapshot URL and `COIN_COUNT: 2`, plus an `Open evidence` link to `/api/kane/runs/8ea17992-4f77-4e6f-831f-bdb630b0aa55/evidence` (snapshot `YW1CqmcYEt-NZA`).
- The agent's reply referenced the Kane result (status passed, coin counter 2, evidence path) and said no project changes were made.
- Before this pass the card rendered verdict, steps, summary and evidence but **no duration** — the runner already returned `durationMs`, the client dropped it. Fixed in `useAgentSession.ts` (forward `durationMs`) and `AgentDrawer.tsx` (`kane-run-duration`), which is what lets the card satisfy all four fields.

### K4 — terminal objective (real pass after one real failure)

| Run | Verdict | Duration | Credits | Reason |
|---|---|---|---|---|
| `k4-terminal.ndjson` | **failed** | 263.1 s | 38.45 | `assertion_error.confirmed_product_bug` — "it shows a passed verdict, at least three executed steps, a duration, and an evidence link" |
| `k4-terminal2.ndjson` | **passed** | 206.7 s | 38.06 | `success.complete`, single flow (`bifurcated: false`, `total_runs: 1`) |

The first terminal run was a genuine product finding: Kane drove the in-app handshake and the card it produced had no duration, so the checkpoint failed. The in-app reproduction above confirmed the same missing field. After the card fix and a raised Kane timeout (300 s for this environment, since 12-step QA runs did not finish inside 140 s), the rerun's `final_state` was `verification_verdict: "PASSED"`, `executed_steps: "12"`, `duration_shown: "true"`, `evidence_link_shown: "true"`, `agent_reply_references_Kane: "true"`.

- In-app AI Play panel: fixture-driven fail → repair → retry smoke passed earlier; real API path verified above.
- Server NDJSON and evidence copies: verified by K1, K4 and both K5 attempts.
- Tool guidance also changed: `verify_with_kane` now tells the model to keep the objective to what the user asked and not to add console-error/bundle checks. The two earlier in-app runs in this session died on exactly that (one "console check did not finish in time", one 145 s timeout), so the passed run is not independent proof that the old objective shape works.

## Game-starter browser evidence — Slice B

### Space Invaders Play and restart

- First named run: `slice-b-space-invaders` (`.testmuai/tests/slice-b-space-invaders_test.md`).
- Outcome: partial, not a clean pass. Kane created the starter, entered Play, exercised D movement and Space firing, verified the HUD/running state, and restarted. The final repeated console-extraction wait timed out after 21 completed progress events; the run took 270.9 s and consumed 68.64 credits.
- Evidence: `C:\Users\Temitope\.testmuai\kaneai\sessions\f634da15-d973-4554-94d7-1db7156a191e\evidence\213a3788-f814-4e17-a104-8f066298c555.evidence`. The captured console logs contain one browser error: `http://localhost:5173/favicon.ico` returned 404. The later console log contains no error-level entries. This is a missing favicon request, not evidence of a gameplay runtime error; the requested console-clean assertion is not considered passed.
- The final screenshot showed `LOST` after the three ships had been spent while the long console inspection was running. This was not a loss/reset acceptance check.

### Space Invaders isolated Play and restart replay

- Second named run: `slice-b-space-invaders-play` (`.testmuai/tests/slice-b-space-invaders-play_test.md`).
- Outcome: failed at the post-input running-state assertion (173.7 s, 41.58 credits). Creation, Play entry, canvas/HUD, and movement/fire inputs completed. By the time Kane checked the state, the game had naturally reached `LOST` with zero ships; the restart and reset-value assertion were not reached. The captured timeline shows the game still playing with three ships at about 10 seconds and lost by about 43 seconds. This is an automation-timing failure, not a confirmed product defect.
- The objective did not request console inspection, so this run is not console evidence. The failure artifact nevertheless showed the Console panel, contrary to that instruction; no console-clean claim is made.
- Evidence pack: `C:\Users\Temitope\.testmuai\kaneai\sessions\37a43ec7-9a6c-4f37-8e0e-43e209284ae9\evidence\9cd59fb4-8c02-4d2b-9885-18ce63177403.evidence`.

### Space Invaders fast restart

- Named run: `slice-b-space-invaders-fast-restart` (`.testmuai/tests/slice-b-space-invaders-fast-restart_test.md`).
- Result: **passed**, 91.1 s, 27.44 credits. Kane created the starter, entered Play, verified the canvas and initial HUD, pressed R immediately, then confirmed `RUNNING`, `SCORE 0`, `SHIPS 3`, and `INVADERS 24`.
- Final state: `http://localhost:5173/play/prj_VrW3mfeR7x`; evidence pack `C:\Users\Temitope\.testmuai\kaneai\sessions\aab7db37-9d1b-4c36-9a05-c4bb23a35aef\evidence\fbaa4003-e59e-4cc1-a406-13a6fe56ae62.evidence`.
- This isolates restart/reset behavior; it does not verify shooting/scoring, a loss/win path, editor tuning, Asteroid Field, or console cleanliness.
- Test Manager: [open the recorded run](https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7PT9G9DS9P28FNFEQ2BPMJ2/dashboard/share/US_AMUS2PCJVEMH8QFZ5YIR2YMJ7S5ITM7YWUSAUWH9AN40U9C38NHJ7OC4XD2ZR8RZ?type=summary&agentView=true&fqdn=summary-page).

### Asteroid Field play and restart smoke

- Named run: `slice-b-asteroid-smoke` (`.testmuai/tests/slice-b-asteroid-smoke_test.md`).
- Result: **passed**, 117.1 s, 34.92 credits. Kane created the starter, verified the canvas and initial `SCORE 0`, `SHIPS 3`, `ROCKS 6`, exercised A-turn/W-thrust/E-fire inputs, then immediately restarted and confirmed `RUNNING` with all initial HUD values restored.
- Final state: `http://localhost:5173/play/prj_g6RnQ5gXRQ`; evidence pack `C:\Users\Temitope\.testmuai\kaneai\sessions\d9cfb7e2-91b8-457e-b8d5-9d5a6fda0b28\evidence\6373c9bc-e771-42a8-a021-7c91932fa049.evidence`.
- This is a Play/input/restart smoke; it does not prove asteroid hits/splitting, score changes, win/loss, editor tuning, or console cleanliness.
- Test Manager: [open the recorded run](https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7PVHK01ZV55M7XKMN597ZNN/dashboard/share/US_TZHM0AQSA9XX75FN0URG69971VY9QL3Z6MBTGHCZRZ4A986X18JQ1ALH3YY46IEU?type=summary&agentView=true&fqdn=summary-page).

### Asteroid Field editor tuning

- Initial named attempt: `slice-b-asteroid-turn-tuning` stopped before project creation when Kane's screenshot capture timed out (112.5 s, 13.46 credits). Evidence pack: `C:\Users\Temitope\.testmuai\kaneai\sessions\124f7ae1-cf44-4ac5-a1b9-57579084e910\evidence\3ae2ad84-0452-47eb-b1e3-48c15137bf84.evidence`. No product behavior was exercised.
- Direct-URL retry: `slice-b-asteroid-turn-tuning-direct` could not find the prior run's project in its isolated browser storage (25.2 s, 11.26 credits); no editor or Play check ran. This was test setup, not a product failure.
- Successful named run: `slice-b-asteroid-turn-tuning-retry` (`.testmuai/tests/slice-b-asteroid-turn-tuning-retry_test.md`) **passed** in 127.8 s (36.47 credits). It set the Pilot's Rotate and thrust **Turn speed from 220 to 0**, then verified in Play that the game remained running and the ship still pointed upward after D was pressed. This proves this editor change affected Play.
- Evidence pack: `C:\Users\Temitope\.testmuai\kaneai\sessions\7cbd987f-1065-4094-b4f3-b30a3379b8ee\evidence\2f2e341b-e5d1-4583-9de1-df0898094794.evidence`.
- Test Manager: [open the recorded run](https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7PW6JSJ6ZQPRGC9GN049ANH/dashboard/share/US_C36SAQ5VVFUTR2CKAMX7TELW2JTKNTSMPNQYOR9TQSDAHZ7UF2HH110MD2UEP0M0?type=summary&agentView=true&fqdn=summary-page).

### Space Shooter loss and R restart

- Named run: `slice-a-space-shooter-lost-restart` (`.testmuai/tests/slice-a-space-shooter-lost-restart_test.md`).
- Kane created Space Shooter, entered Play, reached the normal `LOST` state, then clicked the canvas and pressed R. The subsequent state was `PLAYING` with `SCORE 0` and a full hull bar (`HULL 3`); this is direct evidence that the Play-page restart handler now responds after loss.
- The run **failed its final checkpoint**, not the restart itself. The failure screenshot shows `PLAYING`, `TIME 59` and a full hull bar after R; the step's text analysis instead reported `TIME 34` and expected a numeric hull value although the HUD represents hull as a bar. The screenshot, together with the observed `SCORE 0`, confirms the reset state; the contradictory delayed text check prevented a clean Kane pass.
- Duration: 352.2 s; 55.81 credits. Evidence pack: `C:\Users\Temitope\.testmuai\kaneai\sessions\044c747b-c3b4-4cb6-8fd2-8f6d7e0a16b9\evidence\0387700d-0148-4b22-beef-d7434e957ee6.evidence`.
- Test Manager: [open the recorded run](https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7PWT439GVWJH2DPWV6YPTH0/dashboard/share/US_2PWTLT919WJ1E1GYB98EGLH6SG94IIB4XZECEU7BZBXOZOB2V9XZMUXSL2LKZ88M?type=summary&agentView=true&fqdn=summary-page).

### Space Shooter firing and score check attempts

- First named run: `slice-a-space-shooter-fire-score` (`.testmuai/tests/slice-a-space-shooter-fire-score_test.md`). It created the starter, entered Play, held Space, waited, and released it, but the 10-step limit expired before Kane could assert the score. The failure screenshot showed `SCORE 0`, `HULL` full and `TIME 26`; this is not enough to conclude that firing or scoring is broken because no hit was established. Duration: 125.6 s; 25.92 credits. Evidence pack: `C:\Users\Temitope\.testmuai\kaneai\sessions\f9d3432f-a656-473e-b83c-c3273386d532\evidence\599c7956-6003-4b76-a747-a24cebc7b0ef.evidence`. [Test Manager](https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7PXB51W44J9EGWVDDTAZG2P/dashboard/share/US_B1OKKGWUR5XJEYYLGIOX738X695VPAUCEJ6IK7NSW871A5U5E9RX9CU2SK1X12VA?type=summary&agentView=true&fqdn=summary-page).
- Retry: `slice-a-space-shooter-fire-score-retry` (`.testmuai/tests/slice-a-space-shooter-fire-score-retry_test.md`). The setup used extra navigation steps, and the 16-step limit expired while the game was still running, before key release or score verification. The failure screenshot showed `SCORE 0`, a full hull bar and `TIME 35`; again, no scoring conclusion can be drawn. Duration: 173.5 s; 22.00 credits. Evidence pack: `C:\Users\Temitope\.testmuai\kaneai\sessions\4ecaca57-634d-4bfe-9cc0-eb3504adc307\evidence\1e1ccc92-9e6a-49f0-a67b-4d59612d7802.evidence`. [Test Manager](https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7PXK5KWG6M9GKST6A1C7D3V/dashboard/share/US_18VIT104N9ZB4JDUZN8226F50Z8D04ZCP4KYSI1IHWXIHL7ERYG03Q3RQHT4IA0F?type=summary&agentView=true&fqdn=summary-page).
- Higher-step retry: `slice-a-space-shooter-fire-score-aimed` (`.testmuai/tests/slice-a-space-shooter-fire-score-aimed_test.md`). Kane reached the end of the 60-second watch with `WON`, but the score stayed at 0. The evidence and triage show isolated key presses rather than sustained target tracking and fire, so this is not a valid scoring verdict or a confirmed product defect. Duration: 140.6 s; 30.78 credits. Evidence pack: `C:\Users\Temitope\.testmuai\kaneai\sessions\d91f9819-95d6-4441-8303-e23fcc6692c5\evidence\efce3c96-5de4-4f7d-ae86-4224325e349b.evidence`. [Test Manager](https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7PXYTGMHZ0CF6AR4JPJ74E3/dashboard/share/US_Q84BRLNW1BBUZGTX9E70NASWEHBAE0NG8QCGMLDX9BR4XE6AS28QVUQ4CEF0GSW2?type=summary&agentView=true&fqdn=summary-page).
- Protected-score run: `slice-ab-protected-score` (`.testmuai/tests/slice-ab-protected-score_test.md`) recorded a pass in 212.4 s, extracting `SCORE 1150`. Kane's action trace contains four successful Space key actions, each generated as `await page.keyboard.press('Space')`. The user reports also pressing Space during this run, so the score cannot be attributed solely to Kane and this is not a clean automated scoring pass. Evidence pack: `C:\Users\Temitope\.testmuai\kaneai\sessions\ae390f1b-b4a1-4105-a671-a8dd3b870da4\evidence\6607138b-f80b-4852-9ecd-039520373288.evidence`. [Test Manager](https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7PZC3Z0V0BN5BZ1ZMZTTXP1/dashboard/share/US_DHKJUWQ5TAY0RVYBV0J6129O89YUI1WUW0WAD9IV480C5O8S3WEC23GKF4VJZQL3?type=summary&agentView=true&fqdn=summary-page).
- Post-input-fix retry: `slice-a-input-proof-patched` logged six Space key actions, but the assertion screenshot showed `LOST`, `TIME 49` and an empty hull; the game had stopped before those actions could produce shots or score. This is not a clean keyboard test. Evidence pack: `C:\Users\Temitope\.testmuai\kaneai\sessions\7124278d-3cf2-478f-aaed-75e71dc2765e\evidence\1de4f668-f938-4c13-980b-813655534134.evidence`.
- Protected-health retry: `slice-a-input-proof-stable` set player health to 99. The screenshot showed `PLAYING`, `TIME 25` and a full hull, and the analyzer correctly recorded `LOST` as false; nevertheless, Kane selected the stop-on-`LOST` branch and sent zero Space presses. This automation-flow failure took 257.3 s and 52.06 credits; it is not a game failure or a scoring pass. Evidence pack: `C:\Users\Temitope\.testmuai\kaneai\sessions\2ee967be-2e05-4d90-b1f7-e427af16d95c\evidence\cbcbdab5-b4a1-43ca-843c-df51d79db0ee.evidence`. [Test Manager](https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7Q2V5X5P63HV2M7MT9AJSYS/dashboard/share/US_6FNWB6N2JF2N4BSLU1P0TQ94TTE8ZIYJZO4G32V2YRRL3H3Q99WHT0RKKOT8T6N3?type=summary&agentView=true&fqdn=summary-page).

### Space Shooter keyboard-input test rule

- The runtime shooter previously checked only whether jump/action was still held on a simulation frame; a quick key press can be released before that frame. Shooters now also respond to the captured `jumpPressed`/`actionPressed` edge, covered by a one-frame press regression test.
- Kane's browser timing can still let the game reach `LOST` before the agent finishes planning its first gameplay action. A test must protect player health before Play and verify an observed key action plus a score change; do not use the failing inverse-LOST branch pattern from `slice-a-input-proof-stable`. No clean browser-only score proof has been obtained.

## Reproduction commands

```bash
# Real engine QA (fastest current objective)
sh scripts/kane/run-objective.sh scripts/kane/objectives/k1-editor-smoke.txt http://localhost:5173

# Real AI Play fail → repair → pass on the reduced fixture
node --import tsx scripts/kane/ai-play-smoke.ts

# Independent negative control: unsatisfiable win rule, fail → repair → pass
node --import tsx scripts/kane/negative-control.ts

# Full demo two-attempt loop (real, 151.6 s)
# http://localhost:5173/?demoReset=1 → Neon Runner → AI Play
# needs a signed-in Kane CLI; no feature flag. KANE_TIMEOUT_SECONDS=140 KANE_MAX_STEPS=8
```

## Limitations

- The full Neon Runner AI Play loop is verified as fail → fix → pass in 151.6 s (85.0 s + 66.6 s) with the assert-only objective. With the required `store ... as` extraction the passing attempt measured 86.8 s, so the same loop is ~172 s — only 8 s of headroom against the 180 s budget. The saved-test replay path is the margin, and it is still unmeasured.
- K2 is the one objective recorded as environment-blocked: after its defect was found and fixed, three runs died on "browser target stopped running during screenshot capture" after selecting Player, with no product error in NDJSON. K3a, K3b, K4 and K5 are real passes (above); K2 is not claimed as either a pass or a product failure.
- K5's failure record does not name the inaccessible coin and stored no values (`final_state: {}`); the embedded `Core A` was identified by the product's deterministic repair, and the passing attempt's `coins: "3"` proves the move was required.
- The saved-test replay path (`KANE_AI_PLAY_TEST`) is verified against the documented stream contract only. It needs one real authored run to produce `output-ai-play-demo/` recordings before replay can be measured; that run was not made here.
- The independent negative control now passes (unsatisfiable win rule, above), but its repair is applied deterministically by the harness. Model-driven diagnosis of a *non-coin* failure is still only evidenced indirectly by K3a's agent repair and K5's product repair.
- The full Neon Runner loop uses the deterministic embedded-coin repair, not a model-driven diagnosis. The agent path is exercised by the reduced-fixture smoke and the fixture stream, not by an LLM turn on the demo.
- Evidence packs and run NDJSON stay untracked under `.data/` and `.testmuai/` as intended.
- The toolbar "Ask agent" button was a plain `DropdownMenu` trigger, so a click only opened the "Game Director" menu and the drawer needed a second click on `Open chat` (in whatever mode was last active). It is now the plan's split button: `agent-open` is its own button that opens the drawer in Build with the selection attached, and `agent-menu` (the chevron) opens the menu. Real CDP clicks at 1366×768 confirm main → `Build` + `Locked: Hint`, chevron → menu with the drawer still closed (`.data/split-main-click.png`, `.data/split-menu.png`). With no tool-capable model the main click falls back to Ask rather than landing on a disabled Build tab. The menu keeps its fourth entry, `Ask about this scene`, which the plan's three-item list does not name.
- In-app QA needed `KANE_TIMEOUT_SECONDS=300` in this environment. The 140 s budget that fits AI Play does not fit a 12-step engine-QA run; the default remains 180 s in code.
