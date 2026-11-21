import { useEffect, useRef, useState } from "react";
import { Check, History, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ChatSessionSummary } from "../useAgentSession";
import { relativeTime } from "./chat-utils";

export function ChatHistoryMenu({
  sessions,
  activeSessionId,
  onOpen,
  onNew,
  onDelete,
  onRename,
}: {
  sessions: ChatSessionSummary[];
  activeSessionId: string;
  onOpen: (sessionId: string) => void;
  onNew: () => void;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    };
    window.document.addEventListener("mousedown", closeOutside);
    return () => window.document.removeEventListener("mousedown", closeOutside);
  }, []);

  function close() {
    if (detailsRef.current) detailsRef.current.open = false;
  }

  function beginRename(session: ChatSessionSummary) {
    setEditing(session.sessionId);
    setTitle(session.title);
  }

  function commitRename() {
    if (editing) onRename(editing, title);
    setEditing(null);
    setTitle("");
  }

  return (
    <details className="chat-history" ref={detailsRef}>
      <summary aria-label="Chat history"><History size={14} /></summary>
      <div className="chat-history-popover">
        <div className="chat-history-head">
          <strong>Chats</strong>
          <button type="button" onClick={() => { onNew(); close(); }}><Plus size={12} /> New chat</button>
        </div>
        {sessions.length === 0 ? (
          <p className="chat-history-empty">Your conversations will appear here.</p>
        ) : (
          <div className="chat-history-list">
            {sessions.map((session) => (
              <div key={session.sessionId} className={`chat-history-row ${session.sessionId === activeSessionId ? "active" : ""}`}>
                {editing === session.sessionId ? (
                  <form
                    className="chat-history-rename"
                    onSubmit={(event) => { event.preventDefault(); commitRename(); }}
                  >
                    <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
                    <button type="submit" aria-label="Save title"><Check size={12} /></button>
                    <button type="button" aria-label="Cancel rename" onClick={() => setEditing(null)}><X size={12} /></button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="chat-history-open"
                      onClick={() => { onOpen(session.sessionId); close(); }}
                    >
                      <strong>{session.title}</strong>
                      <span>{relativeTime(session.updatedAt)} · {session.messageCount} message{session.messageCount === 1 ? "" : "s"}</span>
                    </button>
                    <span className="chat-history-actions">
                      <button type="button" aria-label={`Rename ${session.title}`} onClick={() => beginRename(session)}><Pencil size={11} /></button>
                      <button
                        type="button"
                        aria-label={`Delete ${session.title}`}
                        onClick={() => {
                          if (window.confirm(`Delete “${session.title}”? Project assets it added stay in the project.`)) onDelete(session.sessionId);
                        }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
