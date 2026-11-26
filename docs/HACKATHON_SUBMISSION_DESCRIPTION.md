# Clockwork

**A browser-native 2D game engine where the AI works inside the editor — and a real browser agent proves the game runs.**

---

## What it is

Clockwork is a complete 2D game-making environment that runs in the browser. You open it, pick one of fourteen playable genre starters or start from a blank scene, and edit a real game: scenes, sprites, tilemaps, collision, behaviours, rules, variables, prefabs, HUD and audio. When you are done, you play it, export it as a standalone zip, or publish a read-only share link.

The difference is that an AI agent sits *inside* the editor rather than beside it. It sees your scene, your selection and your revision, and it changes the game using the same 57 commands your mouse and keyboard use. Every AI edit is a reviewable change set with one undo entry. Nothing is generated behind your back, and nothing is a one-way code dump.

Clockwork also closes the loop most AI game tools leave open: it can test the game it helped you build, in a real Chrome browser, with evidence.

---

## The problem

Three gaps make AI-assisted game creation frustrating today:

1. **Starting is expensive.** A blank engine is weeks of plumbing before anything moves. Tutorials teach the tool, not the game.
2. **AI output is not editable.** Code generators produce files that must be reviewed, wired and debugged. Chat-based level generators produce text you cannot drag on a canvas.
3. **Nobody tests the result.** A generated game that has never been played is a demo, not a game. Manual playtesting does not scale, and screenshot-based agents cannot reliably tell whether a win condition was reached.

Clockwork attacks all three: playable templates, an agent that operates the editor's own vocabulary, and Kane CLI driving a real browser against a frozen snapshot.

---

## How it works

**Create.** Choose from 14 genre starters (space shooter, space invaders, asteroid field, ping pong, brick breaker, flappy flyer, platform jumper, clockwork meadows, meadow sandbox, endless runner, arena survival, falling objects, maze escape, snake), three classic templates (platformer, top-down, puzzle), a blank scene, or describe the game you want and let the agent build a first pass.

**Edit.** The editor has four workspaces: Scene (PixiJS canvas, hierarchy, inspector, gizmos, snapping, layers, undo/redo), Content (assets, slicing, animation clips, tilemaps, prefabs), Logic (variables and rules with five condition and eight action types), and Presentation (gravity, input map, audio, HUD, messages). Every operation is a command, so manual edits and AI edits share one revision history.

**Ask.** The agent drawer has three modes. **Ask** reads and explains. **Build** applies an atomic batch of commands guarded by the expected revision; one batch is one undo. **Plan** previews violet ghost bounds and a change-set summary, and applies nothing until you say so. Agent-touched objects are outlined and labelled, and your selection is never taken away.

**Test.** Kane is used in four ways. Every game has a Test Mode: 13 genre starters have built-in profiles, and any other project (Meadow Sandbox, the classic templates, Blank, your own) gets a profile derived from the project itself.
- **Agent verification in chat** — the agent calls `verify_with_kane`, `run_ai_play` or `run_kane_test_phase` after it edits, and the typed result returns to the conversation. This is the closed loop described below.
- **AI Play** — one click. Clockwork snapshots the game, generates a goal from the actual document (collect the coins, reach the win state), and Kane drives Chrome through the snapshot's AI HUD. If a collectible is embedded in a wall, Clockwork's deterministic repair lifts it out, replays the same seed, and shows the fail→pass evidence. You can undo the fix.
- **AI Testing** — describe a goal, review a proposed plan of phases with assertions and budgets, approve it, then run phases that advance the game frame by frame and return typed verdicts joined to input receipts and observations.
- **Saved engine E2E** — a terminal command runs a saved Kane test against the editor itself: create a Platform Jumper project, edit and undo a value, play, restart, and return to the editor. It is developer/CI tooling, not a product button.

**Ship.** Export a zip containing a standalone player, the project document, assets and a README. Or create an expiring read-only link that plays the exact snapshot used for testing.

---

## Why it is different

**The agent is a first-class editor user, not a code generator.** It emits the same commands the UI dispatches — `object.update`, `rule.add`, `prefab.instantiate`, `tilemap.paint` — with a revision guard, all-or-nothing validation and a single undo entry. That is why its changes look and feel like yours.

**Testing is honest by construction.** A pass is never inferred from an exit code. It requires a terminal run result, matching assertions, at least one genuinely delivered input where a control was used, a frame count inside budget, and an evidence bundle. Anything missing is `inconclusive`, not green.

**The browser agent gets a fair fight.** A slow agent cannot play a 60 fps game in real time. Clockwork's Test Mode freezes the simulation, exposes labelled controls, advances a bounded number of frames per action, and records an input receipt for every press. Testing a real-time game becomes deterministic without changing the game.

**Built for the browser, end to end.** Projects and assets live in IndexedDB. Rendering is PixiJS. The server is a small Hono process for model streaming, snapshots, player bundling and the Kane bridge. There is nothing to install to make a game, and the exported player needs no Clockwork server.

**The result feeds back to the agent.** A verdict from Kane, whether from a chat check or an approved review-panel phase, goes back into the agent loop. The agent can report it or repair the project and check again.

---

## The closed loop, on a real run

Run `a20a4b28-5387-4849-a978-a5ca5aa499c3` (2026-11-25) used the in-app chat agent on a Meadow Sandbox project, which starts with no coins, score or HUD.

1. The user asked the agent to add coins tagged `coin`, +1 score per coin and a SCORE HUD, then verify with Kane.
2. The agent applied the changes: 6 coins, a score variable and a Score HUD widget.
3. It ran a headless preflight, then called `verify_with_kane`.
4. The check ran first in the engine simulator, then once in a real browser through Kane.
5. It passed at project revision 9: SCORE 0 → 1, COIN COUNT 6 → 5, COLLECTED 0 → 1, PLAYER X 240 → 473.67 after holding MOVE RIGHT for 45 frames. The simulator and the browser agreed on every readout.

Evidence is served locally at `/api/kane/runs/a20a4b28-5387-4849-a978-a5ca5aa499c3/evidence`.

The run also showed two agent faults, both fixed. The user had to send a follow-up message before Kane ran because the agent used its whole 8-step budget, and the agent re-added a HUD widget it could not see. The chat agent now gets 12 steps per message, reserves the last 3 for a requested Kane check, and sees HUD widgets in its context.

---

## Scope and limitations

- Phase results and idempotency state on the server are in memory and clear on a server restart.
- Saved-test replay for phases is wired in, but no phase replay speedup has been measured yet.
- Kane limits depend on the path. Defaults are 180 s and 40 steps. `verify_with_kane` takes 180 s by default and min(40, 6 + 2 per step + 2 per readout) steps. AI Play takes at most 140 s and 8 steps. An approved phase takes at most 600 s and 12 steps, with at most 3 phases.
- The saved engine E2E is a terminal command, not a CI service.
- Engine QA run K2 passed on 2026-11-26 after the undo-history fix it exposed (see below).

---

## What was verified, and how

Clockwork's own editor was tested by Kane as an end-user would use it. Kane opened projects, skipped the tour, used the View menu, selected objects in the hierarchy, read inspector values, pressed arrow keys, undid and redid edits, reloaded to confirm persistence, drove the agent to apply a repair, clicked to steer a player to a win, and invoked the in-app verification card. Those runs found real defects — a non-collapsible inspector, unsafe hierarchy rows, a missing duration on the verification card, Build accepting a request with no model configured, and undo history lost after Play. All were fixed; the first three were rechecked by passing runs, and the no-model fix was verified at the API level plus by later agent runs on the same path. Runs K1, K2, K3a, K3b, K4 and K5 passed against the real editor. K2 caught two product defects on the agent path: Build accepting a request with no model configured, and undo history being cleared when returning from Play. Both are fixed, and K2 then passed in session `bded0577` (Air jumps 0 → 1, a second mid-air jump in Play, and one Undo back to 0).

The AI Play loop was demonstrated on a deliberately seeded defect: a coin embedded inside a solid body. The first run failed with evidence; the deterministic repair moved the coin, the same seed was replayed, and the second run passed. Both evidence packs are recorded in the repository.

The approved-phase AI Testing flow then passed live three times on Space Shooter. Run `b967bbdd` was agent-driven and passed in 79.7 s (shots-fired 3, projectiles 3, accepted inputs 1, 45 frames). Run `98e21783` was approved in the panel and returned a typed PASS with both assertions matching (`shots-fired` 3, `projectiles` 3), one accepted input, 45 frames, 94.7 s, a 721,305-byte evidence bundle and no console or page errors. Run `ea1bb3b3` repeated it in 78.1 s. Both are different runs from `b967bbdd` and are recorded in `docs/kane-proof.md`.

A newer saved engine E2E test passed on 2026-11-24: it created `Engine E2E Platformer` from the Platform Jumper starter, verified canvas/hierarchy/Inspector, edited and undid Object Y, played with `LIVES 3`, restarted with R, and returned to the editor in 286 s (1/1 authored steps). The one-command wrapper then cold-started the app and replayed the same test in 89 s (1/1 replayed steps), and shut the app down cleanly. The test deliberately avoids click-to-move because a canvas click steers the Jumper into spikes.

The test suite covers the document model, command validation, the genre starters, runtime behaviours, the test controller, phase verdicts, snapshots, export and the agent's executor. 176 tests across 27 test files pass, type-check passes, and `pnpm check:repo` passes. The app has been exercised in Chrome throughout.

---

## Who it is for

- **Newcomers** who want to see something move today and learn by editing a working game.
- **Indie developers and game jam teams** who need a fast prototyping loop for 2D mechanics.
- **Educators and studios** exploring human-in-the-loop AI authoring where every change is inspectable.
- **Tool builders** interested in browser-agent testing with deterministic time and evidence.

---

## Under the hood

React 19 and PixiJS 8 on the client; a Zod-validated document model with 57 commands and Immer-backed undo; a custom fixed-step runtime with 26 behaviour types, sub-stepped collision and merged tilemap colliders; IndexedDB persistence; a Hono/Node server for OpenAI-compatible model streaming, immutable snapshots, esbuild player bundling and Kane CLI orchestration; a test vocabulary of 13 built-in game profiles plus profiles derived from any project, typed verdicts and per-criterion reports; and a saved `testmd` engine E2E with a one-command dev runner.

Clockwork is a focused, local-first 2D engine with an AI collaborator that can be reviewed, undone, and tested. It has no cloud sync, multiplayer, or 3D.
