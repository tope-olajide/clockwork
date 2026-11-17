# Kane evidence ledger

This file records real Kane runs only. Fixture output is labelled as fixture output.

## Environment

| | |
|---|---|
| Date | 2026-11-17 |
| Branch | `verify/kane-e2e` (Slice 10 uncommitted) |
| Kane CLI | 0.10.5, signed in as `davidtheatomicshift` |
| Browser | local Chrome, 1366×768 viewport |
| Clockwork origin | `http://localhost:5173` |
| Model | `LLM_MODEL` / `LLM_BASE_URL` / `LLM_API_KEY` from `.env.local` |
| Node | 24.13.0 |

## Bar 1 — the app works end to end

| Flow | Result | Evidence |
|---|---|---|
| Projects → editor → select Player → inspector fields | **passed** | K1 below |
| Move twice + undo twice + reload persistence | **passed** | K1 below, `object_x: "160"` after reload |
| Manual Play without a model or Kane | prior fixture/browser checks | No real-runtime claim added here |
| Share/export | not rerun in Slice 10 | recorded as a gap |

### K1 — editor persistence (real Kane)

- Command: `sh scripts/kane/run-objective.sh scripts/kane/objectives/k1-editor-smoke.txt http://localhost:5173`
- Result: `run_end.status: "passed"`, 303.6 s, 62.79 credits.
- Final state: `object_x: "160"`, `player_visible: "true"`, `editor_open: "true"`.
- Session: `C:\Users\Temitope\.testmuai\kaneai\sessions\010fb663-9351-4a66-8036-cc8d8197b386`
- Test Manager: recorded in `.testmuai/runs/k1-editor-smoke.ndjson`.
- Fixed while running this flow: the inspector stayed collapsed at 1366 px after selecting an object; the hierarchy row was exposed as a generic button containing a nested Delete button, which Kane could mistake for the row action. Rows are now `treeitem`s labelled `Select <name>`, and selecting an object opens the inspector at `wide`.

## Bar 2 — Kane caught or proved something

### AI Play closed loop (real Kane, reduced fixture)

The full Neon Runner demo is useful but too slow for a tight loop: Kane's per-step agent latency made each attempt exceed the run cap while it waited for a win that the embedded coin prevented. The same product path was therefore exercised against a one-coin fixture snapshot, with the real Kane CLI and real evidence.

- Fixture: one `Core A` coin embedded in `Ground`, one nearby `Relay`, win rule adjusted to `coins >= 1`.
- First attempt: **failed** in 154.6 s (14 steps). Kane reached the scene but could not collect the embedded coin; the `status == WON` assertion failed.
  - Evidence: `.data/ai-play/c062a3d4-e98b-4e4e-9110-28c25565eece/evidence.evidence`
- Fix: `repairAiPlayFailure` returned `Move Core A out of Ground`, one `object.update` to `(260, 787)`.
- Second attempt: **passed** in 109.2 s (18 steps), `COINS: "1"`, `STATUS: "WON"`, `LAST_ERROR: "none"`.
  - Evidence: `.data/ai-play/159ac555-2d2a-4584-b940-6301d488b6df/evidence.evidence`
- Reproduce: `node --import tsx scripts/kane/ai-play-smoke.ts` (requires `KANE_ENABLED=1`, `KANE_AI_PLAY_ENABLED=1`, and a running server).

### Engine QA K1–K4

| Objective | Verdict | Notes |
|---|---|---|
| K1 editor smoke | **passed** | real run above |
| K2 agent double jump | not run | agent/model path not driven with Kane in this pass |
| K3 agent repair | not run | same |
| K4 agent ↔ Kane handshake | not run | same |

K1 exposed two real UI/accessibility defects (collapsed inspector; unsafe hierarchy-row semantics), both fixed before the passing run. No product bug is claimed from the AI Play fixture.

## Bar 3 — agent and Kane talked to each other

- In-app AI Play panel: fixture-driven fail → repair → retry smoke passed earlier; real API path verified above.
- In-app `KaneRunCard`: implemented, not driven in a real agent turn in this pass.
- Server NDJSON and evidence copies: verified by K1 and the AI Play smoke.

## Reproduction commands

```bash
# Real engine QA (fastest current objective)
sh scripts/kane/run-objective.sh scripts/kane/objectives/k1-editor-smoke.txt http://localhost:5173

# Real AI Play fail → repair → pass on the reduced fixture
node --import tsx scripts/kane/ai-play-smoke.ts

# Full demo path (slow; not currently a pass gate)
# http://localhost:5173/?demoReset=1 → Neon Runner → AI Play
```

## Limitations

- The full Neon Runner AI Play demo has not produced `run_end.status: "passed"`. Its per-step latency plus the embedded-coin objective exceeds practical time/credit limits; do not describe it as verified.
- K2–K5 were not executed against real Kane. Their objectives remain in `scripts/kane/objectives/`.
- The AI Play fixture is a real Kane run over a reduced scene, not a product demo pass.
- Evidence packs and run NDJSON stay untracked under `.data/` and `.testmuai/` as intended.
