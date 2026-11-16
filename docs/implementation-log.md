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
