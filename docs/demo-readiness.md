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
- [x] `docs/KANE_AI_TESTING_IMPLEMENTATION_PLAN.md` no longer says no features were implemented.
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

- [ ] Server is running with a signed-in Kane CLI, a positive credit balance and
      a tool-capable model configured. Kane has no feature flag.
- [ ] `kane-cli whoami` is authenticated and `/api/kane/status` reports ready.
- [ ] Space Shooter project is open at a known revision.
- [ ] Agent drafts a plan from a real user goal.
- [ ] Plan is reviewed and approved; no Kane run starts before approval.
- [ ] One phase is started through `run_kane_test_phase`, not the direct panel button.
- [ ] The result records:
      - [ ] raw `run_end`
      - [ ] applied input count
      - [ ] final frame count
      - [ ] every observation’s actual value
      - [ ] every assertion’s pass/fail/missing status
      - [ ] evidence URL and run id
      - [ ] phase verdict and failure kind
- [ ] Agent follow-up cites the phase result and references the original user goal.
- [ ] Result is visible in the agent conversation, not only in local state.
- [ ] Evidence and a short transcript are recorded in `docs/demo-readiness-evidence.md`
      or an equivalent tracked artifact without local absolute paths.

**Gate:** a single real, reviewed, evidence-backed phase pass exists. This must be a
real Kane run, not a fixture.

## Phase 4 — Prove the adaptive decision or a deliberate failure

- [ ] Choose the next phase from the Phase 3 observations, not from a prewritten
      unconditional second run.
- [ ] Record the decision rule explicitly:
      - [ ] no applied input → diagnose the input bridge
      - [ ] input applied but effect missing → diagnose the effect
      - [ ] effect present but target/score unchanged → diagnose collision/rule
      - [ ] all criteria passed → stop or test a distinct objective
- [ ] Run the second phase through the agent path, or run a deliberate assertion
      failure if that is more informative.
- [ ] Record the second typed result with the same evidence fields as Phase 3.
- [ ] The final agent response summarizes both phases with PASS/FAIL/INCONCLUSIVE
      per criterion and evidence links.
- [ ] A timeout or missing-observation case is recorded as `INCONCLUSIVE` at least
      once, if obtainable without spending an unreasonable number of credits.
- [ ] Evidence/transcript is added to the tracked demo evidence artifact.

**Gate:** the second action is demonstrably driven by the first result, or a failure
is honestly classified. One phase alone is not enough.

## Phase 5 — Close the panel-to-agent feedback loop

- [ ] A phase run started from `TestPlanPanel` can be handed to the agent without
      pretending it is a fake user message.
- [ ] The phase result is appended to the same conversation as a typed tool result
      or an equivalent structured continuation.
- [ ] The agent can explain the result and request a follow-up phase.
- [ ] `run_kane_test_phase` has a dedicated rich result card:
      - [ ] phase id and verdict
      - [ ] failure kind
      - [ ] assertion values
      - [ ] applied inputs and frames
      - [ ] evidence link
      - [ ] duration
- [ ] The direct panel path and agent path do not display contradictory verdicts.
- [ ] Focused tests cover the result-card/continuation shape.
- [ ] Typecheck passes.

**Gate:** judges do not need to understand the difference between two separate
phase-running paths to see the closed loop.

## Phase 6 — Use Kane’s saved-test replay for approved phases

- [ ] Identify a stable phase objective that can be replayed safely.
- [ ] Add `testmd` replay support to the phase runner with an explicit saved-test
      path and `--no-adaptive-heal`.
- [ ] First replay uses a recorded test; replay failure does not silently re-author.
- [ ] Evidence and Test Manager references remain attached to the replay result.
- [ ] Measure and record:
      - [ ] first authored run duration
      - [ ] replay duration
      - [ ] credit/cost difference if available
      - [ ] whether the replay produced the same observations
- [ ] Document when replay is allowed and when a fresh plan is required.
- [ ] Update `docs/kane-proof.md` with real replay evidence.

**Gate:** the saved-replay path has a real measured run and a documented fallback.

## Phase 7 — Browser smoke test or recorded demo fallback

- [ ] Add a minimal smoke test for the phase flow, or record a manual demo video.
- [ ] Smoke/demo covers:
      - [ ] open project and select AI Testing
      - [ ] draft and approve a plan
      - [ ] run one phase through the agent
      - [ ] view typed result and evidence
      - [ ] agent follow-up references the result
      - [ ] no console errors during the flow
- [ ] If automated, the check is runnable from a documented command and does not
      depend on Kane credits unless explicitly marked as a live test.
- [ ] If manual, the demo recording is stored in the submission artifact and linked
      from the README or demo evidence doc.

**Gate:** a new reviewer can reproduce or at least review the end-to-end story.

## Phase 8 — Final verification and submission gate

- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npm run check:repo` passes.
- [ ] `git status` is clean except intentional, documented local artifacts.
- [ ] The final commit is pushed.
- [ ] `docs/demo-readiness-evidence.md` contains the live phase evidence, run ids,
      verdicts, observation values and evidence links.
- [ ] The README quick start still works from a clean checkout.
- [ ] No stale “future slice” copy remains in the demo path.
- [ ] The final message to judges states exactly what was live-tested and what was
      not.

**Gate:** all prior phases are complete. Do not claim the hackathon demo is finished
until this phase is fully checked.

## Current status

| Phase | Status |
|---|---|
| 1 — Commit/push phase fixes | Complete |
| 2 — Submission surface | Complete |
| 3 — Live phase through agent | Not started |
| 4 — Adaptive/failure proof | Not started |
| 5 — Panel-to-agent loop | Not started |
| 6 — `testmd` phase replay | Not started |
| 7 — Browser smoke/demo | Not started |
| 8 — Final verification | Not started |
