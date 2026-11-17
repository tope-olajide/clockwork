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
KANE_ENABLED=1
KANE_AI_PLAY_ENABLED=1
# Omit KANE_HEADLESS to watch Chrome. Set 1 for CI.
# KANE_HEADLESS=1
KANE_TIMEOUT_SECONDS=180
KANE_MAX_STEPS=40
KANE_CLI=kane-cli
# Public origin the Kane browser must open. In dev this is Vite, not the API.
CLOCKWORK_PUBLIC_URL=http://localhost:5173
```

With `KANE_ENABLED=0`, both `/api/kane/qa` and `/api/kane/ai-play` return 404 and no Kane tool is advertised to the model. Manual Play, editing, persistence, share, and export continue to work.

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
  --final-validation on \
  --bug-detection off
```

- Engine QA uses `--bug-detection continue` so a confirmed bug is recorded while the remaining steps run.
- AI Play uses `--bug-detection off`: a game-design failure is not a product bug.
- AI Play always targets an immutable snapshot (`/s/<id>?ai=1&seed=1234`), never the editor with IndexedDB state.
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
bash scripts/kane/run-objective.sh k1-editor-smoke.txt http://localhost:5173
bash scripts/kane/run-objective.sh k2-agent-double-jump.txt "http://localhost:5173/?demo=1&kane=1"
bash scripts/kane/run-objective.sh k3-agent-repair.txt "http://localhost:5173/?demoReset=1&kane=1"
bash scripts/kane/run-objective.sh k4-kane-handshake.txt "http://localhost:5173/?demo=1&kane=1"
```

K2–K4 require a configured tool-capable model for the agent portion. AI Play (K5) does **not** require a model for the deterministic auto-fix path, but a real product demo should disclose that the repair is the built-in Clockwork repair policy unless the agent's `run_ai_play` tool is being used with a model.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `kane-missing` / status `installed: false` | `npm install -g @testmuai/kane-cli`, then refresh status |
| `kane-auth` | run `kane-cli login` yourself; never paste a token into chat |
| Browser opens the wrong origin | set `CLOCKWORK_PUBLIC_URL` to the Vite/player origin |
| `run_end` missing with exit 2 | check `kane-cli whoami`, Chrome, and the URL; the run never started |
| AI Play says snapshot unavailable | create a new snapshot; snapshots expire and are capped at 20 MB |
| Agent tool missing | set `KANE_ENABLED=1` before starting the API and restart it |
| Evidence empty | the pack lives under the session `evidence/` folder; check `stderr.log` in the run directory |
