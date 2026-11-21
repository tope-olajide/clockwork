# Clockwork

A browser-native 2D game engine with an AI co-worker in the editor. Build a scene by hand, ask the Game Director for a change, play it, then export it or share a read-only link. Manual editing and Play never require a model.

## Quick start

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173.

The dev script runs Vite and the local API server together. The API serves the agent transport, provider settings, snapshots and the on-demand static player bundle.

```bash
pnpm typecheck
pnpm build
pnpm preview
```

`pnpm build` typechecks and builds the client. The exported-game player is generated on demand by `GET /api/build/player.js` with esbuild.

## What works

- **Projects:** create from Blank, Template or From brief; search/filter/sort; rename, duplicate, archive, export and import `.clockwork.json`; damaged-project recovery.
- **Editor:** PixiJS viewport with selection, multi-select, marquee, move/scale/rotate, snapping, pan/zoom, layers, hierarchy drag/reparent, inspector and undo/redo.
- **Assets:** starter art/audio seeding, import, search/filter, rename, manual slicing, animation clips, tilemap paint/erase/fill/pick.
- **Logic and presentation:** variables, rules, prefabs with overrides and detach, input bindings, gravity, look/animation/audio/HUD controls.
- **Runtime:** manual Play with pause/step/reset, telemetry, pointer/gamepad input, sub-stepping and merged tilemap collision.
- **Agent:** read-only tools, build/plan write tools, context chips, tool cards, viewport capture, preview ghosts, changed-object presence, locked selections, presets, bounded re-plan.
- **Shipping:** self-contained `.zip` export, expiring snapshot links (`/s/:id`), read-only snapshot player, project cover capture.

AI Testing is the headline Kane feature: ask the built-in agent for a bounded test plan, review and approve it, then run one phase at a time in deterministic Test Mode. Kane clicks the real snapshot controls, reads runtime observations and returns a typed verdict with evidence. The agent receives that result and chooses the next phase from it. See [`docs/ai-play.md`](docs/ai-play.md), [`docs/game-test-profiles.md`](docs/game-test-profiles.md) and [`docs/demo-readiness.md`](docs/demo-readiness.md).

## Configuration

Copy the variables you need into the environment of the API process:

| Variable | Purpose |
|---|---|
| `PORT` | API port, default `3000` |
| `AI_MOCK=1` | Development-only mock model; never present as a real provider |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Simple env-configured OpenAI-compatible model |
| `CLOCKWORK_SECRET` | Extra secret mixed into the local key vault |
| `KANE_ENABLED=1` | Enables Kane tools and the engine-QA route |
| `KANE_AI_PLAY_ENABLED=1` | Enables AI Play and approved test phases |
| `KANE_CLI` | Optional path or command for the Kane CLI |
| `KANE_TIMEOUT_SECONDS`, `KANE_MAX_STEPS` | Bounded Kane run limits |
| `CLOCKWORK_PUBLIC_URL` | Origin Kane opens (Vite in dev, usually `http://localhost:5173`) |

Provider keys can also be saved to the local vault from **Project → AI Settings**; session-only keys are intentionally lost when the server restarts. See [`docs/model-setup.md`](docs/model-setup.md).

## Data and storage

- Projects, assets and chat threads live in this browser's IndexedDB.
- Snapshots and the key vault live under `.data/` on the local server.
- Export a project before deleting browser data; there is no cloud sync in v1.

## Architecture

- `src/engine/` — document schema, command bus, Pixi renderer, runtime, persistence, agent client tools.
- `src/features/` — dashboard, editor, content/logic/presentation, playtest, agent, settings, ship.
- `src/play/` — the standalone exported-game bootstrapper.
- `server/` — Hono API for the agent, providers, snapshots and player bundling.
- `shared/` — protocol, tool definitions and snapshot contracts shared by client and server.

## Kane and AI Testing

Manual Play is always first-class and never needs a model or Kane. Kane adds real-browser verification:

- **AI Testing** — the built-in agent drafts a typed, bounded plan from a natural-language goal; you review and approve it; Kane runs one phase in deterministic Test Mode; the typed result and evidence return to the same agent conversation.
- **AI Play** — a separate one-off snapshot probe with an optional deterministic embedded-coin repair and same-seed retry.
- **Engine QA** — the agent can call `verify_with_kane` for a general browser check.

The phase flow uses the same profiles, Test Mode controls and evidence parser. A phase is only PASS when Kane returns `run_end`, the approved assertions match, inputs were actually delivered, the frame budget was respected and an evidence bundle exists. Missing input, missing observations, timeouts and runtime errors stay INCONCLUSIVE or FAIL; an exit code alone is never a pass.

Full setup, exact CLI commands and the HUD contract are in [`docs/kane-setup.md`](docs/kane-setup.md). The honest open items are in [`docs/known-issues.md`](docs/known-issues.md) and the sequential demo gate is in [`docs/demo-readiness.md`](docs/demo-readiness.md).

## Documents

- [`features.md`](features.md) — completed, user-facing features only.
- [`docs/known-issues.md`](docs/known-issues.md) — limitations, unverified items and risks.
- [`docs/implementation-log.md`](docs/implementation-log.md) — slice evidence and commands.
- [`docs/testing-hooks.md`](docs/testing-hooks.md) — selectors, URL params, data attributes and debug API.
- [`docs/clockwork-implementation-plan.md`](docs/clockwork-implementation-plan.md) — the full implementation plan.

## Scope

Single-user and local-first. No accounts, cloud sync, multiplayer, arbitrary scripting, 3D, skeletal animation or mobile editor layout below 1024 px. Shared and exported players remain usable on mobile.
