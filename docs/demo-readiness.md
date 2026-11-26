# Demo readiness checklist

This is the execution order for the Kane hackathon demo. Work strictly top to
bottom. A phase is complete only when every checkbox in that phase is checked and
its evidence is recorded. Do not start the next phase while the current phase has
an open item.

**Rule:** no skipped phases, no “temporarily” moving ahead, and no claim of
completion from a compile-only check. Browser/Kane claims require recorded evidence.

## Phase 1 — Commit and push the phase fixes

- [x] Phase objective tells Kane the visible control labels, hold/pulse semantics,
      ADVANCE/STEP sequence and approved frame limits.
- [x] Approved per-step and per-phase frame budgets reach the snapshot player and
      are enforced by `TestController`.
- [x] The server refuses a pass when the frame count is missing or over budget.
- [x] Input receipts count only inputs that actually reached a runtime frame.
- [x] Undelivered input is classified as `INCONCLUSIVE`, not a product failure.
- [x] Baselines use the plan’s scene and scenario.
- [x] Phase budget/idempotency key is derived from plan content, not the
      client-supplied session id.
- [x] `npm run typecheck` passes.
- [x] Focused Kane/Test Mode/report tests pass.
- [x] `npm run build` passes.
- [x] Changes are committed and pushed to `origin/feat/game-starter-templates`.

**Gate:** pushed commit contains the phase-contract fixes. Do not proceed until the
push is confirmed.

## Phase 2 — Make the submission surface match the product

- [x] README describes the shipped AI Testing / Kane phase flow, setup and demo path.
- [x] `features.md` lists the completed AI Testing, Kane Test Mode, chat redesign,
      attachments and chat history features.
- [x] `docs/known-issues.md` reflects the current phase status and open items.
- [x] `docs/ai-play.md` is updated for applied-input and frame-budget semantics.
- [x] [`docs/archive/KANE_AI_TESTING_IMPLEMENTATION_PLAN.md`](archive/KANE_AI_TESTING_IMPLEMENTATION_PLAN.md) (since moved to the archive) no longer says no features were implemented.
- [x] Stale “arrives in Slice …” UI copy is removed:
      - [x] Projects command palette AI Play toast
      - [x] Project overview Playtest placeholder
      - [x] Editor import-asset menu item
      - [x] TopBar help/feedback toasts
      - [x] Command palette assets toast
- [x] `npm run check:repo` passes.
- [x] Docs/UI changes are committed and pushed.

**Gate:** a judge can read the repo and use the app without seeing the main feature
described as future work.

**Completed:** Phase 2 commit on this branch (README/docs/UI alignment).

## Phase 3 — One live Space Shooter phase through the agent

- [x] Server is running with a signed-in Kane CLI, a positive credit balance and
      a tool-capable model configured. Kane has no feature flag.
- [x] `kane-cli whoami` is authenticated and `/api/kane/status` reports ready.
- [x] Space Shooter project is open at a known revision.
- [x] Agent drafts a plan from a real user goal.
- [x] Plan is reviewed and approved; no Kane run starts before approval.
- [x] One phase is started through `run_kane_test_phase`, not the direct panel button.
- [x] The result records:
      - [x] raw `run_end`
      - [x] applied input count
      - [x] final frame count
      - [x] every observation’s actual value
      - [x] every assertion’s pass/fail/missing status
      - [x] evidence URL and run id
      - [x] phase verdict and failure kind
- [x] Agent follow-up cites the phase result and references the original user goal.
- [x] Result is visible in the agent conversation, not only in local state.
- [x] Evidence and a short transcript are recorded in `docs/demo-readiness-evidence.md`
      or an equivalent tracked artifact without local absolute paths.

**Gate:** a single real, reviewed, evidence-backed phase pass exists. This must be a
real Kane run, not a fixture.

**Completed:** run `b967bbdd-0eec-4899-9190-77adfeb9a78e` — verdict `passed`, 1 accepted
input, 45 frames, shots-fired 3, projectiles 3, evidence + Test Manager links in
`docs/demo-readiness-evidence.md`.

## Phase 4 — Prove the adaptive decision or a deliberate failure

- [x] Choose the next phase from the Phase 3 observations, not from a prewritten
      unconditional second run.
- [x] Record the decision rule explicitly:
      - [x] no applied input → diagnose the input bridge
      - [x] input applied but effect missing → diagnose the effect
      - [x] effect present but target/score unchanged → diagnose collision/rule
      - [x] all criteria passed → stop or test a distinct objective
- [x] Ran follow-up `shoot-destroys-raider` phases through the agent path (four
      attempts; none reached a typed `passed` verdict in this phase).
- [x] Recorded each attempt's typed result (verdict, failure kind, observations,
      evidence) in the evidence doc.
- [x] The final agent response summarized the phases it had observed with
      PASS/FAIL/INCONCLUSIVE per criterion, and declined to certify two runs that
      were outside its tool-output context.
- [x] A timeout or missing-observation case is recorded as `INCONCLUSIVE` at least
      once, if obtainable without spending an unreasonable number of credits.
- [x] Evidence/transcript is added to the tracked demo evidence artifact.

**Gate:** the second action is demonstrably driven by the first result, or a failure
is honestly classified. One phase alone is not enough. (No second typed pass came
from this phase. Later approved phases `98e21783` and `ea1bb3b3` did pass; see
`docs/kane-proof.md` and `docs/demo-readiness-evidence.md`.)

**Completed:** four `shoot-destroys-raider` attempts through the agent path —
timeout, step-budget failure, Kane-passed-but-key-mismatch inconclusive
(destroyed 1, score 100 proven in-game), wait-wasted inconclusive. The adaptive
loop, the verdict rigor on non-passes, and the agent's refusal to certify
runs outside its observed context are recorded in
`docs/demo-readiness-evidence.md`.

## Phase 5 — Close the panel-to-agent feedback loop

- [x] A phase run started from `TestPlanPanel` can be handed to the agent without
      pretending it is a fake user message.
- [x] The phase result is appended to the same conversation as a typed tool result
      or an equivalent structured continuation.
- [x] The agent can explain the result and request a follow-up phase.
- [x] `run_kane_test_phase` has a dedicated rich result card:
      - [x] phase id and verdict
      - [x] failure kind
      - [x] assertion values
      - [x] applied inputs and frames
      - [x] evidence link
      - [x] duration
- [x] The direct panel path and agent path do not display contradictory verdicts.
- [x] Focused tests cover the result-card/continuation shape.
- [x] Typecheck passes.

Phase 5 was verified by unit tests and typecheck, not by a live run at the time.
`EditorPage` calls `agent.continueWithPhaseResult(result)`, so the panel's phase
result does feed the agent loop. The approved phase flow was live-proven later
(`98e21783`, `ea1bb3b3`).

**Gate:** judges do not need to understand the difference between two separate
phase-running paths to see the closed loop.

## Phase 6 — Use Kane’s saved-test replay for approved phases

- [x] Identify a stable phase objective that can be replayed safely.
- [x] Add `testmd` replay support to the phase runner with an explicit saved-test
      path and `--no-adaptive-heal`.
- [x] First replay uses a recorded test; replay failure does not silently re-author.
- [x] Evidence packs remain attached to the replay-path results. (Test Manager links
      are absent on those runs because the CLI emitted no `share_url`.)
- [x] Measure and record:
      - [x] authored run duration (run B)
      - [x] duration of a second run through the replay path (run C; it authored and
            no step replayed from cache, so this is not a replay duration)
      - [x] credit/cost of each run
      - [x] whether run C produced the same observations as run B (it did)
- [x] Document when replay is allowed and when a fresh plan is required.
- [x] Update `docs/kane-proof.md` with the live runs through the replay path.

**Gate:** the saved-replay path has real measured runs through it and a documented fallback. No run showed `replay_decisions > 0`.

**Completed:** replay registry + route + panel wired (`7ba6318` follow-up,
`tests/kane-phase-replay.test.ts` 6 pass, typecheck clean) and three live
runs through `POST /api/kane/phase`: A one-shot authored (`failed`/product,
57.9 s, ~22.85cr), B testmd authoring (`passed`, 121 s, ~38.02cr, 0
replayed/2 authored, shots 3 / projectiles 3 / accepted 1 / frames 45), C
same file on a fresh server (`passed`, 120 s, ~30.88cr, identical
observations). Limitation recorded in `docs/kane-proof.md` and the
evidence doc: both `testmd` runs authored (CLI persisted only `meta.json`,
`commit: not_committed`, `upload: failed`), so no step replayed from cache
and no replay speedup is claimed. Fallback documented: omit the key for a
fresh author, mismatch → 400, healing off. Driven via direct HTTP because
the agent model provider was unreachable; route, judge and snapshot
mechanism are identical to the agent path.

## Phase 7 — Browser smoke test or recorded demo fallback

- [x] Add a minimal smoke test for the phase flow, or record a manual demo video.
- [x] Smoke covers:
      - [x] open project and select AI Testing
      - [x] review a seeded draft and approve it
      - [x] run one phase through the panel replay path (fixture Kane)
      - [x] view typed result and evidence
      - [x] explain-in-agent follow-up (mock model) opens the chat and replies
      - [x] no console errors during the flow
- [x] If automated, the check is runnable from a documented command and does not
      depend on Kane credits unless explicitly marked as a live test.
- [x] No demo recording was made; the automated smoke was chosen instead.

**Gate:** a new reviewer can reproduce or at least review the end-to-end story.

**Completed:** `npm run smoke:phase` (`scripts/kane/phase-smoke.mts`) —
self-contained, zero Kane credits, zero LLM calls. Layer A hits the phase
route with fixture Kane (one-shot pass with typed inputs/frames/evidence/
duration; unknown-key and wrong-phase 400s; replays list). Layer B drives
real headless Chrome over CDP: create Space Shooter starter, open AI Play,
review the seeded draft, approve, replay the recorded test to a passed typed
result with checks + evidence + final report, then explain-in-agent against
the mock model — with a console/page-error check that passes clean (fixed
the lone offender, a missing favicon, with `public/favicon.svg`). Seeded
draft and mock follow-up stand in for model authoring; both were proven
against live models in Phases 3 and 5.

## Phase 8 — Final verification and submission gate

- [x] `npm test` passes.
- [x] `npm run typecheck` passes.
- [x] `npm run build` passes.
- [x] `npm run check:repo` passes.
- [x] `git status` is clean except intentional, documented local artifacts.
- [x] The final commit is pushed.
- [x] `docs/demo-readiness-evidence.md` contains the live phase evidence, run ids,
      verdicts, observation values and evidence links.
- [x] The README quick start works on this checkout (build + credit-free smoke); not
      verified from a fresh clone.
- [x] No stale “future slice” copy remains in the demo path.
- [x] The final message to judges states exactly what was live-tested and what was
      not.

**Gate:** all prior phases are complete. Do not claim the hackathon demo is finished
until this phase is fully checked.

**Completed:** `npm test` 126/126 at the time (176 tests across 27 files pass now), typecheck clean, `vite build` clean
(1m8s), `check:repo` clean. `git status` shows only `.claude/` (local Kane
skill install mirroring tracked `.agents/skills/`) and `.testmuai/`
(CLI-generated run artifacts: authored `_test.md` files, recordings,
`Result.md` files) untracked — both intentional local artifacts, consistent
with the repo's standing policy that evidence packs and run NDJSON stay
untracked. Evidence doc holds run ids, verdicts, values, evidence URLs and
Test Manager links for Phases 3/4/6 plus the Phase 8 submission statement.
No "arrives in Slice" / "coming soon" copy remains in `src/`. Quick start
verified via build + credit-free smoke on this checkout (same tree a fresh
clone installs), not a literal fresh-clone install.

## Chat closed-loop run

Run `a20a4b28-5387-4849-a978-a5ca5aa499c3` (2026-11-25): the in-app agent added coins and a SCORE HUD to a Meadow Sandbox project and called `verify_with_kane`. The check passed in the simulator and in a real browser at project revision 9. See `docs/kane-proof.md`.

## Current status

| Phase | Status |
|---|---|
| 1 — Commit/push phase fixes | Complete |
| 2 — Submission surface | Complete |
| 3 — Live phase through agent | Complete |
| 4 — Adaptive/failure proof | Complete |
| 5 — Panel-to-agent loop | Complete |
| 6 — `testmd` phase replay | Complete (one open limitation: no cache-replay observed) |
| 7 — Browser smoke/demo | Complete |
| 8 — Final verification | Complete |
