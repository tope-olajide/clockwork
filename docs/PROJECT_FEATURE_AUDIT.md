# Clockwork — Project Feature Audit

**Audit date:** 2026-11-24
**Scope:** the repository at `main` (`f67f31d` + working tree, including the saved engine E2E test and runner).
**Method:** source inspection, command/behaviour/test inventories, and the project's own recorded browser and Kane evidence. Every feature below was checked against implementation files, not against plans or README copy. Where evidence is missing, the entry says so.

---

## 1. What the product is

Clockwork is a **browser-native 2D game engine with an AI co-worker embedded in the editor**. A project is a typed JSON document (`src/engine/model/schema.ts`) holding scenes, layers, game objects, prefabs, variables, rules, assets and project settings. The document is edited through three routes that all converge on one command bus:

1. **The visual editor** — PixiJS viewport, hierarchy, inspector, logic and presentation panels.
2. **The built-in agent** — a chat drawer that reads the same document through typed tools and writes to it through the same commands, in one atomic undoable transaction.
3. **The project's own persistence layer** — IndexedDB autosave, `.clockwork.json` transfer, immutable snapshots and static export.

Because manual edits and agent edits share one command registry (`src/engine/commands/registry.ts`, 57 commands) and one revision counter, the two workflows are not separate products bolted together: an agent change appears on the canvas, in the inspector, in undo history, and in the next `Ctrl+Z` exactly like a drag.

### The problem it addresses

- **The blank-canvas problem.** Building a playable 2D game normally starts with weeks of engine plumbing. Clockwork ships 12 genre starters plus three classic templates with real scenes, behaviours, rules and HUD configuration, so the first playable build exists before the first edit.
- **The authoring-tool divide.** AI code generators produce text a user must review and wire up; visual editors require the user to know every property. Clockwork's agent operates the editor's own command vocabulary with ids from live context, so its output is a reviewable, undoable change set rather than a code dump.
- **The testing gap.** A generated game is only useful if it runs. Clockwork integrates Kane CLI to drive a real Chrome session against an immutable snapshot in a one-off **AI Play** probe and a human-approved, phase-by-phase **AI Testing** flow, and it also runs a saved **engine E2E** test against the editor itself.

### Who it is for

- Beginners and game-curious developers who want a playable result without an engine learning curve.
- Indie developers prototyping mechanics and level layouts quickly.
- Developers who want AI assistance without surrendering control: every AI change is a diff-like change set with one undo entry, and Plan mode previews before applying.

### Scope and non-goals (as implemented)

Single-user, local-first. No accounts, cloud sync, multiplayer, arbitrary scripting, 3D, skeletal animation, or a mobile editor layout below 1024 px. Exported and shared players are usable on mobile. These are stated in `README.md` and match the code.

---

## 2. How a user builds a game

### 2.1 AI-assisted creation

**Entry points.** The agent drawer opens from the toolbar, with `⌘J`/`Ctrl+J`, from "Ask agent" in the UI, from selection-level "Ask AI", or automatically when a project is created "From brief" (`src/features/projects/NewProjectDialog.tsx` sends a build prompt through `EditorPage`). The drawer has three modes:

- **Ask** — read-only inspection and explanation.
- **Build** — applies commands.
- **Plan** — previews commands without committing.

Modes are enforced twice: the system prompt (`server/ai/system-prompt.ts`) and the tool set returned by `toolDefinitionsForRequest` (`shared/ai-tools.ts`).

**What it can read.** Ten read tools: `list_scenes`, `get_scene` (compact summary or `detail:"full"`), `search_entities`, `get_object`, `get_variables`, `get_selection`, `list_commands`, `capture_viewport`, `get_game_test_profile`, and `propose_test_plan` (which produces a draft, not a run). Three compatibility aliases (`get_project_summary`, `query_project`, `inspect_entity`) are also advertised and executed (`src/engine/ai/client-tools.ts`).

**What it can write.** Six write tools: `apply_commands`, `preview_commands`, `select_entities`, `open_panel`, `start_playtest`, `undo_last_agent_change`. `apply_commands` takes 1–50 `{type,args}` commands, requires `expectedRevision`, dry-runs the whole batch before committing anything, and dispatches through the same engine store as the UI (`src/engine/ai/executor.ts`). One batch = one revision = one undo entry.

**How a change reaches the game.** The agent streams tool calls over NDJSON from `POST /api/ai/step`; the client executes tools against the live document (`useAgentSession.ts`), then the engine store commits them. The canvas, hierarchy and inspector re-render from the store, so results are visible immediately. Agent-authored objects get violet outlines and an `AGENT` pill via `useAgentPresenceStore`; the user's selection is never stolen.

**Review and control.** Plan mode renders violet ghost bounds for changed objects, red bounds for deletions, and a `PLAN PREVIEW` pill with Apply/Discard (`pendingPreview` in `useAgentSession.ts`). Build mode produces a change-set card listing entity kinds, names and touched fields. Any change is undoable with the editor's normal undo; `undo_last_agent_change` refuses if the revision moved since the agent's transaction.

**Context.** Each model step receives a context packet built by `src/engine/ai/context.ts`: project identity, revision, active scene, object index, layers, selection details, variables, settings, available commands, and camera/viewport. The packet is budgeted and compacted (empty `behaviors`/`tags` omitted, 400-object index cap), and per-request assembly is capped server-side (`server/ai/openai-compatible.ts`). Requests are bounded because a turn re-sends context on every step.

**Chat features.** Per-project chat threads persisted in IndexedDB, rename/delete, GFM Markdown rendering, image/audio attachments converted into real project assets on send, model picker with per-project override, provider settings with a local encrypted key vault, typed error cards with retry/open-settings, and bounded re-plan on revision conflicts.

### 2.2 Manual creation

The editor route has four workspaces (`?tab=`): **Scene**, **Content**, **Logic**, **Presentation** (`src/features/editor/EditorPage.tsx`, `EngineDocks.tsx`, `LogicPage.tsx`).

- **Scene.** PixiJS stage; click/marquee selection; move/scale/rotate handles; grid snapping at 8/16/32 px with guides; camera wheel zoom anchored at the cursor, Fit/1:1, Space/Hand pan; rulers; layer ordering, visibility, opacity, parallax and locking; hierarchy search, rename, multi-select, and drag-to-reparent; inspector for transform, visual, body, behaviours, tags, prefab controls; undo/redo per gesture.
- **Content.** Asset browser (import, search, kind filters, rename, usage counts, drag-to-canvas), slicing, animation clips, tilemap painting, prefab creation/instantiation/update/detach/revert.
- **Logic.** Variables with usage counts and reference-checked delete; rules with five condition kinds (variable, overlap, input, timer, scene start) and eight action kinds (set variable, message, go to scene, play sound, spawn, destroy, set behaviour param, log); plain-language previews; flagged broken references skipped at runtime.
- **Presentation.** Look (gravity, background, accent), Animation, Audio (volumes, scene music), and Game UI (HUD widgets, input map with conflict warnings, message styling). Subtab persists in `?ptab=`.

**Manual changes reaching the game.** Everything is a command, so Play always runs the current document; nothing is "baked". Play is a separate read-only route (`/play/:projectId`) that instantiates the same `Runtime` and renderer as the editor preview.

### 2.3 How the two workflows cooperate

- Same document, same commands, same revision counter, same undo history.
- The agent sees the user's selection, active scene and camera; it can lock a selection, open panels and select entities for the user (`select_entities`, `open_panel`).
- The user can undo an agent batch with the normal undo, or ask the agent to undo its last transaction.
- Play and Test Mode run the document produced by either workflow; snapshots capture the exact revision for Kane.
- There is **no** real-time co-editing or multi-user merge. "Collaboration" here means human + agent in one browser session.

---

## 3. Built-in game templates

Verified from `src/engine/model/templates.ts`, `src/engine/model/game-starters/catalog.ts`, `build.ts`, and the per-starter modules under `src/engine/model/game-starters/`.

**Count:** **12 genre starters** + **3 classic templates** + **Blank** = 16 creation options. The 12 starters are the "game templates" in the New Project gallery; the 3 classic templates appear under the Template selector. All 15 templates are playable starting documents, not placeholders.

| # | Template | Type | Authored content (verified in source/tests) |
|---|---|---|---|
| 1 | Space Shooter | Shooter | Player lane movement, shooting, enemies/asteroids, health, score, timer, spawner |
| 2 | Space Invaders | Shooter | Descending formation, destructible barriers, three ships |
| 3 | Asteroid Field | Shooter | Momentum ship, thrust/turn, wraparound, asteroid splitting, three ships |
| 4 | Ping Pong | Sports | Two paddles, ball physics, AI paddle, serve/scoring |
| 5 | Brick Breaker | Arcade | Paddle, ball, brick health, ships, speed-up |
| 6 | Flappy Flyer | Arcade | Flap impulse, moving gates, collision ends run |
| 7 | Platform Jumper | Platformer | Move/jump, five cores, lives, hazards, moving platform |
| 8 | Endless Runner | Arcade | Jump/duck, accelerating obstacles, bonus cores |
| 9 | Arena Survival | Survival | WASD movement, attack, chasers, hull, 60 s timer |
| 10 | Falling Objects | Survival | Catch lane, meteors, bonus stars, three lives, timer |
| 11 | Maze Escape | Puzzle | Grid maze walls, 15 dots, warden pursuit, gated exit |
| 12 | Snake | Puzzle | Fixed-step grid movement, food, growth, self/wall collision |
| 13 | Platformer (classic) | Platformer | Dusk scene, player controller, coins prefab, hazard, checkpoint, relay, win scene and rules |
| 14 | Top-down (classic) | Top-down | Room walls, 8-way controller, health, patrol enemy, exit rule |
| 15 | Puzzle (classic) | Puzzle | 5×7 grid, two keys, gate, two rules |
| — | Blank | Empty | One scene, one layer |

**Evidence they are real:** each starter is constructed by code (`createGameStarterDocument`), covered by committed model/runtime tests (`tests/game-starters.test.ts`, `tests/game-starter-slice-b…f.test.ts`, `tests/space-shooter.test.ts`), and the New Project dialog renders generated preview images from the actual documents (`src/engine/model/game-starters/preview.ts`). Every starter has a game-test profile (`src/engine/model/game-test-profiles.ts`). Kane was also driven against several starters: Space Invaders (three runs; two partial or failed, one fast-restart pass), Asteroid Field (play/restart and editor-tuning passes), and Space Shooter (loss/restart observed, but the run failed its final checkpoint and no clean automated scoring pass exists). See §4.1 and `docs/kane-proof.md`.

---

## 4. Kane CLI integration

Kane CLI is integrated in **four distinct ways**, and only one of them is a user-facing button. The same runner (`server/kane/runner.ts`) launches every in-app run and parses the same NDJSON contract; the saved engine E2E uses the CLI's `testmd` surface with its own runner. What differs is the URL, the objective, the caps and who reads the verdict.

### 4.1 Kane tests the Clockwork application itself (external harness)

This is **not shipped as a product button**. It is a set of scripted objectives under `scripts/kane/objectives/` run by `scripts/kane/run-objective.sh` against the running editor (`http://localhost:5173`). Kane opens a real Chrome window, clicks and types like a user, and returns a terminal verdict plus evidence.

Verified scope (from `docs/kane-proof.md` and the objective text):

| Run | What Kane actually did | Result |
|---|---|---|
| K1 editor smoke | Opened the projects page, opened "Neon Runner", skipped the coach tour, opened the Inspector via the View menu, selected the Player hierarchy row, read Object X, pressed ArrowRight twice, Ctrl+Z twice, reloaded and re-checked Object X | **passed** (303.6 s, 62.79 credits) |
| K2 agent double jump | Sent a Build request while the panel said "No model"; captured a raw fetch failure | **caught a real defect**; after the fix, three reruns died in Kane's own browser (environment-blocked, not a pass) |
| K3a repair + win | Opened the seeded demo, switched the agent to Build, sent a repair prompt, waited for the applied change, played, click-steered to 3 coins and the win message | **passed** (282.1 s, 60.1 credits) |
| K3b undo/redo | Agent edit, Undo, Redo in one flow, asserted the counters | **passed** (218.9 s, 59.29 credits) |
| K4 handshake | Drove the in-app `verify_with_kane` card through the agent and asserted verdict, steps, duration and evidence link | **passed** (65.2 s in-app; 206.7 s terminal rerun) |
| K5 AI Play | Full fail → auto-fix → same-seed replay through the product UI | **passed on attempt 2** (81.1 s) |

Kane's K1 run surfaced two real UI defects (inspector could not be collapsed; unsafe hierarchy-row semantics), both fixed before the pass. K4 surfaced a missing duration on the verification card, also fixed. K2's defect (Build accepted without a model) was fixed and verified at API level. These are genuine end-to-end findings, not fixture output.

A newer saved `testmd` path complements those one-off objectives:

| Artifact | What it does | Result |
|---|---|---|
| `.testmuai/tests/engine-template-e2e_test.md` + `scripts/kane/engine-e2e.mjs` | Creates `Engine E2E Platformer` from the Platform Jumper starter, verifies canvas/hierarchy, selects `Jumper`, records and restores Object Y through ArrowUp ×2 + Ctrl+Z ×2, runs Play with `LIVES 3`, presses Space without click-to-move, restarts with R, and returns to the editor | **passed** 2026-11-24, 1/1 steps, 286 s, session `aceb577f-0a26-456e-a2d7-944652113935`; final state `lives: 3`, back on the project scene |
| `scripts/kane/engine-e2e-dev.mjs` + `npm run kane:engine-e2e:dev` | Starts `npm run dev` if needed, waits for Vite and `/api/health`, runs the saved test, then tears down only the processes it started | **passed** cold start 2026-11-24, 1/1 replayed steps, 89 s, session `e547a290-4de8-4797-af91-19efb79ce3af`; ports were free afterward |

The saved test fails honestly rather than masking product problems: its first two audit runs exposed assumptions in the test itself (the Inspector is collapsed until selection; clicking the Play canvas activates click-to-move and moved the Jumper into spikes). After those corrections, the saved test passed. The runner archives raw NDJSON, stderr, a result JSON and the evidence pack under `.testmuai/`.

**What it does *not* cover:** assets panel, settings, ship/export, mobile layouts, keyboard-only navigation. Those are recorded as unverified in `docs/known-issues.md`.

### 4.2 Kane tests user-created games — AI Play (the button)

**The button:** `AI Play` in the editor toolbar (`data-testid="toolbar-ai-play"`), `Shift+⌘/Ctrl+Enter`, or the command palette. It opens the `AiPlayPanel`.

**Exact execution path when clicked:**

1. First use shows a consent dialog (session-scoped) naming Kane, Chrome and credit use (`AiPlayPanel.tsx`).
2. `useAiPlay.begin` checks `GET /api/kane/status`, which runs `kane-cli --version`, `whoami`, `balance` and rejects missing install, sign-out or zero credits with explicit codes.
3. Saves the project, reads asset blobs from IndexedDB, and creates a **1-hour immutable snapshot** with `POST /api/snapshots` (`src/engine/io/snapshot.ts`).
4. Fetches the generated objective with `GET /api/kane/ai-play/objective/:snapshotId`. The objective is built server-side from the snapshot document (`server/kane/objectives.ts`): real scene name, real HUD label for the coin variable, coin target count, win variable, visible control names, and a `store ... as` + assertion epilogue under 1,000 characters.
5. `POST /api/kane/ai-play` starts Kane against `<origin>/s/<snapshotId>?ai=1&seed=1234` with:
   `kane-cli run "<objective>" --url … --agent --mode testing --max-steps 8 --timeout 140 --assertion-mode dom --final-validation off --skip-code-validation --bug-detection off`.
6. The snapshot player shows the **AI HUD**: `STATUS`, `SCENE`, `COINS`, `HEALTH`, `TIME`, `SEED`, `LAST ERROR`, and real buttons `MOVE LEFT`, `MOVE RIGHT`, `JUMP`, `ACTION`, `STOP`, `RESTART`. The buttons drive the same `InputManager` as the keyboard (`src/play/ai/AiPlayHud.tsx`).
7. The server streams steps as NDJSON, then parses the terminal `run_end`, copies the evidence pack, writes `.data/ai-play/<runId>/result.json`, and emits a redacted result. An exit code alone never becomes a pass.
8. The panel shows `KANE VERIFIED` only for `status: "passed"`, otherwise `KANE FAILED`/`CANCELLED`/`KANE ERROR`, with duration, settled-step count, final-state values and an evidence link.
9. **Auto-fix (optional, default on):** `repairAiPlayFailure` (`src/engine/ai/ai-play-repair.ts`) finds a coin/collectible whose visual bounds overlap a static or kinematic body, moves it above that body with one `object.update`, records one undo entry, saves, snapshots again and replays the **same seed**. Maximum two attempts; a third never runs automatically. `Undo AI fixes` uses the editor's normal undo.
10. If the repair finds nothing, the panel says so and leaves the failed evidence visible.

**What this proves and does not prove.** It is a constrained gameplay probe: Kane reads DOM state and clicks labelled controls, then asserts on stored values. It can detect a wrong final state, an assertion failure, a runtime error surfaced in `LAST ERROR`, a timeout, missing input or missing evidence. It does **not** judge rendering quality, inspect pixels, or understand arbitrary gameplay. The auto-fix handles exactly one class of defect (an embedded collectible); other failures are reported, not repaired.

**Manual Play vs AI Play vs Kane engine QA:**

| | What runs | Time | Needs Kane/credits | Needs a model | Proves |
|---|---|---|---|---|---|
| Manual Play | Real-time `Runtime` in the browser | Real time | No | No | The game is playable by a human |
| AI Play | Kane + Chrome against a snapshot + AI HUD | ~1–2.5 min per attempt | Yes | No (the repair is deterministic; an agent can also call the tool) | One objective (coins/win, error-free) reached or not, with evidence |
| AI Testing phase | Kane + Chrome in lockstep Test Mode against an approved plan | Bounded by plan | Yes | Yes, for drafting the plan | Only the approved assertions, joined to input receipts and observations |
| Kane engine QA | Kane + Chrome against the editor URL | 1–5 min | Yes | Only for objectives that use the agent | App flows (open project, select, edit, undo, reload, agent) work |

### 4.3 Kane tests user-created games — AI Testing (reviewed phases)

`TestPlanPanel` inside the AI Play panel drafts a plan from a natural-language goal. The agent must first read `get_game_test_profile`, then call `propose_test_plan`; the server/client validates the proposal against the profile, project revision and hard budgets. The user reviews phases, controls, assertions, budget, revision reasons and cost estimate, then **Approves**. Approval runs nothing. Running a phase sends ids and bounds only; `server/kane/phase.ts` recomposes the objective and URL and validates them against the snapshot.

A phase verdict is strict (`server/kane/phase.ts`): `passed` requires Kane's pass, every assertion matching, at least one actually delivered input for a control-using phase, a frame count inside budget, no runtime error, and an evidence bundle. Missing input/observations/evidence, over-budget frames, timeouts and cancellations are `inconclusive` or `cancelled`, never a pass. Results are rendered per criterion by `buildTestReport`.

**Honest status:** the phase flow is implemented, unit-tested, and **demo-proven as a pass** as of 2026-11-24. Run `98e21783` was approved through the live panel and returned a typed **PASSED** with both assertions matching (`shots-fired` 3, `projectiles` 3), accepted inputs 1, frames 45, 94.7 s, and a 721,305-byte evidence bundle (HTTP 200) with no console or page errors. Run `ea1bb3b3` repeated the pass in 78.1 s (776,545-byte evidence) and is captured in [the panel screenshot](screenshots/approved-phase-passed.png). Earlier budget limits were real: an 8-step cap stopped run `1105bd78`, and a 300 s wall cap stopped `e088e2c0` during finalization; the caps are now 12 steps and 600 s. Server idempotency state is still in memory. The direct panel run does not feed the agent loop; only the `run_kane_test_phase` tool does. See `docs/kane-proof.md` (Phase 7).

### 4.4 Kane constraints

- Always enabled; no feature flag. Missing CLI/sign-out/zero credits produce explicit errors.
- Local/self-hosted only because it launches Chrome.
- AI Play: one active run per project, 140 s / 8 step cap, 1,000-character objective.
- Phase: max 3 phases, 12 steps, 600 s and 3,600 frames per phase; `maxAdvance` 600.
- Saved engine E2E: 50 steps, 480 s, headless Chrome, `--no-adaptive-heal`; it is a terminal developer/CI path, not a product button.
- Evidence and raw NDJSON are written under `.data/` (gitignored) and local paths are stripped from client responses. The saved engine E2E writes its own raw/result files and evidence copy under `.testmuai/` (also gitignored).

---

## 5. Complete feature inventory

**69 feature entries** in eight areas, each labelled with its evidence level. **21 entries carry recorded browser or Kane evidence**; the rest are implemented with code and/or unit-test coverage, and rows marked "unverified" or "partial" are explicitly excluded from the verified count. Items that exist only as UI or plan text are excluded and listed in §8.

"Implemented" means the code path exists and is reachable. "Browser-verified" means a recorded Chrome session exercised it. "Unverified" means the code exists without an accepted end-to-end run.

### A. Projects and persistence (7)

| # | Feature | Status |
|---|---|---|
| F1 | Create a project from Blank, a template, a written brief (agent builds the first pass), or a `.clockwork.json` import | Implemented; brief flows through the agent, not a model-free generator |
| F2 | 12 genre starters + 3 classic templates, with generated preview thumbnails and category filters | Implemented |
| F3 | Dashboard search, status/template filters, sort | Implemented and browser-verified |
| F4 | Rename, duplicate (fresh ids), archive/restore (read-only), delete | Implemented and browser-verified |
| F5 | Autosave to IndexedDB with Unsaved → Saving… → Saved; document and scene restore on reload | Implemented and browser-verified |
| F6 | Damaged-project recovery panel with delete | Implemented and browser-verified |
| F7 | `.clockwork.json` export/import including assets; malformed and >20 MB files rejected | Implemented and browser-verified; assets embedded |

### B. Visual editor (11)

| # | Feature | Status |
|---|---|---|
| F8 | PixiJS scene viewport rendering shapes, sprites, text and tilemaps with layer order/opacity/parallax | Implemented |
| F9 | Camera pan, cursor-anchored wheel zoom, Fit/1:1, rulers tracking the camera | Implemented and browser-verified |
| F10 | Layers: create/rename/delete/reorder, visibility, lock, opacity, parallax | Implemented |
| F11 | Selection: click, marquee, multi-select, select parent with Esc | Implemented |
| F12 | Move, scale and rotate gizmos | Implemented and browser-verified |
| F13 | Snapping to 8/16/32 px with on-canvas guides | Implemented and browser-verified |
| F14 | Hierarchy: search, rename, multi-select, drag-reparent, virtualization for large scenes | Implemented |
| F15 | Inspector: transform, visual, body, behaviours, tags, prefab controls; mixed values for multi-select | Implemented |
| F16 | Undo/redo: one gesture or agent batch = one revision and one undo entry; revision-correct restore | Implemented and browser-verified |
| F17 | Resizable, collapsible docks; workspace tabs and scene deep links persist in the URL | Implemented and browser-verified |
| F18 | Command palette (`⌘K`), keyboard shortcuts (`⌘J`, `⌘S`, `⌘Z`, `⌘Enter`, `1–4`), context menus | Implemented |

### C. Assets and visual authoring (6)

| # | Feature | Status |
|---|---|---|
| F19 | 16 starter assets seeded into IndexedDB with stable ids (13 SVG images, 3 WAV SFX) | Implemented |
| F20 | Asset import with dedupe ("Already in project"), search, kind filters with counts, rename, usage counts, thumbnails | Implemented |
| F21 | Drag asset to canvas / add to scene as sprite object | Implemented |
| F22 | Sprite slicing: 4×2 grid sheet plus manual frame entry | Implemented and browser-verified |
| F23 | Animation clips with frame list, FPS, loop, preview, assignment to objects | Implemented |
| F24 | Tilemaps: create from a tileset, paint/erase/fill/pick with brush size, one undo per stroke | Implemented and browser-verified |

### D. Gameplay systems (8)

| # | Feature | Status |
|---|---|---|
| F25 | 26 behaviour types with schema-validated params and a data-driven parameter editor | Implemented |
| F26 | Project variables (number/boolean/string) with usage counts and reference-checked delete | Implemented |
| F27 | Rules: 5 condition kinds, 8 action kinds, ordering, enable/once flags, plain-language previews | Implemented |
| F28 | Rule reference validation: new invalid references rejected on save, existing broken ones flagged and skipped at runtime | Implemented |
| F29 | Prefabs: create from selection (including multi-object groups), instantiate ×N, update from selection, per-instance overrides preserved, detach, revert | Implemented |
| F30 | Object grouping/parenting (group root + children in one revision) | Implemented |
| F31 | Input map rebinding with duplicate-binding warnings | Implemented |
| F32 | Presentation: gravity/background/accent, volumes and scene music, HUD widgets (text/bar with max), message styling | Implemented |

### E. Runtime and Play (10)

| # | Feature | Status |
|---|---|---|
| F33 | Fixed 1/60 s simulation with a deterministic seed; same seed + input trace replays identically | Implemented; `Runtime.replay()` exists but has no Play UI control |
| F34 | Physics: dynamic/static/kinematic/none bodies, gravity scale, world bounds, one-way, sub-stepping, merged tilemap row colliders | Implemented |
| F35 | Behaviour runtime for all 26 types (controllers, patrol/follow with grid nav, collectibles, hazards, health, shooter/projectile, spawner, timers, snake, etc.) | Implemented; exercised by starter tests |
| F36 | Rule evaluation with `once`, blocked-rule events and `go-scene` transitions | Implemented |
| F37 | Camera follow with damping, deadzone, world clamp and per-layer parallax | Implemented and browser-verified |
| F38 | Input: keyboard, pointer/tap, first standard-mapping gamepad with deadzone | Implemented; pointer maps to the action button plus click-to-move in Play |
| F39 | Manual Play route with pause, single-step, reset, Escape to editor, F1 telemetry | Implemented and browser-verified |
| F40 | Console event log and DOM data attributes for playtest state, variables, player, scene, frame, FPS | Implemented |
| F41 | Click-to-move steering on the Play stage | Implemented and recorded in Kane evidence |
| F42 | Headless playtest tool (`start_playtest`): same fixed-step runtime, scripted inputs, ≤15 s, returns variables/events/pass | Implemented; explicitly not Kane evidence |


### F. AI agent (13)

| # | Feature | Status |
|---|---|---|
| F43 | Agent drawer with Ask / Build / Plan modes and per-mode tool gating | Implemented; real-model tool calls recorded (K3a/K3b/K4) |
| F44 | Context packet: project, revision, scene, object index, selection, variables, settings, camera, command reference | Implemented |
| F45 | Ten read tools incl. compact `get_scene`, search, command signatures, viewport capture | Implemented |
| F46 | Atomic `apply_commands` / `preview_commands` with `expectedRevision`, dry-run, one undo entry, change-set summary | Implemented |
| F47 | Plan-mode ghost preview with Apply/Discard and stale/preview clearing | Browser-verified 2026-11-23 (pill, changed-id ghost, apply, clear) |
| F48 | Agent presence: violet outlines, `AGENT` pill, camera ease, hierarchy scroll, 2.5 s clear | Browser-verified 2026-11-23 (pill/ids/outline/clear) |
| F49 | Locked selection chip and selection-level "Ask AI" entry points | Browser-verified 2026-11-23 (visible chip, Build lock, Ask mode) |
| F50 | Chat history: multiple threads per project, rename/delete, Markdown, image/audio attachments as project assets | Implemented; unit-tested, browser acceptance pending |
| F51 | Model/provider settings: model picker, env/vault/session keys, custom OpenAI-compatible provider, capability gating | Implemented; key-persistence and custom-provider flows not gate-closed |
| F52 | Error handling: typed codes, actionable cards, stop/retry, bounded revision re-plan, agent undo | Implemented |
| F53 | Prompt presets/suggestions in the empty state and `/` menu | Implemented; no real-model golden run recorded |
| F54 | "From brief" project creation hands the brief to the agent in Build mode | Implemented |
| F55 | Kane tools in the agent loop: `verify_with_kane`, `run_ai_play`, `run_kane_test_phase` | Implemented; `verify_with_kane` proven by K4 |

### G. Kane testing (9)

| # | Feature | Status |
|---|---|---|
| F56 | AI Play: snapshot, generated objective, AI HUD, streamed steps, typed verdict, evidence link | Implemented; real fail→fix→pass recorded |
| F57 | Deterministic embedded-collectible repair + same-seed replay (max 2 attempts) + undo | Implemented; real evidence |
| F58 | AI Testing plan: draft → validate → review → approve, with immutable user goal and revision reasons | Implemented; unit-tested; live approved runs `98e21783` and `ea1bb3b3` passed |
| F59 | Test Mode: paused frame 0, labelled controls, bounded ADVANCE, observations, input receipts, no wall-clock | Implemented and unit-tested |
| F60 | Typed phase verdict joining Kane verdict + assertions + receipts + frames + evidence | Implemented and unit-tested |
| F61 | Per-criterion test report (PASS/FAIL/INCONCLUSIVE) with evidence links and limitations | Implemented and unit-tested |
| F62 | 12 template game-test profiles with controls/observations/objectives and one scenario | Implemented |
| F63 | Saved `_test.md` replay path (`testmd run --no-adaptive-heal`) and replay registry | Implemented; replay passed (1/1 in 89 s), but no controlled speedup benchmark |
| F64 | Engine-QA objectives and evidence ledger for the app itself (K1–K5) | Implemented as scripts; results recorded, not CI |
| F68 | Saved engine E2E `testmd` test + runner: creates a Platform Jumper project, edits/undoes Object Y, plays, restarts, returns to the editor, and emits compact JSON | Implemented; real pass 2026-11-24 (1/1, 286 s) |
| F69 | One-command dev + engine E2E wrapper (`npm run kane:engine-e2e:dev`) that reuses or starts the app, waits for readiness, and cleans up | Implemented; cold-start pass 2026-11-24 (1/1 replayed, 89 s), clean teardown |


### H. Shipping (3)

| # | Feature | Status |
|---|---|---|
| F65 | Static `.zip` export with standalone player bundle, `project.json`, assets, README | Implemented; not re-verified in the Kane pass |
| F66 | Expiring read-only share links (`/s/:id`) with snapshot player and delete | Implemented; playback exercised by AI Play, sharing itself not re-verified |
| F67 | Evidence download and local-path redaction for Kane results | Implemented |

**Total feature entries: 69 (21 with recorded browser/Kane evidence).**

---

## 6. Differentiating capabilities

1. **One command vocabulary for human and agent.** The agent does not edit JSON directly; it emits the same 57 commands the UI dispatches, with a revision guard, dry-run atomicity and one undo entry. That is the core technical reason AI edits feel like editor edits.
2. **A typed, versioned game-test vocabulary.** Game-test profiles are metadata keyed by template, not part of the document, so imports never break; they constrain what a browser agent may press and assert to real runtime state (`src/engine/model/game-test-profile.ts`).
3. **Frozen time for a slow browser agent.** Test Mode replaces real-time play with explicit frame advancement and per-control input receipts, so a 10–25 s-per-action agent can still test a 60 fps game deterministically (`src/engine/runtime/test-controller.ts`).
4. **Honest verdict algebra.** A pass requires a terminal `run_end`, matching assertions, delivered input, budget compliance and evidence. Missing anything stays inconclusive; an exit code alone is never a pass (`server/kane/runner.ts`, `server/kane/phase.ts`).
5. **A shipped, inspectable failure-repair loop.** AI Play's embedded-collectible repair is deterministic, undoable, and demonstrated on a seeded defect with a real fail→pass evidence chain.
6. **Browser-native, local-first architecture.** No install, no server-side rendering, no cloud account: IndexedDB for projects/assets, SQLite for snapshots, Hono for the agent and Kane bridge.

---

## 7. Technical architecture

| Layer | Technology | Responsibility |
|---|---|---|
| UI | React 19, React Router 7, Tailwind 4, Radix primitives, Zustand, Immer | Dashboard, editor, panels, Play, snapshot player |
| Rendering | PixiJS 8 (`SceneRenderer`, `PixiStage`, `texture-cache`) | Batched sprites/shapes, camera, layer parallax, tilemaps |
| Document | Zod 4 schemas + migration (`src/engine/model/schema.ts`) | Validation, defaults, import/export shape |
| Mutations | Command registry (57 commands) + validation + Immer patches (`src/engine/commands/`, `engine-store.ts`) | One revision and undo entry per command/transaction |
| Persistence | IndexedDB (`src/engine/persistence/`) | Projects, assets, chats, autosave |
| Runtime | Custom fixed-step engine (`src/engine/runtime/runtime.ts`), `InputManager`, audio, test controller | Behaviours, physics, rules, camera, HUD, deterministic replay |
| Server | Hono + `@hono/node-server`, Node 20+ | `/api/ai/*` NDJSON streaming, providers/vault, snapshots, player bundling, Kane runs |
| AI transport | OpenAI-compatible streaming (`server/ai/openai-compatible.ts`), model catalog, mock mode | Provider abstraction, budgets, tool-call parsing |
| Player build | esbuild on demand (`server/routes/build.ts`) | IIFE `player.js` for export; `src/play/player.ts` boots it |
| Kane bridge | `server/kane/*`, `src/engine/ai/kane-api.ts` | CLI resolution, NDJSON parsing, caps, evidence, verdicts |

**Data flow of an AI edit:** drawer → `useAgentSession` builds context → `POST /api/ai/step` → model streams tool call → client `executeClientTool`/`applyCommandsInStore` → command registry → Immer patch + revision → IndexedDB autosave → Pixi/inspector re-render → next model step.

**Data flow of a Kane run:** UI or agent → snapshot POST → server builds objective/URL → `startKaneRun` spawns CLI → NDJSON parsed → steps streamed → terminal `run_end` joined with evidence → typed result → panel/agent card.

---

## 8. Implementation status and honest limits

### Verified as working (with recorded evidence)

Project lifecycle, editor viewport and transforms, undo/redo, assets pipeline, tilemaps, rules/variables, prefabs, runtime and manual Play, AI chat with real-model tool calls and command application, static export code path, snapshots, AI Play loop, `verify_with_kane`, engine-QA K1/K3a/K3b/K4, the approved-phase AI Testing flow (runs `98e21783` and `ea1bb3b3`), and the saved engine E2E plus one-command cold-start run (2026-11-24).

### Implemented but not fully verified

- AI Testing phase-result persistence across server restart and replay reuse. The live approve-and-run path is green, but idempotency state is in memory.
- Prompt presets, headless playtest parity.
- Provider vault persistence across restart, custom provider chat, key-absence audit.
- Ship/export acceptance run (zip served offline, share link input/restart).
- 12-starter Kane coverage: Space Invaders, Asteroid Field, Space Shooter and Platform Jumper were attempted; Platform Jumper's saved engine E2E passed, Asteroid Field's play/restart and editor-tuning runs passed, and there is no clean automated scoring or win proof for Space Shooter. Do not claim all 12 starters are Kane-verified.
- The one-command dev wrapper's tear-down under every failure mode; the cold-start, readiness and reuse paths were exercised, but a mid-run crash was not.

### Experimental / constrained

- Auto-fix handles one defect class only.
- Saved-test replay works mechanically but has shown no measured speedup; live `testmd` runs still authored steps.
- Deterministic replay exists in the runtime but is not exposed in Play UI.

### Not implemented (do not advertise)

- Accounts, cloud sync, multiplayer, real-time collaboration.
- Arbitrary user scripting/code, 3D, skeletal animation.
- Mobile editor layout below 1024 px.
- Visual/pixel-diff validation or autonomous gameplay exploration by Kane.
- "Fully autonomous AI game development": the agent is bounded, mode-gated, and every change is reviewable.
- Automatic bug fixing beyond the embedded-collectible repair.

### Constraints

- WebGL/canvas required for viewport and Play.
- Browser storage is per-browser; no sync. Export before clearing data.
- Export requires the local API server to bundle the player; the resulting zip does not.
- Snapshots are local SQLite, 20 MB, TTL 1–168 h (AI Play uses 1 h).
- The saved engine E2E is a terminal path only; it does not replace the in-app reviewed-phase flow and is not a CI job out of the box.
- Kane requires install, sign-in and credits; runs cost real credits.
- Rate limiting and AI budget state are in server memory.
- The Neon Runner demo intentionally seeds an uncollectible coin; that failure is staged demo data, not a random bug.

### Discrepancies between appearance and reality

- The AI Play panel embeds an **AI Testing plan** section, but running a phase from that panel does not feed the agent conversation; only the tool path does.
- "Engine QA" in `verify_with_kane` runs against a **game snapshot**, not the editor; editor QA is the external objectives and the saved engine E2E.
- The 12 starters have game-test profiles; the three classic templates (platformer/topdown/puzzle) do not, so Test Mode reports unavailable for them.
- The default `AI Play` auto-fix is deterministic Clockwork logic, not the language model, unless the agent's `run_ai_play` tool is used.
- `features.md` still labels AI Play and the phase flow as not listed pending gates; it is older and more conservative than this audit. Use `docs/FEATURE_VERIFICATION.md` and the recorded runs for the current status.
