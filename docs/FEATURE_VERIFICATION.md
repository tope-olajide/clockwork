# Clockwork — Feature Verification Ledger

**Purpose:** map every material claim in `docs/PROJECT_FEATURE_AUDIT.md` and `docs/HACKATHON_SUBMISSION_DESCRIPTION.md` to the file that implements it, and state what that file does and does not prove. Claims without evidence are listed at the end and must not be advertised.

**Date:** 2026-11-24. **Scope:** working tree at `main` (`f67f31d` + uncommitted changes). Documentation-only audit; no application source, configuration or dependencies were modified. The only code added in this pass is the saved engine E2E test, its terminal runner and the one-command dev wrapper.

---

## 1. How to read this ledger

- **Implemented** — the code path exists and is reachable from the UI or API.
- **Tested** — covered by a committed test under `tests/` (23 files, 130 tests, run with `node --import tsx --test tests/*.test.ts`).
- **Observed** — exercised in a recorded browser session or Kane run (see `docs/kane-proof.md`, `docs/demo-readiness-evidence.md`).
- **Unverified** — code exists but no accepted run or test demonstrates the end-to-end behavior.

A claim is only "verified" when at least one of *Tested* or *Observed* applies. Typecheck alone proves it compiles, not that it works.

---

## 2. Counts and inventories

| Claim | Source of truth | How counted | Status |
|---|---|---|---|
| 12 genre starters | `src/engine/model/game-starters/catalog.ts` → `GAME_STARTERS` | 12 entries, each with id, category, blurb, mechanics | Verified; each built by `build.ts` and covered by `tests/game-starters.test.ts` + slice tests |
| 3 classic templates | `src/engine/model/templates.ts` → `TEMPLATES` | `platformer`, `topdown`, `puzzle` | Verified by source and template tests |
| 16 creation options (12 + 3 + Blank) | `src/features/projects/NewProjectDialog.tsx` | Starter cards + template options + Blank card | Verified in source; gallery exercised in browser evidence |
| 1 game-test profile per starter (12) | `src/engine/model/game-test-profiles.ts` | 12 registry keys (`space-shooter`, `space-invaders`, `asteroid-field`, `ping-pong`, `brick-breaker`, `flappy-flyer`, `platform-jumper`, `endless-runner`, `arena-survival`, `falling-objects`, `maze-escape`, `snake`) | Verified by source; profiles load without throwing (unit test) |
| No profiles for classic templates | same registry | `platformer`/`topdown`/`puzzle` absent | Verified by source; consequence stated in audit |
| 57 commands | `src/engine/commands/registry.ts` | Count of registered command definitions across `project.*`, `scene.*`, `layer.*`, `object.*`, `objects.*`, `prefab.*`, `asset.*`, `tilemap.*`, `rule.*`, `variable.*`, `hud.*`, `behavior.*` | Verified by direct count |
| 26 behaviour types | `src/engine/model/schema.ts` → behaviour `type` union; `behaviorTypeSchema` | Enumerated 26 engine types (catalog also lists 3 UI field types, total 29 catalog entries) | Verified by enum and runtime switch |
| 5 rule conditions / 8 rule actions | `src/engine/model/schema.ts` + `src/features/editor/logic/*` | Condition: variable, overlap, input, timer, scene-start. Action: set-variable, show-message, go-scene, play-sound, spawn, destroy, set-behavior-param, log | Verified by schema and runtime evaluator |
| 16 starter assets | `src/engine/assets/starter-manifest.ts` → `STARTER_ASSETS` | 13 images + 3 audio entries | Verified by array |
| 23 unit test files, 130 tests | `tests/*.test.ts` | File count and `npm test` run | Verified by `glob` and a passing suite on 2026-11-24 |
| 22 agent tools | `shared/ai-tools.ts` | 10 read + 6 write + 3 Kane + 3 aliases, minus capability-gated vision | Verified by source; tool names listed in audit |
| 8 engine-QA objective files | `scripts/kane/objectives/` | K1–K5, with K3 split into K3a/K3b, plus the superseded K3 and the steer probe | Verified by directory listing and objective text |
| 21 saved testmd files | `.testmuai/tests/*_test.md` | 20 game-play tests + the engine E2E | Verified by listing |
| 1 saved engine E2E test | `.testmuai/tests/engine-template-e2e_test.md` | Platform Jumper creation, canvas/hierarchy/Inspector, Object Y edit/undo, Play, Space, R, return to editor | Verified by a passing Kane run on 2026-11-24 (1/1, 286 s) |
| 1 one-command dev + E2E wrapper | `scripts/kane/engine-e2e-dev.mjs`, `package.json` | Starts or reuses the app, waits for Vite + `/api/health`, runs the saved test, cleans up | Verified by cold-start and reuse paths on 2026-11-24; cold start passed 1/1 replayed steps in 89 s |

---

## 3. Product and editor claims

| Claim | Implementation | Proof | Status |
|---|---|---|---|
| Browser-native editor with PixiJS viewport | `src/features/editor/EditorPage.tsx`, `src/render/PixiStage.tsx`, `src/engine/render/SceneRenderer.ts` | Code + browser evidence in `docs/demo-readiness-evidence.md` | Verified |
| Four workspaces (Scene/Content/Logic/Presentation) | `EngineDocks.tsx`, `LogicPage.tsx`, URL `?tab=`/`?ptab=` | Code; tabs exercised in browser | Verified |
| Move/scale/rotate gizmos, snapping 8/16/32 | `src/features/editor/canvas/*` | Code; browser-verified per evidence doc | Verified |
| Undo/redo, one gesture = one revision | `src/engine/store/engine-store.ts`, command registry | Unit tests + K3b Kane run (undo/redo counters) | Verified |
| Autosave + reload persistence | `src/engine/persistence/indexeddb.ts`, save pill in `EditorPage` | K1 reload check (Object X preserved) | Verified |
| Damaged-project recovery | dashboard recovery panel | Code; browser evidence | Verified |
| `.clockwork.json` import/export incl. assets, 20 MB guard | `src/engine/io/project-file.ts`, dialog | Code; browser evidence | Verified |
| Resizable docks, deep links, command palette, shortcuts | `EditorPage`, `CommandPalette.tsx`, `useKeyboardShortcuts` | Code; palette/shortcuts in browser evidence | Verified |
| Tilemap paint/erase/fill/pick, one undo per stroke | `src/features/editor/tilemap/*`, `engine-store` transaction | Code + browser evidence | Verified |
| Prefabs create/instantiate/update/detach/revert with overrides | `src/engine/model/prefabs.ts`, `prefab.*` commands | Unit tests + browser evidence | Verified |
| Rules with validation and runtime skipping of broken refs | `src/engine/model/rules.ts`, `runtime.ts` | Unit tests + browser | Verified |

---

## 4. Agent claims

| Claim | Implementation | Proof | Status |
|---|---|---|---|
| Ask / Build / Plan modes, tool-gated | `server/ai/system-prompt.ts`, `shared/ai-tools.ts`, `src/features/agent/useAgentSession.ts` | K3a/K3b/K4 real-model runs; mode tests | Verified |
| Context packet with project/scene/selection/camera | `src/engine/ai/context.ts` | Unit tests; recorded prompts in evidence | Verified |
| 10 read tools incl. compact `get_scene`, `capture_viewport`, `get_game_test_profile` | `src/engine/ai/client-tools.ts`, `shared/ai-tools.ts` | Unit tests; K4 used `verify_with_kane` | Verified |
| Atomic writes with `expectedRevision`, dry-run, ≤50 commands | `src/engine/ai/executor.ts`, `applyCommandsInStore` | Unit tests (all-or-nothing, revision conflict, destructive detection) | Verified |
| One undo entry per batch | executor + engine store | Unit tests; K3a applied change undone | Verified |
| Plan preview ghosts, apply/discard | `useAgentSession.ts` (`pendingPreview`), `PlanGhosts` | `scripts/agent-ui-live.mjs` 2026-11-23: pill, real changed-id ghost, apply revision 0→1, ghost cleared; screenshots | Verified in browser (2026-11-23) |
| Agent presence (outlines, pill, camera) | `useAgentPresenceStore`, `SceneRenderer` | Same CDP run: `AGENT` pill + object ids, outline screenshot, cleared after 2.5 s | Verified in browser (2026-11-23) |
| Locked selection + "Ask AI" | context packet + drawer | Same CDP run: visible locked chip via toolbar Ask (Build) and inspector Ask AI (Ask) | Verified in browser (2026-11-23) |
| Chat threads, Markdown, attachments | `src/features/agent/*`, `chat-store` | Unit tests; acceptance pending | Implemented, tested at unit level |
| Provider settings/vault/model picker | `server/ai/vault.ts`, `ProviderSettings.tsx`, `ModelPicker` | Code; key persistence across restart not gate-closed | Implemented, partially verified |
| Error cards, retry, revision re-plan, stop | `useAgentSession.ts` | Unit tests for revision conflict | Verified at unit level |
| From-brief project creation | `NewProjectDialog` → `EditorPage` build prompt | Code; no recorded real-model brief run | Implemented, unverified |

**Boundary:** the agent is not autonomous. It is bounded by mode, step limit, command count, revision checks and human approval for plans. It does not run in the background, does not edit files, and cannot bypass the command validator.

---

## 5. Runtime and Play claims

| Claim | Implementation | Proof | Status |
|---|---|---|---|
| Fixed 1/60 s simulation | `src/engine/runtime/runtime.ts` → `FIXED_DT` | Code + runtime tests | Verified |
| Sub-stepping (≤8 loop, ≤32 at the anti-tunneling pass) | `runtime.ts` | Code + tests | Verified |
| Merged tilemap row colliders | `runtime.ts` → `tilemapRowSpans` | Unit tests | Verified |
| 26 behaviours at runtime | `runtime.ts` behaviour dispatch | Starter tests exercise each family | Verified (per-family tests, not one test per type) |
| Rules: `once`, blocked events, scene transitions | `runtime.ts` | Unit tests | Verified |
| Camera follow/deadzone/clamp/parallax | `runtime.ts`, `SceneRenderer` | Browser evidence | Verified |
| Keyboard, pointer, gamepad | `input.ts`, `InputManager` | Unit tests for mapping; pointer/gamepad browser-unverified | Verified for keyboard, implemented for others |
| Manual Play pause/step/reset/telemetry | `src/features/play/PlayPage.tsx` | Browser evidence | Verified |
| Deterministic seed and `replay()` | `runtime.ts` | Unit tests | Verified at API level; **not exposed in Play UI** |
| Click-to-move steering | Play stage pointer handling | K3a Kane run steered to a win | Verified |
| Headless playtest | `src/engine/runtime/playtest.ts` | Unit tests; explicitly not Kane evidence | Verified as a tool, not as proof of browser behavior |

---

## 6. Kane integration claims

### 6.1 AI Play button — execution path

| Step | File | Notes |
|---|---|---|
| Button `data-testid="toolbar-ai-play"` → `openAiPlay` | `EditorPage.tsx`, toolbar | Also `Shift+⌘/Ctrl+Enter` and palette entry |
| Consent dialog, session-scoped | `AiPlayPanel.tsx` | Names Kane, Chrome, credits |
| Status preflight | `GET /api/kane/status` → `server/routes/kane.ts` | `kane-cli --version`, `whoami`, `balance`; typed errors |
| Save + snapshot (1 h) | `useAiPlay.ts`, `src/engine/io/snapshot.ts` | Assets read from IndexedDB |
| Objective from snapshot document | `GET /api/kane/ai-play/objective/:id` → `server/kane/objectives.ts` | Scene name, HUD label, coin target, controls; <1,000 chars |
| Run | `POST /api/kane/ai-play` → `startKaneRun` | URL `/s/<id>?ai=1&seed=1234`; flags `--final-validation off --skip-code-validation --bug-detection off`; timeout min(env,140)s; steps min(env,8) |
| Snapshot player + AI HUD | `src/play/ai/AiPlayHud.tsx` | STATUS/SCENE/COINS/HEALTH/TIME/SEED/LAST ERROR + six controls |
| Stream + verdict | `server/kane/runner.ts` | NDJSON; terminal `run_end`; evidence copied; paths redacted |
| Repair | `src/engine/ai/ai-play-repair.ts` | Embedded collectible → one `object.update` above static/kinematic body; one undo entry; same seed; max 2 attempts |
| Undo | editor undo stack | Button in panel |

**Evidence:** K5 attempt 1 failed, repair applied, attempt 2 passed at 81.1 s; `docs/kane-proof.md` records both. **What it proves:** the full click→snapshot→Kane→verdict→repair→replay path works for the supported defect class. **What it does not prove:** general bug repair, visual correctness, or that a passed run means the game is fun or bug-free.

### 6.2 AI Testing phases

| Claim | Implementation | Proof | Status |
|---|---|---|---|
| Plan drafted via `get_game_test_profile` → `propose_test_plan` | `shared/ai-tools.ts`, `server/kane/phase.ts` | Unit tests | Verified at unit level |
| Human approval required | `TestPlanPanel.tsx`, approve endpoint | Unit tests | Verified |
| Objective recomposed server-side; ids/bounds only from client | `server/kane/phase.ts` | Unit tests | Verified |
| Test Mode lockstep + receipts | `src/engine/runtime/test-controller.ts`, `src/play/test/TestModeHud.tsx` | Unit tests (frame 0 paused, bounded advance, pulse ≤6 frames) | Verified at unit level |
| Strict typed verdict | `server/kane/phase.ts` | Unit tests for pass/inconclusive/cancelled | Verified at unit level |
| Per-criterion report | `buildTestReport` | Unit tests | Verified at unit level |
| **Live end-to-end accepted phase run** | panel approval → `/api/kane/phase` → typed result + evidence | 2026-11-24 runs `98e21783` (94.7 s) and `ea1bb3b3` (78.1 s): typed **PASSED** (shots 3, projectiles 3, accepted 1, frames 45), evidence HTTP 200, no console/page errors — [panel screenshot](screenshots/approved-phase-passed.png), `docs/kane-proof.md` | **Verified live** |
| Result persistence across restart | in-memory store | Source | **Not persisted — limitation** |

### 6.3 Engine QA of the application

| Claim | Implementation | Proof | Status |
|---|---|---|---|
| Scripted objectives drive the real editor | `scripts/kane/objectives/*.txt`, `scripts/kane/run-objective.sh` | K1, K3a, K3b, K4 records with durations/credits | Verified |
| K1 editor smoke | objective text: projects page, coach skip, View menu, hierarchy select, inspector, ArrowRight ×2, Ctrl+Z ×2, reload | Passed 303.6 s / 62.79 credits | Verified |
| K3a repair + play win | agent Build prompt, applied change, Play, click-to-steer | Passed 282.1 s / 60.1 credits | Verified |
| K3b undo/redo | agent edit + counters | Passed 218.9 s / 59.29 credits | Verified |
| K4 in-app verification card | `verify_with_kane` tool + result card | Passed 65.2 s in-app; 206.7 s terminal rerun | Verified |
| K2 defect discovery | Build with no model | Defect fixed; reruns environment-blocked | **Not a passed run — do not claim** |
| Saved engine E2E | `.testmuai/tests/engine-template-e2e_test.md` + `scripts/kane/engine-e2e.mjs` | Passed 2026-11-24: 1/1 steps, 286 s, session `aceb577f-0a26-456e-a2d7-944652113935`; final `lives: 3`, Object Y `780`, back on `/project/.../scene/...` | Verified |
| One-command dev + E2E | `scripts/kane/engine-e2e-dev.mjs`, `npm run kane:engine-e2e:dev` | Cold start: app launched, Vite + `/api/health` ready, saved test passed 1/1 replayed in 89 s, app torn down and ports free; reuse path also exercised | Verified by run; not a CI job |

**Coverage limit:** these objectives exercise project creation, project open, hierarchy, inspector, canvas keys, undo/redo, reload, agent drawer and Play. Assets, Logic, Presentation, Ship, settings and mobile layouts were not covered by Kane.

---

## 7. Export, share and persistence

| Claim | Implementation | Proof | Status |
|---|---|---|---|
| Zip export with standalone player | `src/engine/io/build.ts`, `server/routes/build.ts`, `src/play/player.ts` | Unit tests for archive contents; code path | Verified structurally; acceptance run pending |
| `/api/build/player.js` esbuild IIFE | `server/routes/build.ts` | Code; served during export | Verified |
| Share links create/delete, `/s/:id` player | `server/routes/snapshots.ts`, `src/features/ship/ShipPanel.tsx` | AI Play exercises `/s/:id` playback; create/delete browser-verified earlier | Partially verified |
| Snapshot 20 MB cap, TTL 1–168 h | `shared/snapshot.ts` → `MAX_SNAPSHOT_BYTES`; `server/snapshots/repository.ts` | Source | Verified |
| Local-only persistence | IndexedDB + SQLite | Source | Verified |

---

## 8. Claims explicitly NOT verified (do not advertise as working)

1. **Phase result persistence** — in memory; lost on server restart.
2. **Phase panel feeding the agent loop** — it does not; only `run_kane_test_phase` does.
3. **Saved-test replay reuse in the phase runner** — replay exists, but the phase runner does not use saved tests; no measured speedup.
4. **Prompt presets** — implemented; no real-model golden run recorded.
5. **Provider key persistence across restart, custom provider chat** — not gate-closed.
6. **All 12 starters tested by Kane** — Space Invaders, Asteroid Field, Space Shooter and Platform Jumper were attempted; Platform Jumper's saved engine E2E passed, Asteroid Field's play/restart and editor-tuning runs passed, and there is no clean automated scoring or win proof for Space Shooter. Do not claim "all templates Kane-verified".
7. **Visual regression / pixel diffing** — Kane runs with `--assertion-mode dom`; no screenshot judging.
8. **Autonomous gameplay or autonomous repair beyond embedded collectibles** — the repair is a deterministic policy for one defect class.
9. **Multi-user collaboration, cloud sync, accounts, mobile editor** — not implemented.
10. **Real-time replay UI** — `Runtime.replay()` exists, no Play control.
11. **CI browser suite** — none committed; 23 Node test files and terminal Kane scripts only.
12. **Accessibility audit** — not performed; `docs/known-issues.md` records it as outstanding.
13. **One-command wrapper as a CI service** — it is a local command, not a committed CI workflow.

---

## 9. Documentary evidence used

| Artifact | What it records |
|---|---|
| `docs/kane-proof.md` | Dated Kane runs with objectives, durations, credits, findings, evidence paths, and negative controls |
| `docs/known-issues.md` | Maintained limitation ledger; source for every "unverified" entry above |
| `docs/demo-readiness.md` / `docs/demo-readiness-evidence.md` | Demo script and browser-observed behavior |
| `docs/ai-play.md` | AI Play design, consent, evidence, repair policy, limits |
| `docs/game-test-profiles.md` | Profile schema and per-template coverage |
| `docs/testing-hooks.md` | Test Mode, data attributes, deterministic hooks |
| `docs/kane-setup.md` / `docs/kane-cli-usage.md` | Install, auth, CLI invocation and caps |
| `.testmuai/tests/engine-template-e2e_test.md` / `scripts/kane/engine-e2e.mjs` | Saved engine E2E objective and the runner that archives its result/evidence |
| `scripts/kane/engine-e2e-dev.mjs` | One-command app-start/reuse wrapper and readiness checks |
| `docs/implementation-log.md` | Slice-by-slice build history |
| `features.md` | Feature claims, conservatively gated and older than this ledger |

---

## 10. Verification gaps in this audit

- No application source, configuration or dependency was modified for this audit. The saved engine E2E was executed during the audit; the rest of the evidence is committed tests, typecheck, and recorded browser/Kane runs.
- Static reading can miss dead code paths. Where a feature is only reachable through a flag or environment variable, the ledger says so.
- Counts are point-in-time against the working tree, which contains uncommitted changes to AI provider files; those changes do not alter the feature inventory.
- The Kane evidence is the project's own recording. It was cross-checked against objective text and runner code. The latest engine E2E result and 3.3 MB evidence pack were inspected locally; older raw bundles under `.data/` are gitignored and were not re-opened line by line.
