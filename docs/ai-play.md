# AI Play contract

AI Play is the second Play button. Manual Play is always available and never depends on Kane, a model, or a key. AI Play sends Kane into an immutable snapshot of the game, reads the structured verdict, and lets Clockwork repair one non-destructive content problem before replaying the same seed.

## Flow

1. The editor saves the current document and assets.
2. It creates a 1-hour snapshot through `POST /api/snapshots`.
3. The server builds an objective from the snapshot document and starts Kane against `/s/<snapshotId>?ai=1&seed=1234`.
4. The panel streams steps. A pass is shown only when `run_end.status` is `passed`.
5. On failure with Auto-fix enabled, the Clockwork repair policy runs `repairAiPlayFailure()`:
   - finds a coin/collectible whose visual bounds overlap a static or kinematic body;
   - moves it above that body with one `object.update` command;
   - records one undo entry;
   - saves and creates a new snapshot.
6. Attempt 2 runs with the same seed and objective. There is no third automatic attempt.
7. If attempt 2 fails, both attempts, final states, and evidence links stay visible, and **Undo AI fixes** is offered.

Never hide a failed Kane run behind a retry. Never call an assertion failure "Kane passed". Never use the editor URL with live IndexedDB state for an AI Play run.

## Roles

| Entry point | What runs | What it proves |
|---|---|---|
| Manual **Play** | The real-time runtime in the editor, no Kane and no model | The game is playable manually; never browser-test evidence. |
| `start_playtest` (Agent tool) | Seeded `Runtime` stepping on the server, no browser | Mechanics in the deterministic engine; explicitly a headless preflight, never Kane evidence. |
| **AI Testing** plan panel | Clockwork planner drafts; a human approves; Kane CLI runs one phase at a time in Chrome | Only the approved assertions, joined to input receipts, observations and `.evidence`. |
| Agent drawer `run_ai_play` / `verify_with_kane` | The built-in agent calls Kane directly and receives the terminal result in its tool loop | One-off browser runs; the model may reason about the result, but this is not the reviewed phase flow. |
| Kane CLI directly | The CLI outside Clockwork | Whatever that run's own objective and evidence establish; not Clockwork plan evidence unless imported. |

The planner and browser operator are different systems. The report names the Clockwork planner model and the Kane CLI version separately; neither is presented as the other.

## Final report and recovery

The report is built from typed phase results, never from a Kane exit code alone. It includes the user goal, plan revision, project revision, scene, scenario, seed, budget, planner model, Kane CLI version, every approved assertion with its status and observed value, evidence links, follow-up actions and limitations. It also separates what the engine agent **inferred** from what Kane **directly observed**.

A phase passes only when Kane reports a passing terminal verdict, every approved observation is present and matches, required inputs were actually delivered to a runtime frame, the reported frame count is within the approved budget, an evidence bundle exists and no runtime error was reported. Missing or undelivered input is INCONCLUSIVE, not a product failure. Missing observations, missing evidence, over-budget frames, timeouts, cancellations, runtime errors and unrun phases stay visible and can never become PASS.

**Stop phase** asks the server to terminate the active Kane process. The result is recorded as `cancelled` and is not retried automatically. A reload restores saved results only for the exact plan fingerprint (project, revision, scene, seed and phase content); if the project revision changed, the panel says the saved results are stale, disables approval/run and asks for a new plan. **Replay saved result** reuses the server's idempotent phase result instead of paying for another Kane run.

Local filesystem paths are stripped from user-visible summaries, steps, observations and reports. Raw NDJSON, `result.json` and evidence paths remain only in the server's local run directory.

## Test Mode

`/s/:snapshotId?ai=1&testMode=step&seed=1234` opens the snapshot player in lockstep Test
Mode: the runtime starts paused at frame 0 with no real-time loop, controls are labelled
from the template's game-test profile (`MOVE LEFT`, `SHOOT`, ...), and frames advance only
through a bounded **ADVANCE** request. Kane is told to click the visible control, enter
an approved frame count and press **STEP**; pressing a control alone does not advance the
game. Every control produces an input receipt with the frames that actually carried the
action, and a rejected or clamped request says so.

Test Mode requires a registered profile. A template without one reports
`TEST MODE UNAVAILABLE` and stays at frame zero rather than approximating controls. Normal
Play and the default snapshot player keep their real-time behaviour unchanged. See
[`docs/testing-hooks.md`](./testing-hooks.md) for the selectors.

## HUD selectors and labels

The DOM contract is intentionally visible and accessible. Kane acts like a player:

```text
[data-testid="ai-play-hud"]
[data-testid="ai-hud-state"]      GAME STATE panel, aria-live
[data-testid="ai-hud-status"]     PLAYING | WON | LOST | ERROR | PAUSED
[data-testid="ai-hud-scene"]      scene name
[data-testid="ai-hud-coins"]      plain number
[data-testid="ai-hud-health"]     plain number or none
[data-testid="ai-hud-time"]       MM:SS
[data-testid="ai-hud-seed"]       integer
[data-testid="ai-hud-last-error"] none or the runtime error
[data-testid="ai-hud-move-left"]  toggle, ON/OFF, aria-pressed
[data-testid="ai-hud-move-right"] toggle, ON/OFF, aria-pressed
[data-testid="ai-hud-jump"]       impulse
[data-testid="ai-hud-action"]     impulse
[data-testid="ai-hud-stop"]       pause input
[data-testid="ai-hud-restart"]    reset runtime
```

The AI HUD buttons call the same `InputManager` as the keyboard. The keyboard remains active in `?ai=1`; gameplay rules are unchanged.

## Objective generation

`server/kane/objectives.ts`:

- uses the active scene's actual HUD label for the coin variable (`COINS` for Neon Runner);
- counts coin/collectible-tagged objects for the target;
- finds the boolean win variable set by a rule;
- names the visible controls;
- stays under 15 lines and 1,000 characters;
- ends with `store ... as` plus assertions, never a bare action.

Example for Neon Runner:

```text
You are playing Neon Runner in scene "Dusk Run". Collect all 3 coins and reach the end of the scene.
Start at the snapshot and wait for STATUS: PLAYING.
Click the button labeled "MOVE RIGHT" once, then keep it ON.
Click "JUMP" when the player is on the ground, up to 24 times, until STATUS is WON or LOST.
If the player is stuck, click "STOP", then "RESTART", then try again with "MOVE RIGHT" and "JUMP".
Click "STOP" when STATUS is WON or LOST.
Store the text next to "STATUS" as "status".
Store the text next to "SCENE" as "scene".
Store the text next to "COINS" as "coins".
Store the text next to "LAST ERROR" as "last_error".
Assert status is "WON".
Assert coins is "3".
Assert last_error is "none".
```

For a game without coins, the assertion becomes the win variable. For a game without a win condition, the objective falls back to an error-free bounded run.

## Result shape

`shared/protocol/kane.ts`:

```ts
interface AiPlayResult {
  runId: string;
  attempt: number;
  status: "passed" | "failed" | "cancelled" | "error";
  resultCode?: number | string;
  reasonCode?: string;
  summary: string;
  objective: string;
  finalState: Record<string, string>;
  steps: KaneStep[];
  runtimeErrors: string[];
  evidencePath?: string;
  evidenceUrl?: string;
  testUrl?: string;
  durationMs: number;
}
```

Completed runs are written to `.data/ai-play/<runId>/result.json`, with `raw.ndjson`, `stderr.log`, and `evidence.evidence`. The raw event stream is never rendered wholesale.

## Agent tools

When `KANE_ENABLED=1`, the agent catalog includes:

- `verify_with_kane({ objective })` — creates a snapshot and returns the Kane verdict, steps, final state, and evidence.
- `run_ai_play({ goal?, sceneId? })` — runs the in-product loop once and returns the structured result so the model can diagnose and apply a fix before calling it again. Retries are the model's decision across turns; the tool itself never repeats a run.

Tools are client-executed against the live document, matching every other Clockwork write. The model never receives a key, base URL, or arbitrary command. The agent must not claim success unless Kane returned `run_end.status === "passed"`.

## Seeded negative control

`Neon Runner` deliberately places `Core B` at `(1080, 566)`, inside the solid `Ledge B` body. Manual Play can reach the relay but can only collect two cores. `?demoReset=1` restores that exact defect. The expected Kane failure is:

```text
STATUS: WON
COINS: 2
LAST ERROR: none
```

The repair moves the core above Ledge B with one `object.update`. The replay asserts `COINS: 3`. This is a seeded demo defect, not a fabricated failure, and must be disclosed as such in the demo.

## Limits and safety

- One active AI Play run per project.
- Snapshot-only URLs; the client cannot submit a URL.
- 1,000-character objective cap and 64 KB request body.
- 180-second timeout, 40-step cap.
- `KANE_AI_PLAY_ENABLED` and `KANE_ENABLED` are independent gates.
- Evidence, raw logs, and `.data` are gitignored.
- AI Play is local/self-hosted in v1 because it launches Chrome.
