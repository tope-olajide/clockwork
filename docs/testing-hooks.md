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
| `?seed=<number>` | Play | Deterministic runtime seed, default `1234`.
| `?ai=1` | Snapshot | Show the AI Play HUD.
| `?testMode=step` | Snapshot | Opt in to lockstep Test Mode. Ignored by `/play/:projectId`.
| `?scenario=<id>` | Snapshot + `testMode=step` | Request a registered scenario; must be allowed by the template's profile. |
| `?maxAdvance=<n>&maxFrames=<n>` | Snapshot + `testMode=step` | Approved per-STEP and per-phase frame limits, composed server-side. |

## Test Mode contract (snapshot only)

`/s/:snapshotId?ai=1&testMode=step&seed=1234` starts the runtime **paused at frame 0**
with no `requestAnimationFrame` loop. Frames advance only through bounded requests, and
every queued control has a planned press/release frame, so nothing depends on wall time.
A template without a registered profile renders `test-mode-unavailable` and stays at
frame zero instead of falling back to real time.

| Selector | Meaning |
|---|---|
| `[data-testid="test-mode-hud"]` | Root. Carries `data-frame`, `data-status`, `data-seed`, `data-scenario`, `data-receipts`, `data-input-accepted` and `data-accepted-inputs`. |
| `test-control-<controlId>` | Profile-labelled control (`move-left`, `shoot`, ...). Hold controls report `aria-pressed`. |
| `test-advance` | Advance exactly the frame count in `test-advance-frames`. |
| `test-advance-10` | Advance 10 frames. |
| `test-reset` | Restore the same snapshot, seed and frame-zero state. |
| `test-observation-<id>` | Read-only observation value from the runtime. |
| `test-observation-accepted_inputs` | Count of accepted input receipts; the plan objective stores it as `accepted_inputs`. |
| `test-receipts` | Input receipts: accepted frames or the rejection reason. |
| `test-notice` | Last rejection, clamp or budget message. |
| `test-mode-unavailable` | No profile for this template. |

Controls can only enqueue a logical action from the profile. There is no endpoint or
control that writes variables, score, health or win/loss. An allowed scenario is applied
to a document copy before frame zero. `data-scenario` contains the applied id or an
empty string; the Test Mode HUD shows `(setup applied)` or `none`. A disallowed or
invalid scenario stays unapplied and is reported as `none`, never as a successful setup.

## Test plan review selectors

| Selector | Meaning |
|---|---|
| `test-plan-panel` | AI Testing plan section (absent when the template has no profile). |
| `test-plan-objective` | Natural-language goal input. |
| `test-plan-suggest-<objectiveId>` | Profile-suggested objective; fills the goal input. |
| `test-plan-request` | Sends the goal to the planning model. Never starts Kane. |
| `test-plan-errors` | Explicit rejection reasons from plan validation. |
| `test-plan-draft` | Proposed plan: phases, assertions, budget and revision reasons. |
| `test-plan-stale` | Draft targets an older project revision; approve is disabled. |
| `test-plan-approve` / `test-plan-cancel` | Approve the reviewed plan / discard it. |
| `test-plan-run-<phaseId>` | Run one approved phase. Disabled until approval and when the draft is stale. |
| `test-plan-cancel-phase` | Stop the active Kane phase; it becomes `cancelled`, not a pass. |
| `test-plan-result-<phaseId>` | Typed result; `data-verdict` is `passed`, `failed`, `inconclusive` or `cancelled`. |
| `test-plan-phase-error` | Request/transport error for the phase. |
| `test-plan-report` | Per-criterion final report; `data-report-verdict` is `passed`, `failed` or `inconclusive`. |
| `test-plan-report-<assertionId>` | One criterion row; `data-status` is `passed`, `failed` or `inconclusive`. |
| `test-plan-report-meta` | Plan/project revision, scene, seed and scenario for the run. |
| `test-plan-report-versions` | Planner model, Kane CLI version, phase budget and frame cap. |
| `test-plan-report-assessment` | Separates what the engine agent inferred from what Kane directly observed. |
| `test-plan-report-followups` | Follow-up actions derived from unrun/failed criteria and staleness. |
| `test-plan-report-limitations` | Coverage, evidence, runtime-error and stale-revision limitations. |
| `test-plan-report-evidence-<n>` | Evidence bundle link backing the report; includes phase and run id. |
| `test-plan-roles` | Planner identity and the Kane CLI browser-agent role. |
| `test-plan-unavailable` | No profile, so no plan can be validated. |

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
| `data-test-mode` | Snapshot root | `step`, `unavailable` or `off`. |
| `data-seed` | Snapshot root | Seed the run was created with. |
| `data-scenario` | Snapshot root | Allowed scenario id, else empty. |
| `data-testid="test-plan-*"` | AI Play panel | Plan review surface listed above. |

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
