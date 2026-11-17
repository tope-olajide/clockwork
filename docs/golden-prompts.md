# Golden prompts (Slice 7)

These are the seven prompts used to tune the agent and verify the write path. Each
runs in a fresh thread against a real tool-capable model. The presets in the
drawer mirror these prompts (`src/engine/ai/prompts.ts`).

| # | Prompt | Expected tool calls | Success looks like |
|---|--------|---------------------|--------------------|
| 1 | Build a small playable platformer level: ground, two platforms, three coins, a goal, and a win rule. | `get_scene`, `preview_commands`, `apply_commands` | One undo entry, playable scene, concise summary. |
| 2 | Give the player a double jump and make the drone patrol back and forth above the bridge. | `get_object` ×2, `apply_commands` | Only player and drone change; Play shows double jump and patrol. |
| 3 | Why does the player fall through the bridge? Inspect colliders and explain; do not change anything. | `get_object` / `get_scene` only | Precise explanation, zero commands applied. |
| 4 | Make this scene dusk and add parallax mountains using existing assets only. | `list_scenes`, `search_entities` (assets), `apply_commands` | Reports missing art instead of inventing an asset. |
| 5 | Make collecting all coins trigger a win; the rule fires once. | `get_variables`, `apply_commands` | Variable + rule exist; Play reaches the win state once. |
| 6 | Play it and tell me if it is completable. | `start_playtest` | Honest telemetry (`status`, variables, frames, stuck position); no false pass. |
| 7 | Plan a change that adds a checkpoint, then wait for apply. | `preview_commands` (Plan mode) | Ghost preview and card; stale guard blocks Apply after a manual edit. |

## What not to count

- A retry after a manual repair is not a pass; rerun the prompt from a new thread.
- A model claim without a matching `run_end`/playtest result is not a pass.
- Destructive changes must stop for confirmation before Apply.
