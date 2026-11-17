# Kane evidence ledger

This file records real Kane runs only. Fixture output is labelled as fixture output.

## Environment

| | |
|---|---|
| Date | 2026-11-17 |
| Branch | `verify/kane-e2e` |
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

The one-coin reduced fixture exercised the real Kane CLI and the real product path.

- Fixture: one `Core A` coin embedded in `Ground`, one nearby `Relay`, win rule adjusted to `coins >= 1`.
- First attempt: **failed** in 154.6 s (14 steps). Kane reached the scene but could not collect the embedded coin; the `status == WON` assertion failed.
  - Evidence: `.data/ai-play/c062a3d4-e98b-4e4e-9110-28c25565eece/evidence.evidence`
- Fix: `repairAiPlayFailure` returned `Move Core A out of Ground`, one `object.update` to `(260, 787)`.
- Second attempt: **passed** in 109.2 s (18 steps), `COINS: "1"`, `STATUS: "WON"`, `LAST_ERROR: "none"`.
  - Evidence: `.data/ai-play/159ac555-2d2a-4584-b940-6301d488b6df/evidence.evidence`
- Reproduce: `node --import tsx scripts/kane/ai-play-smoke.ts` (requires `KANE_ENABLED=1`, `KANE_AI_PLAY_ENABLED=1`, and a running server).

### Full Neon Runner AI Play (speed pass)

- The demo and objective were tightened to reduce Kane steps/credits: `Core A` is seeded inside `Ground` near spawn, `Core B/C/Relay` form a short straight run, and the objective is reduced to move + 3 s wait + one final WON/COINS/LAST ERROR assertion (no STOP/win polling). AI Play requests are capped to 50 s / 6 steps.
- `server/kane/runner.ts` now preserves `run_end.status === "passed"` / `reason: "Objective completed"` instead of misclassifying a successful run as cancelled/failed from exit code.
- Real attempt 2 run `15aeddda-be39-492a-b9c9-d741bc5446d3` (snapshot `HjvoNybqcTpGRQ`, 2026-11-17): `run_end.status: "passed"`, `result_code: 100`, `reason: "Objective completed"`, 68.3 s, 6 steps, final state `STATUS: "WON"`, `coins: "3"`, `last_error: "none"`.
  - Raw: `.data/ai-play/15aeddda-be39-492a-b9c9-d741bc5446d3/raw.ndjson`
  - Evidence: `.data/ai-play/15aeddda-be39-492a-b9c9-d741bc5446d3/evidence.evidence`
  - Note: this run was recorded as `cancelled` in `result.json` before the classification fix; the NDJSON terminal event is the source of truth.
- A full two-attempt UI fail→repair→pass loop under 180 s was **not re-verified** after the final speed changes because subsequent real Kane runs in this environment exited without `run_end` (cancelled/early exit) under low-memory/Chrome pressure. Treat the full-demo loop as improved but not freshly proven in this pass.

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

- The full Neon Runner AI Play fail→repair→pass loop has not been freshly re-verified end-to-end under 180 s after the latest speed changes. One real attempt reached `run_end.status: "passed"` in 68.3 s (see above), but later runs in this environment were unstable (no `run_end`, early exit / Chrome pressure).
- K2–K5 were not executed against real Kane in this pass. Their objectives remain in `scripts/kane/objectives/`.
- The reduced-fixture AI Play smoke is the strongest verified closed-loop proof; the full demo is a speed-optimized path, not a newly recorded green two-attempt run.
- Evidence packs and run NDJSON stay untracked under `.data/` and `.testmuai/` as intended.
