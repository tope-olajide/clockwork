import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Check, ChevronDown, Settings, X } from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import type { AgentMode, ChatAttachment } from "@shared/protocol";
import type { DisplayMessage, AgentUiError, PendingPreview } from "./useAgentSession";
import { ModelPicker } from "./ModelPicker";
import type { ModelInfo, ProviderInfo } from "../../engine/ai/api";
import { suggestionsFor, type PromptPreset } from "../../engine/ai/prompts";
import type { ProjectDocument } from "../../engine/model/schema";
import { ChatComposer } from "./chat/ChatComposer";
import { ChatMessage } from "./chat/ChatMessage";
import { EmptyState } from "./chat/EmptyState";
import { checkAttachmentFile, MAX_CHAT_ATTACHMENTS, type PendingAttachment } from "./chat/chat-utils";
import { importChatAttachments } from "./chat/import-attachments";

interface AgentDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  sceneName: string | null;
  revision: number;
  selectionCount: number;
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  messages: DisplayMessage[];
  status: "ready" | "thinking" | "streaming" | "tool" | "error";
  error: AgentUiError | null;
  isBusy: boolean;
  onSend: (text: string, attachments?: ChatAttachment[]) => void;
  onStop: () => void;
  onRetry: () => void;
  onRegenerate: () => void;
  onNewChat: () => void;
  selectedModelId: string | null;
  onSelectModel: (id: string | null) => void;
  models: ModelInfo[];
  providers: ProviderInfo[];
  aiSettings: { defaultModelId: string | null; mock: boolean } | null;
  modelLabel: string;
  canBuildPlan: boolean;
  onOpenSettings: () => void;
  pendingPreview: PendingPreview | null;
  onApplyPreview: () => void;
  onDiscardPreview: () => void;
  lockedSelection: { id: string; name: string } | null;
  onUnlockSelection: () => void;
  document: ProjectDocument;
  draftKey: string;
  history?: React.ReactNode;
}

function statusLabel(status: AgentDrawerProps["status"]) {
  if (status === "thinking") return "Thinking";
  if (status === "streaming") return "Writing";
  if (status === "tool") return "Working";
  if (status === "error") return "Needs attention";
  return "Ready";
}

export function AgentDrawer(props: AgentDrawerProps) {
  const {
    open, onClose, projectName, sceneName, revision, selectionCount, mode, onModeChange,
    messages, status, error, isBusy, onSend, onStop, onRetry, onRegenerate, onNewChat,
    selectedModelId, onSelectModel, models, providers, aiSettings, modelLabel, canBuildPlan,
    onOpenSettings, pendingPreview, onApplyPreview, onDiscardPreview, lockedSelection,
    onUnlockSelection, document, draftKey,
  } = props;
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const dragDepth = useRef(0);
  const pendingRef = useRef<PendingAttachment[]>([]);
  pendingRef.current = pending;

  const suggestions = suggestionsFor({
    selectionPresent: selectionCount > 0,
    emptyProject: messages.length === 0,
    lastChangeFailed: status === "error",
    noKeyConfigured: !aiSettings?.mock && !models.some((model) => {
      const provider = providers.find((candidate) => candidate.id === model.providerId);
      return Boolean(provider?.key.configured || provider?.local);
    }),
  });
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant" && !message.streaming);
  const canRegenerate = Boolean(latestAssistant && messages.at(-1)?.id === latestAssistant?.id && !isBusy);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isBusy) {
        event.preventDefault();
        onStop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isBusy, onStop]);

  useEffect(() => {
    if (stickRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open, pendingPreview]);

  useEffect(() => () => {
    for (const attachment of pendingRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
  }, []);

  useEffect(() => {
    for (const attachment of pendingRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
    setPending([]);
    setAttachmentError(null);
  }, [draftKey]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = nearBottom;
    setShowJump(!nearBottom);
  }

  function removeAttachment(id: string) {
    setPending((current) => current.flatMap((attachment) => {
      if (attachment.id !== id) return [attachment];
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return [];
    }));
    setAttachmentError(null);
  }

  function addFiles(files: File[]) {
    if (!files.length) return;
    setAttachmentError(null);
    const slots = MAX_CHAT_ATTACHMENTS - pending.length;
    if (slots <= 0) {
      setAttachmentError(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files per message.`);
      return;
    }
    const accepted: PendingAttachment[] = [];
    for (const file of files.slice(0, slots)) {
      const check = checkAttachmentFile(file);
      const previewUrl = check.ok && file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl,
        error: check.ok ? undefined : check.error,
      });
    }
    if (files.length > slots) setAttachmentError(`Only ${MAX_CHAT_ATTACHMENTS} files fit in one message; extra files were skipped.`);
    setPending((current) => [...current, ...accepted]);
  }

  async function submit(text: string): Promise<boolean> {
    if (pending.some((attachment) => attachment.error)) {
      setAttachmentError("Remove the files marked with an error before sending.");
      return false;
    }
    setAttachmentError(null);
    const files = pending.map((attachment) => attachment.file);
    let attachments: ChatAttachment[] | undefined;
    if (files.length > 0) {
      setUploading(true);
      try {
        attachments = await importChatAttachments(files, document);
      } catch (importError) {
        setAttachmentError(importError instanceof Error ? importError.message : "The files could not be added to the project.");
        setUploading(false);
        return false;
      }
      for (const attachment of pending) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
      setPending([]);
      setUploading(false);
    }
    onSend(text, attachments);
    return true;
  }

  function usePreset(preset: PromptPreset) {
    onSend(preset.prompt);
  }

  const renderedMessages: React.ReactNode[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (message.role === "tool") {
      const group: DisplayMessage[] = [];
      while (index < messages.length && messages[index]?.role === "tool") group.push(messages[index++]!);
      renderedMessages.push(
        <div className="chat-tool-group" key={`tools-${group[0]?.id ?? index}`}>
          {group.map((toolMessage) => (
            <ChatMessage key={toolMessage.id} message={toolMessage} canRegenerate={false} onRegenerate={onRegenerate} />
          ))}
        </div>,
      );
      index -= 1;
      continue;
    }
    renderedMessages.push(
      <ChatMessage
        key={message.id}
        message={message}
        canRegenerate={message.id === latestAssistant?.id && canRegenerate}
        onRegenerate={onRegenerate}
      />,
    );
  }

  if (!open) return null;

  return (
    <aside
      className={`agent-drawer chat-shell ${dragging ? "is-dragging" : ""}`}
      aria-label="Agent chat"
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <header className="chat-header">
        <div className="chat-header-identity">
          <span className="chat-brand-mark"><Bot size={16} /></span>
          <div>
            <strong>Clockwork Agent</strong>
            <span className="chat-status" aria-live="polite"><i className={`dot ${status}`} /> {statusLabel(status)}</span>
          </div>
        </div>
        <div className="chat-header-actions">
          <ModelPicker value={selectedModelId} onChange={onSelectModel} onOpenSettings={onOpenSettings} models={models} providers={providers} settings={aiSettings} label={modelLabel} />
          {props.history}
          <IconButton label="New chat" onClick={onNewChat}><span className="chat-new-label">New</span></IconButton>
          <IconButton label="Close agent" onClick={onClose}><X size={14} /></IconButton>
        </div>
      </header>

      <details className="chat-context">
        <summary>
          <span className="chat-context-dot" /> {sceneName ?? projectName}
          <span className="chat-context-meta">r{revision} · {selectionCount} selected</span>
          <ChevronDown size={13} />
        </summary>
        <div className="chat-context-popover">
          <div><span>Project</span><strong>{projectName}</strong></div>
          <div><span>Scene</span><strong>{sceneName ?? "None"}</strong></div>
          <div><span>Revision</span><strong>r{revision}</strong></div>
          <div><span>Selection</span><strong>{selectionCount}</strong></div>
          {lockedSelection && (
            <div><span>Locked</span><strong>{lockedSelection.name} <button type="button" onClick={onUnlockSelection}>Unlock</button></strong></div>
          )}
        </div>
      </details>

      <div className="chat-messages" ref={listRef} onScroll={onScroll} role="log" aria-label="Conversation">
        {messages.length === 0 ? (
          <EmptyState projectName={projectName} suggestions={suggestions} onUse={usePreset} onModeChange={onModeChange} />
        ) : renderedMessages}

        {pendingPreview && (
          <div className={`chat-preview-card ${pendingPreview.destructive ? "is-destructive" : ""}`} role="region" aria-label="Pending change preview">
            <div className="chat-preview-title">
              {pendingPreview.destructive ? <AlertTriangle size={14} /> : <Check size={14} />}
              {pendingPreview.destructive ? "Confirm changes" : "Proposed changes"}
            </div>
            <div className="chat-preview-body">
              <div><strong>{pendingPreview.summary}</strong>{pendingPreview.stale ? " (stale — project changed)" : ""}</div>
              {pendingPreview.changeSet?.changes?.length ? (
                <ul>
                  {pendingPreview.changeSet.changes.slice(0, 8).map((change, index) => (
                    <li key={index}>{change.op} {change.entityKind} “{change.entityName}”{change.fields.length ? ` (${change.fields.length} field${change.fields.length === 1 ? "" : "s"})` : ""}</li>
                  ))}
                </ul>
              ) : <div className="muted">Review the previewed command batch before applying.</div>}
              {pendingPreview.destructive && <div className="chat-preview-warning">This includes destructive changes. Applying may remove content.</div>}
            </div>
            <div className="chat-preview-actions">
              <Button variant="primary" size="sm" onClick={onApplyPreview} disabled={pendingPreview.stale}>{pendingPreview.destructive ? "Delete / Apply" : "Apply"}</Button>
              <Button variant="secondary" size="sm" onClick={onDiscardPreview}>Discard</Button>
            </div>
          </div>
        )}

        {error && status === "error" && (
          <div className="chat-error-card" role="alert">
            <div className="chat-error-title"><AlertTriangle size={14} /> {errorTitle(error.code)}</div>
            <div className="chat-error-body">{error.message}</div>
            <div className="chat-error-actions">
              {(error.action === "open-settings" || error.code === "no-key" || error.code === "invalid-key" || error.code === "provider-timeout") && (
                <Button variant="secondary" size="sm" onClick={onOpenSettings}><Settings size={12} /> Open settings</Button>
              )}
              {(error.action === "choose-model" || error.code === "no-model" || error.code === "model-unavailable" || error.code === "no-tools" || error.code === "no-vision") && (
                <Button variant="secondary" size="sm" onClick={() => { (window.document.querySelector(".agent-model") as HTMLButtonElement | null)?.click(); }}>Choose another model</Button>
              )}
              <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showJump && (
        <button className="chat-jump" type="button" onClick={() => { stickRef.current = true; bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }}>
          Jump to latest
        </button>
      )}

      {attachmentError && <div className="chat-attachment-error" role="alert">{attachmentError}</div>}
      {!canBuildPlan && <div className="chat-mode-note">Build and Plan need a tool-capable model. Ask remains available.</div>}

      <ChatComposer
        draftKey={draftKey}
        mode={mode}
        onModeChange={onModeChange}
        canBuildPlan={canBuildPlan}
        isBusy={isBusy || uploading}
        uploading={uploading}
        pending={pending}
        onFiles={addFiles}
        onRemoveAttachment={removeAttachment}
        onSend={submit}
        onStop={onStop}
      />

      {dragging && (
        <div className="chat-drop-overlay" aria-hidden="true">
          <div><span>Drop to attach</span><small>Sprites, GIFs or audio up to 20 MB</small></div>
        </div>
      )}
    </aside>
  );
}

function errorTitle(code?: string) {
  if (code === "no-key") return "No API key configured";
  if (code === "invalid-key") return "Invalid API key";
  if (code === "no-model") return "No model selected";
  if (code === "model-unavailable") return "Model unavailable";
  if (code === "no-tools") return "Model does not support tools";
  if (code === "no-vision") return "Model does not support vision";
  if (code === "rate-limit") return "Rate limited";
  if (code === "provider-timeout") return "Provider timeout";
  return "Agent error";
}
