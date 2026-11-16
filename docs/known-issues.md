# Clockwork Known Issues and Limitations

This file records anything that could reduce confidence or score: incomplete features, failing checks, deferred verification, deliberate scope cuts, and environment requirements. Keep it honest and current. Do not hide a failure here to make the product look finished.

**Last updated:** 2026-11-16 (Slice 0)
**Branch:** `feat/game-engine`

## Current status

- **Slice 0 is implemented as a static shell.** The repository now contains the Vite/React app, design system, projects dashboard, creation dialog, routing, and editor shell. There is no engine document, Pixi canvas, persistence, or agent yet.
- **Only Slice 0 shell features are complete.** The product features in later slices are not in `features.md`.
- **No automated tests, UI tests, or Kane CLI runs have been executed yet.** Slice 0 was checked with typecheck/build plus headless Chrome screenshots at 1024, 1366, and 1920. The K1–K4 engine-QA suite is deferred to the separate verification branch by design.
- **Slice 0 data is intentionally static.** Projects are mock records in memory; creating a project adds an in-memory card and navigates to the static editor. A refresh loses it. The command palette actions are stubs. The canvas is CSS art, not a renderer.
- **The real Kane CLI AI Play loop has not been run.** Slice 10 defines a deterministic fixture plus two real loops: the seeded `Neon Runner` fail → fix → pass, and an independent negative control (unreachable goal) fail → fix → pass. The engine-QA K1–K4 evidence belongs to the verification branch.
- **The `reference/` directory is still untracked and must be removed before the implementation branch is finalized.** The app does not import or depend on it.

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
- The visual target must be checked at 1366×768, not only on a large monitor. Slice 0 screenshots covered 1024, 1366, 1601, and 1920; drawer behavior was exercised with headless Chrome.
- Any failing `pnpm typecheck`, `pnpm build`, console error, or unchecked acceptance item must be recorded here with the date and slice.

## Reporting rules

1. Add an entry as soon as a limitation or failure is known.
2. Include the slice, command, observed result, and whether it blocks the gate.
3. Remove an entry only when the underlying issue is fixed and verified.
4. Never list a feature in `features.md` while it has an open blocking entry here.
