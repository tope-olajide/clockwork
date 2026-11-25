/**
 * Maps a `run_ai_play` tool call onto the `/api/kane/ai-play` request body.
 *
 * The tool schema is what the model sees, so every argument it advertises must
 * survive this step. Anything the endpoint cannot act on is dropped here rather
 * than being forwarded as a value the server silently ignores.
 */
export function aiPlayArgsFromToolCall(
  callArgs: Record<string, unknown>,
  context: { snapshotId: string; projectId?: string; seed?: number },
) {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const sceneId = text(callArgs.sceneId);
  const goal = text(callArgs.goal);
  return {
    snapshotId: context.snapshotId,
    projectId: context.projectId,
    seed: context.seed ?? 1234,
    ...(goal ? { goal } : {}),
    ...(sceneId ? { sceneId } : {}),
  };
}

export const KANE_OBJECTIVE_MAX = 1_000;
export const KANE_DEFAULT_OBJECTIVE = "Verify the current project in the snapshot player.";

/**
 * Maps a `verify_with_kane` tool call onto the `/api/kane/qa` request body.
 * Only `objective` and `sceneId` survive; anything else the model sends (a url,
 * a command, a path) is dropped, and the objective is bounded here as well as on
 * the server.
 */
export function verifyArgsFromToolCall(
  callArgs: Record<string, unknown>,
  context: { snapshotId: string; seed?: number },
) {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const objective = (text(callArgs.objective) ?? KANE_DEFAULT_OBJECTIVE).slice(0, KANE_OBJECTIVE_MAX);
  const sceneId = text(callArgs.sceneId);
  return {
    snapshotId: context.snapshotId,
    objective,
    seed: context.seed ?? 1234,
    ...(sceneId ? { sceneId } : {}),
  };
}
