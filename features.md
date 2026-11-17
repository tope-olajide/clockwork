# Clockwork Features

Only features that are **100% implemented, manually verified, and passing the current slice gate** are listed here. Planned, partial, mocked, or disabled work does not belong in this file. Put limitations and unfinished work in [`docs/known-issues.md`](docs/known-issues.md).

## Status

Slice 0 (static shell) committed and verified. Slice 1 (engine model, command bus, persistence, project lifecycle) is implemented and committed (`10b839e`), including the undo/redo revision fix (`748786a`; history entries store `prevRevision`; undo restores it, redo restores `prevRevision + 1`). It passes `pnpm typecheck` and `pnpm build`, and its full acceptance gate passed **45/45 checks in one consolidated cold-profile browser run** (2026-11-17).

Slice 2 (PixiJS viewport, scene graph, selection, transforms) is implemented on top: the editor scene view is now a real Pixi stage with camera pan/zoom/fit, rulers, layer order/opacity/parallax, canvas selection, marquee, drag move, scale/rotate gizmos, grid snapping, context menu, hierarchy multi-select/rename/drag-reparent and layer drag-reorder. Headless browser verification passed 17/17 checks, including “one drag = one revision and one undo entry” and “pan/zoom creates no history”. This also fixed two Slice 1 engine bugs: undo/redo revision semantics and `layer.reorder` restoring the original order.

Verified in headless browser passes: Slice 1 search, all filters, archived read-only, duplicate/delete, export → delete → re-import (documents identical), project/object rename, start-scene change and fallback, add/delete scene/layer/object with one revision + one undo each, the dirty → saving → saved transition, and malformed-import rejection. Slice 2 scale/rotate gizmos, 8 px snapping, dock/panel persistence, hierarchy virtualization, multi-select inspector fields, Group selection and Create prefab were also verified. Three real bugs were fixed in these passes: undo/redo revision semantics, layer reorder restoring the original order, and canvas context menus closing before their actions ran.

The Slice 1 gate is closed and its features are listed below. The Slice 2 gate is still **not fully evidenced** (marquee automation, guide visuals, cursor-anchored zoom proof, the 2,000-object fps target, and multi-object prefab instantiation), so no Slice 2 feature is listed yet.

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

<!--
When a feature is fully complete, add it under the right area using this shape:

### Feature name

One or two sentences describing what the user can do and where to find it.
Completed in Slice N · commit <short-sha> · verified at 1366×768 and 1440×900.

Areas: Editor, Assets, Runtime, Logic, AI Agent, Shipping, Platform.
Do not add a feature until every acceptance criterion for its slice is checked and logged.
-->
