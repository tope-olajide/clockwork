# Clockwork

Clockwork is a browser-native 2D game engine with an AI co-worker inside the editor. Build a scene by hand, ask the Game Director for a change, play it, test it with Kane CLI, then export a standalone build or share a read-only link.

Manual editing and Play work without a model. AI authoring and Kane runs are optional, explicitly invoked workflows.

## Quick start

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173.

`pnpm dev` runs Vite and the local API server together. The API serves the agent transport, provider settings, snapshots, player bundling, and the Kane bridge.

```bash
pnpm typecheck
pnpm build
pnpm preview
pnpm test
pnpm check:repo
```

`pnpm build` typechecks and builds the client. The exported-game player is generated on demand by `GET /api/build/player.js` with esbuild.

## What is implemented

- **Projects:** create from Blank, one of 14 genre starters, one of 3 classic templates, or a written brief; search/filter/sort; rename, duplicate, archive, export and import `.clockwork.json`; damaged-project recovery.
- **Editor:** PixiJS viewport with selection, multi-select, marquee, move/scale/rotate, snapping, pan/zoom, layers, hierarchy drag/reparent, inspector and undo/redo.
- **Assets:** seeded starter art/audio, import, search/filter, rename, manual slicing, animation clips, and tilemap paint/erase/fill/pick.
- **Gameplay authoring:** 57 commands, 26 behaviour types, variables, five rule conditions, eight rule actions, prefabs with overrides and detach, input bindings, gravity, HUD and scene audio.
- **Runtime:** fixed-step manual Play with pause/step/reset, telemetry, keyboard/pointer/gamepad input, sub-stepping, and merged tilemap collision.
- **Agent:** Ask / Build / Plan modes, typed read/write tools, live project context, atomic command batches, plan ghosts, agent presence, change-set cards, and normal undo.
- **Shipping:** self-contained `.zip` export, expiring snapshot links (`/s/:id`), read-only snapshot player, and project cover capture.

### Built-in starting points

The New Project dialog offers **14 genre starters**, **3 classic templates**, and **Blank**, or you can describe a game in a written brief:

- Genre starters: Space Shooter, Space Invaders, Asteroid Field, Ping Pong, Brick Breaker, Flappy Flyer, Platform Jumper, Clockwork Meadows, Meadow Sandbox, Endless Runner, Arena Survival, Falling Objects, Maze Escape, Snake.
- Classic templates: Platformer, Top-down, Puzzle.
- Blank: one empty scene and layer.

Meadow Sandbox uses the Clockwork Meadows hero, art and parallax on a short 2,800 px stage with three easy ledges and no coins, enemies, hazards, variables or HUD. It is a clean starting point for adding features, for example with the agent.

Each starter is a real generated document with a scene, objects, behaviours, rules and HUD data. Test Mode has 13 built-in game-test profiles, one for every genre starter except Meadow Sandbox. Any other game (Meadow Sandbox, the classic templates, Blank and your own projects) gets a profile derived from the project itself, so every game has a Test Mode. The derived profile exposes status, player X/Y, every variable (up to 10), up to 6 object-tag counts and event counts (COLLECTED, DESTROYED, DAMAGE EVENTS, SHOTS FIRED). Readouts for a score or coins added later appear automatically.

## Kane CLI integration

Kane is used in four distinct ways. See [`docs/kane-cli-usage.md`](docs/kane-cli-usage.md) for the field guide.

### The closed loop

The in-app agent builds a change, asks Kane to check it, and reads the result:

1. The user asks the agent for a change and a Kane check.
2. The agent edits the project through the normal command registry.
3. The agent calls `verify_with_kane`.
4. The check runs first in the engine simulator.
5. The same check then runs in a real browser through Kane.
6. The typed verdict and readouts return to the chat and to the agent.
7. The agent reports the result or repairs the project.

**Headline run, `a20a4b28-5387-4849-a978-a5ca5aa499c3` (2026-11-25).** On a Meadow Sandbox project the user asked the agent to add coins tagged `coin`, give +1 score per coin, show a SCORE HUD, and verify with Kane. The agent applied the changes (6 coins, a score variable, a Score HUD widget), ran a headless preflight, then called `verify_with_kane`. The check passed at project revision 9: SCORE 0 → 1, COIN COUNT 6 → 5, COLLECTED 0 → 1, PLAYER X 240 → 473.67 after holding MOVE RIGHT for 45 frames. The simulator and the browser agreed on every readout. Evidence is served locally at `/api/kane/runs/a20a4b28-5387-4849-a978-a5ca5aa499c3/evidence`.

That run exposed two agent problems, now fixed. The user had to send a follow-up message before Kane ran because the agent used up its step budget. The chat agent now gets 12 model steps per message, reserves the last 3 for a requested Kane check and is told to stop editing; if the budget runs out, the chat says so. The agent also re-added a HUD widget it could not see, so HUD widgets are now in its context and `hud.add` rejects a duplicate widget id.

### The four ways

1. **AI Testing (reviewed phases).** The built-in agent drafts a bounded test plan from a goal. The user reviews and approves it. Kane runs one phase at a time in deterministic Test Mode, clicking real controls and reading runtime observations. The typed verdict and evidence return to the agent conversation (the review panel passes its result to the agent with `agent.continueWithPhaseResult`). A pass requires matching assertions, delivered input, budget compliance and an evidence bundle. Live passes on Space Shooter: `b967bbdd` (agent-driven, 79.7 s), `98e21783` (94.7 s) and `ea1bb3b3` (78.1 s), the last two approved through the review panel. Each returned typed PASSED with shots-fired 3, projectiles 3, accepted inputs 1 and 45 frames. Details are in [`docs/kane-proof.md`](docs/kane-proof.md).
2. **AI Play.** A one-off snapshot probe with an AI HUD and optional deterministic embedded-collectible repair. It is a constrained gameplay check, not autonomous playtesting or visual bug detection.
3. **Saved engine E2E.** A saved `testmd` test drives the real editor: create a Platform Jumper project, verify the canvas/hierarchy/Inspector, edit and undo Object Y, play the game with `LIVES 3`, restart with R, and return to the editor. This tests the application, not a user-created game.
4. **Agent verification tools.** The agent can call `verify_with_kane`, `run_ai_play`, and `run_kane_test_phase`; results return as typed cards/events. This is the path used by the headline run above.

### Kane limits by path

| Path | Timeout | Steps |
|---|---|---|
| Defaults (`KANE_TIMEOUT_SECONDS`, `KANE_MAX_STEPS`) | 180 s | 40 |
| `verify_with_kane` (`POST /api/kane/qa`) | 180 s default | min(40, 6 + 2 per step + 2 per readout) |
| AI Play (`POST /api/kane/ai-play`) | at most 140 s | at most 8 |
| Approved test phase (`POST /api/kane/phase`) | plan budget, at most 600 s per phase | at most 12 per phase, at most 3 phases |

### What Kane has caught and confirmed

- Engine QA runs K1, K3a, K3b, K4 and K5 passed against the real editor.
- K2 caught two real defects: Build accepting a request with no model configured, and undo history being wiped when returning from Play. Both are fixed, and K2 passed afterwards (`bded0577`: Air jumps 0 → 1, a second mid-air jump, then back to 0 with one Undo).
- A seeded uncollectible coin made AI Play fail with evidence (`87f6f320...`). The deterministic repair moved the coin, and the rerun passed (`646cff5f...`, STATUS WON, coins 3). The seeded defect is deliberate demo data.

### Run the saved engine E2E

With the app already running:

```bash
pnpm kane:engine-e2e
```

Or start the app, wait for Vite and `/api/health`, run the test, and tear down only what it started:

```bash
pnpm kane:engine-e2e:dev
```

Both print one JSON object to stdout with `status`, `steps`, `durationSeconds`, `finalState`, `testUrl`, `sessionId`, `evidencePath`, and file paths. The one-command wrapper writes app logs to `.testmuai/runs/engine-e2e-dev.log` so stdout stays machine-readable.

The saved test first passed authored in 286 s (2026-11-24, session `aceb577f-0a26-456e-a2d7-944652113935`): project `Engine E2E Platformer`, Object Y restored by undo, `LIVES 3` in Play and after R, and the final URL back on the project scene. The one-command cold-start path then passed again in 89 s with 1/1 replayed steps (session `e547a290-4de8-4797-af91-19efb79ce3af`), and its wrapper stopped the app cleanly. The latest result and 3.8 MB evidence pack are under `.testmuai/`. Only `.testmuai/tests/engine-template-e2e_test.md` is tracked; `.testmuai/runs/`, `.testmuai/evidence/` and `.testmuai/tests/output-*/` are gitignored.

### Credit-free phase smoke

```bash
pnpm smoke:phase
```

This runs fixture Kane plus a mock agent through the approve-and-replay panel flow with real headless Chrome and a console-error check.

## Configuration

Copy the variables you need into the environment of the API process.

| Variable | Purpose |
|---|---|
| `PORT` | API port, default `3000` |
| `AI_MOCK=1` | Development-only mock model; never present as a real provider |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Env-configured OpenAI-compatible model |
| `CLOCKWORK_SECRET` | Extra secret mixed into the local key vault |
| Kane CLI login | Required for Kane runs; no feature flag |
| `KANE_CLI` | Optional path or command for the Kane CLI |
| `KANE_TIMEOUT_SECONDS`, `KANE_MAX_STEPS` | Default Kane limits (180 s, 40 steps); see the table above for per-path limits |
| `CLOCKWORK_PUBLIC_URL` | Origin Kane opens (Vite in dev, usually `http://localhost:5173`) |

Provider keys can also be saved to the local vault from **Project → AI Settings**; session-only keys are intentionally lost when the server restarts. See [`docs/model-setup.md`](docs/model-setup.md).

## Data and storage

- Projects, assets and chat threads live in this browser's IndexedDB.
- Snapshots, Kane evidence and the key vault live under `.data/` on the local server.
- Export a project before deleting browser data; there is no cloud sync in v1.
- Kane and screenshots require Chrome/WebGL; exported players do not need the local server.

## Architecture

- `src/engine/` — Zod document schema, 57-command bus, PixiJS renderer, fixed-step runtime, persistence, agent tools.
- `src/features/` — dashboard, editor, content/logic/presentation, playtest, agent, settings, ship.
- `src/play/` — standalone exported-game player and the AI HUD.
- `server/` — Hono API for agent streaming, providers, snapshots, player bundling and Kane runs.
- `shared/` — protocol, tool definitions and snapshot contracts shared by client and server.
- `.testmuai/tests/` — saved Kane `testmd` tests, including the engine E2E.
- `scripts/kane/` — terminal Kane runners and the one-command dev wrapper.

The document model, command registry, renderer, runtime and persistence are separate layers. Manual edits and agent edits both dispatch through the same command registry, so they share revisions, validation and undo history.

## Documents

- [`docs/PROJECT_FEATURE_AUDIT.md`](docs/PROJECT_FEATURE_AUDIT.md) — verified feature inventory, workflows, architecture and limitations.
- [`docs/FEATURE_VERIFICATION.md`](docs/FEATURE_VERIFICATION.md) — claim-to-source verification ledger.
- [`docs/HACKATHON_SUBMISSION_DESCRIPTION.md`](docs/HACKATHON_SUBMISSION_DESCRIPTION.md) — submission-ready project description.
- [`docs/kane-cli-usage.md`](docs/kane-cli-usage.md) — how Kane is used for engine and game testing.
- [`docs/known-issues.md`](docs/known-issues.md) — limitations and risks.
- [`docs/implementation-log.md`](docs/implementation-log.md) — build log, ending with the 2026-11-25 final status.
- [`docs/clockwork-implementation-plan.md`](docs/clockwork-implementation-plan.md) — the original brief.
- `docs/archive/` — historical planning docs (`KANE_AI_TESTING_IMPLEMENTATION_PLAN.md`, `slice-3-7-fixes.md`, `chat-kane-integration-plan.md`, `agent-chat-ux-plan.md`, `game-starter-templates-plan.md`, `video-scene/`).
- [`docs/kane-proof.md`](docs/kane-proof.md) — dated Kane evidence and negative controls.
- [`docs/testing-hooks.md`](docs/testing-hooks.md) — selectors, URL params, data attributes and debug API.
- [`features.md`](features.md) — slice-by-slice feature status.

## Scope and limitations

- Single-user and local-first: no accounts, cloud sync, multiplayer, arbitrary user scripting, 3D, skeletal animation, or mobile editor layout below 1024 px. Shared and exported players work on mobile.
- Kane checks gameplay readouts and inputs. The only automatic repair is the deterministic embedded-collectible policy used by AI Play.
- Phase results and idempotency state on the server are held in memory and are cleared when the server restarts.
- Phase replay from a saved test is wired in (`POST /api/kane/phase` accepts `replayTestKey`), but no phase replay speedup has been measured yet. The engine E2E replayed 1/1 steps in 89 s, re-confirmed on 2026-11-26 in 164 s.

## Test status

176 tests across 27 test files pass (`pnpm test`), `pnpm typecheck`, `pnpm build` and `pnpm check:repo` pass, and `pnpm test:hud` passes 108/108 HUD layouts. `pnpm smoke:phase` passes against a running app. Kane runs are recorded evidence, not CI; coverage boundaries are listed in [`docs/known-issues.md`](docs/known-issues.md).
