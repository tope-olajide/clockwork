# Clockwork Features

Only features that are **100% implemented, manually verified, and passing the current slice gate** are listed here. Planned, partial, mocked, or disabled work does not belong in this file. Put limitations and unfinished work in [`docs/known-issues.md`](docs/known-issues.md).

## Status

Slice 0 (static shell) committed and verified. Slice 1 (engine model, command bus, persistence, project lifecycle) is implemented and committed (`10b839e`), including the undo/redo revision fix (`748786a`; history entries store `prevRevision`; undo restores it, redo restores `prevRevision + 1`). It passes `pnpm typecheck` and `pnpm build`, and core flows are verified (all templates, persist/reload, Brief disabled, add scene/layer with revision + undo/redo, import/transfer identity, corrupted recovery).

Slice 2 (PixiJS viewport, scene graph, selection, transforms) is implemented on top: the editor scene view is now a real Pixi stage with camera pan/zoom/fit, rulers, layer order/opacity/parallax, canvas selection, marquee, drag move, scale/rotate gizmos, grid snapping, context menu, hierarchy multi-select/rename/drag-reparent and layer drag-reorder. Headless browser verification passed 17/17 checks, including “one drag = one revision and one undo entry” and “pan/zoom creates no history”. This also fixed two Slice 1 engine bugs: undo/redo revision semantics and `layer.reorder` restoring the original order.

Verified in a 32/32-check headless browser pass: Slice 1 search, all filters, archived read-only, duplicate/delete, and export → delete → re-import (documents identical); Slice 2 scale/rotate gizmos, 8 px snapping, dock/panel persistence across reload, and hierarchy virtualization above 500 rows. The gizmo-handle hit-test bug on short objects was fixed in that pass.

The Slice 1 and Slice 2 gates are still **not fully evidenced** in one clean end-to-end pass (Slice 1: UI rename/start-scene, add/delete scene and layer/object with per-mutation assertions, malformed-import rejection, save-state transition, corrupted recovery in the same run; Slice 2: marquee automation, guide visuals, cursor-anchored zoom proof, 2,000-object fps target, inspector multi-select). Per the file's rule, no product feature is listed below until those checks are logged.

<!--
When a feature is fully complete, add it under the right area using this shape:

### Feature name

One or two sentences describing what the user can do and where to find it.
Completed in Slice N · commit <short-sha> · verified at 1366×768 and 1440×900.

Areas: Editor, Assets, Runtime, Logic, AI Agent, Shipping, Platform.
Do not add a feature until every acceptance criterion for its slice is checked and logged.
-->
