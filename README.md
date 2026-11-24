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

- **Projects:** create from Blank, one of 12 genre starters, one of 3 classic templates, or a written brief; search/filter/sort; rename, duplicate, archive, export and import `.clockwork.json`; damaged-project recovery.
- **Editor:** PixiJS viewport with selection, multi-select, marquee, move/scale/rotate, snapping, pan/zoom, layers, hierarchy drag/reparent, inspector and undo/redo.
- **Assets:** seeded starter art/audio, import, search/filter, rename, manual slicing, animation clips, and tilemap paint/erase/fill/pick.
- **Gameplay authoring:** 57 commands, 26 behaviour types, variables, five rule conditions, eight rule actions, prefabs with overrides and detach, input bindings, gravity, HUD and scene audio.
- **Runtime:** fixed-step manual Play with pause/step/reset, telemetry, keyboard/pointer/gamepad input, sub-stepping, and merged tilemap collision.
- **Agent:** Ask / Build / Plan modes, typed read/write tools, live project context, atomic command batches, plan ghosts, agent presence, change-set cards, and normal undo.
- **Shipping:** self-contained `.zip` export, expiring snapshot links (`/s/:id`), read-only snapshot player, and project cover capture.

### Built-in starting points

The New Project dialog offers **12 genre starters**, **3 classic templates**, and **Blank**:

- Genre starters: Space Shooter, Space Invaders, Asteroid Field, Ping Pong, Brick Breaker, Flappy Flyer, Platform Jumper, Endless Runner, Arena Survival, Falling Objects, Maze Escape, Snake.
- Classic templates: Platformer, Top-down, Puzzle.
- Blank: one empty scene and layer.

Each starter is a real generated document with a scene, objects, behaviours, rules and HUD data. The 12 genre starters also have game-test profiles; the three classic templates do not.

## Kane CLI integration

Kane is used in four distinct ways. See [`docs/kane-cli-usage.md`](docs/kane-cli-usage.md) for the field guide.

1. **AI Testing (reviewed phases).** The built-in agent drafts a bounded test plan from a goal. The user reviews and approves it. Kane runs one phase at a time in deterministic Test Mode, clicking real controls and reading runtime observations. The typed verdict and evidence return to the agent conversation. A pass requires matching assertions, delivered input, budget compliance and an evidence bundle. Live passes are recorded in [`docs/kane-proof.md`](docs/kane-proof.md).
2. **AI Play.** A one-off snapshot probe with an AI HUD and optional deterministic embedded-collectible repair. It is a constrained gameplay check, not autonomous playtesting or visual bug detection.
3. **Saved engine E2E.** A saved `testmd` test drives the real editor: create a Platform Jumper project, verify the canvas/hierarchy/Inspector, edit and undo Object Y, play the game with `LIVES 3`, restart with R, and return to the editor. This tests the application, not a user-created game.
4. **Agent verification tools.** The agent can call `verify_with_kane`, `run_ai_play`, and `run_kane_test_phase`; results return as typed cards/events.

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

The saved test first passed authored in 286 s (2026-11-24, session `aceb577f-0a26-456e-a2d7-944652113935`): project `Engine E2E Platformer`, Object Y restored by undo, `LIVES 3` in Play and after R, and the final URL back on the project scene. The one-command cold-start path then passed again in 89 s with 1/1 replayed steps (session `e547a290-4de8-4797-af91-19efb79ce3af`), and its wrapper stopped the app cleanly. The latest result and 3.8 MB evidence pack are under `.testmuai/`, which is gitignored.

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
| `KANE_TIMEOUT_SECONDS`, `KANE_MAX_STEPS` | Bounded Kane run limits |
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
- [`docs/known-issues.md`](docs/known-issues.md) — limitations, unverified items and risks.
- [`docs/kane-proof.md`](docs/kane-proof.md) — dated Kane evidence and negative controls.
- [`docs/testing-hooks.md`](docs/testing-hooks.md) — selectors, URL params, data attributes and debug API.
- [`features.md`](features.md) — conservative, slice-by-slice feature status.

## Scope

Single-user and local-first. No accounts, cloud sync, multiplayer, arbitrary user scripting, 3D, skeletal animation, or mobile editor layout below 1024 px. Shared and exported players remain usable on mobile.

Kane does not provide autonomous game design, general visual bug detection, or unrestricted repair. The only automatic repair is the deterministic embedded-collectible policy used by AI Play.
