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

Tests for Slice 6.5, 7, 8 and 9 acceptance are intentionally deferred to the Slice 10 Kane pass. See `docs/known-issues.md` for the honest current state.

## Configuration

Copy the variables you need into the environment of the API process:

| Variable | Purpose |
|---|---|
| `PORT` | API port, default `3000` |
| `AI_MOCK=1` | Development-only mock model; never present as a real provider |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Simple env-configured OpenAI-compatible model |
| `CLOCKWORK_SECRET` | Extra secret mixed into the local key vault |

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

## Kane and AI Play

Kane engine QA and in-product AI Play are Slice 10. The shipped product keeps manual Play first-class; AI Play is additive and requires a model plus a logged-in Kane CLI. The setup and HUD contracts land with that slice; the plan is in `docs/clockwork-implementation-plan.md` §Slice 10.

## Documents

- [`features.md`](features.md) — completed, user-facing features only.
- [`docs/known-issues.md`](docs/known-issues.md) — limitations, unverified items and risks.
- [`docs/implementation-log.md`](docs/implementation-log.md) — slice evidence and commands.
- [`docs/testing-hooks.md`](docs/testing-hooks.md) — selectors, URL params, data attributes and debug API.
- [`docs/clockwork-implementation-plan.md`](docs/clockwork-implementation-plan.md) — the full implementation plan.

## Scope

Single-user and local-first. No accounts, cloud sync, multiplayer, arbitrary scripting, 3D, skeletal animation or mobile editor layout below 1024 px. Shared and exported players remain usable on mobile.
