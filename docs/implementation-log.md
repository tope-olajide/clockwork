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

## Slice 1 gate completion + multi-select/Group/prefab

- Date: 2026-11-16
- `pnpm typecheck` / `pnpm build`: pass.
- Browser evidence: headless Chrome 1440×900, cold profile, production preview, CDP-driven, dialogs handled. **Slice 1 gate: 26/26; extras: 10/10.**
- **Save state:** the save pill was observed as `Unsaved · r1 → Saving… · r1 → Saved · r1` via a MutationObserver during an add-object command.
- **Per-mutation revision/undo:** add object, add layer, add scene, rename object (double-click), delete object and delete layer each produced exactly one revision and one undo entry, and undo restored the prior revision, history and object/layer/scene counts. Scene delete from the overview produced exactly one revision and left an undo entry.
- **Rename:** dashboard `Rename` (prompt) updated the card to `Gate Renamed` and survived reload.
- **Start scene:** setting the second scene as start updated the overview stat and row marker, survived reload, and deleting that scene fell the start scene back to `Dusk Run`.
- **Malformed import:** importing `{format:"not-clockwork",version:99}` showed `Import failed — This is not a Clockwork project file.` and created no project card.
- **No regressions / console:** no console errors across both runs.
- **Multi-select inspector:** selecting Player + Relay shows the shared-transform panel with mixed-value fields; setting X=500 and applying moved both objects in exactly one revision and one undo entry, and undo restored both.
- **Group:** Group selection works from the inspector and from the canvas context menu. It creates a group parent in one revision with the selected objects as children; undo removes it. The canvas items read `Group selection (2)` for multi-select.
- **Create prefab:** the canvas context menu creates a prefab rooted at the selected object (single selection) and stores it in the document in one revision.
- **Bug fixed this pass:** the canvas context menu closed on its own `pointerdown` because the window-level dismiss listener ran before the item click, so no menu action could be used. The listener now ignores pointer-downs inside the menu.
- **Still open:** >20 MB import rejection is implemented but not exercised; corrupted-document recovery has not been re-run in the same clean pass; the overview `Play`/`Share` state is a toast rather than a disabled control; duplicate-id non-sharing has not been asserted in this pass.

## Slice 1 gap closure + multi-object prefabs

- Date: 2026-11-16
- `pnpm typecheck` / `pnpm build`: pass.
- Browser evidence: headless Chrome 1440×900, cold profile, production preview. **13/13 checks pass; no console errors.**
- **Disabled Play/Share:** the project overview now renders `Play` disabled with “Manual Play arrives in Slice 4” and a new `Share` button disabled with “Share links arrive in Slice 8” (both carry explanatory titles/aria labels).
- **Duplicate ids:** duplicating Neon Runner produced a new project id and 15 new, unique, disjoint object ids; adding an object to the duplicate left the original at 15 objects while the copy reached 16, proving no shared mutable objects.
- **>20 MB import:** selecting a 21 MB `.clockwork.json` showed “That file is larger than 20 MB.” and kept `Create project` disabled.
- **Corrupted recovery:** replacing a stored document with an invalid schema payload produced the recovery panel with `Delete damaged project`. **Bug fixed:** that button called `removeProject()`, which returned early because `current` is null on the recovery screen, so deletion did nothing. It now deletes by active project id and returns to the dashboard (verified: dashboard shows only the remaining project).
- **Multi-object prefabs:** `prefabSchema` now stores `objects: GameObject[]` alongside `root`. Creating a prefab from a multi-selection builds a `Prefab group` root and clones the selection (plus descendants) as children with `parentId` pointing at the root; all prefab ids are freshly generated and disjoint from scene objects. Verified from the canvas menu (`Create prefab (2)`): one prefab with a root and two children.
- **Superseded by the consolidated run below.** Prefab instantiation, overrides and detach remain Slice 5.

## Slice 1 consolidated gate (single cold-profile run)

- Date: 2026-11-17
- `pnpm typecheck` / `pnpm build`: pass.
- Browser evidence: headless Chrome 1440×900, one fresh cold profile, production preview on `127.0.0.1:4173`, CDP-driven, dialogs and downloads handled. **45/45 checks pass; no console errors.**
- **Bug fixed before the run:** `/project/:id?section=project` rendered the overview because the render branch only tested placeholder sections (`section` was `null` for `project`). The settings panel was therefore unreachable from every Settings entry point. The branch now keys off `sectionKey === "project"`; the consolidated run exercises the real settings panel for read-only state, rename, start scene, save, export and import.
- **Coverage in one pass:** demo seeding; dashboard rename plus reload persistence; search; template filter; status filter; archive → archived read-only overview and disabled settings controls → restore; Blank creation; add object/layer/scene, object rename, delete object/layer each at exactly one revision and one undo entry; undo revision rollback and redo restore; `Unsaved → Saving… → Saved`; reload restores revision/content/save pill; settings start-scene select plus overview stat; start-scene deletion fallback; settings rename; settings export file and payload; settings import round-trip; overview Play/Share disabled with Slice 4/8 titles; Template creation; malformed import rejected via `Import failed` toast with no project created; 21 MB import rejected with a disabled Create button; duplicate gets a new id and disjoint object ids; corrupted document recovery panel and `Delete damaged project`; zero console errors.
- **Gate status:** Slice 1 acceptance is fully evidenced in a single clean pass. Slice 2 checks not repeated here remain as noted above.

## Slice 2 consolidated gate + performance

- Date: 2026-11-17
- `pnpm typecheck` / `pnpm build`: pass.
- Browser evidence: headless Chrome 1366×768, one fresh cold profile, production preview, CDP-driven. **24/24 checks pass; no console errors.** Platformer scene screenshot inspected: layered dusk background, ground, ledges, player, coins, hazard, checkpoint, goal and UI text render.
- **Coverage in one pass:** Pixi canvas mount and size; platformer render with 15 objects/4 layers; hierarchy selection opens the Object inspector at 1366; clearing selection returns the inspector to Scene and collapses it; workspace tab URL + reload persistence; invalid scene falls back to the start scene with a `Scene not found` toast while preserving `tab=logic`; inspector dock resized 300 → 370 px, width persisted to `localStorage`, and both width and collapsed state survived reload; panel changes created no revision and stayed out of the document JSON; marquee selected all 20 objects; dragging all 20 was exactly one revision and one undo entry and undo restored every position; snapping committed to 8, 16 and 32 px with guides visible during the drag and gone on release; wheel zoom kept the world point under the cursor fixed (1506.71, 240.95 before and after) and zoomed 0.241 → 0.390; Fit and 1:1 buttons and the `0`/`1` keys work; rulers match the camera transform to floating-point precision; pan/zoom created no revision or history; layer reorder (`UI|Play|Far|Sky` → `Play|Far|Sky|UI`) survived reload.
- **Bugs fixed this pass:**
  - The ruler overlays sat above the viewport toolstrip and swallowed pointer clicks, so the Fit and 1:1 buttons did nothing. Rulers are now `pointer-events: none` and the buttons respond to real clicks.
  - A failed project load rendered `Project could not open` inside `.too-small`, which is `display: none` above 1023 px, producing a blank editor body. It now uses a `.project-error` variant that is always visible.
  - Dock widths were fixed CSS variables. Both docks now have drag separators, clamp sensibly, and persist `leftDockWidth`/`rightDockWidth` in `clockwork:editor-ui`.
  - Invalid scene deep links redirected silently; they now show the required `Scene not found` toast.
  - `Esc` now selects the selected object’s parent when it has one, instead of always clearing selection.
  - Rects/sprites now render as tinted `Texture.WHITE` sprites instead of one `Graphics` per object, so large scenes batch their draw calls. The 2,000-object scene went from 40 fps (display cap) to **801 fps with rAF uncapped** in the same environment.
- **Performance method and caveat:** headless Chrome reports Intel UHD hardware ANGLE (`Direct3D11`). This machine/display caps rAF at ~40.9 fps even on a blank page, so a 55 fps on-screen reading is not observable here. With `--disable-frame-rate-limit --disable-gpu-vsync`, 2,000 rect objects rendered at 801 fps (2,405 frames / 3.0 s), about 1.25 ms per frame, and the in-app `?debug=1` counter read 835 fps. The target of ≥55 fps (18.2 ms/frame) has ~14× headroom; the on-screen cap is environmental.
- **Gate status:** every Slice 2 acceptance checkbox is evidenced. Slice 2 features are listed in `features.md`.

## Slice 4 — Runtime, manual Play, physics, rules, telemetry, replay

- Date: 2026-11-17
- Commit: this commit
- `pnpm typecheck`: pass (`tsc -b`, exit 0).
- `pnpm build`: pass (Vite 7.3.8; chunk-size warning only).
- **Runtime harness: 13/13 pass.** The temporary Node/esbuild harness loaded the real Platformer template and Runtime:
  - player settles on the ground at y=796 and reports `grounded`;
  - jump launches at vy=-623.67;
  - configured double jump fires a `double-jump` event and relaunches at vy=-623.67;
  - coyote jump works after leaving the ground;
  - a buffered jump fires on landing;
  - collecting a core increments `coins` and deactivates the collectible;
  - hazard respawn returns to the checkpoint;
  - the goal rule sets `won=true` and status `won`;
  - camera stays inside world bounds (x 1204.7, y 616 at 1366×768);
  - camera deadzone ignores a 40 px move (1000 → 1000) and follows a 200 px move (→1024);
  - identical seed + 300 input frames produce identical snapshots (887 chars);
  - a synthetic runtime failure reports `Dusk Run (scene-id) · Player (object-id)` and stops without throwing;
  - document `dispatch` returns `{ok:false, code:"READ_ONLY"}` while `playtestRunning`.
- **Renderer check: pass.** `SceneRenderer.applyCamera` at camera x=1600 produced sky=380, far=280, play=0, UI=400 px, matching each layer’s configured parallax factor.
- **Browser evidence — cold profile, 1366×768, production preview, CDP-driven:**
  - Overview `Play start scene` navigated to `/play/:projectId`, loaded the start scene (`scn_Odt_j-svgs`), showed `PLAYING`, `READ-ONLY`, HUD `CORES 0`, and the runtime console.
  - Pause froze the frame counter (270 → 270 over 700 ms); Step advanced exactly one frame (270 → 271); Reset restored frame/time and player position.
  - A keyboard run (right + timed jumps) reached the relay at frame 442/447, fired `Reach the relay`, set `won=true`, and changed the chip to `WON`; the run then stopped instead of falling off the world.
  - `Escape` returned to `/project/:projectId`; the rail `Playtest` item opened `/play/:projectId` with status `running`.
  - F1 opened the debug overlay (FPS/avg, entities 15, bodies 6, camera, frame); zero console exceptions across the runs.
  - Screenshot inspected: layered dusk scene, player, ground, ledges, cores, hazard, checkpoint, relay, HUD and centered win message all render.
- **Performance method:** headless Chrome reports Intel UHD hardware ANGLE (D3D11). The environment’s display/vsync still caps pages at ~40 Hz. With `--disable-frame-rate-limit --disable-gpu-vsync`, Play averaged **655 fps over 20 samples / 10 s** (560–858 fps), with the fixed loop still stepping at 60 Hz. The ≥59 fps telemetry target is met with large headroom; the on-screen cap is environmental.
- **Bugs fixed this pass:**
  - Keyboard input threw when a `KeyboardEvent` target was `window` (`target.matches` is not a function); input is now guarded and browser movement/jump work.
  - Camera clamp used the project’s settings dimensions instead of the actual play viewport; `Runtime.setViewport` now clamps to the rendered size.
  - HUD/debug/error overlays were painted under the Pixi canvas; canvas/HUD/debug/error now have explicit z-indexes.
  - Setting `won=true` did not stop the run; it now freezes the runtime as `WON` and the win message remains visible.
  - Checkpoints logged every frame while overlapping; they now log once per checkpoint.
  - Parallax forced the first layer to factor 1; all layers now use their configured factors.
  - Static-body collision now honors `body.offsetX/offsetY`, matching dynamic-body collision.
- **Viewports checked:** 1366×768 (cold profile). 1440×900 and other sizes were not re-run for this slice.
- **Console:** no page-level exceptions in the final browser passes.
- **Acceptance: 10/10 checked.** Platformer flow, configured double jump/coyote/buffer, camera/parallax, pause/step/reset, scoped runtime errors, deterministic traces, ≥59 fps telemetry, read-only dispatch plus rail/Overview entry, no-model manual Play (the Play route has no AI/Kane dependency), and typecheck/build.
- **Features completed:** four Runtime features added to `features.md` (Manual Play, Platformer run, Camera/HUD/messages, Play controls/telemetry/determinism).
- **New known issues:** Play is a separate route; replay has no UI control; audio/music paths were not exercised because the template has no audio assets; telemetry is not yet exposed to the agent; the Slice 3 gate remains unlogged.
- **Known limitations:** runtime physics is deterministic single-player AABB with static bodies and tilemap tiles; no rotation collision or rigid-body solver.
