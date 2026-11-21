import type { ChatAttachment } from "./protocol";

/** The model gets names and asset ids, never a binary or a local object URL. */
export function attachmentManifest(attachments: ChatAttachment[] | undefined): string {
  if (!attachments?.length) return "";
  const rows = attachments.map((attachment) => {
    const dimensions = attachment.width && attachment.height ? `, ${attachment.width}x${attachment.height}` : "";
    return `[Attached: ${attachment.name} — ${attachment.mime}${dimensions}, asset_id ${attachment.assetId}]`;
  });
  return `\n\n${rows.join("\n")}`;
}
