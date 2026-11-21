import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, Paperclip, Square, X } from "lucide-react";
import type { AgentMode } from "@shared/protocol";
import { PROMPT_PRESETS } from "../../../engine/ai/prompts";
import { AttachmentTray } from "./AttachmentTray";
import type { PendingAttachment } from "./chat-utils";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,audio/mpeg,audio/wav,audio/ogg,audio/webm";

export function ChatComposer({
  draftKey,
  mode,
  onModeChange,
  canBuildPlan,
  isBusy,
  uploading = false,
  pending,
  onFiles,
  onRemoveAttachment,
  onSend,
  onStop,
}: {
  draftKey: string;
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  canBuildPlan: boolean;
  isBusy: boolean;
  uploading?: boolean;
  pending: PendingAttachment[];
  onFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: (text: string) => Promise<boolean> | boolean;
  onStop: () => void;
}) {
  const [input, setInput] = useState(() => {
    try { return window.localStorage.getItem(draftKey) ?? ""; } catch { return ""; }
  });
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const validAttachments = pending.filter((attachment) => !attachment.error);
  const hasInvalid = pending.some((attachment) => attachment.error);
  const canSend = (input.trim().length > 0 || validAttachments.length > 0) && !isBusy && !hasInvalid;

  const presets = useMemo(() => {
    if (!input.startsWith("/")) return [];
    const query = input.slice(1).toLowerCase();
    return PROMPT_PRESETS.filter((preset) => `${preset.label} ${preset.id}`.toLowerCase().includes(query)).slice(0, 6);
  }, [input]);

  useEffect(() => {
    setSlashOpen(input.startsWith("/") && presets.length > 0);
    setSlashIndex(0);
  }, [input, presets.length]);

  useEffect(() => {
    try { setInput(window.localStorage.getItem(draftKey) ?? ""); } catch { setInput(""); }
  }, [draftKey]);

  function changeInput(next: string) {
    setInput(next);
    try { window.localStorage.setItem(draftKey, next); } catch { /* storage can be unavailable */ }
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(200, Math.max(44, el.scrollHeight))}px`;
  }, [input]);

  async function submit() {
    if (!canSend) return;
    const accepted = await onSend(input);
    if (!accepted) return;
    changeInput("");
    setSlashOpen(false);
    try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
    textareaRef.current?.focus();
  }

  function choosePreset(prompt: string) {
    changeInput(prompt);
    setSlashOpen(false);
    textareaRef.current?.focus();
  }

  return (
    <div className="chat-composer">
      <AttachmentTray
        pending={pending}
        onRemove={onRemoveAttachment}
        onQuickPrompt={(text) => {
          changeInput(input.trim() ? `${input.trim()} ${text}` : text);
          textareaRef.current?.focus();
        }}
      />
      {slashOpen && presets.length > 0 && (
        <div className="chat-slash-menu" role="listbox" aria-label="Prompt presets">
          {presets.map((preset, index) => (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={index === slashIndex}
              className={index === slashIndex ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choosePreset(preset.prompt)}
            >
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      )}
      <div className="chat-composer-shell">
        <textarea
          ref={textareaRef}
          className="chat-composer-input"
          data-testid="agent-input"
          rows={1}
          placeholder="Ask, build, or drop a sprite or sound…"
          value={input}
          onChange={(event) => changeInput(event.target.value)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            if (files.length === 0) return;
            event.preventDefault();
            onFiles(files);
          }}
          onKeyDown={(event) => {
            if (slashOpen && presets.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSlashIndex((index) => (index + 1) % presets.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSlashIndex((index) => (index - 1 + presets.length) % presets.length);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                const preset = presets[slashIndex];
                if (preset) {
                  event.preventDefault();
                  choosePreset(preset.prompt);
                  return;
                }
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setSlashOpen(false);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
            if (event.key === "Escape" && isBusy) {
              event.preventDefault();
              onStop();
            }
          }}
        />
        <div className="chat-composer-toolbar">
          <div className="chat-composer-left">
            <button type="button" className="chat-attach-button" aria-label="Attach a sprite or sound" onClick={() => fileRef.current?.click()} disabled={isBusy || uploading}>
              <Paperclip size={15} />
              <span>Attach</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept={ACCEPT}
              onChange={(event) => {
                onFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <div className="chat-mode-switch" role="tablist" aria-label="Agent mode">
              {(["ask", "build", "plan"] as AgentMode[]).map((candidate) => {
                const disabled = (candidate === "build" || candidate === "plan") && !canBuildPlan;
                return (
                  <button
                    key={candidate}
                    type="button"
                    role="tab"
                    aria-selected={mode === candidate}
                    disabled={disabled}
                    onClick={() => onModeChange(candidate)}
                  >
                    {candidate[0]!.toUpperCase() + candidate.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="chat-composer-right">
            {input.length > 0 && <button type="button" className="chat-clear-composer" aria-label="Clear message" onClick={() => changeInput("")}><X size={13} /></button>}
            {uploading ? (
              <button type="button" className="chat-send-button" aria-label="Adding files" disabled><Loader2 size={14} className="spin" /></button>
            ) : isBusy ? (
              <button type="button" className="chat-send-button is-stop" onClick={onStop} aria-label="Stop" data-testid="agent-stop"><Square size={12} fill="currentColor" /></button>
            ) : (
              <button type="button" className="chat-send-button" onClick={() => void submit()} disabled={!canSend} aria-label="Send" data-testid="agent-send"><ArrowUp size={15} /></button>
            )}
          </div>
        </div>
      </div>
      <div className="chat-composer-hint">Enter to send · Shift+Enter for a new line · Drop files anywhere</div>
    </div>
  );
}
