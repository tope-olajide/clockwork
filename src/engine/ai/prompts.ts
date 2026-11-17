export interface PromptPreset {
  id: string;
  label: string;
  description: string;
  prompt: string;
  mode: "ask" | "build" | "plan";
}

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: "build-platformer",
    label: "Build a small level",
    description: "Playable platformer with one undoable change set.",
    prompt: "Build a small playable platformer level in this project: ground, two platforms, three collectible coins, a goal, and a win rule that requires all three coins. Keep it physically reachable and summarize what changed.",
    mode: "build",
  },
  {
    id: "double-jump-drone",
    label: "Double jump + drone patrol",
    description: "Tune the player and give a drone a patrol route.",
    prompt: "Give the player a double jump and make the drone patrol back and forth above the bridge. Only change the player and drone, and tell me the exact fields you changed.",
    mode: "build",
  },
  {
    id: "explain-collider",
    label: "Why do I fall through?",
    description: "Inspect colliders and explain the cause.",
    prompt: "Why does the player fall through the bridge? Inspect the bridge and player colliders, then explain the exact cause and the smallest safe fix. Do not change anything yet.",
    mode: "ask",
  },
  {
    id: "dusk-parallax",
    label: "Make it dusk",
    description: "Change the mood without inventing art.",
    prompt: "Make this scene dusk and add parallax mountains. Use existing assets only; if no mountain art exists, say so instead of inventing an asset.",
    mode: "build",
  },
  {
    id: "coins-win",
    label: "Collect all coins → win",
    description: "Create a variable and a once-only win rule.",
    prompt: "Make collecting all coins trigger a win. Create the variable and rule you need, make the rule fire once, and explain how to verify it in Play.",
    mode: "build",
  },
  {
    id: "playtest-completable",
    label: "Is it completable?",
    description: "Run the headless playtest and report honestly.",
    prompt: "Play it and tell me if it is completable. Use the playtest tool with the real scene and report the status, variables, frames, and any stuck position. Do not claim it passed unless the telemetry says so.",
    mode: "ask",
  },
  {
    id: "plan-apply",
    label: "Plan, then apply",
    description: "Preview a change, then apply after review.",
    prompt: "Plan a change that adds a checkpoint halfway through the level. Show the preview and wait for me to apply it; do not apply in Plan mode.",
    mode: "plan",
  },
];

export interface SuggestionState {
  emptyProject?: boolean;
  selectionPresent?: boolean;
  playtestError?: boolean;
  noKeyConfigured?: boolean;
  lastChangeFailed?: boolean;
}

export function suggestionsFor(state: SuggestionState): PromptPreset[] {
  const pick = (id: string) => PROMPT_PRESETS.find((preset) => preset.id === id);
  const ids: string[] = [];
  if (state.noKeyConfigured) ids.push("explain-collider");
  else if (state.playtestError) ids.push("playtest-completable");
  else if (state.lastChangeFailed) ids.push("plan-apply");
  else if (state.selectionPresent) ids.push("double-jump-drone", "explain-collider");
  else if (state.emptyProject) ids.push("build-platformer", "coins-win");
  else ids.push("build-platformer", "dusk-parallax", "playtest-completable");
  return ids.map(pick).filter((preset): preset is PromptPreset => Boolean(preset));
}
