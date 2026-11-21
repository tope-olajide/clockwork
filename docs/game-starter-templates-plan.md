# Built-in 2D game starter templates — vertical slice plan

- **Status:** Slices A–F are implemented and all twelve game documents are registered. After implementation completed, the combined local validation passed: 30/30 tests, typecheck, build and repository check. Browser acceptance remains open, especially gameplay/input/editor-to-Play gates for every starter; see `docs/known-issues.md`.
- **Branch:** `feat/game-starter-templates` (created from `main` at `ecf3f4a`).
- **Date:** 2026-11-18.
- **Goal:** twelve editable, genuinely playable starter projects built from the engine's own document, behavior, rule and runtime systems, selectable from the project-creation flow.

This plan starts from what the repository actually contains, not from what the brief assumes. The engine has a real fixed-step runtime, prefabs, rules, a HUD and a Pixi renderer, but it does **not** yet have primitive shape rendering, projectile/ball physics, working spawners, health or a loss state. Those are prerequisites, and they are part of the work — not workarounds added per template.

## 1. What this delivers

1. Twelve starter documents, each a small but complete level with real movement, input, collisions, spawning, scoring, health/lives, win and loss rules, restart and tuning properties visible in the inspector.
2. A category-grouped template picker in the existing `New project` flow, with a preview generated from the template's real scene rather than a separate mock game.
3. Editor surfaces needed to customise a starter: object colours, physics toggles, body size and behavior parameters with live gameplay effect.
4. Automated tests for template integrity and gameplay logic, plus a per-template browser test report.
5. Per-template documentation of objects, variables, behaviors and tuning knobs.

## 2. Non-negotiables

- Every template is a real `ProjectDocument`: the thing in the editor is the thing Play runs. No separate preview game and no hardcoded gameplay in the picker.
- Graphics are engine primitives only. No images, spritesheets, downloaded assets or sprite packs. The starter SVG assets that exist for the Platformer demo must not be applied to these templates.
- Reuse the existing mechanisms: `behaviors`, `rules`, `variables`, `prefabs`, `settings.ui.hud`, the fixed-step `Runtime` and the existing `SceneRenderer`. Do not add a second scripting language or a parallel game loop.
- Do not claim a template complete because it renders. Each one needs a playtest, a win path, a lose path, a restart check and at least one editor-modification check.
- Do not simplify mechanics until they no longer behave as the brief describes. If a mechanic cannot be built honestly, record the deviation.
- No regressions to the existing Platformer, Top-down, Puzzle, Play, AI Play, export or snapshot paths.

## 3. Engine baseline

### 3.1 What already works

| Area | Reality |
|---|---|
| Document model | Zod schemas, revisions, undo/redo, IndexedDB persistence, import/export. |
| Rendering | PixiJS renderer with layers, parallax, camera, rects, text, sprites and tilemaps; one display object per object keyed by id. |
| Runtime | Fixed `1/60` step, deterministic input replay, static/dynamic/kinematic bodies, one-way platforms, tilemap spans, rules, variables, messages, scene transitions, checkpoints. |
| Behaviors | `platformer-controller`, `top-down-controller`, `patrol`, `follow`, `collectible`, `hazard`, `checkpoint`, `camera-follow`, `spawner`, `timer`, `variable-set`, `health`. |
| Editor | Hierarchy, inspector, behavior parameter editor driven by `BEHAVIOR_CATALOG`, transform gizmos, layers, prefabs, rules, HUD, input map. |
| Play | `/play/:projectId` with pause, step, reset, HUD, messages, debug overlay, snapshot and export players. |
| Templates | Blank, Platformer, Top-down, Puzzle. `templateOrigin` drives labels, filters and cover art. |

### 3.2 Gaps that block the brief

| Gap | Consequence if not fixed |
|---|---|
| `visualSchema` only supports `sprite`, `rect`, `text`, `tilemap`. | No circles, triangles, polygons, lines or multi-shape objects. Every game would be coloured rectangles, which the brief explicitly forbids. |
| `spawner` is a catalog stub; the runtime never spawns from it. | Cannot create enemies, bullets, obstacles or falling objects. |
| `health` is a catalog stub. | No damage, lives, invulnerability, enemy/brick health or death. |
| No projectile, ball, bounce, paddle, flap, formation, wrap, rotation, chase or timer behavior. | No real shooter, pong, brick, flappy, invaders, asteroids or survival loop. |
| `Runtime.status` is `running | paused | won | stopped`; only `won` is triggered by a variable. | No honest game-over state; a loss would look like an error or keep playing. |
| `follow` teleports through walls and always targets the player. | Maze enemies and arena chasers ignore maze walls. |
| The inspector has no object colour control and only exposes body type/width/height. | The brief requires changing colours, movement speed, physics and collision settings; speed exists only inside the behavior editor, colours nowhere. |
| `applyStarterVisuals` rewrites tagged objects (`player`, `enemy`, `coin`, `goal`, `ground`, `wall`) to starter sprites. | New primitive templates would silently become sprite games. |
| No automated test command or test files are committed. | The brief's "create automated tests" and "template-by-template test report" cannot be evidenced. |

`docs/known-issues.md` already records "No committed automated test suite". Slice A closes that gap for engine/template logic; browser playtests stay manual.

## 4. Architecture

### 4.1 Template identity and file layout

`TEMPLATE_ORIGINS` gains twelve ids:

```
space-shooter, ping-pong, platform-jumper, endless-runner, brick-breaker,
flappy-flyer, arena-survival, snake, space-invaders, maze-escape,
asteroid-field, falling-objects
```

Existing ids (`blank`, `platformer`, `topdown`, `puzzle`, `brief`, `import`) stay valid, so stored projects and imports keep parsing. `TEMPLATE_LABELS`, the dashboard template filter, `coverFor`, `templateSummary` and `createProjectFromTemplate` extend to the new ids. Project cards can then filter by actual starter, and `ProjectOverviewPage` shows the right label.

New code lives in `src/engine/model/game-starters/`:

```
catalog.ts          // ids, label, category, blurb, mechanics, accent
shared.ts           // palettes, shape helpers, prefab/variable/HUD helpers
preview.ts          // ProjectDocument -> SVG data URL for the picker
build.ts            // createGameStarterDocument(id, name)
space-shooter.ts    // one module per template, each returns a ProjectDocument
...
```

`templates.ts` delegates the twelve new ids to `build.ts`; it does not grow into a 2,000-line switch. Each template module stays independent and readable, which is also the documentation unit.

### 4.2 Primitive visuals

Add one variant to `visualSchema`, a composite primitive shape:

```ts
primitive: {
  kind: "rect" | "circle" | "triangle" | "polygon" | "line";
  x: number; y: number;           // offset from object centre
  width: number; height: number;  // local bounds
  color: string;
  stroke?: string; strokeWidth?: number;
  rotation?: number;              // degrees
  points?: Array<{ x: number; y: number }>; // normalised -1..1, polygon only
}
shapeVisual: {
  kind: "shape";
  width: number; height: number;  // object bounds used by bodies, bounds, hit-test
  shapes: Primitive[];            // 1..32, painted in order
}
```

- `scene-renderer.ts` adds a `shape` branch that draws each primitive into one `Graphics` (no per-frame rebuild; the existing signature cache handles edits).
- `objectDims` (renderer) and `bodyDims` (runtime) return the shape's declared width/height. `boundsOf`, hit-testing, marquee, gizmos and camera logic then work unchanged.
- The editor inspector gains an **Appearance** section: width/height for non-bodied shapes, colour and stroke for `rect`/`shape` primitives. Changing colour is an `object.update` command, so it is one revision and one undo entry.
- The picker preview maps the same primitives to SVG, so the thumbnail is generated from the actual document.

Visual identity comes from combinations: a spaceship is a hull triangle plus two wing polygons and an engine rect; an asteroid is a polygon with a stroke; a coin is a circle with an inner circle; a snake head is a rounded rect with two eye circles. No two templates share a palette.

### 4.3 Runtime behaviors

Existing behaviors are completed and new ones are added to `behaviorTypeSchema`, `BEHAVIOR_CATALOG` (so the existing inspector UI edits them automatically) and the runtime. Helpers: comma-separated tag lists, seeded RNG, parameter coercion with defaults.

Completed:

| Behavior | Work |
|---|---|
| `spawner` | Real interval spawning from a prefab: `prefabId`, `intervalMs`, `startDelayMs`, `minX/maxX/minY/maxY`, `edge`, `limit`, `maxAlive`, `intervalDecayPerSecond`, `minIntervalMs`. Uses the runtime seed. |
| `health` | `max`, `variable`, `invulnMs`, `damageTags`, `destroyOnZero`, `scoreVariable`, `scoreOnDeath`, `deathVariable`, `deathAmount`, `deathPrefabId`, `deathSpawnCount`, `respawnOnHit`. Initialises its variable on reset; death-prefab children are added to the death variable so split-object counts remain accurate. Damage is applied only through explicit damage sources. |
| `follow` | Wall-aware movement, `targetTag`, `stopDistance`, optional `axis` fallback. Keeps the player target default. |
| `hazard` | `damageVariable`, `damage`, `invulnMs`, `respawn`; no longer forced to teleport. |
| `platformer-controller` | Read the catalog's `maxAirJumps` (the runtime currently reads an undocumented `doubleJump`), `jump`/`jumpVelocity`, `gravityScale`, `maxFallSpeed`. |
| `top-down-controller` | `lockAxis` (`none`/`x`/`y`) for fixed-lane movement. |
| `variable-set` | Implement as "set once when the scene starts" or remove it from the catalog; no silent stub remains. |

New:

| Behavior | Purpose / params | Used by |
|---|---|---|
| `shooter` | `prefabId`, `trigger` (`jump`/`action`/`any`/`auto`), `cooldownMs`, `speed`, `direction` (`up`/`down`/`left`/`right`/`aim`), `aimTag`, `offsetX/offsetY`, `maxAlive`, `chance` | Shooter, Invaders, Arena |
| `projectile` | `speed`, `direction`, `lifetimeMs`, `targetTags`, `damage`, `destroyOnHit`, `pierce` | Shooter, Invaders, Asteroids |
| `mover` | `vx`, `vy`, `accelX/accelY`, `maxSpeed`, `wrap`, `destroyOffscreen`, `lifetimeMs`, `passX`, `passVariable`, `passAmount` | almost all |
| `ball` | `speed`, `paddleTag`, `speedUpEvery`, `speedUpBy`, `maxSpeed`, `bounceAngle`, `serveTrigger`, `serveDelayMs`, `attachToTag`, `missLeftVariable`, `missRightVariable`, `missBottomVariable`, `missAmount` | Pong, Brick Breaker |
| `paddle` | `axis`, `speed`, `min`, `max` | Pong, Brick Breaker |
| `ai-paddle` | `targetTag`, `speed`, `error`, `reactionMs`, `min`, `max` | Pong |
| `flap` | `trigger`, `impulse`, `maxFallSpeed`, `lockX`, `ceiling`, `floor` | Flappy |
| `countdown` | `durationMs`, `variable`, `mode` (`down`/`up`), `tickMs` | Shooter, Arena, Falling Objects |
| `formation` | `groupId`, `groupTag`, `columns`, `spacingX`, `spacingY`, `speed`, `dropDistance`, `edgeMargin`, `breachY`, `breachVariable` | Invaders |
| `rotate-thrust` | `turnSpeed`, `thrust`, `drag`, `maxSpeed`, `wrap` | Asteroids |
| `duck` | `trigger`, `bodyHeight`, `visualScaleY` | Endless Runner |
| `melee` | `trigger`, `cooldownMs`, `range`, `damage`, `targetTags` | Arena Survival |
| `snake` | `cols`, `rows`, `cellSize`, `stepMs`, `initialLength`, `bodyPrefabId`, `foodTag`, `scoreVariable`, `scorePerFood`, `loseOnWall`, `loseOnSelf` | Snake |

`ball` moves itself rather than relying on dynamic-body collision, because the current physics zeroes velocity on contact and has no restitution. It reflects off static bodies tagged `paddle` using the contact offset for angle, reflects off other static solids by overlap normal, and depenetrates so it cannot stick inside a paddle or wall.

### 4.4 Runtime state, win and loss

- `Runtime.status` gains `"lost"`.
- `setVariable` treats `won === true` as before and `lost === true` as `status = "lost"`. Rules do the rest: `health <= 0`, `lives <= 0`, `timeLeft <= 0`, `enemies <= 0`, `bricks <= 0`, `coins >= n`, etc.
- `PlayPage`, `SnapshotPlayerPage`, `src/play/player.ts` and the exported player show `LOST` and keep Reset/Restart working. `data-playtest` reports it.
- A loss does not stop the editor document from resetting; `runtime.reset()` returns to the authored initial state, and the saved project is never mutated by Play.
- Restart is verified as: reset restores positions, variables, HUD, spawner timers, fired rules and object count.

### 4.5 Determinism, cleanup and performance

- Spawners, random spawn positions, enemy-fire chances and asteroid shapes use a seeded `mulberry32` stream derived from `Runtime.seed`. Same seed and inputs produce the same run, which the tests assert.
- Spawned objects are capped by `maxAlive`/`limit`; movers with `destroyOffscreen` deactivate on exit. Inactive runtime-spawned objects are compacted so a long endless run cannot grow the object list without bound. The test asserts a bounded count after several simulated minutes.
- No new listeners, timers or RAF loops: everything is driven by `Runtime.step`, so restart cannot duplicate handlers.
- Shape rendering reuses one `Graphics` per object and the existing signature cache. No per-frame display-object creation.

### 4.6 Template selection and creation

- `NewProjectDialog` gains a **Game starters** section above the three genre skeletons, grouped by category with a category filter: All, Arcade, Shooter, Platformer, Sports, Puzzle, Survival.
- Each card shows: generated preview, name, short description, category, one-line mechanics and a `Use template` action. Selecting a card sets the template; the existing Create button creates it. Keyboard focus and `aria-pressed` follow the current template-option pattern.
- `Racing` is listed in the brief's category list but no racing template is specified. The picker renders only categories with templates; no empty or fake Racing card is added. This is recorded as a scope decision, not an omission to hide.
- Game templates keep their tuned resolution, gravity and HUD. The dialog's resolution/gravity overrides are disabled for them with an explanatory note; applying a 1920×1080 override to a fixed-layout arcade game would break it. Genre skeletons keep the existing override behaviour.
- Creation skips `applyStarterVisuals` for all twelve new origins. `seedStarterAssets` can still run for the asset library, but it must not rewrite their visuals.
- The picker builds previews from `buildGameStarterDocument(id, "Preview")`. It does not run Play, and it does not store a second copy of the game.

### 4.7 Editor integration

- Inspector **Appearance**: colour/stroke for primitive visuals, width/height, and a read-only note that composite shapes are authored as a list of primitives.
- Inspector **Body**: `gravityScale`, `collideWorldBounds`, `oneWay` toggles in addition to type/size.
- Inspector **Behaviors**: already generic; the new catalog entries expose speed, cooldown, interval, gap, lives, health, spawn limits and score values. Every exposed param changes the run; tests assert at least one per template.
- Changing a numeric behavior param in the editor and replaying must change behaviour. The test report records the exact param and observed effect per template.

## 5. Template ↔ capability matrix

| # | Template | Category | Key behaviors | Variables / HUD | Win | Lose |
|---|---|---|---|---|---|---|
| 1 | Space Shooter | Shooter | `shooter`, `projectile`, `mover`, `spawner`, `health`, `countdown` | `score`, `health`, `timeLeft` | `timeLeft <= 0` | `health <= 0` |
| 2 | Ping Pong | Sports | `ball`, `paddle`, `ai-paddle` | `leftScore`, `rightScore` | `leftScore >= 5` | `rightScore >= 5` |
| 3 | Platform Jumper | Platformer | `platformer-controller`, `collectible`, `hazard`, `patrol`, rule overlap exit | `coins`, `lives` | reach exit | `lives <= 0` |
| 4 | Endless Runner | Arcade | `platformer-controller`, `duck`, `spawner`, `mover`, `hazard`, `collectible` | `score`, `lives`, `speed` | none (distance score) | `lives <= 0` |
| 5 | Brick Breaker | Arcade | `ball`, `paddle`, `health` (bricks), `collectible`? no | `score`, `lives`, `bricks` | `bricks <= 0` | `lives <= 0` |
| 6 | Flappy Flyer | Arcade | `flap`, `spawner`, `mover`, `hazard` overlap rule | `score`, `best` | none | collision/ground |
| 7 | Arena Survival | Survival | `top-down-controller`, `follow`, `spawner`, `health`, `melee`, `countdown` | `health`, `score`, `timeLeft`, `wave` | `timeLeft <= 0` | `health <= 0` |
| 8 | Snake | Puzzle | `snake` + body prefab | `score`, `length` | `score >= 100` | wall/self collision |
| 9 | Space Invaders | Shooter | `paddle`, `shooter`, `projectile`, `formation`, `health`, `spawner` (enemy fire) | `score`, `lives`, `enemies` | `enemies <= 0` | `lives <= 0` or breach |
| 10 | Maze Escape | Puzzle | `top-down-controller`, `follow` (wall-aware), `collectible`, rules | `dots`, `score` | `dots >= 15` + exit overlap | enemy overlap |
| 11 | Asteroid Field | Shooter | `rotate-thrust`, `shooter`, `projectile`, `mover`, `health` (split) | `score`, `lives`, `asteroids` | `asteroids <= 0` | `lives <= 0` |
| 12 | Falling Objects | Survival | `top-down-controller` (locked Y), `spawner`, `mover`, `hazard`, `collectible`, `countdown` | `score`, `lives`, `timeLeft` | `timeLeft <= 0` | `lives <= 0` |

Scoring is real: points come from `health.scoreOnDeath` (enemies, asteroids, bricks) or `collectible` amounts, not from a decorative HUD widget. Survival timers come from `countdown`, not from a text object pretending to tick.

## 6. Vertical slices

Each slice is end-to-end: document data → behaviors → picker/preview → editor → Play → automated tests → honest report. Per the user's request, tests and build checks were deferred until all twelve templates were implemented; local validation has now been run, while browser gates remain open.

### Slice A — Foundation and Space Shooter

**Why first:** it proves the whole path on one representative game and avoids writing twelve templates against missing systems.

- Add `shape` visuals (schema, renderer, dims, preview), the `lost` status, seeded RNG, and the completed/new behaviors needed by the shooter: `spawner`, `health`, `shooter`, `projectile`, `mover`, `countdown`, plus projectile-hit/score/death handling and inactive-object compaction.
- Add template registry, category metadata, origin ids, preview generator, starter-art opt-out, picker integration and appearance/physics inspector controls.
- Author Space Shooter completely: layered starfield (rects/circles), composite player ship with engine flame, two enemy shapes, asteroid polygons, bullets, explosion prefab particles, HUD, 60 s timer, 3 health, scoring, restart.
- Add `npm test` with `node --import tsx --test`; tests for catalog integrity, shape dims, each new behavior, and a scripted Space Shooter win, loss and reset.

**Gate:** open the picker → preview → create → inspect objects → change player speed and an object colour → Play → move/shoot → destroy enemies and an asteroid → verify score, health, timer → force a loss → Reset → verify state → force a win. `npm run typecheck`, `npm run build`, `npm test`, `npm run check:repo` pass. Browser console clean.

### Slice B — Shooter wave: Space Invaders, Asteroid Field

**Implementation status (2026-11-18):** Both documents and the formation/thrust/splitting runtime behaviors are implemented and covered by automated tests. Kane verified create/Play/HUD, input and immediate restart for both Space Invaders and Asteroid Field, and verified that setting Asteroid Field Pilot turn speed to 0 prevents turning in Play. A longer Space Invaders run reached the normal `LOST` state before Kane's delayed running-state assertion; another run's final console extraction timed out and recorded a `/favicon.ico` 404. The browser acceptance gate remains open for asteroid splitting/scoring, Space Invaders gameplay/editor effects, win/loss and console cleanliness. Slice A's separate Space Shooter gameplay gate also remains open.

- Add `formation`, `rotate-thrust`, asteroid splitting via `health.deathPrefabId/deathSpawnCount`, enemy auto-fire, breach detection, barrier health.
- Author both templates including their win/loss rules and tuned settings.
- Tests: formation reverse/drop/breach, ship rotation/thrust/wrap, split counts, and scripted win/loss/reset for both.
- Gate: the Slice A checklist for each template, plus verifying that changing formation speed and asteroid count changes the run.

### Slice C — Arcade physics: Ping Pong, Brick Breaker, Flappy Flyer

**Implementation status (2026-11-18):** `ball`, `paddle`, `ai-paddle` and `flap` behaviors, all three primitive-only starter documents, catalog/picker integration and focused regression cases have been added. Combined local validation passes; the browser acceptance gate remains open.

- Add `ball`, `paddle`, `ai-paddle`, `flap`, serve/reset, miss variables, pass scoring.
- Author the three templates. Ball must not stick or tunnel; AI must be beatable; Flappy gaps must stay reachable.
- Tests: bounce angles, paddle depenetration, miss/scoring, speed-up cap, AI error, flap impulse and ground loss, scripted win/loss/reset.
- Gate: same checklist; change ball speed and gap size and observe the effect.

### Slice D — Platformer: Platform Jumper, Endless Runner

- **Implementation status (2026-11-18):** `duck` collider/visual scaling and elapsed-time spawner interval ramping are implemented. Platform Jumper and Endless Runner documents, catalog/picker integration and focused regression cases are authored. Combined local validation passes; the browser acceptance gate remains open.
- Author both templates with a short level, five cores, spikes, an exit gated by all five cores, a death zone, bounded obstacle/core spawners and lives.
- Moving platforms patrol as kinematic one-way platforms; the current physics does not carry the player along with them.
- Tests: jump only when grounded, platform landing, core count, hazard lives/respawn, exit win, duck collider height, bounded obstacle cleanup, scripted win/loss/reset.
- Gate: same checklist; change jump force, gravity and obstacle interval and observe each effect.

### Slice E — Top-down survival: Arena Survival, Falling Objects, Maze Escape

- **Implementation status (2026-11-18):** tag-based/grid-aware `follow`, action-triggered `melee`, progress-driven `exit-gate`, Arena Survival, Falling Objects and Maze Escape documents, picker integration and focused regression cases are authored. Combined local validation passes; the browser acceptance gate remains open.
- Author the three templates: arena with pursuers and a 60-second timer, falling hazards/bonuses with three lives, and a 15-dot maze whose wall-blocking exit opens at the threshold.
- Fixed-lane movement uses the top-down controller's locked Y axis; contact damage uses health tags and invulnerability.
- Tests: pursuit respects walls, contact cooldown, melee kill/score, spawner caps, collectible exhaustion, exit gating, scripted win/loss/reset.
- Gate: same checklist; change enemy speed, player health and spawn interval and observe each effect.

### Slice F — Grid puzzle: Snake

- **Implementation status (2026-11-18):** fixed-interval grid movement, queued non-reversing turns, prefab body segments, seeded food relocation, growth, wall/self loss and score-threshold win are implemented. The 20×15 Snake document, picker integration and focused regression cases are authored. Combined local validation passes; the browser acceptance gate remains open.
- Author the 20×15 board, start length 3, 10 points per food, 100-point win.
- Tests: fixed step timing, no reverse, no food inside the snake, growth, wall/self loss, win at 100, reset restores length 3, bounded body objects.
- Gate: same checklist; change `stepMs`, grid size and food score and observe each effect.

### Slice G — Full acceptance and documentation

- **Local validation complete:** `npm test` (30/30), `npm run typecheck`, `npm run build`, and `npm run check:repo` pass. The build emits existing dependency/chunk warnings.
- Browser acceptance is still required: run the Part 4 checklist for all twelve templates, record pass/fail and deviations, and verify editor-to-Play changes, win/loss/reset, and console behavior. No browser/Kane run was made in the combined local validation.
- Verify Play from the picker, editor inspection, editor modification → Play, win, loss, restart, share/snapshot and export/import for at least one representative template from each slice (not necessarily all twelve for share/export, but every template for load/play/win/loss/restart/editor-modification).
- Write `docs/game-template-test-report.md` with the matrix and evidence.
- Update `docs/game-templates.md`, `docs/implementation-log.md`, `docs/known-issues.md` and `features.md`. `features.md` admits a template only when its checklist is fully verified.

## 7. Test strategy

**Runner:** Node's built-in test runner with `tsx` (`node --import tsx --test`). No new dependency. Add `"test"` to `package.json`.

**Template integrity** (`tests/game-templates.test.ts`):
- all twelve ids present exactly once, each with label, category, blurb, mechanics and accent;
- each built document passes `projectDocumentSchema`;
- start scene exists, scene/prefab/rule references resolve, HUD variables exist, behavior types are in the schema and catalog;
- no `sprite` or `tilemap` visuals and no asset references, so the primitive-only rule is enforceable;
- every variable named by a rule or behavior exists with a sensible initial value;
- deterministic object counts for a given build (ids excluded).

**Behavior logic** (`tests/runtime-behaviors.test.ts`): each new behavior in a minimal fixture — projectile hit/damage/score/destroy, health invulnerability and death, spawner interval/limit/seed, ball bounce/miss/serve, formation reverse/drop/breach, wrap, flap, duck, melee, countdown, snake growth/collision.

**Per-template playtests** (`tests/game-start-playtests.test.ts`): a driver that constructs `Runtime`, steps fixed frames with scripted `InputFrame`s, asserts the win path, the lose path, the reset state and a bounded object count. It uses the same runtime as Play. It does not render.

**Manual/browser:** the only proof of rendering, input, editor modification, HUD, export and share. Each template's report row lists the twelve Part 4 checks. Screenshots are captured as evidence in the ignored `.data/` directory, not committed.

**Performance:** measure Play FPS with the debug overlay for the busiest template (Space Shooter or Arena Survival) and assert in tests that object counts stay bounded and step time does not grow over a long simulated run.

## 8. Documentation deliverables

- `docs/game-templates.md`: per template — scene/layer map, objects, prefabs, variables, behaviors and their tuning parameters, win/loss rules, and "how to customise" steps.
- `docs/game-template-test-report.md`: per-template matrix (load, objects, start, controls, physics/collisions, rules, spawning/cleanup, win, lose, restart, editor modification, no runtime errors) with evidence dates and any deviation.
- `docs/implementation-log.md`: one entry per slice with commands, browser evidence and honest gaps.
- `docs/known-issues.md`: the loss state, touch limitations, Racing category decision, moving-platform carrying, and anything unverified.
- `features.md`: only verified templates and picker behaviour, after each slice gate.

## 9. Risks and decisions

| Risk / decision | Plan |
|---|---|
| No automated tests exist at all. | Slice A adds the runner and the first tests; no template is considered started without its tests. |
| Ball physics is hand-rolled. | Keep it in one behavior, sweep movement, clamp and depenetrate; dedicated tests for stuck/tunnel cases. |
| Snake is the least reusable behavior. | Isolate it in `game-starters/snake.ts` plus a runtime module; keep gameplay data in the template. |
| `TEMPLATE_ORIGINS` grows by twelve. | Old documents remain valid; labels, filters and covers are updated centrally. Grouping in the filter can follow later. |
| Starter SVG art would overwrite primitives. | Hard opt-out for the twelve origins, covered by a test. |
| Racing has no specified template. | No Racing card until a racing starter is requested; the category filter renders only non-empty categories. |
| Touch movement is not supported by the engine (pointer maps to `action` only). | Templates inherit keyboard + click-to-action; no virtual joystick is invented. Recorded in known issues. |
| Moving platforms do not carry the player in the current physics. | Use patrol/kinematic platforms; if carrying is not added, document it and keep the platform optional as the brief allows. |
| 60-second games are too slow for tests. | Step the runtime directly; Play stays real-time. Manual runs use the real clock for timing evidence. |
| Previews could drift from the real scene. | Generate previews from the built document, not hand-drawn art. |

## 10. Definition of done

- Twelve templates selectable from the picker, each a valid editable project with primitive-only visuals.
- Each template loads, plays with the documented controls, scores, wins, loses and restarts correctly.
- Editor changes to colour, speed, physics, spawning and score values demonstrably affect Play.
- Each template has automated tests for its core rules and a browser report row covering the twelve Part 4 checks.
- `npm run typecheck`, `npm run build`, `npm test` and `npm run check:repo` pass.
- Existing template, Play, AI Play, export and snapshot paths still work.
- Documentation and known issues are current, and any deviation is stated rather than smoothed over.
