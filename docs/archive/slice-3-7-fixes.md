# Slice 3–7 Remediation Plan

This document turns the Slice 3–7 audit (`docs/known-issues.md` → “Audit — Slices 3–7 code review”) into an ordered, followable work plan. Work top to bottom. Do not start a later slice until the current slice's gate section is checked and logged.

Source of truth for acceptance: `docs/clockwork-implementation-plan.md` §8 (Slices 3–7).
Evidence rules: `docs/implementation-log.md` template; `docs/known-issues.md` reporting rules.

---

## 0. How to work this plan

1. One item at a time, in numeric order (`S3-1`, `S3-2`, …). Items list the files to change and the check that proves it.
2. After each slice's items, run the slice gate: `tsc -b` + `vite build`, then the browser script in the appendix at 1366×768 in a cold profile.
3. Update `docs/implementation-log.md` and `docs/known-issues.md` in the same commit. Only then add the slice's features to `features.md`.
4. Keep the uncommitted Slice 7 work as the starting point; commit it only after S7 items are complete and verified, or fold it into the S7 commits.
5. Never weaken an acceptance check to make it pass. If a limitation is real, log it and keep the gate open.

Current state (from the audit):

| Slice | State | Blocking work |
|---|---|---|
| 3 | Implemented, no starter art, gate unlogged | S3-1 … S3-5 |
| 4 | Gate closed | Residual task gaps only (S4-1 … S4-3) |
| 5 | Implemented, partial evidence | S5-1 … S5-4 |
| 6 | Implemented, no chat persistence, loose server | S6-1 … S6-5 |
| 6.5 | Implemented, unverified | S65-1 … S65-5 |
| 7 | Partly implemented | S7-1 … S7-9 |

---

# Phase 1 — Slice 3 (assets, slicing, animation, tilemaps)

## S3-1 — Add starter art and audio, and seed them into every project

**Why:** `public/` does not exist. Task 9 (original starter art + WAVs) was never done, and templates still render `rect` placeholders. This is the largest Slice 3 gap.

### Design decision

Starter assets are **shipped as files in `public/starter/` and seeded into IndexedDB at project creation**. Reason: the renderer loads textures from IndexedDB blobs keyed by `asset.id` (`PixiStage.tsx` preload loop → `readAssetBlob` → `ensureTexture`), and templates must reference stable asset ids. A `public/` file is not visible to the document, so seeding must create both the asset record and the blob.

**Rasterize SVGs before storing.** Author editable SVG sources, but the seeder draws each SVG into a canvas and stores the PNG blob (`image/png`). This avoids `createImageBitmap`/Pixi SVG quirks and guarantees thumbnails, dimensions and slicing all behave exactly like user imports. SVG source files remain the editable originals in `public/starter/`.

### Files

- `public/starter/*.svg` (new)
- `public/starter/audio/*.wav` (new, generated)
- `scripts/generate-starter-audio.mjs` (new, committed; produces deterministic PCM WAV)
- `src/engine/assets/starter-manifest.ts` (new: stable ids, URLs, name, mime, size, slices, animations, tags)
- `src/engine/assets/starter-seed.ts` (new: fetch → rasterize → hash → blob → thumbnail → `Asset[]`; `applyStarterVisuals(document)`)
- `src/engine/model/templates.ts` (emit art-ready objects or leave rects and let `applyStarterVisuals` upgrade them)
- `src/features/projects/ProjectsPage.tsx` (`createProject` awaits seeding for non-import projects)
- `src/engine/store/engine-store.ts` (`ensureDemoProject` seeds the demo too)
- `src/engine/assets/asset-store.ts` (add SVG-safe `readImageDimensions` fallback if rasterization path is not used elsewhere)

### Manifest (stable ids; keep these strings forever)

| Asset id | File | Size (px) | Notes |
|---|---|---|---|
| `asset_starter_player_sheet` | `player-sheet.svg` | 512×256 (4×2 @128) | slices = 4×2; clips `idle` [0,1], `run` [2,3,4,5], `jump` [6] |
| `asset_starter_drone` | `drone.svg` | 96×64 | patrol enemy |
| `asset_starter_coin` | `coin.svg` | 48×48 | collectible |
| `asset_starter_flag` | `flag.svg` | 64×96 | goal / relay |
| `asset_starter_hazard` | `spark.svg` | 96×48 | hazard |
| `asset_starter_ground` | `ground.svg` | 256×96 | tileable strip |
| `asset_starter_platform` | `platform.svg` | 256×32 | ledge |
| `asset_starter_hill_far` | `hill-far.svg` | 1024×512 | parallax 0.3 |
| `asset_starter_hill_mid` | `hill-mid.svg` | 1024×512 | parallax 0.3 (second ridge) |
| `asset_starter_hill_near` | `hill-near.svg` | 1024×512 | parallax 0.5 |
| `asset_starter_panel` | `panel.svg` | 256×128 | UI panel |
| `asset_starter_coin_sfx` | `audio/coin.wav` | 0.15 s mono | play on collect |
| `asset_starter_jump_sfx` | `audio/jump.wav` | 0.12 s mono | play on jump |
| `asset_starter_click_sfx` | `audio/click.wav` | 0.05 s mono | UI click |

Art direction: cohesive dusk palette already used by templates — `#151a2c` background, `#ff856f` coral, `#8f9dff` periwinkle, `#f6e7c8` moon, `#384562` ledges. Transparent PNG output; no external art.

Audio generation: `scripts/generate-starter-audio.mjs` writes 16-bit mono 22 050 Hz PCM WAVs from deterministic envelopes (coin = two rising sine blips, jump = fast upward sweep, click = short noise burst). Run once with `node scripts/generate-starter-audio.mjs`; commit the WAVs. No runtime dependency.

### Steps

1. Create `public/starter/` and author the SVGs. Keep each file self-contained (`xmlns`, explicit `width`/`height`, `viewBox`). Do not reference external fonts or images.
2. Generate and commit the WAVs from the script.
3. Write `starter-manifest.ts`:

```ts
export interface StarterAssetSpec {
  id: string;
  url: string;          // `${import.meta.env.BASE_URL}starter/...`
  name: string;
  kind: "image" | "audio";
  mime: string;
  width?: number;
  height?: number;
  slices?: { x: number; y: number; w: number; h: number }[];
  animations?: { id: string; name: string; frameIndices: number[]; fps: number; loop: boolean }[];
  tags?: string[];
}
```

4. `starter-seed.ts` exposes:

```ts
export async function seedStarterAssets(document: ProjectDocument): Promise<ProjectDocument>
export function applyStarterVisuals(document: ProjectDocument): ProjectDocument
```

`seedStarterAssets`:
- For each spec, `fetch(spec.url)`, read `arrayBuffer`, compute `sha256Bytes`.
- If `document.assets` already has the id or hash, skip (idempotent; satisfies import dedupe expectations).
- For images: draw the fetched blob into an `Image`, rasterize to a canvas at its intrinsic size, `canvas.toBlob("image/png")`; use the PNG `Blob` for the stored blob and `generateThumbnail` for `thumbnail`.
- For audio: store the fetched blob directly.
- `writeAssetBlob(spec.id, blob)`; push an `Asset` with the stable id, width/height, slices/animations, `tags: ["starter"]`.
- Never throw for one bad file: collect failures, log them, and continue; the project still opens with rect fallbacks.

`applyStarterVisuals` maps template objects to sprites without touching transforms or bodies:
- tag `player` → `player_sheet`, `frame: 0`, animations `{ idle: "starter-idle", run: "starter-run", jump: "starter-jump" }`, width/height from current body.
- tag `ground` → `ground` (stretch `visual.width/height` to the object's existing size).
- tag `coin` → `coin`; tag `hazard` → `spark`; tag `checkpoint`/`goal` → `flag`; tag `enemy` → `drone`; tags `ui` stay text.
- platformer layers: objects on layers named `Sky`/`Far` keep the moon but `Ridge`/`Ridge detail` become `hill-far`/`hill-near` sprites at the same bounds.
- Do not change object names, ids, transforms, bodies, tags or rules.

5. Wire seeding into creation:

```ts
// ProjectsPage.createProject, non-import branch
document = createProjectFromTemplate(baseTemplate, name);
document = applyStarterVisuals(document);
document = await seedStarterAssets(document);
```

Do the same in `ensureDemoProject` (`engine-store.ts`). `createAndSaveProject` should also seed or be removed if unused.

6. Template-only guarantees: because seeding can fail, `applyStarterVisuals` may leave rects for tags without art. The template must stay playable either way. Do not make a sprite visual mandatory.

### Verification (S3-1)

- Create a Platformer project in a cold profile: Player/coins/hazard/goal render as art (not colored rectangles), layers keep parallax, bodies/colliders unchanged, Play still reaches the relay.
- Assets page lists every starter asset with thumbnail, dimensions and “frames/clips” metadata.
- Reload: art is still there (blobs restored from IndexedDB).
- Delete a project, create another: seeding is idempotent and does not duplicate records.
- Re-import `public/starter/coin.svg` through the asset browser: reports “Already in project” (hash dedupe).
- No console errors from missing `/starter/*` requests (production build served by Vite/Hono must include `public/`).

---

## S3-2 — Complete the asset browser (task 2)

**Why:** search, kind filter, rename and usage counts are missing.

Files: `src/features/assets/AssetBrowser.tsx`, `src/engine/commands/registry.ts` (export a usage helper), `src/engine/render/PixiStage.tsx` (accept asset drag payload).

1. **Search:** local `query` state; filter by `name` and `tags`.
2. **Kind filter:** segmented control `All / Images / Audio / Tilesets`; counts per kind.
3. **Rename:** inline edit (pencil) dispatching `asset.update { assetId, patch: { name } }`; refresh from the store. Validate non-empty and ≤120 chars.
4. **Usage count:** export `assetUsage(document, assetId): string[]` from `registry.ts` (make `assetReferences` public, keep the return strings). Render `Used by: scene background, 3 objects` or `Unused`.
5. **Drag-to-canvas:** make each image card `draggable` with `dataTransfer.setData("application/x-clockwork-asset", asset.id)`. In `PixiStage`'s drop handler (currently file-only around line 1035), read that type first, convert the drop point to world coordinates, and dispatch `object.add` with a sprite visual in one transaction, then select the new object.
6. Keep the existing import/slice/animate/tilemap/delete actions.

Verification: filter+search narrow the grid; rename persists after reload; a card drag creates one sprite at the cursor with one undo entry; usage count matches references and turns “Unused” after the last reference is removed.

---

## S3-3 — Manual frames in the slicer (task 5)

Files: `src/features/assets/AssetBrowser.tsx`, `asset.setSlices` command unchanged.

1. In the slice dialog add a **Manual frames** section: list of `{x,y,w,h}` rows with number inputs, add/remove, and a “Use manual frames” apply button.
2. Show manual and grid modes as tabs; preview overlays for both, numbered.
3. `Save slices` dispatches whichever mode is active; validate `w>0`, `h>0`, bounds inside the image.

Verification: save two manual frames, reopen the dialog, both frames persist and are selectable as animation frames.

---

## S3-4 — Tilemap authoring polish (task 8)

Files: `src/engine/render/PixiStage.tsx`.

1. While a tilemap is selected, draw the tile grid and a hover-cell highlight in the overlay (`drawOverlay`), independent of the object bounding box.
2. Ensure right-drag erase and left-drag paint use the same stroke transaction (already implemented); add the visible hint in the toolstrip (`Paint / Erase / Fill / Pick`, brush size, tile index).
3. Keep the full drag stroke as one undo entry (already true) and test a 20×10 map.

Verification: paint a 20×10 map, erase a row, fill an area; one undo reverts the whole stroke; grid and hover cell visible.

---

## S3-5 — Slice 3 gate

Run the Slice 3 acceptance list exactly as written in the plan:

- [ ] Drag a PNG onto the canvas → imported, deduped, sprite selected.
- [ ] Auto-slice a 4×2 sheet; frames correct; animation preview plays at the requested fps.
- [ ] `Fit body to art` produces a tight collider on a transparent-padded sprite.
- [ ] Paint a 20×10 tilemap; drag stroke = one undo; erase and fill work.
- [ ] Importing the same file twice reuses the asset and reports “Already in project”.
- [ ] Deleting an in-use asset is refused with a reference list.
- [ ] Reload restores assets and thumbnails from IndexedDB.
- [ ] `tsc -b` + `vite build` pass.

Then: log the entry with the commit, cold-profile steps and viewport; update `features.md` with the Slice 3 features; clear the Slice 3 audit entry from `known-issues` (or mark it fixed).

---

# Phase 2 — Slice 4 residuals (optional, gate already closed)

Do these before Slice 5 only if you want the task list to match the plan; the gate is already evidenced.

## S4-1 — Pointer/tap and gamepad input; released set

Files: `src/engine/runtime/input.ts`, `src/features/playtest/PlayPage.tsx`.

- Add pointer/tap: pointerdown/up on the play canvas maps to `actionPressed`/`action` (or a `tap` field if the runtime needs coordinates).
- Add gamepad polling in `snapshot()` (standard mapping: left stick/d-pad → directions, A → jump, X → action), with a deadzone.
- Track `released` per fixed step alongside `pressed`/`down`; clear both after each snapshot.

## S4-2 — Sub-stepping

Files: `src/engine/runtime/runtime.ts`.

- Split each fixed step's movement into `ceil(maxSpeed*dt / minCollider)` substeps, resolving collision after each; cap at an absolute maximum. Preserve determinism and replay.

## S4-3 — Merged tilemap row spans

Files: `src/engine/runtime/runtime.ts` (`solids()`).

- For each tilemap row, merge contiguous non-zero columns into one solid span; feed spans to the same AABB path. Add a check that a 100×100 tilemap produces ≤ rows of solids and Play performance does not regress.

Verification: 20 keyboard-only acceptance checks still pass; add one pointer and one gamepad check; deterministic trace unchanged with no tilemaps.

---

# Phase 3 — Slice 5 gate

## S5-1 — Run the Slice 5 acceptance script and fix failures

The code exists; the evidence does not. Work the plan's 13 acceptance boxes in one cold profile at 1366×768 and record observed values. Expected failure points to investigate first:

- Rule `coins == 3 → go to Win` firing exactly once (check `firedRules`, `once`, scene transition).
- A rule referencing a deleted object: flagged in LogicPage and skipped in runtime with a `rule-blocked` event.
- Gravity/jump inspector edits reflected in Play (template vars vs settings).
- Prefab update propagating to instances while preserving `prefabOverrides`; detach stops propagation.
- Jump rebound to `KeyW` working in Play with a conflict warning in the editor.
- HUD/widget bound value updating, bar max, hide; `show-message` display and clear.
- Per-scene music loop/volume and SFX volume (needs audio assets from S3-1 to be audible; if headless, use the runtime/audio state assertions and log the limitation honestly).
- Animation clip playback on the assigned object in Play.
- Only one workspace mounted; viewport camera preserved across workspace switches (compare numeric camera before/after).

## S5-2 — Fix and log

Fix causes, not checks. Then log the Slice 5 gate with N/N, update `features.md`, and remove the Slice 5 in-progress entry from `known-issues`.

---

# Phase 4 — Slice 6 (agent transport, chat shell)

## S6-1 — Chat persistence per project (task 11)

Files: `src/engine/persistence/indexeddb.ts`, `src/features/agent/useAgentSession.ts`, optionally `src/features/agent/agent-chat.ts`.

1. Add `readChat(projectId)`, `saveChat(projectId, messages)`, `deleteChat(projectId)` using the existing `chats` store (`{ id, messages, updatedAt }`; `id` = projectId).
2. In `useAgentSession`, when `projectId` is valid, load the last 50 non-tool-internal messages once; when `messages` changes and is not streaming, debounce-save (300 ms).
3. New chat clears the stored thread for that project only.
4. Do not persist draft tool results that are still streaming; persist tool cards in their completed state.

Verification: send a message, reload, thread restored (≤50); New chat empties it and survives reload; switching projects loads separate threads.

## S6-2 — Server hardening (task 1, carried into 6.5 task 5)

Files: `server/index.ts`, `server/env.ts` (new), `server/routes/ai.ts`.

1. `server/env.ts`: Zod schema for `PORT`, `NODE_ENV`, `AI_MOCK`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `CLOCKWORK_SECRET`; parse once and fail fast with a readable error.
2. Apply `bodyLimit({ maxSize: 1024 * 1024 })` to `/api/*`; keep the 20 MB import path client-side only.
3. Add a small in-memory rate limiter (per IP, per route) for `/api/ai/step`, key save/test, and custom provider/model creation; return `429` with the typed `rate-limit` code.
4. Keep `AbortSignal` handling: abort the upstream fetch when the client disconnects.

## S6-3 — `AI_MOCK` fixtures (task 10)

Files: `server/ai/mock.ts`.

Add explicit triggers: `[mock:slow]` (chunk every 250 ms), `[mock:chain]` (tool call → tool-result → second tool call → final text), `[mock:stopped]` (long stream for Stop), in addition to the existing text/tool/error. Keep the default deterministic.

## S6-4 — Tool-name alignment (§5.4)

Decision: add aliases rather than rename. Include `get_project_summary`, `query_project`, `inspect_entity` in `toolDefinitionsForRequest` and handle them in `executeClientTool` (map to the existing summary/search/inspect logic). Keep the existing names for compatibility and keep the system prompt mentioning both. Document the alias set in the Slice 6 log.

## S6-5 — Slice 6 gate

Complete the plan's acceptance checklist in the drawer at 1366 with `AI_MOCK=1`:

- empty / streaming / tool running / tool done / error / stopped states;
- context chips reflect scene/revision/selection/playtest;
- selection changes the next context packet (`debugContext` log);
- `query_project` (alias) returns only requested entities with real ids;
- `capture_viewport` returns a PNG and the image part reaches the next step;
- Stop aborts <200 ms; Retry preserves the thread;
- drawer docks at 1920, overlays with scrim at 1366, no horizontal overflow;
- one real provider streamed answer with ≥1 tool call;
- `tsc -b` + `vite build`.

Log it, add features, update known issues.

---

# Phase 5 — Slice 6.5 (providers, vault, settings)

The code is present; this phase is verification and hardening.

## S65-1 — Key-leak audit

With a vault key saved and a chat turn run, inspect: `localStorage`, `sessionStorage`, IndexedDB, the JS bundle/network responses, SSE/NDJSON payloads, server stdout/logs. Assert only `{ configured, source, hint }` is returned. Capture the exact commands/observed output in the log.

## S65-2 — Vault and precedence

- Save a key to the vault, restart the server, confirm it still tests successfully and shows a masked hint only.
- Save a session-only key, restart, confirm it is gone and the UI shows `MISSING`.
- Set an env key, confirm it is read-only and no value is displayed.
- Delete a vault key and confirm status changes.

## S65-3 — Custom provider/model end to end

Stand up a local fake OpenAI-compatible endpoint (Node script under `scripts/verify/`, not committed as production code) returning a streamed chat completion. Add it as a custom provider (localhost HTTP is the allowed exception), add a custom model, test, save, select, and run a real chat turn. Then try a bad base URL/key and assert the typed error card and no crash.

## S65-4 — Picker, gating, errors

- Picker search/grouping/badges/context size; selecting a model applies to the next turn and survives reload (`clockwork:agent-model:<projectId>`).
- Tool-less model: Ask works, Build/Plan disabled with explanation, server rejects `no-tools`.
- Vision-less model: `capture_viewport` hidden and refused client/server.
- Error cards for `no-key`, `invalid-key`, `no-models`, `model-unavailable`, `rate-limit`, `provider-timeout` with the right actions.
- Fresh install with no key: editor/player/export boot; agent shows setup card.
- `AI_MOCK=1` labelled `MOCK`.
- `tsc -b` + `vite build`.

## S65-5 — Log and features

Log 6.5, remove the in-progress entries, add features. Record the JSON-vs-SQLite vault deviation as a known limitation (already done) and decide whether to migrate to SQLite now or keep the documented deviation.

---

# Phase 6 — Slice 7 (agent writes, workflows, presence)

Order matters: executor → presence/ghost → playtest → UX → prompts → gate.

## S7-1 — Executor correctness: changed ids and preview document

Files: `src/engine/ai/executor.ts`.

1. `PreviewCommandsResult` gains `document: ProjectDocument` (the dry-run result) and `changedIds: string[]`.
2. `applyCommandsInStore` fills `changedIds` from the change set (`object`/`scene`/`prefab`/`asset` ids).
3. `previewCommands` returns the full preview document so the UI can render ghosts without re-running commands.
4. Keep atomicity: dry-run first, then dispatch; on failure report the command index.

## S7-2 — Agent presence (task 7)

Files: new `src/engine/store/agent-presence.ts` (zustand), `src/engine/ai/executor.ts`/`useAgentSession.ts`, `PixiStage.tsx`, `EngineDocks.tsx`, `base.css`.

1. Store `{ objectIds, sceneId, label, until }`. Set it after an apply (and after preview) from `changedIds`; clear after ~2.5 s or on new turn.
2. `PixiStage` overlay: violet (`#8f6bff`) 2 px outline + soft pulse for those ids, plus an `AGENT` pill at their bounds.
3. Camera ease: publish a `focus` event; PixiStage lerps camera to the first changed object over ~350 ms (respect reduced-motion).
4. Hierarchy: scroll the first changed row into view (`data-object-id` query) without stealing focus.
5. Selection sync: keep the user's selection; never focus the drawer/composer.

Verification: an agent edit in another scene switches scene, pulses the changed objects, scrolls the hierarchy, and typing focus stays where it was.

## S7-3 — Plan-mode ghost overlay (task 3)

Files: `src/engine/store/agent-presence.ts` (or a `ghost` slice), `PixiStage.tsx`, `AgentDrawer.tsx`.

1. When `pendingPreview` exists, store `previewDocument` + changed ids + label.
2. Render ghost copies of changed objects from `previewDocument` at 35% opacity violet, plus created objects; deleted objects get a red dashed outline at their old bounds.
3. Show a top-center pill: `PLAN PREVIEW · N changes · Apply / Discard`.
4. Clear ghosts on Apply, Discard, stale, or mode change.
5. Keep the existing change-set card; the pill is additive.

Verification: Plan a change; ghosts match exactly what Apply produces; Discard removes them with no revision change; a manual edit while previewing marks it stale and blocks Apply.

## S7-4 — Real `start_playtest` bridge (task 8)

Files: new `src/engine/runtime/playtest.ts`, `src/features/agent/useAgentSession.ts`, maybe `PlayPage.tsx`.

Implement a headless, deterministic run in the client (no navigation):

```ts
export interface PlaytestResult {
  passed: boolean; sceneId: string; seed: number; frames: number; elapsedMs: number;
  status: "won" | "stopped" | "timeout"; variables: Record<string, unknown>;
  events: Array<{ frame: number; type: string; message: string }>;
  error?: { sceneName: string; objectName: string; message: string };
}
export function runHeadlessPlaytest(document, opts): PlaytestResult
```

- Build `new Runtime(document, opts.sceneId, opts.seed)`, step at `FIXED_DT` for `durationMs` (cap 15 s), feed scripted inputs (per-step `InputFrame[]`, cycling if shorter), capture snapshot at the end.
- `passed` means `status === "won"` (or `stopped` without error) — define it and say it in the tool result.
- If a playtest is already running (`playtestRunning`), return the existing error.
- Return honest telemetry: it is a headless simulation, not a visual run; say so in the result.
- Optional: a “Run in Play” button beside the result for visual confirmation.

Verification: `"Play it and tell me if it is completable"` returns variables/events/frames matching a manual Play of the same seed; an uncompletable level returns `passed:false` with the stuck position; a second call while one runs errors.

## S7-5 — Selection-level “Ask AI” (task 10)

Files: `PixiStage.tsx`, `EditorPage.tsx`, `useAgentSession.ts`, `AgentDrawer.tsx`.

1. Replace the canvas stub (`toast.push("Ask agent", ...)`) with a callback that opens the drawer, sets Ask mode, and locks a selection context chip `Locked: <object name>`.
2. Add the same action to the inspector (object tab) and wire the toolbar split button: default attaches the selection; menu items `Plan a change` (Plan mode + selection) and `Explain this scene` (Ask mode, no mutation).
3. Session gains `lockedSelection` in the context packet; unlocking is a chip click. Never auto-clear it while the drawer is open.

Verification: right-click an object → Ask AI opens with the locked chip; “Plan a change” opens Plan mode with it; the next context packet contains the locked id; Explain produces no commands.

## S7-6 — Prompt presets and contextual suggestions (§7.6, tasks 9/12)

Files: new `src/engine/ai/prompts.ts`, `AgentDrawer.tsx`.

1. Export `PROMPT_PRESETS` (the seven golden prompts) and `suggestionsFor(state)` based on: empty project, selection present, playtest error present, no key configured, last change failed.
2. Drawer empty state renders presets as cards; a `/` prefix or a “Presets” button lists them in the composer.
3. Add `docs/golden-prompts.md` with the seven prompts, what success looks like, and which tool calls are expected.

## S7-7 — Revision conflict auto re-plan (task 6)

Files: `src/features/agent/useAgentSession.ts`.

- Track `replanCount` per user turn. When a tool returns a `revision` (or stale-preview) failure, append a synthetic user message: “Revision changed to rN; re-read the context and re-plan. Do not retry the same batch.” and continue the loop automatically.
- Limit: one automatic re-plan per failure, at most two per turn; then stop with the existing error card and a “Retry” action.
- Never auto-apply after a conflict.

Verification: modify the project between preview and apply → agent re-plans once and succeeds; force a second conflict → stops cleanly with nothing applied.

## S7-8 — Golden prompts (task 12)

Run the seven prompts from `docs/golden-prompts.md` with a real model, each in a fresh thread:

1. Build a small platformer level (playable, one undo entry, concise summary).
2. Double jump + drone patrol (only intended objects change; Play confirms).
3. Why does the player fall through the bridge? (inspects or explains precisely).
4. Make it dusk and add parallax mountains (does not invent assets; reports missing art).
5. Collect all coins → win (valid rule + variable; Play triggers it).
6. Play it and tell me if it is completable (real telemetry, honest).
7. Plan a change → apply (stale guard respected).

Record pass/fail per prompt and tune `server/ai/system-prompt.ts` only where a prompt fails. No manual retries count as passes.

## S7-9 — Slice 7 gate

Run every Slice 7 acceptance box at 1366×768 in a cold profile: Build apply/undo, double jump/drone, collider explanation, dusk/parallax honesty, rule creation, playtest telemetry, Plan apply + stale block, destructive confirmation, whole-turn undo, presence, Ask/Plan/Explain entry points, From brief success and failure-retry, `tsc -b` + `vite build`.

Log, add features, clear known issues.

---

# Appendix A — Commands

```bash
node node_modules/typescript/bin/tsc -b tsconfig.json tsconfig.node.json
./node_modules/.bin/vite build
```

`pnpm typecheck && pnpm build` is the plan's wording; this environment currently fails pnpm's ignored-build check for `better-sqlite3`, so run the two binaries above and record that fact in the log (`pnpm` commands can be tried again after `pnpm approve-builds`).

Start the app for browser checks:

```bash
node node_modules/vite/bin/vite.js --port 4173 --strictPort        # client
node_modules/.bin/tsx server/index.ts                              # API (if not proxied)
AI_MOCK=1 node_modules/.bin/tsx server/index.ts                    # mock agent
```

# Appendix B — Browser script skeleton

Every gate uses the same shape so entries are comparable:

1. New headless Chrome profile, 1366×768, production build (`vite preview`).
2. Seed/clean IndexedDB; create the project through the UI.
3. Perform the slice's steps, capturing DOM/state assertions (revision, history length, asset count, playtest data attributes).
4. Capture console errors and network failures.
5. Reload once to prove persistence.
6. Record N/N checks, exact observed values, and any limitation in the log.

# Appendix C — Done criteria per slice

A slice is done only when:

- every acceptance box is checked with observed evidence,
- `tsc -b` and `vite build` pass in the same working tree,
- the entry in `docs/implementation-log.md` is complete,
- `docs/known-issues.md` no longer lists an open blocker for that slice,
- `features.md` lists the completed features,
- the work is committed (and pushed if requested).

Until then, the next slice does not start — that is the Slice execution contract in §8.0.
