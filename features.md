# Clockwork Features

Only features that are implemented and pass the current local gates are listed here. Where live browser or Kane evidence is still pending, the entry says so explicitly; the remaining acceptance gates are tracked in [`docs/known-issues.md`](docs/known-issues.md) and [`docs/demo-readiness.md`](docs/demo-readiness.md).

## Status

Slice 0 (static shell) committed and verified. Slice 1 (engine model, command bus, persistence, project lifecycle) is implemented and committed (`10b839e`), including the undo/redo revision fix (`748786a`; history entries store `prevRevision`; undo restores it, redo restores `prevRevision + 1`). It passes `pnpm typecheck` and `pnpm build`, and its full acceptance gate passed **45/45 checks in one consolidated cold-profile browser run** (2026-11-17).

Slice 2 (PixiJS viewport, scene graph, selection, transforms) is implemented on top: the editor scene view is a real Pixi stage with camera pan/zoom/fit, rulers, layer order/opacity/parallax, canvas selection, marquee, drag move, scale/rotate gizmos, grid snapping, context menu, hierarchy multi-select/rename/drag-reparent and layer drag-reorder. Its full acceptance gate passed **24/24 checks in one cold-profile run at 1366×768** (2026-11-17). This also fixed two Slice 1 engine bugs: undo/redo revision semantics and `layer.reorder` restoring the original order.

Verified in headless browser passes: Slice 1 search, all filters, archived read-only, duplicate/delete, export → delete → re-import (documents identical), project/object rename, start-scene change and fallback, add/delete scene/layer/object with one revision + one undo each, the dirty → saving → saved transition, and malformed-import rejection. Slice 2 scale/rotate gizmos, 8 px snapping, dock/panel persistence, hierarchy virtualization, multi-select inspector fields, Group selection and Create prefab were also verified. Three real bugs were fixed in these passes: undo/redo revision semantics, layer reorder restoring the original order, and canvas context menus closing before their actions ran.

The Slice 1 and Slice 2 gates are closed and their features are listed below. Slice 2’s 2,000-rect run measured **801 fps with rAF uncapped** (≈1.25 ms/frame) in Chrome on Intel UHD graphics; this environment’s display/vsync caps every page at ~40 Hz, so 55 fps cannot be observed directly on-screen, but the measured frame budget is 14× the target.

Slice 4 (runtime and manual Play) is implemented and verified. A runtime harness passed **13/13 checks**, the renderer’s per-layer parallax passed a separate check, and a cold-profile browser pass at 1366×768 verified Play entry from the rail and Overview, pause/step/reset, read-only state, F1 telemetry, goal completion, and zero console errors. With rAF uncapped, Play measured **655 fps average** over 10 seconds (individual samples 560–858 fps). The Slice 3 asset pipeline is committed and its gate is logged in `docs/implementation-log.md`; its features are listed below. Slice 5 (logic, prefabs, presentation) is also gate-closed with browser evidence in the implementation log.

Slice 6 (agent transport, context, chat shell) is gate-closed on `AI_MOCK=1` evidence, and a real provider tool-call turn is now proven by the 2026-11-18 agent runs. Slice 6.5 (provider vault and settings) is implemented but not gate-closed: key persistence across restart, session-only key loss, the custom-provider chat and the key-absence audit have not been run. Slices 7 and 8 (agent workflows and presence; ship, export, share) are implemented, and their browser acceptance is still unverified.

Slice 9 (hardening and demo readiness) is implemented. Its matrix is only partly covered by the Kane runs, which exercised the editor cold at 1366×768; the `AI_ENABLED=0` manual path, the 1440/1920 and 1024 layouts, the keyboard-only run, the console-warning sweep and refresh-during-save recovery remain open.

Slice 10 (Kane engine QA and in-product AI Play) is implemented and has real evidence in [`docs/kane-proof.md`](docs/kane-proof.md): K1, K3a, K3b, K4 and K5 passed against the real editor, and the independent negative control (an unsatisfiable win rule) failed and then passed after repair. AI Play and the other Kane surfaces are deliberately **not** listed below yet: the Slice 10 gate is still open on the manual/no-model browser pass, the no-model AI Play state, the fixture-driven UI artifact and AI HUD keyboard parity, and this file admits no feature while a blocking entry is open in [`docs/known-issues.md`](docs/known-issues.md).

## Editor

### Project dashboard

Create a project from Blank or a Platformer, Top-down or Puzzle template, then search, filter by status and template, sort, rename, duplicate, archive/restore, and delete projects from the dashboard.
Completed in Slice 1 · gate 45/45 · verified at 1440×900 (single cold-profile run).

### Scene and layer editing

Open a project and add, rename, delete and undo/redo objects, layers and scenes; every mutation is one revision and one undo entry, and the save pill shows the Unsaved → Saving… → Saved transition.
Completed in Slice 1 · gate 45/45 · verified at 1440×900 (single cold-profile run).

### Autosave and reload persistence

Work is saved to local storage automatically and reloading restores the same revision, scenes, layers, objects and save state.
Completed in Slice 1 · gate 45/45 · verified at 1440×900 (single cold-profile run).

### Import and export

Export the project as a `.clockwork.json` file and import it back (or into another project); malformed files and files over 20 MB are rejected without creating a project.
Completed in Slice 1 · gate 45/45 · verified at 1440×900 (single cold-profile run).

### Project settings

From Settings: rename the project, choose the start scene, save changes, export/import, and delete the project; a deleted start scene falls back to the first remaining scene.
Completed in Slice 1 · gate 45/45 · verified at 1440×900 (single cold-profile run).

### Archived projects

Archive a project to make it read-only, see the read-only banner and disabled settings, then restore it from the dashboard or the overview.
Completed in Slice 1 · gate 45/45 · verified at 1440×900 (single cold-profile run).

### Damaged project recovery

If a stored project fails validation, the overview shows a recovery panel whose `Delete damaged project` action removes it and returns to the dashboard.
Completed in Slice 1 · gate 45/45 · verified at 1440×900 (single cold-profile run).

### Scene viewport and rendering

Open a scene to see it rendered by PixiJS with layer order, visibility, opacity, parallax and world rulers; the Platformer demo renders its full layered dusk scene, ground, platforms, player, coins, hazard, checkpoint and goal.
Completed in Slice 2 · gate 24/24 · verified at 1366×768 (cold-profile run).

### Canvas selection and multi-object moves

Click objects on the canvas or in the hierarchy to select them; marquee-drag empty space to select many, and drag a multi-selection so the whole gesture is one revision and one undo entry that restores every position.
Completed in Slice 2 · gate 24/24 · verified at 1366×768 (cold-profile run).

### Transform gizmos and snapping

Move, scale and rotate with canvas handles; snap to 8, 16 or 32 px grids with visible guides that disappear on release.
Completed in Slice 2 · gate 24/24 · verified at 1366×768 (cold-profile run).

### Cursor-anchored zoom and fit

Zoom with the wheel around the cursor, use the Fit and 1:1 buttons or the `0`/`1` keys, and pan with Space or the Hand tool; rulers track the camera and none of it creates history.
Completed in Slice 2 · gate 24/24 · verified at 1366×768 (cold-profile run).

### Layer order

Reorder layers by dragging them in the Layers dock; draw order updates and survives reload.
Completed in Slice 2 · gate 24/24 · verified at 1366×768 (cold-profile run).

### Resizable, persistent docks

Drag the dock separators to resize the hierarchy and inspector, and collapse or reopen the inspector; widths, collapse state, tool and workspace tab survive reload without touching the document revision.
Completed in Slice 2 · gate 24/24 · verified at 1366×768 (cold-profile run).

### Deep links and workspace tabs

The active scene and workspace tab live in the URL and survive reload; an invalid scene falls back to the project’s start scene with a `Scene not found` toast.
Completed in Slice 2 · gate 24/24 · verified at 1366×768 (cold-profile run).

### Large scenes

A 2,000-object scene renders and stays responsive; rendering is sprite-batched, and the uncapped measurement is 801 fps (≈1.25 ms per frame).
Completed in Slice 2 · gate 24/24 · verified at 1366×768 (cold-profile run).

## Assets

### Starter art and audio

Every new project (and the built-in demo) seeds 13 original sprite/background images (including a dusk sky gradient and moon) and three SFX WAVs into local storage with stable asset ids. Platformer objects reference the art automatically, so a new project opens with a composed gradient sky, layered hills, ground and gameplay sprites instead of flat rectangles.
Completed in Slice 3 · verified at 1366×768 (cold-profile run).

### Asset browser

The Assets page supports import (file picker or drag onto the canvas), search, kind filters with counts, inline rename, usage counts with in-use references, thumbnails, drag-to-canvas, add-to-scene, slicing, animation clips and tilemap creation. Duplicate imports reuse the existing asset and report “Already in project”; deleting an in-use asset is refused with a reference message; assets and thumbnails restore after reload.
Completed in Slice 3 · verified at 1366×768 (cold-profile run).

### Sprite slicing and animation

Grid slicing supports 4×2 sheets (verified frame size 341×384 on a 1366×768 import) and manual frame entry with an overlay; the animation editor previews frames at the requested FPS (verified at 5 fps), and clip records store name, fps, frame list and loop.
Completed in Slice 3 · verified at 1366×768 (cold-profile run).

### Tilemap painting

A 20×10 tilemap can be created from a tileset image. Selecting it shows Paint/Erase/Fill/Pick, a brush size and tile index; the canvas draws a tile grid and hover cell, and each drag stroke is one undo entry (verified paint, erase, fill and one-undo revert).
Completed in Slice 3 · verified at 1366×768 (cold-profile run).

## Logic

### Rules and variables

Logic lets you author variable- and overlap-driven rules with plain-language previews, flags references to deleted objects in the editor, and skips blocked rules at runtime with a `rule-blocked` event. The Platformer “coins ≥ 3 → Win” rule fires exactly once.
Completed in Slice 5 · verified in the runtime harness.

### Prefabs, overrides and detach

Coin prefabs instantiate in bulk, receive prefab edits across every instance, keep per-instance overrides through an update, and stop following the prefab once detached. Fixed a duplicate-id bug in prefab refresh found by the gate.
Completed in Slice 5 · verified in the runtime harness.

### Presentation controls

Presentation shows one of Look, Animation, Audio or Game UI at a time, persists the active subtab in `?ptab=`, and edits gravity, input bindings, volumes, HUD widgets and messages used by Play. Duplicate bindings warn (for example `KeyW (up, jump)`).
Completed in Slice 5 · verified at 1366×768 in a cold profile.

### HUD bars and visibility

HUD widgets bind to variables in Play; bar widgets respect their max (`Coins 0 of 7`) and hiding a widget removes it from the runtime HUD.
Completed in Slice 5 · verified at 1366×768 in a cold profile.

## AI Agent

### Agent drawer and project context

Open the agent with `⌘J` or the toolbar; it shows the current scene, selection and revision as context chips, streams replies, supports Ask/Build/Plan modes, and keeps each project's thread across reloads (New chat clears it).
Completed in Slice 6 · verified at 1366×768 with `AI_MOCK=1`.

### Read-only tools and viewport capture

The agent calls read-only tools (`list_scenes`, `get_scene`, `search_entities`/`query_project`, `get_object`/`inspect_entity`, `get_variables`, `get_selection`) and renders tool results in expandable cards; `capture_viewport` returns a PNG into the drawer and into the next step. Chained tool calls resolve to a final answer.
Completed in Slice 6 · verified at 1366×768 with `AI_MOCK=1`, and real-provider tool calls were proven on 2026-11-18 (K3a/K3b/K4, `docs/kane-proof.md`).

### Stop, retry and errors

Stop aborts the stream and returns to ready in under 200 ms, errors render an actionable Retry card that preserves the thread, and the drawer overlays with a scrim at 1366×768 and docks at 420 px on wide screens.
Completed in Slice 6 · verified at 1366×768 and 1920×1080 with `AI_MOCK=1`.

## Runtime

### Manual Play from the project

Start the project’s start scene from either the Playtest rail item or the Overview Play button; Play runs in a dedicated read-only route with a scene/seed/time chip, and Escape returns to the project.
Completed in Slice 4 · verified at 1366×768 (cold-profile run).

### Platformer run

The Platformer template can be played end to end: move, jump, collect cores, hit the hazard, respawn at the checkpoint, and reach the relay to win. Double jump, coyote time and jump buffering work when configured on the controller.
Completed in Slice 4 · 13/13 runtime checks plus browser goal run.

### Camera, HUD and messages

The camera follows with a deadzone, lerps, clamps to the world, and applies each layer’s parallax factor; HUD widgets bind to variables and rule messages appear over the scene.
Completed in Slice 4 · verified at 1366×768 (cold-profile run).

### Pointer, tap and gamepad input

Play accepts keyboard, pointer/tap on the play canvas, and the first standard-mapping gamepad (left stick/d-pad to move, A to jump, X to action) with a deadzone. Pressed and released edges are consumed once per fixed step.
Completed in Slice 4 residual pass · verified with the runtime harness.

### Sub-stepping and merged tilemap collision

Fast dynamic bodies move in up to eight deterministic physics substeps so they cannot tunnel through thin colliders, and tilemap rows merge contiguous filled tiles into single solid spans. A 100×100 tilemap yields 100 row solids instead of 10,000.
Completed in Slice 4 residual pass · verified with the runtime harness.

### Play controls, telemetry and determinism

Pause freezes the fixed-step loop, Step advances exactly one 1/60 s step, Reset restores variables and positions, and Stop/Escape leave Play. F1 shows FPS, entities, bodies and camera; the console lists rule, jump, checkpoint, variable and error events with object ids. The same seed and input trace replay identically.
Completed in Slice 4 · 13/13 runtime checks plus browser pause/step/reset.

## AI Testing and Kane

### Reviewable game-test plans

Ask the built-in agent for a bounded test plan in natural language. It reads the template’s versioned controls, observations, objectives and scenarios, validates the proposal against the current revision and hard budgets, and places it in the AI Testing panel. Every revision needs a reason, the original user goal is immutable, and no Kane run starts until the plan is explicitly approved.
Implemented · unit-tested; live model-to-plan acceptance pending.

### Kane Test Mode and typed phase results

The approved phase opens an immutable snapshot in deterministic Test Mode. Kane clicks profile-labelled controls, advances a bounded number of frames and stores observations. The server joins the terminal verdict with applied-input receipts, frame count, assertion values and evidence; the report never converts missing input, missing observations, timeouts or missing evidence into a pass.
Implemented · typecheck, runner, phase and Test Mode tests pass; live Kane phase evidence pending.

### AI Play fail → repair → replay

AI Play runs Kane against a snapshot, reads the strict terminal verdict, applies the narrow embedded-collectible repair when applicable, and replays the same seed once. Both attempts, final states and evidence links remain visible, with Undo AI fixes.
Implemented · real K1–K5 evidence recorded in [`docs/kane-proof.md`](docs/kane-proof.md); demo gate still open.

### Agent chat attachments and history

The agent drawer renders safe GFM Markdown, keeps multi-chat history with rename/delete, and accepts image/audio project assets from the picker, drag/drop or paste. Attachments become real project assets on send, appear as thumbnails/audio cards, and reach the model as an asset-id manifest rather than binary data.
Implemented · unit tests cover attachment validation, manifests, titles and legacy-chat migration; browser acceptance pending.

<!--
When a feature is fully complete, add it under the right area using this shape:

### Feature name

One or two sentences describing what the user can do and where to find it.
Completed in Slice N · commit <short-sha> · verified at 1366×768 and 1440×900.

Areas: Editor, Assets, Runtime, Logic, AI Agent, Shipping, Platform.
Do not add a feature until every acceptance criterion for its slice is checked and logged.
-->
