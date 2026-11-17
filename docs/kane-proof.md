# Kane evidence ledger

This file records real Kane runs only. Fixture output is labelled as fixture output.

## Environment

| | |
|---|---|
| Date | 2026-11-17 |
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
- Reproduce: `node --import tsx scripts/kane/ai-play-smoke.ts` (requires `KANE_ENABLED=1`, `KANE_AI_PLAY_ENABLED=1`, and a running server).

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
| K5 AI Play closed loop | **passed** | full Neon Runner fail → fix → pass, 151.6 s (above) |
| K2 agent double jump | **failed** (environment, 3 attempts) | real runs, see below |
| K3 agent repair | **failed** (Play input, after the agent path worked) | real run, see below |
| K4 agent ↔ Kane handshake | not run | depends on a stable K2/K3 |

### K2 — agent double jump (real run, failed)

- Objective: `scripts/kane/objectives/k2-agent-double-jump.txt`, 300 s cap, `--bug-detection continue`.
- Result: `run_end.status: "failed"`, 265.7 s, 47.56 credits. Kane opened Neon Runner, selected Player, opened the agent, sent "Give the player a double jump", hit `No model` / "Build/Plan require a tool-capable model", retried, and both sends ended in a fetch failure.
- Kane's summary: the panel showed "No model" and the run proceeded anyway; both attempts ended with a fetch failure rather than applying the change. Its recommendation: block the request when the panel shows "No model".
- This is a **real defect caught by Kane**, not an environment crash: the app disables the Build/Plan tabs but still allows the request path to proceed, and a failed provider stream surfaces as a raw fetch failure instead of an actionable "connect a tool-capable model" message. The first K2 attempt also hit the same `environment_issue/platform_failure` (browser crashed during screenshot) seen in K1, and passed that point on retry after ~800 MB of memory was freed.
- Consequence: K2's agent behaviour cannot be verified until a tool-capable model is configured in the app; K3 depends on the same capability, so it was not run rather than spending credits on a known block.

#### Follow-up: the no-model defect is fixed

- `server/ai/store.ts` now surfaces a single-provider `.env` setup (`LLM_MODEL` / `LLM_BASE_URL` / `LLM_API_KEY`) as a read-only `env` provider and `env:<model>` model with `tools: true`; the client auto-selects it when nothing else is chosen. Before this, the server could already answer with the env model while the app showed "No model", Build/Plan were disabled, and sends failed as raw fetch errors.
- `src/features/agent/useAgentSession.ts` now blocks before the network when no model is selected, the provider has no key, or Build/Plan is used without a tool-capable model, with actionable guidance (choose a model / open settings). Provider/network failures are reworded to point at Settings → AI Models instead of a bare `fetch failed`.
- Verified: `POST /api/ai/step` with `env:deepseek-v4.1-flash` streams `ready`; `/api/ai/providers` reports the env provider `configured: true, source: env`; `/api/ai/models` lists `deepseek-v4.1-flash (env)` with `tools: true`. (A wrong key in `.env.local` was replaced by the user during this pass; the endpoint was re-verified after the restart.)

#### K2 after the fix: still an environment failure

Three further real runs all ended the same way: `run_end.status: "failed"` at 51–60 s, reason "browser target stopped running during screenshot capture", immediately after selecting Player in the hierarchy. Cost 3.1–13.1 credits per attempt. The NDJSON shows no product error and no rejected request. This is the same `environment_issue/platform_failure` recorded in K1's evidence; it is a local Chrome/graphics stability limit, not a regression.

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

**Fix direction:** expose the command reference (a `list_commands` read tool returning each type's arg keys, and/or a compact cheat-sheet in the Build prompt), and echo the expected args back in the failure message so one retry can succeed instead of four blind attempts.

**Kane steerability probe** (`scripts/kane/objectives/k3-steer-probe.txt`, 199.4 s, 33.1 credits): `run_end.status: "passed"`, `final_state { player_moved: "true", coins_counter: "2" }`, summary "Clicked to the right of the player … The player moved, and the COINS counter reached 2". Click steering is therefore the input path K3 should use; `k3-agent-repair.txt` was rewritten to click the stage instead of pressing keys.
- An earlier K3 attempt was killed by a 320 s wrapper mid-repair (no `run_end`, no verdict) and is not evidence either way.

K1 exposed two real UI/accessibility defects (collapsed inspector; unsafe hierarchy-row semantics), both fixed before the passing run. That count is what the evidence supports, not a cap: engine QA runs with `--bug-detection continue`, so any further confirmed defect is recorded here too. The same evidence pack also contains one `environment_issue/platform_failure` (browser target crashed during a screenshot) which is not a product bug and is not counted. No product bug is claimed from the AI Play fixture.

## Bar 3 — agent and Kane talked to each other

- In-app AI Play panel: fixture-driven fail → repair → retry smoke passed earlier; real API path verified above.
- In-app `KaneRunCard`: implemented, not driven in a real agent turn in this pass.
- Server NDJSON and evidence copies: verified by K1 and the AI Play smoke.

## Reproduction commands

```bash
# Real engine QA (fastest current objective)
sh scripts/kane/run-objective.sh scripts/kane/objectives/k1-editor-smoke.txt http://localhost:5173

# Real AI Play fail → repair → pass on the reduced fixture
node --import tsx scripts/kane/ai-play-smoke.ts

# Full demo two-attempt loop (real, 151.6 s)
# http://localhost:5173/?demoReset=1 → Neon Runner → AI Play
# needs KANE_ENABLED=1 KANE_AI_PLAY_ENABLED=1 KANE_TIMEOUT_SECONDS=140 KANE_MAX_STEPS=8
```

## Limitations

- The full Neon Runner AI Play loop is verified as fail → fix → pass in 151.6 s (85.0 s + 66.6 s) with the assert-only objective. With the required `store ... as` extraction the passing attempt measured 86.8 s, so the same loop is ~172 s — only 8 s of headroom against the 180 s budget. The saved-test replay path is the margin, and it is still unmeasured.
- K2–K5 were not executed against real Kane in this pass. Their objectives remain in `scripts/kane/objectives/`.
- The saved-test replay path (`KANE_AI_PLAY_TEST`) is verified against the documented stream contract only. It needs one real authored run to produce `output-ai-play-demo/` recordings before replay can be measured; that run was not made here.
- The independent negative control (unreachable goal rather than the seeded coin) has not been run.
- The full Neon Runner loop uses the deterministic embedded-coin repair, not a model-driven diagnosis. The agent path is exercised by the reduced-fixture smoke and the fixture stream, not by an LLM turn on the demo.
- Evidence packs and run NDJSON stay untracked under `.data/` and `.testmuai/` as intended.
