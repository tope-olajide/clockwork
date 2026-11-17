# Testing hooks

Stable selectors and state surfaces for the verification branch. Prefer these over
CSS classes or layout-dependent text.

## Route params

| Param | Where | Meaning |
|---|---|---|
| `?debug=1` | Editor | Show renderer diagnostics and the debug menu item. |
| `?tab=scene\|content\|logic\|presentation` | Editor | Active workspace. |
| `?ptab=look\|animation\|audio\|ui` | Editor | Active Presentation subtab. |
| `?section=assets\|ai\|ship\|project` | Project overview | Open a project section. |
| `?state=empty\|loading\|error` | Projects dashboard | Force a dashboard state. |
| `?demoReset=1` | Projects dashboard | Delete and reseed Neon Runner with the intentional uncollectible Core B. |
| `?seed=<number>` | Play | Deterministic runtime seed, default `1234`. |

## Data attributes

| Attribute | Element | Meaning |
|---|---|---|
| `data-viewport-canvas` | Editor canvas host | Pixi canvas container. |
| `data-camera="x,y,zoom"` | Editor canvas host | Current camera. |
| `data-guides` | Editor canvas host | Number of active snap guides. |
| `data-marquee="0\|1"` | Editor canvas host | Marquee gesture active. |
| `data-object-id` | Hierarchy row | Stable object id for scroll/selection checks. |
| `data-hierarchy-search` | Hierarchy search input | Object filter. |
| `data-playtest` | Play/snapshot root | `running`, `paused`, `won`, `stopped`, or `PLAYING`/`WON`/`PAUSED` on the snapshot player. |
| `data-scene-id` | Play/snapshot root | Active runtime scene id. |
| `data-frame` | Play/snapshot root | Fixed-step frame count. |
| `data-fps` | Play root | Recent FPS sample. |
| `data-variables` | Play/snapshot root | JSON snapshot of runtime variables. |
| `data-player` | Play/snapshot root | JSON player position/velocity/grounded state. |
| `data-step-ms`, `data-render-ms` | Play root | Per-frame timing. |

## Console events

Runtime events are also rendered in the Play console with their type:

`start`, `jump`, `land`, `collect`, `hazard`, `checkpoint`, `variable`, `rule`,
`rule-blocked`, `message`, `win`, `error`.

Agent UI errors use codes `no-key`, `invalid-key`, `no-model`, `model-unavailable`,
`no-tools`, `no-vision`, `rate-limit`, `provider-timeout`, `revision`.

## Debug API

When the editor is mounted, `window.__clockwork` exposes:

```ts
window.__clockwork.getState()
// { projectId, revision, sceneId, selection, historyLength, futureLength,
//   saveState, playtestRunning, agentOpen, agentMode, pendingPreview }

window.__clockwork.select(["obj_..."])
window.__clockwork.undo()
window.__clockwork.redo()
window.__clockwork.openAgent()
window.__clockwork.closeAgent()
window.__clockwork.setTab("scene" | "content" | "logic" | "presentation")
```

The bridge is removed when the editor unmounts. It never exposes provider keys.

## API endpoints used by verification

- `GET /api/health`
- `GET /api/build/player.js` — standalone IIFE player bundle.
- `POST /api/snapshots` — `{ document, assets, ttlHours }`.
- `GET /api/snapshots/:id`, `DELETE /api/snapshots/:id`.
- `/api/ai/*` — models, providers, settings, key status and the NDJSON step stream.

See `docs/known-issues.md` for which of these are browser-verified. As of Slice 9,
Slice 6.5–9 acceptance and Kane evidence are deferred to Slice 10.
