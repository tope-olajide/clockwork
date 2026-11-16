# Clockwork Known Issues and Limitations

This file records anything that could reduce confidence or score: incomplete features, failing checks, deferred verification, deliberate scope cuts, and environment requirements. Keep it honest and current. Do not hide a failure here to make the product look finished.

**Last updated:** 2026-11-16 (Slice 1 gate run and Slice 2 multi-select/Group/prefab verified; a few gate items remain)
**Branch:** `feat/game-engine`

## Current status

- **Slice 1 implemented and committed (`10b839e`, with fixes in `748786a`) and most dashboard flows are now browser-verified.** Engine model, Zod schemas/migration, command bus + validation + patch history, IndexedDB persistence/autosave, `.clockwork.json` transfer, templates, and real dashboard/editor/overview/settings surfaces are wired up. Verified: creation through the dialog from all three templates, search, all three filter groups, archived read-only (overview + editor, `+ Add` blocked), restore, duplicate, delete with confirmation, and **download → delete → re-import with an identical document** (ids, revision, scenes, layers, objects, variables; `updatedAt` excluded).
- **Slice 1 gate items now verified (26/26 run):** project and object rename, start-scene change plus fallback after deleting the start scene, add/delete scene/layer/object each with exactly one revision and one undo entry (and undo restoring counts), scene delete revision/undo, the `Unsaved → Saving… → Saved` transition, and malformed-import rejection with no partial project.
- **Slice 1 gaps closed:** >20 MB imports are rejected with a visible error and a disabled Create button; corrupted documents show the recovery panel and its `Delete damaged project` action now works (it was a no-op because `removeProject` returned early with no current document); duplicates get a new project id and fresh disjoint object ids with no shared mutable objects; the overview `Play` and new `Share` buttons are disabled with Slice 4/8 explanations.
- **Slice 1 items still open:** the settings-panel-specific rename/start-scene/export/import variants are not separately automated, redo was not re-run in the latest pass, and the whole gate has not yet been consolidated into one single cold-profile run. Because of that, no feature is listed in `features.md` yet.
- **Fixes applied during Slice 1:** enabled Immer `enablePatches()` in command runner; **fixed undo/redo revision semantics: stored prevRevision in history entries, undo sets revision to prevRevision, redo sets to prevRevision + 1**; preserved URL search params on scene-route redirects (keeps `?debug=1`).
- **Slice 2 implemented (PixiJS viewport, scene graph, selection, transforms); gate partially evidenced.** Headless browser verification passed 17/17 checks: Pixi canvas mounts and sizes, platformer scene renders with layers/opacity/parallax, rulers map to world coordinates, `?debug=1` shows FPS/camera, hierarchy selection drives the inspector, dragging an object produces exactly one revision and one undo entry (undo verified), wheel zoom changes zoom without touching revision/history, and layer drag-reorder changes the stack. Two engine bugs were fixed here: `layer.reorder` sorted by stale order values and silently restored the original order; fast drag gestures could commit an empty preview because pointer-up read React state instead of the gesture.
- **Slice 2 additions verified:** scale and rotation via their handles (scale 1.362, rotation 65.35°), 8 px snapping on a drag (committed `x=648`), dock/panel open state, tool and workspace tab persisting across reload with no revision change, and hierarchy virtualization (600 objects rendered as a 20-row window, stable after scrolling). Fixed in this pass: gizmo handles no longer capture pointer-down inside a short selected object, so a centre drag moves instead of resizing.
- **Slice 2 additions verified:** multi-select inspector shows shared transform fields with mixed values; applying X to two objects is one revision and one undo entry; Group selection (inspector and canvas menu) creates a group parent with children in one revision and undo removes it; Create prefab stores a prefab rooted at the selected object. Fixed: the canvas context menu used to close on its own pointer-down, making its actions unusable.
- **Multi-object prefabs:** `prefabSchema` stores `root` plus `objects[]`, and Create prefab from a multi-selection builds a group root whose children are cloned with remapped ids (descendants are captured too). Instantiation, overrides, update and detach remain Slice 5.
- **Slice 2 items still unverified or unimplemented:** marquee selection and snap-guide visuals are not automated; cursor-anchored zoom is implemented but only zoom change (not anchor invariance) was asserted; the 2,000-rect ≥55 fps target was **not measured** (headless Chrome runs software WebGL and is not a valid performance environment); dock width is not resizable; `Esc` clears selection rather than selecting the parent; sprite and tilemap visuals are placeholder geometry until the asset pipeline in Slice 3.
- **Runtime/agent features not implemented yet.** Manual Play arrives in Slice 4; AI/agent surfaces remain placeholders for later slices. The viewport requires WebGL; without it the document stays editable from the docks.
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
