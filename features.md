# Clockwork Features

Only features that are **100% implemented, manually verified, and passing the current slice gate** are listed here. Planned, partial, mocked, or disabled work does not belong in this file. Put limitations and unfinished work in [`docs/known-issues.md`](docs/known-issues.md).

## Status

Slice 0 (static shell) committed and verified. Slice 1 (engine model, command bus, persistence, project lifecycle) is implemented in code and passes `pnpm typecheck`/`pnpm build`, with substantial verification (all template creates, persist/reload, Brief disabled, scene add/undo/redo revision semantics, import-mode/transfer identity, corrupted recovery). Because the full Slice 1 acceptance gate was not evidenced end-to-end in one clean run for every required mutation and dashboard flow permutation, no Slice 1 product feature is listed below yet.

<!--
When a feature is fully complete, add it under the right area using this shape:

### Feature name

One or two sentences describing what the user can do and where to find it.
Completed in Slice N · commit <short-sha> · verified at 1366×768 and 1440×900.

Areas: Editor, Assets, Runtime, Logic, AI Agent, Shipping, Platform.
Do not add a feature until every acceptance criterion for its slice is checked and logged.
-->
