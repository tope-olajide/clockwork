import type { ChangeSetSummary } from "../../engine/ai/executor";

/** Field paths that never change how the game plays. */
const COSMETIC_PATH = /^(name|description|notes|visual|color|tint|opacity|locked|visible)(\.|\[|$)/;

/**
 * True when an applied change set could alter gameplay, so a browser check is
 * worth offering. Renames, descriptions and colour-only edits are not.
 */
export function changeAffectsGameplay(changeSet: ChangeSetSummary | undefined | null): boolean {
  if (!changeSet || changeSet.changes.length === 0) return false;
  return changeSet.changes.some((change) => {
    if (change.entityKind === "asset" || change.entityKind === "layer" || change.entityKind === "project") {
      return false;
    }
    if (change.op === "update") {
      if (change.fields.length === 0) return false;
      return change.fields.some((field) => !COSMETIC_PATH.test(field.path));
    }
    return true;
  });
}

/**
 * The user message behind "Ask agent to check this" and the post-change offer.
 * The agent turns the description into a structured check; it never writes
 * Kane prose.
 */
export function kaneCheckRequestMessage(description: string): string {
  const clean = description.trim().slice(0, 600) || "the change you just made";
  return `Verify with Kane: ${clean}\n\nBuild one verify_with_kane check from context.kane.testMode (controls, readouts and their start values) and call it.`;
}
