# Clockwork Implementation Log

Append one entry per slice. Do not edit the implementation plan to claim completion; record real evidence here.

## Template

```markdown
## Slice N — <title>

- Date:
- Commit:
- `pnpm typecheck`: pass/fail + output tail
- `pnpm build`: pass/fail + output tail
- Manual script: steps performed, observed result
- Viewports checked: 1366×768, 1440×900, 1920×1080, 1024 drawer
- Console: clean / issues
- Acceptance: N/N checked
- Features completed: <names added to features.md, or none>
- New known issues: <entries added to docs/known-issues.md, or none>
- Known limitations: none / list
```

## Entries

## Slice 0 — Foundation, design system, engine shell

- Date: 2026-11-16
- Commit: `930946e` Build the Clockwork Slice 0 static shell.
- `pnpm typecheck`: pass
- `pnpm build`: pass — Vite 7.3.8, 481.06 kB JS (150.53 kB gzip), 52.16 kB CSS (12.83 kB gzip)
- Manual script: opened `/`; inspected the active project grid, Filters disclosure, and sort select; opened `New project`; confirmed exactly one selected mode, all four mode cards, `From brief` disabled reason, `More settings` collapsed; opened the editor shell; selected Player and verified the 1366 inspector opens as `Object`; opened Hierarchy and Inspector as labeled drawers at 1024; checked the <1024 wider-window panel.
- Viewports checked: 1024×768, 1366×768, 1440×900, 1601×900, 1920×1080
- Console: no page-level errors observed in the headless runs; Radix dialogs use explicit titles/descriptions. No exhaustive console audit yet.
- Acceptance: 9/9 checked
- Features completed: none added to `features.md`; this slice is a static shell, and its mock data/canvas are intentionally incomplete product features.
- New known issues: static in-memory project data, CSS-art canvas, stub command-palette actions, and no persistence/engine/agent.
- Known limitations: no real engine document, Pixi renderer, IndexedDB, autosave, model calls, or Kane integration yet.

## Slice 1 — Engine model, command bus, persistence, project lifecycle

- Date: 2026-11-16
- Commit: (this commit)
- `pnpm typecheck`: pass (`tsc -b`, exit 0).
- `pnpm build`: pass (`tsc -b && vite build`, Vite 7.3.8, 653.01 kB JS / 200.46 kB gzip, 53.53 kB CSS / 13.00 kB gzip). Existing third-party annotation/chunk-size warnings only.
- Manual script (headless Chrome against production preview, fresh profile / DB resets): 
  - **Dashboard/templates:** app loads with demo seed; `From brief` disabled with "Available in Slice 7…" reason. Created projects via `New project` from **Blank**, **Template: Platformer**, **Template: Top-down**, and **Template: Puzzle**; debug JSON showed expected document shapes (blank: 1 scene, 0 objects, 0 vars; platformer: `coins`/`won` vars and 15 objects; top-down: 10 objects, 3 layers, 2 vars; puzzle: 39 objects, 3 layers, 2 vars).
  - **Persist/reload:** each created project reloaded with unchanged name/revision/scene/object counts.
  - **Command bus + revision/undo/redo (evidenced):** `Add scene` +1 revision (scene count increased), `Undo` +1 revision and reverted, `Redo` +1 revision and reapplied. `Add layer` +1 revision. Undo/redo correctness required fixes: enabled Immer `enablePatches()` in the command runner and made undo/redo apply patches immutably while bumping revision. **Fix applied: stored prevRevision in history entries, undo sets revision to prevRevision, redo sets to prevRevision + 1.**
  - **Import + data identity:** imported a valid `.clockwork.json` transfer (`format: "clockwork-project"`, version 1, `project` document) via Import mode; project opened and debug/document state matched source exactly (id, name, revision, scene/layer/object/variable counts) — verifying import-mode creation and transfer round-trip identity of document data.
  - **Scene management:** delete scene performed from project overview (scene row removed).
  - **Corrupted recovery:** a deliberately corrupted stored document produced the unavailable/damaged project recovery UI (not a broken editor).
  - **Dashboard actions present:** project action menu exposes Open/Rename/Duplicate/Export/Archive/Delete controls; archive/duplicate/delete/export UI flows are implemented and wired to persistence/transfer.
  - **All required mutations with revision + undo:** rename/add/delete scene/layer/object each produce +1 revision; undo reverts one revision; redo reapplies one revision. Verified per-mutation revision tracking.
  - Not fully evidenced end-to-end in one clean automated pass: complete search/all-filters/archived-read-only walkthrough, dashboard duplicate/delete/archive/export button flows, and UI-download `export → delete → re-import identical` as a single scripted sequence (automation was limited by headless download/menu timing; transfer/import identity was verified directly).
- Viewports checked: not re-run in this slice (Slice 0 verified 1024 drawer and 1366×768/1440×900/1920×1080; Slice 1 focused on engine/persistence wiring).
- Console: no runtime exceptions captured in scripted verification runs; favicon 404 observed in dev smoke only.
- Acceptance: **partially evidenced** (core model/persistence/command/import/template flows verified; remaining interaction permutations not fully closed in one clean pass). Code implements the Slice 1 surfaces and passes typecheck/build.
- Features completed: none added to `features.md` (Slice 1 gate not fully evidenced as complete in one clean run).
- New known issues: updated in `docs/known-issues.md` with specific remaining verification gaps and notes.
- Known limitations: undo history session-scoped; editor scene view is debug/document renderer (Pixi/runtime later slices); asset binary storage beyond schema/transfer shape is minimal in this slice.

## Slice 2 — Viewport, scene graph, selection, transforms

- Date: 2026-11-16
- Commit: (this commit)
- `pnpm typecheck`: pass (`tsc -b`, exit 0).
- `pnpm build`: pass (Vite 7.3.8, 965.96 kB JS / 298.92 kB gzip, 53.53 kB CSS / 13.00 kB gzip; PixiJS 8.23.0 added). Chunk-size warning only.
- Browser evidence (headless Chrome 1440×900, production preview, fresh profile, CDP-driven): **17/17 checks pass**
  - Pixi canvas mounts and sizes to the viewport (1052×559 at 1440 window); no console errors during render.
  - Platformer demo renders layered background, ridges, ground, ledges, player, coins, hazard, checkpoint, relay and UI text with layer order/opacity/parallax.
  - Rulers render world ticks/labels that map correctly to world coordinates.
  - `?debug=1` overlay reports FPS, object count, layer count, camera and zoom.
  - Layers dock lists all 4 layers; hierarchy lists 15 objects; clicking a hierarchy row selects the object and switches the inspector to the Object tab.
  - Dragging an object on canvas = **one revision, one undo entry**; `⌘Z` restores it (0 undo / 1 redo).
  - Wheel zoom changes zoom (41% → 59%) without creating history or a revision.
  - Layer drag-reorder changes the stack (UI/Play/Far/Sky → Play/UI/Far/Sky).
  - Fit control produces a valid zoom label.
- Engine fixes found by this verification:
  - `layer.reorder` assigned orders after sorting by stale values, restoring the original order; now assigns sequential order from the moved array.
  - Drag/scale/rotate commit read React state for the preview map; pointer-up now commits from the gesture object so fast gestures are not lost.
  - Pointer capture is guarded for synthetic/pen pointers.
- Not yet evidenced / not implemented in this slice (see `docs/known-issues.md`): scale/rotate handles and marquee exercised manually only; snapping guide visuals not automated; 2,000-object ≥55 fps not measured (headless software WebGL); dock/panel persistence across reload; hierarchy virtualization above 500 rows; inspector multi-select shared fields; context-menu Group/Create prefab; `Esc` selects parent; sprite textures are placeholders until Slice 3.
- Viewports checked: 1440×900 headless. 1366×768 not re-checked in this pass.
- Acceptance: **partially evidenced** (core render/selection/transform/layer-order flows verified; remaining interaction permutations and performance target open).
- Features completed: none added to `features.md` (Slice 2 gate not fully evidenced).
- New known issues: recorded in `docs/known-issues.md`.
- Known limitations: WebGL required for the viewport (falls back to an editable document without it); sprite/tilemap art is placeholder geometry until the asset pipeline (Slice 3).

## Acceptance verification — Slice 1 dashboard flows + Slice 2 transforms/persistence

- Date: 2026-11-16
- `pnpm typecheck`: pass (`tsc -b`, exit 0).
- `pnpm build`: pass (Vite 7.3.8, production bundle; chunk-size warning only).
- Browser evidence: headless Chrome 1440×900, production preview on a cold profile, CDP-driven, JavaScript dialogs auto-accepted. **32/32 checks pass.**
- **Slice 1 — creation/search/filters/archive:** created Platformer, Top-down and Puzzle projects through `New project`; the dashboard listed all four projects including the demo. Search narrowed to one card, the count badge followed the filter, and a non-matching query showed the no-results state.
- **Slice 1 — filters:** archiving Beta through the card menu made it disappear from Active, appear alone under Archived with an Archived chip, and remain present under All. Template=Platformer kept only platformers; Name sort ordered the cards alphabetically.
- **Slice 1 — archived read-only:** opening Beta showed the archived read-only overview, `Open scene` kept the read-only banner, and `+ Add` was disabled in the editor. `Restore project` worked.
- **Slice 1 — duplicate/delete:** Duplicate created `Gamma copy` with the expected extra card; Delete (confirmation auto-accepted) removed it.
- **Slice 1 — export → delete → re-import:** Export downloaded `alpha.clockwork.json` with `format: "clockwork-project"`, `version: 1`; deleting Alpha removed the card; re-importing the downloaded file through `New project → Import` recreated the project. Deep comparison of the exported document against the stored re-imported document (ignoring `updatedAt`) was **identical**, including ids, revision, scenes, layers, objects and variables.
- **Slice 2 — snapping:** dragging Ledge A by 13 screen px committed `x=648` (a multiple of 8 with the default Snap 8), with exactly one undo entry.
- **Slice 2 — scale/rotate:** dragging the south-east handle changed scale to 1.362; dragging the rotation ring changed rotation to 65.35°.
- **Slice 2 — dock/panel persistence:** closing the inspector with Escape changed no revision (`Saved · r3` before and after). After reload, the Hand tool, the `?tab=logic` workspace and the closed inspector were all restored from `localStorage`/URL.
- **Slice 2 — hierarchy virtualization:** a synthetic 600-object scene rendered only 20 `.object-row` elements inside a `.dock-list.virtualized` container; after scrolling 4000 px it still rendered 20 rows while reporting 600 objects.
- **Bug fixed this pass:** gizmo handles are no longer hit-tested when the pointer is inside the selected object. On short objects the north/south handles overlapped the centre, so a centre drag resized instead of moved (observed as scale 0.108 and a 14 px move instead of 31.6 px).
- **Console:** no console errors during the whole run.
- **Still open for a full gate:** Slice 1 still lacks automated evidence for project rename/start-scene change, add/delete scene and layer/object through the UI with per-mutation revision+undo assertions, malformed-import rejection, the dirty→saving→saved transition, and corrupted-document recovery in the same clean pass. Slice 2 still lacks automated evidence for marquee selection, guide visuals, cursor-anchored zoom, the 2,000-object fps target (not measured; headless software WebGL), and the 1366×768 inspector auto-open check.
- Acceptance: search/filters/archive/export-import (Slice 1) and scale/rotate/snapping/reload persistence/virtualization (Slice 2) are now verified. Broader gates remain open; no feature was added to `features.md`.
