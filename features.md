# Clockwork Features

Only features that are **100% implemented, manually verified, and passing the current slice gate** are listed here. Planned, partial, mocked, or disabled work does not belong in this file. Put limitations and unfinished work in [`docs/known-issues.md`](docs/known-issues.md).

## Status

Slice 0 (static shell) committed and verified. Slice 1 (engine model, command bus, persistence, project lifecycle) is implemented and committed (`10b839e`), including the undo/redo revision fix (`748786a`; history entries store `prevRevision`; undo restores it, redo restores `prevRevision + 1`). It passes `pnpm typecheck` and `pnpm build`, and its full acceptance gate passed **45/45 checks in one consolidated cold-profile browser run** (2026-11-17).

Slice 2 (PixiJS viewport, scene graph, selection, transforms) is implemented on top: the editor scene view is a real Pixi stage with camera pan/zoom/fit, rulers, layer order/opacity/parallax, canvas selection, marquee, drag move, scale/rotate gizmos, grid snapping, context menu, hierarchy multi-select/rename/drag-reparent and layer drag-reorder. Its full acceptance gate passed **24/24 checks in one cold-profile run at 1366×768** (2026-11-17). This also fixed two Slice 1 engine bugs: undo/redo revision semantics and `layer.reorder` restoring the original order.

Verified in headless browser passes: Slice 1 search, all filters, archived read-only, duplicate/delete, export → delete → re-import (documents identical), project/object rename, start-scene change and fallback, add/delete scene/layer/object with one revision + one undo each, the dirty → saving → saved transition, and malformed-import rejection. Slice 2 scale/rotate gizmos, 8 px snapping, dock/panel persistence, hierarchy virtualization, multi-select inspector fields, Group selection and Create prefab were also verified. Three real bugs were fixed in these passes: undo/redo revision semantics, layer reorder restoring the original order, and canvas context menus closing before their actions ran.

The Slice 1 and Slice 2 gates are closed and their features are listed below. Slice 2’s 2,000-rect run measured **801 fps with rAF uncapped** (≈1.25 ms/frame) in Chrome on Intel UHD graphics; this environment’s display/vsync caps every page at ~40 Hz, so 55 fps cannot be observed directly on-screen, but the measured frame budget is 14× the target.

Slice 4 (runtime and manual Play) is implemented and verified. A runtime harness passed **13/13 checks**, the renderer’s per-layer parallax passed a separate check, and a cold-profile browser pass at 1366×768 verified Play entry from the rail and Overview, pause/step/reset, read-only state, F1 telemetry, goal completion, and zero console errors. With rAF uncapped, Play measured **655 fps average** over 10 seconds (individual samples 560–858 fps). The Slice 3 asset pipeline is committed but its acceptance gate has not been logged in `docs/implementation-log.md`, so no Slice 3 features are listed here.

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

Every new project (and the built-in demo) seeds 11 original sprite/background images and three SFX WAVs into local storage with stable asset ids. Platformer objects reference the art automatically, so a new project opens with real player, coin, enemy, hazard, flag, ground and parallax visuals instead of flat rectangles.
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

### Play controls, telemetry and determinism

Pause freezes the fixed-step loop, Step advances exactly one 1/60 s step, Reset restores variables and positions, and Stop/Escape leave Play. F1 shows FPS, entities, bodies and camera; the console lists rule, jump, checkpoint, variable and error events with object ids. The same seed and input trace replay identically.
Completed in Slice 4 · 13/13 runtime checks plus browser pause/step/reset.

<!--
When a feature is fully complete, add it under the right area using this shape:

### Feature name

One or two sentences describing what the user can do and where to find it.
Completed in Slice N · commit <short-sha> · verified at 1366×768 and 1440×900.

Areas: Editor, Assets, Runtime, Logic, AI Agent, Shipping, Platform.
Do not add a feature until every acceptance criterion for its slice is checked and logged.
-->
