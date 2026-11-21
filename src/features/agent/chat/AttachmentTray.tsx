import { FileAudio, Image as ImageIcon, X } from "lucide-react";
import type { ChatAttachment } from "@shared/protocol";
import type { PendingAttachment } from "./chat-utils";
import { formatBytes } from "./chat-utils";

const QUICK_PROMPTS: Record<ChatAttachment["kind"], Array<{ label: string; prompt: string }>> = {
  image: [
    { label: "Player sprite", prompt: "Use this image as the player's sprite." },
    { label: "Background", prompt: "Use this image as the scene background." },
    { label: "Collectible", prompt: "Add this image as a collectible object." },
  ],
  audio: [
    { label: "Music", prompt: "Use this audio as the scene music." },
    { label: "Jump SFX", prompt: "Use this audio as the jump sound effect." },
    { label: "Pickup SFX", prompt: "Use this audio as the pickup sound effect." },
  ],
};

export function AttachmentTray({
  pending,
  onRemove,
  onQuickPrompt,
}: {
  pending: PendingAttachment[];
  onRemove: (id: string) => void;
  onQuickPrompt: (text: string) => void;
}) {
  if (pending.length === 0) return null;
  const valid = pending.filter((attachment) => !attachment.error);
  const quick = valid.length === 1 && valid[0]
    ? QUICK_PROMPTS[valid[0].file.type.startsWith("audio/") ? "audio" : "image"]
    : [];
  return (
    <div className="chat-attachment-tray" aria-label="Attachments">
      <div className="chat-attachment-chips">
        {pending.map((attachment) => {
          const isAudio = attachment.file.type.startsWith("audio/");
          const quickText = attachment.error ? null : quick;
          return (
            <div
              key={attachment.id}
              className={`chat-attachment-chip ${attachment.error ? "has-error" : ""}`}
              data-testid="chat-pending-attachment"
            >
              <span className="chat-attachment-chip-icon">
                {attachment.previewUrl
                  ? <img src={attachment.previewUrl} alt="" />
                  : isAudio ? <FileAudio size={15} /> : <ImageIcon size={15} />}
              </span>
              <span className="chat-attachment-chip-copy">
                <strong title={attachment.file.name}>{attachment.file.name}</strong>
                <span>{attachment.error ?? formatBytes(attachment.file.size)}</span>
              </span>
              <button type="button" aria-label={`Remove ${attachment.file.name}`} onClick={() => onRemove(attachment.id)}>
                <X size={12} />
              </button>
              {quickText && (
                <span className="chat-attachment-quick">
                  {quickText.map((action) => (
                    <button key={action.label} type="button" onClick={() => onQuickPrompt(action.prompt)}>
                      {action.label}
                    </button>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
