# Clockwork Known Issues and Limitations

An honest record of what is not covered, not measured or constrained by design. Entries are removed only when the issue is fixed and verified. Real Kane runs are listed in [`kane-proof.md`](kane-proof.md).

**Last updated:** 2026-11-26

## Current status

- 176 tests across 27 test files pass (`pnpm test`). Type-check and `pnpm check:repo` pass.
- The approved-phase Kane flow is live-proven (runs `98e21783`, `ea1bb3b3`, `b967bbdd`). The review panel's result feeds the agent loop through `agent.continueWithPhaseResult`.
- The chat agent closed loop is proven on a Meadow Sandbox project (run `a20a4b28-5387-4849-a978-a5ca5aa499c3`, 2026-11-25): the agent added coins, a score variable and a Score HUD, then `verify_with_kane` passed in the simulator and in a real browser.
- Engine QA K1–K5 all passed. K2 passed last (2026-11-26, session `bded0577`). The saved engine E2E passed authored (286 s), replayed from cold start (89 s) and was re-confirmed replayed 1/1 (164 s).

## Kane and AI Testing

- **Phase state is in memory.** Phase results and idempotency state live in a `Map` in `server/kane/phase-session.ts` and are cleared on server restart. The client keeps results in `localStorage`, but the server cannot replay a typed phase result after a restart.
- **No measured phase replay speedup.** `POST /api/kane/phase` accepts `replayTestKey` and replays a recorded `_test.md` with healing disabled, but no phase replay timing has been recorded. The engine E2E replayed 1/1 steps in 89 s. `KANE_AI_PLAY_TEST` (the AI Play replay path) is contract-verified only.
- **K2's earlier post-fix runs never reached a verdict.** Three runs died in Kane's own browser, and that history is kept in `kane-proof.md`. A hardened objective passed on 2026-11-26 (session `bded0577`) after K2 exposed a second defect: undo history was cleared when returning from Play.
- **Kane Chrome sessions are flaky on this machine.** A stale browser held CDP port 9222 (`connect_over_cdp ... ETIMEDOUT`), and a later run lost its page mid-step. Neither is a product result.
- **Phase stream retry is not browser-proven.** `streamKanePhase` retries the same approved request every 5 s (up to 18 attempts) because long streams can outlive the Vite dev proxy. The runs after the fix finished in one connection, so the retry has not fired live.
- **Model plan drafting is not claimed.** The live panel run used a deterministic seeded draft with the mock planner. Approval, execution, verdict and evidence were exercised, not model authorship.
- **Auto-fix covers one defect class.** The AI Play repair moves an embedded collectible. Other failures are reported, not repaired. The independent negative control (runs `b050f47c-…`, `52baa697-…`) used a deterministic repair too, so model-driven diagnosis is evidenced only by K5's product repair and the K3a agent run.
- **Kane time and cost.** AI Play is capped at `min(KANE_TIMEOUT_SECONDS, 140)` s plus 5 s grace. A real AI Play attempt runs 80–95 s and consumes Kane credits; engine-QA runs are longer. Engine QA needs `KANE_TIMEOUT_SECONDS=300` here.
- **Starter coverage by Kane is partial.** Platform Jumper (saved engine E2E), Asteroid Field (play/restart, editor tuning), Space Invaders (creation, HUD, fast restart) and Space Shooter (loss → R restart, 2026-11-26) have passing runs. Space Invaders still has no clean single run that reads every HUD value consistently: the 2026-11-26 attempt returned `passed` with contradictory `SHIPS` readouts. Console cleanliness passed a CDP sweep on 2026-11-26 (no console errors, no HTTP 4xx; the earlier `/favicon.ico` 404 no longer reproduces). There is no automated scoring or win proof for Space Shooter. Asteroid splitting and scoring, win and loss paths for the other starters, and editor-to-Play tuning for Space Invaders are not covered.
- **No visual judging.** Kane runs use `--assertion-mode dom`. There is no pixel or screenshot comparison.

## Agent and AI providers

- **Provider settings are partly verified.** Key persistence across restart, session-only key loss, masked hints, test connection, custom provider and model chat, model picker behaviour after reload, key absence from storage, network and logs, fresh-install setup and SSRF/rate/body-limit hardening have no recorded run.
- **No real-model golden prompt run.** The seven prompts in `docs/golden-prompts.md` and the prompt presets have not been run against a real model.
- **Revision-conflict auto re-plan has no forced-conflict browser run.** It re-plans at most twice per turn and never auto-applies.
- **Build-mode feedback is partial.** Changed objects pulse through agent presence, but there is no dedicated toast or agent-undo action beyond the normal undo history.
- **`start_playtest` is a headless simulation.** Browser telemetry parity is unverified.
- **Transport deviates from the original plan.** It is NDJSON on `/api/ai/step`, not SSE on `/api/agent/step`. Read tools keep their original names, with `get_project_summary`, `query_project` and `inspect_entity` accepted as aliases.
- **Rate limiting is in memory.** 60 POST/min per IP and route, reset on restart. The `/api/*` body limit is 1 MB. This suits a local single-user app, not a multi-instance deployment.
- **Vault.** Keys persist in encrypted `.data/vault.json` (not SQLite). They become unreadable if `CLOCKWORK_SECRET` changes or `.data/secret.key` is deleted. Session-only keys are lost on server restart.

## Editor, runtime and starters

- **No committed browser/UI test suite.** Kane objectives and the negative-control harness are in `scripts/kane/`, but they need a running API and a logged-in Kane CLI. `pnpm check:repo` is a source-tree check only.
- **WebGL/canvas is required.** Without it the document stays editable from the docks, but the viewport and Play do not render.
- **Play has no replay control.** `Runtime.replay()` exists with no Play UI. Music looping is not implemented. Play telemetry is shown in the UI but is not a read tool for the agent. Pointer input maps to the action button only, and gamepad support uses the first standard pad.
- **Kinematic moving platforms do not carry the player.**
- **Slice 5 items without end-to-end runs.** Music and SFX audibility, `show-message` timing, HUD bar max and hide in Play, animation clip playback on a runtime object, instance-override survival after prefab update, and viewport camera preservation across workspace switches.
- **Hierarchy drag-reparent into groups in very large scenes has no dedicated perf test.**
- **Composite shapes edit coarsely.** The Appearance inspector changes the first primitive's colour and stroke only. Width and height change the bounds.
- **No touch movement.** Starters use keyboard movement, with no virtual joystick. There is no Racing starter.
- **Space Shooter is tuned for 1280×720.** Editing resolution or gravity afterwards can break the fixed lane.
- **Rendering performance** was measured at 801 fps (1.25 ms/frame, 2,000 rects, uncapped). This machine caps every page at about 40.9 fps, so the 55 fps target cannot be observed on screen here.

## Ship and export

- **Export and share have no acceptance run.** Zip export, snapshot create/read/delete, the Ship panel and cover capture typecheck and the player bundles with esbuild. Unzipping and serving offline, share-link input and restart, malformed and oversized rejection, and cover-after-save were not run (`kane-proof.md`, Bar 1). Snapshot players did run for AI Play (`/s/:id?ai=1`).
- **Snapshots are local SQLite.** `.data/snapshots.sqlite` is single-instance. Links expire after 1–168 hours and are purged lazily.
- **Exported builds embed assets as data URLs** in `project.json`, plus an `assets/` folder. Exporting needs the local API server to bundle the player. The zip itself does not.

## Hardening and demo readiness

- **The Slice 9 acceptance matrix is incomplete.** Not run: the cold-start 5-minute manual path with `AI_ENABLED=0`, the 1440/1920 visual audit, 1024 px drawer behaviour, a keyboard-only run, a console-warning sweep and refresh-during-save recovery.
- **No-model states have no browser evidence.** This covers the manual create, edit, save, reopen, play, share and export pass with `AI_ENABLED=0`, and the hidden or disabled no-model AI Play state.
- **Fixture-driven AI Play UI artifact.** The failed → fix → passed panel flow has no stored artifact. Real runs of the same loop are recorded in `kane-proof.md`.
- **AI HUD keyboard parity** (`?ai=1`) is unverified in a browser.
- **Coach tour and `?demoReset=1`** are unverified in a real browser. Confirm the reset does not remove other projects.
- **Accessibility** (focus order, contrast, keyboard paths) was not audited.
- **The visual target** was checked at 1366×768 only.

## Product limits by design (v1)

- Single-user and local-first. No accounts, teams, cloud sync, multiplayer or collaboration.
- No arbitrary scripting, plugin marketplace, 3D, skeletal animation, particle or shader editor, or media generation.
- No mobile editor layout below 1024 px. Shared and exported players work on mobile.
- Share links, Kane engine QA and AI Play need the local Node server, because Kane launches Chrome. Exported zips do not.
- Manual editing, Play, save, share and export work with no model, key or Kane. AI features need a provider key (environment, vault or session). `AI_MOCK=1` is a development fixture.
- AI Play needs a logged-in Kane CLI and consumes Kane and provider credits. It asks for consent before the first run. Without Kane it is disabled and manual Play still works.
- Custom providers must pass the SSRF-safe base-URL and connection check. A local provider is the only HTTP exception.
- Undo history is session-scoped: it now survives a Play round-trip but not a page reload.
- The `Neon Runner` demo contains one uncollectible coin on purpose, for the AI Play fail → fix → pass demo. `?demoReset=1` restores it. The negative control uses a separate compact fixture with an unsatisfiable win rule.
- The "Meadow Sandbox" starter has no built-in game-test profile on purpose, so Test Mode uses a derived one (see `FEATURE_VERIFICATION.md`).

## Resolved

- Approved phase flow had no live pass: runs `98e21783`, `ea1bb3b3` and `b967bbdd` passed.
- Review panel result did not reach the agent: `EditorPage` now calls `agent.continueWithPhaseResult`.
- Phase runner could not replay saved tests: `replayTestKey` is wired in (speedup unmeasured, see above).
- Phase budget too small: now 12 steps and 600 s per phase, and the plan budget wins over the 180 s env cap.
- Chat agent ran out of steps before Kane (run `a20a4b28`): now 12 model steps per message with the last 3 reserved for a requested Kane check, and the agent sees HUD widgets.
- Plan ghosts, agent presence and locked-selection "Ask AI" were unverified: passed a CDP browser run (`.data/agent-ui/verify.json`). The empty `changedIds` bug in `summarizePatchPath` is fixed and covered by `tests/agent-change-set.test.ts`.
- Real provider tool calls were unverified: K3a, K3b and K4 streamed and applied `apply_commands` from the env model.
- K1 defects (inspector could not collapse, unsafe hierarchy-row semantics) and K4's missing duration on the verification card are fixed.
- Slice 1–5 gates closed with recorded runs (`implementation-log.md`).
- Stale submission copy in README, `features.md` and `docs/ai-play.md` was updated.
- Historical planning docs moved to `docs/archive/` (for example `docs/archive/slice-3-7-fixes.md`).
