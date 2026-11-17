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
  - **Dashboard/templates:** app loads with demo seed; `From brief` disabled with \"Available in Slice 7…\" reason. Created projects via `New project` from **Blank**, **Template: Platformer**, **Template: Top-down**, and **Template: Puzzle**; debug JSON showed expected document shapes (blank: 1 scene, 0 objects, 0 vars; platformer: `coins`/`won` vars and 15 objects; top-down: 10 objects, 3 layers, 2 vars; puzzle: 39 objects, 3 layers, 2 vars).
  - **Persist/reload:** each created project reloaded with unchanged name/revision/scene/object counts.
  - **Command bus + revision/undo/redo (evidenced):** `Add scene` +1 revision (scene count increased), `Undo` +1 revision and reverted, `Redo` +1 revision and reapplied. `Add layer` +1 revision. Undo/redo correctness required fixes: enabled Immer `enablePatches()` in the command runner and made undo/redo apply patches immutably while bumping revision. **Fix applied: stored prevRevision in history entries, undo sets revision to prevRevision, redo sets to prevRevision + 1.**
  - **Import + data identity:** imported a valid `.clockwork.json` transfer (`format: \"clockwork-project\"`, version 1, `project` document) via Import mode; project opened and debug/document state matched source exactly (id, name, revision, scene/layer/object/variable counts) — verifying import-mode creation and transfer round-trip identity of document data.
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
- **Malformed import:** importing `{format:\"not-clockwork\",version:99}` showed `Import failed — This is not a Clockwork project file.` and created no project card.
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
- **Bug fixed before the run:** `/project/:id?section=project` rendered the overview because the render branch only tested placeholder sections (`section` was `null` for `project`). The settings panel was therefore unreachable from every Settings entry point. The branch now keys off `sectionKey === \"project\"`; the consolidated run exercises the real settings panel for read-only state, rename, start scene, save, export and import.
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
  - document `dispatch` returns `{ok:false, code:\"READ_ONLY\"}` while `playtestRunning`.
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
- Viewports checked: 1366×768 (cold profile). 1440×900 and other sizes were not re-run for this slice.
- **Console:** no page-level exceptions in the final browser passes.
- **Acceptance: 10/10 checked.** Platformer flow, configured double jump/coyote/buffer, camera/parallax, pause/step/reset, scoped runtime errors, deterministic traces, ≥59 fps telemetry, read-only dispatch plus rail/Overview entry, no-model manual Play (the Play route has no AI/Kane dependency), and typecheck/build.
- **Features completed:** four Runtime features added to `features.md` (Manual Play, Platformer run, Camera/HUD/messages, Play controls/telemetry/determinism).
- **New known issues:** Play is a separate route; replay has no UI control; audio/music paths were not exercised because the template has no audio assets; telemetry is not yet exposed to the agent; the Slice 3 gate remains unlogged.
- **Known limitations:** runtime physics is deterministic single-player AABB with static bodies and tilemap tiles; no rotation collision or rigid-body solver.

## Slice 5 — Logic authoring, prefabs, presentation (in progress, not gate-closed)

- Date: 2026-11-17
- Commit: (uncommitted; implementation and verification in working tree)
- `pnpm typecheck`: pass (`tsc -b`, exit 0) after fixing unused `document` parameters in `src/features/logic/LogicPage.tsx`.
- `pnpm build`: pass (`pnpm build` / `tsc -b && vite build`, exit 0). Vite chunk-size warning only.
- Code completed in this session/workspace: Logic/Content/Presentation workspace pages; rule/variable/prefab/animation/HUD/scene-audio model and command support; rule reference validation/flagging helpers; prefab instantiate/update/detach/revert flows with Immer-draft-safe cloning; runtime rule safety, prefab spawn/transition preservation, animation frame application, scene music/volume handling, HUD visibility/message styling; Presentation `?tab=presentation&ptab=` URL state and subtab UI; behavior catalog/editor, variable usage/rule previews, prefab controls, input rebinding/conflict UI, and inspector prefab controls.
- Browser evidence (headless Chrome 1366×768, cold profiles, production preview `http://localhost:4174`, CDP-driven, temporary harness/profile files deleted): 
  - Presentation workspace: clicking Look/Animation/Audio/Game UI updated URL to `?tab=presentation&ptab=look|animation|audio|ui`; reloading with `ptab=audio` preserved `?tab=presentation&ptab=audio`.
  - Workspace switching: Scene/Content/Logic/Presentation navigation worked and returning to Scene rendered the canvas (Scene tab URLs/canvas presence observed across switches).
  - Logic (Platformer template): rule "When coins >= 3 → set won true, then go to Win" is present and marked `Once`; variable/rule authoring UI and scene-start/rule context render.
  - Content: setting prefab instance count to 10 and clicking Instantiate completed without a cloning error, advanced revision, showed "Instantiated prefab ×10.", and reported `1 objects · 13 instances`; selecting a prefab instance exposed `Detach instance`, `Revert overrides`, and `Update prefab from selection` with "Updating the prefab applies to 13 instance(s)."
  - Presentation/Game UI: HUD/Input map/Messages controls render; template input bindings show `up` and `jump` both bound to `KeyW` with `Conflicts: KeyW (up, jump)`. Look allowed changing a gravity input (set to 2200 in a probe).
  - Play: `/play/:projectId` loaded `running` with HUD `CORES 0` and variables `{"coins":0,"won":false,"lives":3}`.
- Viewports checked: 1366×768 (headless, cold profile). 1440×900/1920×1080/1024 drawer not re-run.
- Console: not exhaustively audited in this pass.
- Acceptance: **not closed**. Full Slice 5 gate not completed in one clean run.
- Features completed: none added to `features.md` (gate not complete/fully verified).
- New known issues: see `docs/known-issues.md` (remaining end-to-end verification gaps).
- Known limitations / not yet fully browser-verified: authoring+play "coins == 3 → go to Win scene" triggering exactly once in a controlled run; deleted-object rule flagged in authoring and refused/skipped in play; gravity/jump inspector changes measurably affecting playtest behavior; prefab instantiate×10 followed by prefab edit/update with instance-override survival and detach preventing further prefab propagation; rebinding jump to `KeyW` working in play; HUD bound value updates during play, bar max behavior, and hide/removal in play; `show-message` display and clear after duration; per-scene music play/loop and music/SFX volume audibility; animation clip preview in panel and playback on assigned runtime object; numerical viewport-camera preservation across Scene/Content/Logic/Presentation switches. Audio/music assets and audible playback were not exercised in headless runs.

## Slice 6 — Agent transport, context, chat shell (initial implementation)

- Date: 2026-11-17
- Commit: (uncommitted; implementation in working tree)
- `pnpm typecheck`: pass (`tsc -b tsconfig.json tsconfig.node.json`, exit 0).
- `pnpm build`: pass (`tsc -b tsconfig.json tsconfig.node.json && vite build`, exit 0). Vite chunk-size/dynamic-import warnings only.
- Code completed in this session: added shared agent protocol/tool definitions (`shared/protocol.ts`, `shared/ai-tools.ts`) for NDJSON step events, context packet, and Slice 6 read-only tools (`list_scenes`, `get_scene`, `search_entities`, `get_object`, `get_variables`, `get_selection`, `capture_viewport`); added Hono server (`server/index.ts`, `server/routes/ai.ts`) with `/api/health` and `POST /api/ai/step` streaming NDJSON; env-based resolver (`server/ai/provider.ts`) using `AI_MOCK=1` mock stream or OpenAI-compatible chat-completions streaming via `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`; mock fixture states for text, tool call, capture, and error/step end (`server/ai/mock.ts`); client context builder and read-only tool executor with viewport capture support (`src/engine/ai/context.ts`, `src/engine/ai/client-tools.ts`, `src/engine/ai/viewport-capture.ts`, `src/engine/ai/transport.ts`); Pixi stage viewport-capture registration (`src/engine/render/PixiStage.tsx`); agent session hook with multi-step client tool loop, abort/stop, retry/new chat state (`src/features/agent/useAgentSession.ts`); agent drawer UI with status, read-only model label, mode tabs, context chips, streaming text/tool cards/image rendering, composer, jump-to-latest, and error/stop controls (`src/features/agent/AgentDrawer.tsx`, `src/design/base.css`); editor integration with agent open/close state, toolbar/menu actions, and `⌘J` shortcut (`src/features/editor/EditorPage.tsx`); dev/build wiring for Vite proxy + API server + shared/server tsconfig (`package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`).
- Browser evidence: not yet run for Slice 6 in this session (no `AI_MOCK=1` end-to-end UI/streaming/tool-call/capture/stop/retry verification, no responsive docking/overlay/manual checks recorded).
- Console: not audited.
- Acceptance: **not closed**.
- Features completed: none added to `features.md` (gate not complete/fully verified).
- New known issues: see `docs/known-issues.md` (Slice 6 not gate-closed).
- Known limitations / not yet verified: `AI_MOCK=1` covering all required drawer/stream states end-to-end in the UI; streamed assistant text, tool-call card rendering, `capture_viewport` PNG displayed and attached to the next step; Stop within ~200 ms and Retry preserving thread; Ask/Build/Plan mode UI behavior in-scope for Slice 6 (read-only, no `apply_commands`); agent drawer dock/overlay behavior at 1366×768/≥1600 without horizontal overflow; revision/context refresh after tool steps; one real env-configured provider streamed tool call (no credentials/evidence in this session); provider settings/key storage/vault correctly deferred to Slice 6.5.

## Audit — Slices 3–7 code review (2026-11-17)

- Scope: read-only audit of the Slice 3–7 implementation against `docs/clockwork-implementation-plan.md`; cross-checked `docs/implementation-log.md`, `docs/known-issues.md`, `features.md`.
- Checks: `node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json` pass; `./node_modules/.bin/vite build` pass (both re-run in this session after the Slice 7 working-tree edits).
- Result: Slice 1, 2 and 4 gates are fully logged; Slice 3 is implemented but its gate is unlogged and its starter assets are missing; Slice 5/6/6.5 are in-progress with logged partial evidence; Slice 7 is partially implemented and unlogged.
- Concrete gaps found and added to `docs/known-issues.md` under “Audit — Slices 3–7 code review”: missing `public/starter/**` art/audio; asset-browser search/filter/rename/usage missing; keyboard-only input (no pointer/gamepad) and no sub-stepping; no chat persistence; no server env schema/body/rate limits; read-tool naming deviation; no `AI_MOCK` slow/three-step fixtures; no agent presence or ghost overlay; `start_playtest` stub; selection “Ask AI” placeholder; no presets; no golden-prompt fixtures; conflict handling is prompt-only.
- Acceptance: none of the Slice 3/5/6/6.5/7 gates were closed by this audit, and no feature was added to `features.md`.
- Follow-up: ordered remediation plan written to `docs/slice-3-7-fixes.md` (S3-1 … S7-9), starting with starter assets and seeding.
- Known limitations: this was a code-and-doc audit, not a browser run; it did not re-execute any acceptance script.

## Slice 6.5 — AI providers, model selection, key vault, settings (in progress, not gate-closed)

- Date: 2026-11-17
- Commit: (uncommitted at time of writing; implementation in working tree)
- `pnpm typecheck`: pass (`node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json`, exit 0).
- `pnpm build`: pass (`node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json && vite build`, exit 0). Vite chunk-size/dynamic-import warnings only.
- Code completed in this session: added built-in provider catalog and curated model metadata (`server/ai/catalog.ts`), encrypted key vault and settings store with env→vault→session precedence (`server/ai/vault.ts`, `server/ai/store.ts`; AES-256-GCM, secret from `CLOCKWORK_SECRET` or generated `.data/secret.key`, vault persisted to `.data/vault.json`, session keys in memory), model/settings responses (`server/ai/models.ts`), server-side model resolution for `/api/ai/step` rejecting client-supplied credentials and returning typed no-key/no-model/model-unavailable/provider errors (`server/ai/provider.ts`, `server/routes/ai.ts`), expanded `/api/ai/*` routes for providers, models, settings, provider key save/delete (vault/session), connection test (15s timeout), custom providers (SSRF-guarded base URL validation) and custom models; client AI API helpers and Settings → AI panel with provider cards/key source+masked hint, vault/session key save/remove, test connection, custom provider/model forms, and default model selection (`src/engine/ai/api.ts`, `src/features/settings/AiSettingsPanel.tsx`, `src/features/editor/ProjectOverviewPage.tsx` `?section=ai`), editor/settings navigation wired to AI settings, initial model picker component scaffold (`src/features/agent/ModelPicker.tsx`), and `docs/model-setup.md`.
- Browser evidence: not yet run for Slice 6.5 in this session (no UI verification of provider/key flows, custom provider/model end-to-end, model picker behavior, capability gating/error cards, or key-absence checks in browser storage/network).
- Console/network key-leak audit: not performed.
- Acceptance: **not closed**.
- Features completed: none added to `features.md` (gate not complete/fully verified).
- New known issues: see `docs/known-issues.md` (Slice 6.5 not gate-closed).
- Known limitations / deviations / not yet verified: vault persistence implemented as encrypted JSON (`.data/vault.json`) rather than SQLite due environment/native-module constraints (spec called for SQLite); agent header model picker not fully integrated (per-chat override/localStorage, applying selected model to `/step`, disabling Build/Plan for tool-less models, hiding `capture_viewport` for vision-less models, and rich error cards with Open settings/Choose model actions remain incomplete); only OpenAI-compatible streaming adapter wired for `/step` (other API styles may be rejected as unsupported in this build); custom base-URL SSRF guard is basic; rate/body limits not comprehensively enforced; no end-to-end verification that keys are absent from `localStorage`/`sessionStorage`/client JS/SSE/API responses/logs; no verified custom provider+model real chat turn; fresh-install no-key setup card behavior not verified in UI. Slice 6 gate was not fully closed before starting 6.5 work.

### Slice 6.5 integration follow-up (same session, in progress)

- Code completed after initial Slice 6.5 foundation: integrated agent model picker into the editor drawer/session with per-project per-chat model override persistence in `localStorage` (`clockwork:agent-model:<projectId>`), server-default fallback, and model/capability metadata loading from `/api/ai/{models,providers,settings}`; wired "Open settings" to project AI settings (`?section=ai`) and added setup/error actions ("Open settings", "Choose another model", "Retry"); gated Build/Plan to tool-capable models with in-UI explanation and server-side `/step` rejection (`no-tools`) for non-tool models; hid/refused `capture_viewport` for vision-less models in client context/tool execution and filtered server tool definitions; added typed agent error handling for `no-key`/`invalid-key`/`no-model`/`model-unavailable`/`no-tools`/`no-vision`/`rate-limit`/`provider-timeout`; added basic model-window-aware context/history trimming and provider error-code mapping in the OpenAI-compatible stream path.
- Checks: `node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json` pass; `./node_modules/.bin/vite build` pass.
- Still not gate-closed / not yet verified in browser or with real providers: all Slice 6.5 acceptance UI flows (save key to vault and confirm persistence across server restart, session-only key loss after restart, masked hints, test connection states, custom OpenAI-compatible provider+model real chat, model picker search/grouping/metadata/default-per-chat override surviving reload), capability-gating UX in real use, key absence from `localStorage`/`sessionStorage`/client JS/SSE payloads/API responses/logs, fresh-install no-key setup card behavior, SSRF/rate/body-limit hardening beyond basic guards, and one real streamed provider/custom-provider turn. Vault remains encrypted JSON (`.data/vault.json`) rather than SQLite. Slice 6 gate remains unclosed.

## Slice 3 — Assets, slicing, animation, tilemaps (gate closed)

- Date: 2026-11-17
- Commit: see this change set (working tree at time of writing)
- `pnpm typecheck`: pass (`node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json`, exit 0).
- `pnpm build`: pass (`./node_modules/.bin/vite build`, exit 0); chunk-size warnings only.
- Starter assets: original SVGs/WAVs in `public/starter/` (11 SVG, 3 WAV), generated deterministically by `scripts/generate-starter-assets.mjs`; seeded into IndexedDB as PNG blobs with stable ids on project creation/demo creation. 14 assets stored (11 images + 3 audio); player sheet is 512×256 with 8 slices and clips idle 4 fps / run 12 fps / jump 1 fps.
- Asset browser: search, kind filter with counts, rename, usage counts, drag-to-canvas, slice/manual frames, animation editor, tilemap creation.
- Fixed during the gate: Pixi texture loading failed for extensionless blob URLs (`Assets.load` could not pick a parser), so sprites fell back to tinted rectangles; `src/engine/render/texture-cache.ts` now decodes the blob URL through an `Image` and builds `Texture.from(image)`. Starter art now renders in the scene (hills/player/coin etc. visible at 1366×768).
- Cold-profile browser runs (headless Chrome, fresh profile, production preview at 1366×768):
  - Dashboard → project → scene: seeded project opens; 14 assets present; asset grid lists 14 cards; thumbnails load; usage badges show; search filters to “Drone”; rename shows “Drone Renamed”; manual slice modal shows 8 grid frames, adding a 9th frame saves (`9 frames` toast); in-use delete is refused (`Asset is in use by scene object.`); reload restores all 14 assets/thumbnails.
  - PNG drop onto canvas: creates a new asset and a selected sprite (`Sprite added`, asset count 14 → 15). Dropping an existing asset card creates one sprite object. New-project scene shows starter sprite art (hills and ground) instead of only flat rects.
  - 4×2 grid slice of a 1366×768 imported PNG saved 8 frames at 341×384 each; duplicate import rejected (`s3-home.png is already imported.`) with no asset-count change; animation preview at FPS 5 advanced 4 distinct frames in a 1.2 s sample.
  - Fit body to art: selected starter flag sprite body became 53×87 (alpha-trimmed from 64×96), confirming the tight collider path.
  - Tilemap: `Ground` → 20×10 tilemap created (toast `Tilemap created`); toolbar showed Paint/Erase/Fill/Pick; grid lines render over the selected tilemap; hover highlights the cell; one paint stroke wrote 1 cell and one undo restored the previous data; Fill filled all 200 cells; Erase cleared a cell.
- Console: no page exceptions in the final tilemap/import runs; animation/drag run console output limited to the harness's own logs. The earlier Pixi parser warning disappeared after the texture fix.
- Acceptance: **closed** for the Slice 3 list in `docs/slice-3-7-fixes.md` §S3-5.
- Features added: `features.md` → Assets.
- Known limitations: starter assets are generated original art, not hand-authored final art; the seeded PNG rasterization path requires canvas 2D (no-WebGL still allows editing); tilemap hover/paint pixel mapping was exercised with synthetic pointer events; manual frame rows use number inputs (no drag-handles in the modal).

## Slice 4 residuals — pointer/gamepad, sub-stepping, tilemap spans (gate already closed)

- Date: 2026-11-17
- Commit: see this change set.
- `node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json`: pass.
- `./node_modules/.bin/vite build`: pass (13.07 s, chunk-size warnings only).
- `./node_modules/.bin/tsx .data/runtime-check.ts`: **13/13 pass** (`.data` harness is uncommitted).
  - Pointer: down → `action` + `actionPressed`; held snapshot clears the pressed edge; up → `actionReleased`.
  - Gamepad: A → `jump` + `jumpPressed`; held clears the edge; release → `jumpReleased`. Left stick/d-pad/A/X with a 0.35 deadzone.
  - Sub-stepping: a 6000 px/s body stopped before a 6 px static wall (`x=360`, wall left 377) instead of tunnelling.
  - Tilemap spans: full 100×100 tilemap produces 100 row solids; `[1,1,0,1]` produces two spans (widths 16 and 8).
  - Determinism: 300-frame keyboard trace replayed identically in two fresh runtimes; no runtime errors.
  - Baseline: platformer player settles (`grounded`, y=796) and Space still jumps (y=785.6).
- Implementation: `InputManager` now exposes `jumpReleased`/`actionReleased`, tracks pointer handlers scoped to the Play canvas, and polls the first standard gamepad; `PlayPage` attaches the canvas to the input manager after Pixi init. Physics movement is split into up to 8 deterministic substeps using half the smallest collider dimension, resolving X and Y per substep. `tilemapRowSpans()` merges contiguous filled tiles per row and is used by `solids()`.
- Starter composition follow-up: added a dusk sky gradient with stars (`sky.svg`) and a moon sprite (`moon.svg`), widened the ridge art to 4:1 at 2048×512, widened the ground strip to 2048×100 to avoid extreme stretching, and added a sky backdrop plus a near-ridge layer to the Platformer template. Cold-profile screenshot at 1366×768 shows the gradient sky, stars, layered hills and seeded assets (16 assets, 17 scene objects).
- Known limitations: pointer input maps only to the `action` logical action (no per-pointer coordinates exposed to rules); gamepad support uses the first connected standard-mapping pad only.

## Slice 5 — Logic authoring, prefabs, presentation (gate closed)

- Date: 2026-11-17
- Commit: see this change set.
- `node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json`: pass.
- `./node_modules/.bin/vite build`: pass (chunk-size warnings only).
- Runtime harness (`./node_modules/.bin/tsx .data/slice5-check.ts`, 13/13 pass):
  - `coins >= 3` transitioned to Win exactly once (`scene=Win events=1`).
  - A rule referencing a missing object produced 2 validation issues and a `rule-blocked` event; its log action never ran.
  - Doubling gravity and raising jump to 1100 changed jump apex from 203.7 to 299.6.
  - Coin prefab instantiate ×10 grew roots 3 → 13; prefab update changed all 13 roots; an instance rename override survived; a detached instance stayed at width 30 while the prefab moved to 44.
  - Rebound `KeyW` produced `jumpPressed` through `InputManager`; HUD-bound `coins` 0 → 2; `show-message` displayed “Hello gate” and cleared after 200 ms; an assigned animation clip advanced 2 frames; scene music loop/volume persisted.
- Browser harness (cold profile, 1366×768, production preview; 10/10 pass):
  - Only one workspace root mounted at a time; Scene canvas and `100%` zoom were identical after Content → Logic → Presentation → Scene.
  - Presentation rendered exactly one sub-tab; Audio set `?ptab=audio`, showed Master/Music/SFX controls and the no-track state, and survived reload.
  - Duplicate bindings showed `Conflicts: KeyW (up, jump)`.
  - Adding a bar HUD widget with max 7 showed `/ 7` in the live preview; Play rendered `Coins 0 of 7`; hiding the widget removed the bar from Play.
- Bug fixed: `refreshPrefabInstances` kept existing instance objects and then reinserted refreshed copies with the same ids, producing duplicate object ids when updating a prefab. It now removes the old instance objects before inserting the refreshed set.
- Known limitations: music/SFX audibility was not measured in headless Chrome; verification covers persisted loop/volume settings, the Audio panel controls and the no-asset state. The runtime harness is uncommitted.
- Acceptance: **closed** for the Slice 5 list in `docs/clockwork-implementation-plan.md` §Slice 5, with the audio-audibility caveat above.

## Slice 6 gate — chat shell, context, tools, hardening (gate closed on mock evidence)

- Date: 2026-11-17
- Commit: see this change set.
- `node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json`: pass. Production `vite build`: pass (chunk-size warnings only).
- Browser harness `.data/slice6-ui.mjs` (cold profile, production preview, 1366×768; **17/17 pass**): empty drawer opens from `⌘J` with context chips; a selected object appears in the context chip and in the `/step` request body; mock text streams; tool cards expand to real `obj_` ids; `capture_viewport` renders a PNG in the drawer and that image is attached to the next request; slow stream Stop returns to ready in 25–47 ms; error card shows Retry, and Retry preserves the thread and re-requests; a two-tool chain ends in final text; reload restores the thread; New chat clears it and it stays cleared after reload; at 1920 px the drawer docks at 420 px without horizontal overflow; no uncaught console exceptions.
- Persistence (S6-1): `readChat`/`saveChat`/`deleteChat` in `src/engine/persistence/indexeddb.ts`; `useAgentSession` loads the last 50 messages per project, debounce-saves 300 ms when idle, and New chat deletes the project thread.
- Hardening (S6-2): `server/env.ts` Zod schema fails fast; `/api/*` `bodyLimit` 1 MB; in-memory per-IP/per-route POST limiter 60/min returning `429` `code:"rate-limit"`; provider fetch receives `c.req.raw.signal`. Verified with curl: 1.2 MB body → `413 payload-too-large`; 62 rapid `POST /api/ai/step` → 60×400 then 2×429; health stayed 200. Also fixed a crash: a body with no `messages` array now returns `400 bad-request` instead of throwing inside `streamText` and terminating the server.
- Mock coverage (S6-3): `[mock:slow]`, `[mock:stopped]`, `[mock:chain]`, `[mock:query]`, `[mock:capture]`, plus the error trigger. Triggers only fire on the first step so tool-result follow-ups can finish.
- Tool aliases (S6-4): `get_project_summary`, `query_project`→`search_entities`, `inspect_entity`→`get_object` accepted by `executeClientTool` and appended to `toolDefinitionsForRequest`; system prompt names both sets.
- Responsive drawer: scrim below 1500 px; docked 420 px at ≥1500 px via `.app.agent-open` padding.
- Known limitations: no real-provider turn was possible without credentials (the only unverified Slice 6 gate item); persistence stores plain chat JSON in IndexedDB like the rest of the local project state; rate limiting is in-memory.
- Acceptance: **closed** for the deterministic/mock Slice 6 gate; the real-provider tool-call item is recorded in `docs/known-issues.md` as a verification gap.

## Slice 7 — agent writes, presence, playtest, presets (implementation; browser gate deferred)

- Date: 2026-11-17
- Commit: see this change set.
- `node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json`: pass.
- S7-1: `previewCommands` now returns the dry-run `document` and `changedIds`; `applyCommandsInStore` reports changed ids and names the failing command index.
- S7-2: new `useAgentPresenceStore` drives violet changed-object outlines, an `AGENT` pill, a 350 ms camera ease (reduced-motion aware), a hierarchy scroll, and a 2.5 s clear. The user's selection is never changed. Presence is set after apply and on preview, cleared on a new turn/new chat/mode change.
- S7-3: Plan preview stores the preview document; the canvas draws violet ghost bounds and red deleted bounds, plus a top-center `PLAN PREVIEW · N changes` pill with Apply/Discard. Apply/discard/stale/mode change clear the ghost.
- S7-4: `start_playtest` now runs `runHeadlessPlaytest`: the real `Runtime`, 1/60 s fixed steps, scripted inputs, a 15 s cap, variables/events/frames, a stuck-position error, and an honest `passed` only for `won` or a clean stop. It rejects a second concurrent run.
- S7-5: canvas context menu, inspector and toolbar open the drawer with a locked selection chip; `ContextPacket.editor.lockedSelection` carries it, and unlocking is explicit.
- S7-6: seven presets and contextual suggestions (`src/engine/ai/prompts.ts`), preset cards in the empty state, `/` preset filtering, and `docs/golden-prompts.md`.
- S7-7: a `revision` tool failure appends a re-read/re-plan message and continues, at most twice per turn; it never auto-applies after a conflict.
- Verification deferred at the user's request until the Slice 10 Kane run. No browser acceptance evidence is claimed; `docs/known-issues.md` marks each implemented item as unverified.

## Slice 8 — ship, export, share (implementation; acceptance deferred)

- Date: 2026-11-17
- Commit: see this change set.
- `node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json`: pass. The standalone player bundle also builds with esbuild (1.08 MB IIFE).
- Export: `src/engine/io/build.ts` produces `index.html`, `clockwork.js`, `project.json`, `README.txt` and `assets/*`, zipped with fflate. The player bundle is built on demand by `GET /api/build/player.js` from `src/play/player.ts`, so no generated artifact is committed.
- `src/play/player.ts` loads the exported project and embedded data-URL assets, runs the same `Runtime`/`SceneRenderer`/`InputManager`, renders HUD/messages, exposes `data-playtest`, `data-scene-id`, `data-frame`, `data-variables` and `data-player`, and restarts on `R`.
- Snapshots: SQLite table `.data/snapshots.sqlite`; `POST /api/snapshots` validates a Clockwork document, assets are data URLs, max 20 MB, TTL clamped to 1 h–7 d; `GET /api/snapshots/:id` returns the immutable payload; `DELETE` removes it. Expired rows are purged on access.
- `src/features/ship/ShipPanel.tsx` adds build summary, `.zip`/`.clockwork.json` export, share link creation with expiry, copy/open/delete. It flushes the project and reads asset blobs before sharing/exporting. The Overview `Share` button and Ship card/rail open it.
- `src/features/playtest/SnapshotPlayerPage.tsx` serves `/s/:snapshotId` as a chrome-free read-only player with HUD, messages, restart and the `Made with Clockwork` badge.
- Cover capture: `captureViewportCover()` downsizes the canvas to 640×360; autosave stores it as `coverDataUrl` on the project record, and project cards render it with the template cover as fallback.
- `fflate` and `esbuild` were added as dependencies.
- Acceptance is deferred at the user's request to the Slice 10 Kane run: no browser export/snapshot/share run has been performed. `docs/known-issues.md` records the unverified items.

## Slice 9 — hardening and demo readiness (implementation; acceptance deferred)

- Date: 2026-11-17
- Commit: see this change set.
- `node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json`: pass.
- Added a route-level error boundary with a reload/back path; the editor retains its WebGL failure fallback, and Ship/snapshot/export paths render explicit error states.
- Added the four-step first-run coach tour (`src/features/onboarding/CoachTour.tsx`, dismissible, stored in `localStorage`).
- Neon Runner now seeds the intentional uncollectible Core B (inside the solid Ledge B body), with a generated 640×360 cover SVG. `?demoReset=1` deletes and reseeds it for Slice 10 rehearsals.
- Project cards render captured covers with the template cover as fallback; autosave captures a 640×360 JPEG cover from the viewport.
- Added `window.__clockwork` editor debug bridge (state, selection, undo/redo, agent open/close, workspace tab), documented in `docs/testing-hooks.md`.
- Added `scripts/check-repo.mjs` and `pnpm check:repo`: rejects `reference/`, stray root Markdown, tracked `dist/`, generated `public/player/clockwork.js`, and missing ledgers/slice log entries. It passes after this entry is present.
- README rewritten for the actual product: quick start, configuration, storage, architecture, scope and document links.
- Acceptance is deferred at the user's request: no 1366/1440/1920 visual audit, keyboard-only pass, cold-start 5-minute run, or Kane run has been performed. `docs/known-issues.md` records the gap.

## Slice 10 — Kane engine QA and AI Play (verification in progress)

- Date: 2026-11-17
- Commit: see this change set.
- `node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json`: pass.
- Added the Kane runner, NDJSON protocol, objective builders, `/api/kane` routes, AI Play HUD/panel/controller, deterministic embedded-coin repair, agent `verify_with_kane` / `run_ai_play` tools, and the Kane setup/AI Play docs.
- Real K1 editor run passed with `object_x: "160"` after two moves, two undos and a reload (303.6 s, 62.79 credits). The run exposed and fixed two UX/accessibility defects: selecting an object at 1366 px did not open the inspector, and hierarchy rows were buttons containing a nested Delete button; rows are now labelled `treeitem`s and selection opens the inspector.
- Real AI Play on the full Neon Runner demo did not finish inside practical time/credit limits; Kane's per-step latency plus the embedded-coin wait exceeded the cap. A reduced one-coin real-Kane smoke (`scripts/kane/ai-play-smoke.ts`) produced a real failed attempt, a deterministic `Move Core A out of Ground` repair, and a real passing retry with `COINS: "1"`, `STATUS: "WON"`.
- AI Play objectives now use a fixed settle window instead of polling for `WON/LOST`, and compact scenes skip the jump loop. The runner accepts `KANE_TIMEOUT_SECONDS` / `KANE_MAX_STEPS`; the API now loads `.env.local` and supports `LLM_MODEL` / `LLM_BASE_URL` / `LLM_API_KEY` as an OpenAI-compatible fallback.
- Full Neon Runner AI Play now passes with real Kane: attempt 1 failed in 85.0 s (embedded coin, `COINS: 2`), the deterministic fix applied one undoable `object.update`, and attempt 2 passed in 66.6 s with `STATUS: "WON"`, `COINS: "3"`, `LAST_ERROR: "none"` — 151.6 s total, both with evidence packs.
- The AI Play ceiling was raised from 50 s / 6 steps to 140 s / 8 steps after real runs were killed at ~55 s mid-assertion and reported as a 0 s cancel; timeouts now report real elapsed time and "verdict is unknown". The objective was rephrased from a goal ("Collect all 3 coins…") to a fixed-input verification ("Run the scene once… Do not press RESTART"), which stopped Kane from restarting a broken scene instead of letting the assertion fail.
- Honest gaps: K2–K4, the independent negative control, and the agent `KaneRunCard` handshake were not executed with real Kane in this pass; `docs/kane-proof.md` records the evidence and limitations.
