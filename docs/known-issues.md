# Clockwork Known Issues and Limitations

This file records anything that could reduce confidence or score: incomplete features, failing checks, deferred verification, deliberate scope cuts, and environment requirements. Keep it honest and current. Do not hide a failure here to make the product look finished.

**Last updated:** 2026-11-16 (Slice 1 implementation commit, acceptance partially evidenced)
**Branch:** `feat/game-engine`

## Current status

- **Slice 1 implemented and committed in working tree state for this step (typecheck/build pass).** Engine model, Zod schemas/migration, command bus + validation + patch history, IndexedDB persistence/autosave, `.clockwork.json` transfer, templates (blank/platformer/top-down/puzzle), and real dashboard/editor/overview/settings surfaces are wired up. Runtime/debug verification confirmed: dashboard + demo seed, `From brief` disabled with Slice 7 reason, creation from Blank and all three templates with expected document shapes, persist/reload for created projects, scene add with +1 revision / undo +1 revert / redo +1 reapply, layer add +1 revision, import-mode creation via valid transfer with identical document state, scene deletion from overview, and corrupted-document recovery UI.
- **Slice 1 acceptance not fully evidenced end-to-end in one clean pass.** Still to fully demonstrate/log as a single checklist run: every required rename/add/delete scene/layer/object mutation with one revision and one undo per mutation, complete dashboard search + all filters + archived read-only behavior, duplicate/delete/archive actions exercised end-to-end, and UI `export → delete → re-import identical` flow including file download (transfer/import identity was verified; headless download capture and some menu-driven flows were not fully automated in one pass).
- **Fixes applied during Slice 1:** enabled Immer `enablePatches()` in command runner; **fixed undo/redo revision semantics: stored prevRevision in history entries, undo sets revision to prevRevision, redo sets to prevRevision + 1**; preserved URL search params on scene-route redirects (keeps `?debug=1`).
- **Renderer/runtime/agent features not implemented yet.** Editor scene view is a debug/document renderer (not Pixi runtime); Play/AI/agent surfaces remain placeholders for later slices.
- **No automated tests, UI tests, or Kane CLI runs executed.**

## Product limitations by design (v1)

- Single-user and local-first. No accounts, teams, roles, comments, notifications, or authorization layer.
- No cloud sync, multiplayer, or CRDT collaboration.
- No arbitrary JavaScript/TypeScript scripting, plugin marketplace, 3D, skeletal animation, particle editor, or shader editor.
- No mobile editor layout below 1024 px. Shared and exported players remain usable on mobile.
- Share links, Kane engine QA, and AI Play require the local Node server; exported zips do not.
- Manual editing, manual Play, save, share, and export work with no model, no provider key, and no Kane. AI is additive; `AI_ENABLED=0` hides AI surfaces without breaking the editor.
- AI features require a provider key (environment variable, in-app vault, or session-only key). `AI_MOCK=1` is a development fixture, not a production model.
- AI Play requires both a configured model (for diagnosis/fix) and a logged-in Kane CLI (to play). Without either, it is disabled with an explanation; manual Play still works.
- AI Play is local/self-hosted in v1 because it launches Chrome. A deployed server needs a dedicated runner/display or it cannot use AI Play.
- AI Play consumes Kane and provider credits and uploads a Test Manager run unless configured otherwise; consent is required before the first run.
- The `Neon Runner` demo intentionally contains one uncollectible coin for the AI Play negative-control demo. Manual Play can still reach the goal; `?demoReset=1` restores the defect. It is a demo fixture, not a product bug.
- Custom providers must pass the SSRF-safe base-URL and connection checks; a local provider is the only HTTP exception.
- Session-only provider keys are intentionally lost on server restart. Vault keys become unreadable if `CLOCKWORK_SECRET` changes or `.data/secret.key` is deleted; the user must re-enter them.
- Provider connection tests and agent calls consume provider credits; the UI must state this before testing.
- Media generation (images/audio) is not included.
- Undo history is session-scoped; it does not survive reload.

## Scoring risks / what must be proven later

- The end-to-end path must be demonstrated from a cold browser profile, not a warm dev session.
- The agent ↔ Kane handshake must produce real NDJSON and evidence: engine QA in the verification branch, and the two real AI Play loops in Slice 10. A fixture pass is not enough.
- The project must run without a model/key/Kane for the editor and manual Play paths; only AI features may be unavailable.
- The AI Play demo must show a real failure (`COINS: 2`) and a real same-seed pass (`COINS: 3`), not a scripted success card.
- The visual target must be checked at 1366×768, not only on a large monitor.
- Any failing `pnpm typecheck`, `pnpm build`, console error, or unchecked acceptance item must be recorded here with the date and slice.

## Reporting rules

1. Add an entry as soon as a limitation or failure is known.
2. Include the slice, command, observed result, and whether it blocks the gate.
3. Remove an entry only when the underlying issue is fixed and verified.
4. Never list a feature in `features.md` while it has an open blocking entry here.
