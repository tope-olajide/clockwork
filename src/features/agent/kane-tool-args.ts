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
