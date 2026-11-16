# Clockwork

A browser-native 2D game engine with an AI co-worker built into the editor. This branch currently contains the **Slice 0 static shell**; the engine, renderer, persistence, agent, and Kane integration land in later slices.

## Run it

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. The dashboard is at `/`; the static editor demo is at `/project/prj_neonrunner/scene/scn_track`.

```bash
pnpm typecheck
pnpm build
```

## What is implemented

- Dark, fixed game-engine shell at a 1366×768 baseline: 52 px top bar, 68 px rail, 42 px tab strip, 46 px toolbar, 26 px status bar.
- Projects dashboard with search, filters, archived styling, loading/empty/no-results/error states, and a four-mode creation dialog.
- Static editor with mock layers/hierarchy, CSS-art viewport, selection-driven inspector, workspace tabs, command palette shell, and responsive drawers.
- Manual `Play` and `AI Play` buttons are present as shell actions. They are not wired to a runtime or Kane yet.

## Not implemented

No project document, Pixi renderer, IndexedDB persistence, autosave, playable runtime, agent, provider keys, or Kane AI Play. Project creation is in-memory and refresh loses new cards; the canvas is static CSS art. See [`docs/known-issues.md`](docs/known-issues.md) and [`features.md`](features.md).

## Documents

- [`docs/clockwork-implementation-plan.md`](docs/clockwork-implementation-plan.md) — implementation plan and acceptance gates.
- [`docs/implementation-log.md`](docs/implementation-log.md) — slice evidence.
- [`docs/known-issues.md`](docs/known-issues.md) — limitations and risks.
- [`features.md`](features.md) — completed, user-facing features only.
