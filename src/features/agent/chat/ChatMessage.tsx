import { useState } from "react";
import { Check, Copy, RotateCcw, Sparkles } from "lucide-react";
import type { DisplayMessage } from "../useAgentSession";
import { AttachmentCard } from "./AttachmentCard";
import { MarkdownMessage } from "./MarkdownMessage";
import { ToolActivity } from "./ToolActivity";

function timeLabel(iso: string) {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

export function ChatMessage({
  message,
  canRegenerate,
  onRegenerate,
  onStop,
}: {
  message: DisplayMessage;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onStop?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (message.role === "tool" && message.toolCard) return <ToolActivity card={message.toolCard} onStop={onStop} />;
  if (message.role === "assistant") {
    if (!message.content && message.streaming) {
      return (
        <div className="chat-row chat-row-assistant">
          <span className="chat-avatar"><Sparkles size={13} /></span>
          <div className="chat-assistant-body"><span className="chat-thinking"><i /><i /><i /></span></div>
        </div>
      );
    }
    if (!message.content) return null;
    async function copy() {
      try {
        await navigator.clipboard.writeText(message.content);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      } catch {
        // Clipboard permission is optional.
      }
    }
    return (
      <div className="chat-row chat-row-assistant">
        <span className="chat-avatar" aria-hidden="true"><Sparkles size={13} /></span>
        <div className="chat-assistant-body">
          <MarkdownMessage content={message.content} />
          {message.streaming && <span className="agent-cursor" />}
          <div className="chat-message-meta">
            <time>{timeLabel(message.createdAt)}</time>
            {!message.streaming && (
              <span className="chat-message-actions">
                <button type="button" aria-label="Copy response" onClick={() => void copy()}>
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                </button>
                {canRegenerate && <button type="button" aria-label="Regenerate response" onClick={onRegenerate}><RotateCcw size={12} /> Regenerate</button>}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (message.role === "user") {
    return (
      <div className="chat-row chat-row-user">
        <div className="chat-user-bubble">
          <div className="chat-user-text">{message.content}</div>
          {message.attachments && message.attachments.length > 0 && (
            <div className="chat-message-attachments">
              {message.attachments.map((attachment) => <AttachmentCard key={attachment.assetId} attachment={attachment} />)}
            </div>
          )}
          <time className="chat-user-time">{timeLabel(message.createdAt)}</time>
        </div>
      </div>
    );
  }
  return null;
}
