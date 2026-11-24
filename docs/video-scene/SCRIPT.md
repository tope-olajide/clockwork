# Clockwork video — "Don't trust me. Trust Kane." (I am the LLM)

You asked for real proof with the AI agent + Kane, not a mock tour. This scene IS that:
I played the LLM. Fixture Kane + real Chrome did the browser work. Zero LLM cost to record,
same code path as your paid runs.

Play it: open `docs/video-scene/index.html` (auto-advance) or `scene.gif`.

## The standout story (3:45)

**Title card:** CLOCKWORK — the engine with a co-worker inside it.

### 0:00 HOOK — frame 01-projects.png
LLM (me): "I am the LLM inside Clockwork. You built a game. I know this game — and I can prove it works."
You: "Most demos show you a pass. I'll show you a fail my engine caught, fixed, then proved."

Cut to your REAL evidence (no re-record needed):
- `.data/ai-play/87f6f320.../evidence.evidence` FAILED → repair `Move Core A out of Ground` → `646cff5d...` PASSED `STATUS WON, coins 3`.
- Phase 3 live run `b967bbdd`: passed, 1 input, 45 frames, shots 3 / projectiles 3 + Test Manager link.

### 0:30 I KNOW YOUR GAME — frame 02-editor.png
LLM (me): "Space Shooter. I read its document: scenes, objects, rules. And its test profile: SHOOT is hold, 190ms cooldown — a pulse would never fire."
Show: `src/engine/model/game-test-profiles.ts` space-shooter profile, tool cards `get_scene` + `get_game_test_profile`.
Line that kills generic-chatbot demos: "I don't guess controls. The profile forbids inventing actions."

### 1:10 I DRAFT, YOU APPROVE — frame 03-draft.png
LLM (me): "Prove firing creates a projectile → typed plan: phase fire-creates-projectile, assertions shots-fired gte 1, projectiles gte 1, budget 45 frames / 12 steps / 600s. Nothing runs until you approve."
Show approval boundary: `TestPlanPanel`, `propose_test_plan` validates against profile + revision.

### 1:50 I FREEZE IT — frame 04-approved.png
LLM (me): "Approved. I snapshot your revision, freeze seed 1234, hand Kane a Test Mode URL. Time moves ONLY when Kane presses STEP."
Show: `POST /api/snapshots` → `/s/<id>?ai=1&testMode=step&seed=1234`, TestController lockstep, input receipts.

### 2:20 KANE PROVES IT — frame 05-passed.png
LLM (me): "Kane held SHOOT, stepped 45 frames: shots-fired 5, projectiles 4, accepted inputs 3. PASS — inputs delivered, frames in budget, evidence attached."
Show the strict join from `server/kane/phase.ts`: `run_end` + assertions + input receipts + frame budget + `.evidence` bundle, or INCONCLUSIVE. "Exit code alone is never a pass."

### 3:00 I CLOSE THE LOOP — frame 06-agent.png
LLM (me): "And the result lands back in my chat as a typed `run_kane_test_phase` result — PASSED, checks, evidence link — so I decide what to test next."
Show agent drawer rich card: `shots-fired gte 1 · observed 5 · passed`, `Accepted inputs: 3 · Frames: 45`, `Open evidence`.

**End card:** Build it. Prove it. Ship it. — Clockwork + Kane CLI

## How to record voiceover (10 min)

1. `npx vite docs/video-scene --port 5213` or just double-click `index.html`, hit Play, screen-record with Xbox Game Bar (Win+G).
2. Read the LLM lines above verbatim — that IS the agent talking.
3. For "real proof" B-roll: scroll `docs/kane-proof.md` Phase 3 + open one Test Manager link for 5 seconds. Say: "Same route, same judge, paid run."
4. Disclose once: "Motion captured with fixture Kane + mock planner, zero credits. Verdicts shown are real paid runs."

## Files

- `01-projects.png` … `06-agent.png` — recorded this session via `scripts/kane/scene-record.mjs` (fake-kane + AI_MOCK + real headless Chrome 1366×768)
- `scene.gif` — 6-frame cut for README / hackathon page
- `index.html` — narrated player (this script's voiceover text built in)
- `cues.json` — frame → LLM line mapping
