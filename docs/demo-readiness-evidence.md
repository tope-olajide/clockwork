# Demo readiness evidence

Tracked, portable record of the live Kane runs behind `docs/demo-readiness.md`.
Paths are repo-relative; no local absolute paths. Raw run artifacts live under
`.data/ai-play/<runId>/` (gitignored); the typed results below are the reviewable
record.

## Phase 3 — first live pass through the agent

- **Date:** 2026-11-21
- **Kane CLI:** 0.10.6, authenticated
- **Planner model:** `deepseek-v4.1-flash (env)`, tool-capable
- **Project:** Space Shooter Demo (`prj_FQTuy0lXEs`), revision 0, scene `scn_0_daOQj5sE`, seed 1234, no scenario
- **User goal:** “An accepted SHOOT hold is visible in the accepted-input counter, increments shots fired and creates a projectile, without claiming a hit.”
- **Phase:** `shoot-hold-creates-projectile` — toggle SHOOT on, type 45, STEP once, toggle SHOOT off, store all four values in one read, end immediately
- **Budget:** 1 phase, 8 steps, 240 s wall, 45 frames/advance, 180 frames/phase
- **Approval:** local user, before the run; the run went through `run_kane_test_phase`, not the panel button

### Result

- **Run id:** `b967bbdd-0eec-4899-9190-77adfeb9a78e`
- **Snapshot id:** `cXfuwKVo5LENlQ`
- **Kane status:** `passed` (`run_end.status: passed`)
- **Phase verdict:** `passed`, `failureKind: none`
- **Reason:** “Kane passed and every approved assertion matched the observed values.”
- **Accepted inputs:** 1
- **Frames advanced:** 45
- **Assertions:**
  - `shots-fired-increased`: expected increase ≥ 1, actual `3` → passed
  - `projectiles-increased`: expected increase ≥ 1, actual `3` → passed
- **Runtime errors:** none
- **Duration:** 79.7 s
- **Credits consumed:** ≈ 25.03
- **Evidence:** `/api/kane/runs/b967bbdd-0eec-4899-9190-77adfeb9a78e/evidence`
- **Test Manager:** `https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7YP572T046EZPZAACGJTTR7/dashboard/share/US_ACIW3XQEOIN7GLU438RIYWFPLYNU1PG01PQZ0PLT5ZRNJU64A94KK9QCO8UTBM5I?type=summary&agentView=true&fqdn=summary-page`
- **Agent follow-up:** the same conversation cites the verdict, accepted inputs, frames, both assertion values, run id and evidence URL against the original goal, clause by clause. No pass was claimed before the typed result arrived.

### What the earlier attempts proved (honest record)

| Run id | Outcome | What it taught |
|---|---|---|
| `843dbf78-…` | INCONCLUSIVE, timeout (66 s on a 60 s budget) | Wall budget must cover Kane startup, not just gameplay frames. |
| `60843afe-…` | INCONCLUSIVE, timeout (146 s on a 140 s budget) | Navigation succeeded; the first large advance stalled. |
| `cf2518a2-…` | `failed` (config): Test Mode showed UNAVAILABLE | First-paint bug: assigning the TestController ref never re-rendered the HUD. Fixed in `SnapshotPlayerPage`. |
| `52e57ca7-…` | `failed` (step budget): repeated frame entry, 8/6 steps | 6 steps are too few once Kane retypes frame values. |
| `c9545273-…` | `failed` (automation): SHOOT click landed on STEP 10 | The profile-control row and frame-advance row overlapped at the same bottom offset. Fixed in `TestModeHud` + `base.css`. |
| `d1f11f0c-…` | INCONCLUSIVE, timeout (146 s) | All gameplay steps done, but `run_end` never arrived: the 140 s ceiling killed finalization. Ceiling raised to 300 s; objective now says end immediately with no wait steps. |
| `498a5567-…` | INCONCLUSIVE, timeout (146 s) | Compact 5-step sequence completed through the observation read, then killed during finalization. Confirmed the fix needed is time-to-finish, not fewer frames. |
| `b967bbdd-…` | **PASSED** | 5-step compact sequence, 240 s budget, 79.7 s actual. |

Total live-run spend for Phase 3, including diagnosis: 8 paid Kane runs.

## Phase 4 — the adaptive kill-chain follow-up

Decision rule (recorded before acting): Phase 3 proved input creates
projectiles. The profile's own objective ladder says the next causal link is
shoot-destroys-enemy, so Phase 4 tests exactly that: a fired projectile kills
the `shooting-range` Raider, a death is recorded, score increases. Every
revision below was driven by artifact analysis of the previous attempt, and
every attempt ran through the agent path (draft → approval →
`run_kane_test_phase` → agent follow-up).

- **Attempt 1 — `f1780d7f` (inconclusive, timeout, 248 s).** Kane held SHOOT
  and clicked STEP once at the default 10-frame advance (≈ 130 px of bullet
  travel against a Raider ≈ 480 px up the lane), then stalled with no further
  instruction: the agent-drafted phase never told it to type 150 or click STEP.
  All checks `missing`. Lesson: the plan must spell out the time advance, not
  just the read.
- **Attempt 2 — `466e66d8` (failed, step budget, 103.9 s).** Gameplay done
  right (SHOOT, typed 150, STEP, released), but Kane saved only FRAME at step
  8 then burned the rest on waits. No observation of an effect — correctly
  recorded as failure, never as a pass.
- **Attempt 3 — `e367aea0` (Kane `passed`, verdict inconclusive/observation,
  96 s, ≈ 28.9 credits).** The kill chain works in-game: 12 shots fired,
  1 target destroyed, score 100, hull untouched at 3, 150 frames, evidence +
  Test Manager links. But Kane saved `shots_fired` (underscore) instead of
  the exact id `shots-fired` (hyphen), so one required check went `missing`
  and the pipeline refused the pass. This is the verdict pipeline proving a
  near-miss with the same rigor as a pass.
- **Attempt 4 — `ef3a47a9` (Kane `failed`, verdict inconclusive/observation,
  95.8 s, ≈ 28.4 credits).** Kane used a `wait` step despite the plan
  forbidding it, burned the 8-step budget, recorded nothing. Correctly
  classified, evidence attached.

**Agent behavior worth the blog:**

- After each attempt the agent diagnosed from artifacts (not vibes): the
  10-frame-vs-480px analysis, "no observation of an effect is different from
  an effect that failed to occur", refusal to infer the kill.
- It caught a real product-rule subtlety I initially got wrong: cutting the
  read list to three values would make a pass structurally impossible,
  because the judge requires `accepted_inputs` and `frames_advanced`.
- Most importantly: when asked for the final summary, the agent disclosed
  that two run ids (the Phase 3 pass and attempt 1) were outside its current
  tool-output context after a page reload, reported them as user-reported
  only, and refused to certify a pass it did not observe. The honesty
  pipeline holds at the conversation layer too — a model that will not claim
  what it cannot source.

**Phase 4 status:** the adaptive loop is demonstrated (artifact-driven
revisions, typed results, agent follow-ups, agent-proposed fixes), and the
game-side kill chain is proven by attempt 3's in-game values. A second full
`passed` verdict remains open: the blocker is Kane-model step discipline
(wait habit, exact key naming), not the game or the harness. No further paid
runs were spent chasing model variance.

Total live-run spend for Phase 4: 4 paid Kane runs.

## Phase 5 — panel-to-agent feedback loop (code-verified, no live run)

- Every stored phase result now has an **Explain in agent** button
  (`test-plan-explain-<phaseId>`) in `TestPlanPanel`. It calls
  `agent.continueWithPhaseResult`, which appends the result to the same
  conversation as a typed `run_kane_test_phase` tool message — never a fake
  user message — then runs a model turn so the agent explains it and may
  request a follow-up phase with its own tool call.
- The agent loop was refactored so `send` (user message) and
  `continueWithPhaseResult` (panel result) share one `runTurn`: same
  8-step tool loop, same revision-recovery, same error mapping.
- `run_kane_test_phase` tool cards render a dedicated rich card
  (`kane-phase-card`): phase id + verdict, failure kind, per-assertion values,
  accepted inputs and frames (`unknown`, never `0`, when null), duration and
  evidence link.
- Both paths build their payload with one `phaseResultPayload` from the single
  stored `KanePhaseResult`, so the panel block and the agent card cannot show
  contradictory verdicts.
- `tests/kane-phase-continuation.test.ts` (6 tests) covers payload fidelity,
  the tool-not-user continuation shape, card fields, verdict tones and the
  null-inputs rule. `npm run typecheck` passes.
- Honest scope note: verified by typecheck + unit tests only. No live Kane
  run was spent proving the handoff end to end; that is Phase 7 demo-video
  material.

## Phase 6 — `testmd` replay path (code complete, measured live, one open limitation)

- **Date:** 2026-11-21. **Kane CLI:** 0.10.6, authenticated. Balances:
  7550.4534 pre-Phase-6 → 7521.7914 after an early 186.1 s wall-timeout
  probe (28.66cr) → 7498.9435 after run A (22.85cr) → 7460.9185 after run B
  (38.02cr) → 7430.0345 after run C (~30.88cr).
- **Registry:** `server/kane/replay-tests.ts` maps `space-shooter-fire` →
  `scripts/kane/tests/phases/space-shooter-fire_test.md` → phase
  `fire-creates-projectile`. The route resolves the key server-side (never a
  caller path), refuses unknown keys (`kane-replay-missing`) and
  wrong-phase keys (`kane-replay-mismatch`), both 400. `GET
  /api/kane/phase-replays` feeds the panel's per-phase "Replay saved test"
  button. Replay runs use `testmd run <file>` with `--no-adaptive-heal`.
- **Runs** (all through `POST /api/kane/phase` with a hand-built plan over a
  fresh starter snapshot — same route, judge and snapshot mechanism as the
  agent path; only plan authorship differed because the agent model provider
  returned `fetch failed` all afternoon):
  - A `be3b1863` (no replay key): Kane `passed` in 57.9 s / 10 steps, but the
    judge returned `failed` / product — one frame advanced, 0 shots, 0
    projectiles. Evidence + Test Manager link present.
  - B `e3befc89` (recorded file): verdict `passed` / none, 121 s, 2/2 steps
    (0 replayed, 2 authored). Shots 3, projectiles 3, accepted 1, frames 45.
    Evidence yes, `testUrl` empty (no `share_url` emitted).
  - C `f4ee134b` (same file, fresh server to clear idempotency): verdict
    `passed` / none, 120 s, 2/2 (0 replayed, 2 authored) — observations
    identical to B (3/3/1/45). Evidence yes, `testUrl` empty.
- **Why no step replayed:** both `test_md_summary` events report
  `commit: {committed: false, reason: "not_committed"}` and `upload:
  {succeeded: false}`; the output dir holds only `.internal/meta.json`, no
  step tapes. With no recordings the CLI authors every step (per the replay
  rule), so run C is a second authoring through the replay path, not a
  cache replay — same observations, same ~120 s cost, no speedup.
- **Fallback (documented, no extra run needed):** omit `replayTestKey` for a
  fresh authored run; a mismatched key gets a 400 naming the owning phase;
  healing stays off so a replay failure is fast and visible. The
  `share_url` → `test_url` mapping and the `--no-adaptive-heal` invocation
  are covered by `tests/kane-phase-replay.test.ts` (6 tests, pass).
- **Open limitation:** no run has shown `replay_decisions > 0`, so no replay
  timing or credit saving is claimed. Do not present run C as a replay win.

Total live-run spend for Phase 6: 4 paid Kane runs (1 timeout probe + A + B + C).
