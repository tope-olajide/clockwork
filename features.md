# Clockwork Features

Only features that are **100% implemented, manually verified, and passing the current slice gate** are listed here. Planned, partial, mocked, or disabled work does not belong in this file. Put limitations and unfinished work in [`docs/known-issues.md`](docs/known-issues.md).

## Status

Slice 0 (static shell) committed and verified. Slice 1 (engine model, command bus, persistence, project lifecycle) is implemented and committed (`10b839e`), including the undo/redo revision fix (history entries store `prevRevision`; undo restores it, redo restores `prevRevision + 1`). It passes `pnpm typecheck` and `pnpm build`, and core flows are verified (all templates, persist/reload, Brief disabled, add scene/layer with revision + undo/redo, import/transfer identity, corrupted recovery).

The Slice 1 acceptance gate is still **not fully evidenced** in one clean end-to-end pass (search/filters, archived read-only, duplicate/archive/delete menu flows, export → delete → re-import). Per the file's rule, no Slice 1 product feature is listed below until those checks are logged.

<!--
When a feature is fully complete, add it under the right area using this shape:

### Feature name

One or two sentences describing what the user can do and where to find it.
Completed in Slice N · commit <short-sha> · verified at 1366×768 and 1440×900.

Areas: Editor, Assets, Runtime, Logic, AI Agent, Shipping, Platform.
Do not add a feature until every acceptance criterion for its slice is checked and logged.
-->
