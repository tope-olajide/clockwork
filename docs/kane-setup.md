# Kane CLI in Clockwork

Clockwork uses Kane in two places, both through the same CLI:

1. **Engine QA** — Kane drives the Clockwork editor in a real Chrome window, verifies the app's flows, and captures evidence.
2. **AI Play** — Kane plays a saved game snapshot through the visible AI HUD. The editor reads the `run_end` verdict and the auto-fix agent repairs the game, then Kane replays the same seed.

The integration is built around Kane's documented NDJSON contract. Clockwork never scrapes terminal prose and never treats a progress step as a verdict: only `run_end.status === "passed"` is a pass.

## 1. Install and sign in

```bash
npm install -g @testmuai/kane-cli
kane-cli --version
kane-cli whoami
kane-cli balance
```

Clockwork's server resolves the CLI in this order:

1. `KANE_CLI` (a path, a `.mjs`/`.js` fixture, or a command).
2. The npm global package entry (`@testmuai/kane-cli/bin/kane-cli.cjs`) on Windows/macOS/Linux.
3. `kane-cli` / `kane-cli.cmd` on `PATH`.

On Windows, the npm global directory is normally `%APPDATA%\npm`. The server invokes the Node entry directly so objective text is passed as an argument array, never interpolated into a shell string.

```bash
# If kane-cli is not on PATH in Git Bash:
export PATH="$APPDATA/npm:$PATH"
```

Never put the Kane token in the repository, browser, or a prompt. Clockwork's Settings → AI Models → Kane card renders only the account name, version, flags, and evidence folder.

## 2. Server flags

Copy `.env.example` to `.env` (or export these before `npm run dev`):

```bash
# Kane is built in and enabled by default; no feature flag is needed.
# Omit KANE_HEADLESS to watch Chrome. Set 1 for CI.
# KANE_HEADLESS=1
KANE_TIMEOUT_SECONDS=180
KANE_MAX_STEPS=40
KANE_CLI=kane-cli
# Public origin the Kane browser must open. In dev this is Vite, not the API.
CLOCKWORK_PUBLIC_URL=http://localhost:5173
```

The 180 s default fits an 8-step AI Play attempt but not a 12-step in-app engine-QA run: the K4 reruns here used `KANE_TIMEOUT_SECONDS=300` (configuration, not a code change). The runner clamps the value to 30–900 s and adds a 5 s grace on top of the process timer.

Kane has no enable/disable flag. If the CLI is missing or signed out, the Kane routes return an explicit install/auth error and no Kane tool is advertised to the model. Manual Play, editing, persistence, share, and export continue to work. If the account balance is zero, the run is rejected with an explicit `kane-credits` error.

`AI_MOCK=1` only mocks the model. It does not mock Kane.

## 3. Start Clockwork

```bash
npm run dev
# Projects: http://localhost:5173
# API:      http://localhost:3000
```

Health and readiness:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/kane/status
```

The status route caches for 20 seconds because `whoami` performs a real CLI check. Use `?refresh=1` after changing accounts.

## 4. The exact Kane command

Engine QA and AI Play use one runner (`server/kane/runner.ts`):

```bash
kane-cli run "<objective>" \
  --url "<snapshot player URL>" \
  --agent \
  --mode testing \
  --max-steps 40 \
  --timeout 180 \
  --assertion-mode dom \
  --final-validation off \
  --skip-code-validation \
  --bug-detection off
```

- `--final-validation off` is deliberate: every objective already ends in explicit assertions, and the synthesized checkpoint costs another agent step (and credits) per run.
- Engine QA uses `--bug-detection continue` so a confirmed bug is recorded while the remaining steps run.
- AI Play uses `--bug-detection off`: a game-design failure is not a product bug.
- AI Play always targets an immutable snapshot (`/s/<id>?ai=1&seed=1234`), never the editor with IndexedDB state.
- A saved-test replay uses `kane-cli testmd run <file>` with `--no-adaptive-heal`, so a replay failure fails fast instead of re-authoring steps.
- `KANE_HEADLESS=1` adds `--headless`; leave it unset for a demo so the audience sees Chrome play.
- The objective is capped at 1,000 characters and the URL is formed server-side. The client cannot pass an arbitrary command, base URL, or key.

### Exit codes

| Exit | Meaning | Clockwork handling |
|---|---|---|
| `0` | passed | `run_end.status` must also be `passed` before the UI says KANE VERIFIED |
| `1` | ran and failed | the panel shows the failed attempt and the evidence |
| `2` | never started (auth/URL/Chrome) | error card with `kane-auth` / `kane-missing` |
| `3` | timeout or cancelled | cancelled result; no pass is claimed |

`run_end` is parsed by `type`, never by line position. Progress events are typeless and only render the live step list. The raw NDJSON is saved at `.data/ai-play/<runId>/raw.ndjson`; the evidence pack is copied to `.data/ai-play/<runId>/evidence.evidence` and `result.json`.

## 5. AI HUD contract

Open any snapshot with `?ai=1&seed=1234` to get the DOM control surface Kane uses:

- Buttons: `MOVE LEFT`, `MOVE RIGHT`, `JUMP`, `ACTION`, `STOP`, `RESTART`.
- Movement toggles show `ON` / `OFF` and expose `aria-pressed`.
- State labels (plain values, no fractions): `STATUS`, `SCENE`, `COINS`, `HEALTH`, `TIME`, `SEED`, `LAST ERROR`.
- `STATUS` is one of `PLAYING`, `WON`, `LOST`, `ERROR`, `PAUSED`.
- `LAST ERROR` is `none` unless the runtime names a failing object.
- Manual keyboard input still works; AI mode changes controls, not gameplay rules.

The AI Play objective is generated from the snapshot: it uses the actual HUD label for coins, the scene's win variable, and the visible HUD controls. It ends with:

```text
Store the text next to "STATUS" as "status".
Store the text next to "COINS" as "coins".
Store the text next to "LAST ERROR" as "last_error".
Assert status is "WON".
Assert coins is "3".
Assert last_error is "none".
```

See `docs/ai-play.md` for the full retry policy.

## 6. Evidence

After a run:

```bash
kane-cli evidence serve .data/ai-play/<runId>/evidence.evidence
```

The AI Play panel's **Open evidence** downloads the sealed pack from `GET /api/kane/runs/:runId/evidence`. `GET /api/kane/runs/:runId` returns the parsed result. Evidence is gitignored and never committed.

For a terminal-only run:

```bash
kane-cli run "$(cat scripts/kane/objectives/k1-editor-smoke.txt)" \
  --url "http://localhost:5173" \
  --agent --headless --timeout 240 \
  > .testmuai/runs/k1.ndjson
jq -c 'select(.type == "run_end")' .testmuai/runs/k1.ndjson
```

## 7. Engine-QA runbook

Make sure Vite is running and the demo is reset:

```bash
open "http://localhost:5173/?demoReset=1"
```

Then run the objectives in `scripts/kane/objectives/`:

```bash
bash scripts/kane/run-objective.sh scripts/kane/objectives/k1-editor-smoke.txt http://localhost:5173
bash scripts/kane/run-objective.sh scripts/kane/objectives/k3a-repair-win.txt "http://localhost:5173/?demo=1"
bash scripts/kane/run-objective.sh scripts/kane/objectives/k3b-undo-redo.txt "http://localhost:5173/?demo=1"
bash scripts/kane/run-objective.sh scripts/kane/objectives/k4-kane-handshake.txt "http://localhost:5173/?demo=1"
# K2 and the older single-flow K3 are kept for reproduction:
bash scripts/kane/run-objective.sh scripts/kane/objectives/k2-agent-double-jump.txt "http://localhost:5173/?demo=1"
bash scripts/kane/run-objective.sh scripts/kane/objectives/k3-agent-repair.txt "http://localhost:5173/?demo=1"
```

The script writes `.testmuai/runs/<objective>.ndjson` and `.stderr.log` and prints the parsed `run_end`. Keep the objective to one flow: Kane splits a long objective into independent runs, and a fresh flow re-seeds the demo, so state (undo history, an applied edit) does not cross the boundary.

K2–K4 require a configured tool-capable model for the agent portion. AI Play (K5) does **not** require a model for the deterministic auto-fix path, but a real product demo should disclose that the repair is the built-in Clockwork repair policy unless the agent's `run_ai_play` tool is being used with a model.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `kane-missing` / status `installed: false` | `npm install -g @testmuai/kane-cli`, then refresh status |
| `kane-auth` | run `kane-cli login` yourself; never paste a token into chat |
| Browser opens the wrong origin | set `CLOCKWORK_PUBLIC_URL` to the Vite/player origin |
| `run_end` missing with exit 2 | check `kane-cli whoami`, Chrome, and the URL; the run never started |
| AI Play says snapshot unavailable | create a new snapshot; snapshots expire and are capped at 20 MB |
| Agent tool missing | check that the model supports tools and `kane-cli whoami` succeeds, then restart the API |
| Evidence empty | the pack lives under the session `evidence/` folder; check `stderr.log` in the run directory |

## 9. What Kane caught and proved

A row only claims what `run_end.status === "passed"` plus stored `final_state` and the evidence pack support. Full narratives, screenshots and NDJSON paths are in `docs/kane-proof.md`; this is the short ledger.

### Caught — product defects Kane surfaced

| Run | What Kane reported | Fix that followed |
|---|---|---|
| K1 editor smoke | The inspector could not be collapsed; hierarchy rows had unsafe interactive semantics | Both UI/accessibility defects fixed before K1 passed |
| K2 double jump | Build/Plan accepted a request while the panel said "No model", then failed as a bare fetch error | Env-provider detection, a pre-flight block with actionable guidance, and Settings-pointing errors |
| K3d repair | The Build agent's `apply_commands` was rejected and nothing was saved | `list_commands` + `command-reference` signatures from the zod schemas, and rejected-command hints (`PROMPT_VERSION` 3) |
| K4 terminal | The in-app verification card showed verdict, steps and evidence but **no duration**, so the checkpoint could not pass | `durationMs` forwarded in `useAgentSession.ts`, rendered as `kane-run-duration` |

### Proved — passing runs, all single-flow

| Objective | Duration | Credits | `final_state` |
|---|---|---|---|
| K3 steer probe | 199.4 s | 33.1 | `player_moved: true`, `coins_counter: 2` |
| K3a repair + win (`k3a-repair-win.txt`) | 282.1 s | 60.1 | `coin_counter: 3`, `stage_loaded: true`, `command_rejected: false` |
| K3b undo/redo (`k3b-undo-redo.txt`) | 218.9 s | 59.29 | undo/redo `1/0` → `0/1` → `1/0` |
| K4 in-app `verify_with_kane` | 65.2 s | not recorded in the result | card `PASSED · 12 steps · 65.2s` + evidence link, run `8ea17992…` |
| K4 terminal handshake | 206.7 s | 38.06 | `verification_verdict: PASSED`, `executed_steps: 12`, duration/evidence/reference flags `true` |
| K5 AI Play attempt 2 | 81.1 s | 23.54 | `status: WON`, `coins: 3`, `last_error: none` |

### Not credited to the product

- K2's three post-fix runs that ended with "browser target stopped running during screenshot capture" are an `environment_issue/platform_failure`; the objective is recorded as environment-blocked rather than passed or failed-as-product. Its defect half (Build accepted under "No model") is credited from the first run and its fix is verified separately.
- K5 attempt 1 failed on Kane's own final-verification assertion with `final_state: {}` and did not name the inaccessible coin; the embedded `Core A` was identified by Clockwork's deterministic repair, and the three-coin passing attempt proves the move mattered.
- Fixture-driven runs (`scripts/kane/fake-kane.mjs`, `KANE_FIXTURE_NO_RUN_END=1`) test the client contract only and are never counted as Kane evidence.
