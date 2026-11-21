import type { AgentChatMessage, ChatAttachment } from "@shared/protocol";
import { MAX_ASSET_BYTES, isSupportedAssetFile } from "../../../engine/assets/asset-store";

export const MAX_CHAT_ATTACHMENTS = 6;

export interface AttachmentFileCheck {
  ok: boolean;
  error?: string;
}

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  error?: string;
}

export function checkAttachmentFile(file: File): AttachmentFileCheck {
  if (file.size > MAX_ASSET_BYTES) return { ok: false, error: "Larger than 20 MB." };
  if (!isSupportedAssetFile(file)) return { ok: false, error: "Use a PNG, JPEG, WebP, GIF, SVG, MP3, WAV, OGG or WebM file." };
  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function titleForMessages(messages: AgentChatMessage[]): string {
  const first = messages.find((message) => message.role === "user" && message.content.trim());
  const text = (first?.content ?? "New chat").replace(/\s+/g, " ").trim();
  return text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(then).toLocaleDateString();
}

export function attachmentPrompt(attachment: ChatAttachment): string {
  if (attachment.kind === "audio") return `Use “${attachment.name}” as a game sound. `;
  return `Use the attached image “${attachment.name}” in this game. `;
}
