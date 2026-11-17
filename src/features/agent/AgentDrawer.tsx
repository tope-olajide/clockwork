import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Check, ChevronDown, ChevronRight, Image as ImageIcon, Loader2, Send, Settings, Square, X } from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import type { AgentMode } from "@shared/protocol";
import type { DisplayMessage, AgentUiError, PendingPreview } from "./useAgentSession";
import { ModelPicker } from "./ModelPicker";
import type { ModelInfo, ProviderInfo } from "../../engine/ai/api";
import { PROMPT_PRESETS, suggestionsFor } from "../../engine/ai/prompts";

interface AgentDrawerProps {
  open: boolean;
  onClose: () => void;
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
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
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
}

function statusLabel(status: AgentDrawerProps["status"]) {
  if (status === "thinking") return "thinking";
  if (status === "streaming") return "streaming";
  if (status === "tool") return "running tool";
  if (status === "error") return "error";
  return "ready";
}

export function AgentDrawer(props: AgentDrawerProps) {
  const { open, onClose, projectName, sceneName, revision, selectionCount, mode, onModeChange, messages, status, error, isBusy, onSend, onStop, onRetry, onNewChat, selectedModelId, onSelectModel, models, providers, aiSettings, modelLabel, canBuildPlan, onOpenSettings, pendingPreview, onApplyPreview, onDiscardPreview, lockedSelection, onUnlockSelection } = props;
  const [input, setInput] = useState("");
  const [showJump, setShowJump] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const suggestions = suggestionsFor({ selectionPresent: selectionCount > 0, emptyProject: messages.length === 0, lastChangeFailed: status === "error", noKeyConfigured: !aiSettings?.mock && !models.some((m) => { const provider = providers.find((p) => p.id === m.providerId); return Boolean(provider?.key.configured || provider?.local); }) });
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isBusy) { e.preventDefault(); onStop(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isBusy, onStop]);

  useEffect(() => {
    if (stickRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open, pendingPreview]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = nearBottom;
    setShowJump(!nearBottom);
  }

  function submit(text = input) {
    const t = text.trim();
    if (!t || isBusy) return;
    onSend(t);
    setInput("");
    stickRef.current = true;
  }

  if (!open) return null;

  const modeDisabledReason = !canBuildPlan ? "This model does not support tools, so Build and Plan are unavailable. Ask is read-only." : null;

  return (
    <aside className="agent-drawer" aria-label="Agent drawer">
      <div className="agent-header">
        <div className="agent-header-left">
          <span className="agent-title"><Bot size={14} /> Agent <span className="agent-sub">GAME DIRECTOR</span></span>
          <span className={`agent-status agent-status-${status}`}><span className="dot" /> {statusLabel(status)}</span>
        </div>
        <div className="agent-header-right">
          <ModelPicker value={selectedModelId} onChange={onSelectModel} onOpenSettings={onOpenSettings} models={models} providers={providers} settings={aiSettings} label={modelLabel} />
          <Button variant="ghost" size="sm" onClick={onNewChat} aria-label="New chat">+ Chat</Button>
          <IconButton label="Close agent" onClick={onClose}><X size={14} /></IconButton>
        </div>
      </div>

      <div className="agent-context-row">
        <span className="agent-chip">{projectName} · r{revision}</span>
        {sceneName && <span className="agent-chip">Scene: {sceneName}</span>}
        <span className="agent-chip">{selectionCount} selected</span>
        {lockedSelection && (
          <span className="agent-chip agent-chip-locked">
            Locked: {lockedSelection.name}
            <button type="button" aria-label="Unlock selection" className="agent-chip-x" onClick={onUnlockSelection}><X size={10} /></button>
          </span>
        )}
      </div>

      <div className="agent-mode-row" role="tablist" aria-label="Agent mode">
        {(["ask", "build", "plan"] as AgentMode[]).map((m) => {
          const disabled = (m === "build" || m === "plan") && !canBuildPlan;
          return (
            <button key={m} role="tab" aria-selected={mode === m} aria-disabled={disabled} disabled={disabled} className={`agent-mode ${mode === m ? "active" : ""}`} onClick={() => onModeChange(m)} title={disabled ? modeDisabledReason ?? undefined : undefined}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          );
        })}
        {!canBuildPlan && <span className="agent-mode-note">Build/Plan require a tool-capable model</span>}
      </div>

      <div className="agent-messages" ref={listRef} onScroll={onScroll}>
        {messages.length === 0 ? (
          <div className="agent-empty">
            <h3>What are we building?</h3>
            <p>Ask about the project, inspect live state, or use Build/Plan with a tool-capable model to propose and apply changes.</p>
            <div className="agent-suggestions">
              {suggestions.map((preset) => (
                <button key={preset.id} className="agent-suggestion" onClick={() => { onModeChange(preset.mode); submit(preset.prompt); }}>
                  <strong>{preset.label}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>
            <button className="agent-presets-link" type="button" onClick={() => setPresetOpen((open) => !open)}>All presets</button>
            {presetOpen && (
              <div className="agent-preset-menu" role="menu" aria-label="Prompt presets">
                {PROMPT_PRESETS.map((preset) => (
                  <button key={preset.id} role="menuitem" type="button" onClick={() => { setPresetOpen(false); setInput(preset.prompt); }}>
                    <strong>{preset.label}</strong> <span>{preset.description}</span>
                  </button>
                ))}
              </div>
            )}
            {!aiSettings?.mock && !models.some((m) => {
              const p = providers.find((pr) => pr.id === m.providerId);
              return p?.key.configured || p?.local;
            }) && (
              <div className="agent-error-card" role="status" style={{ marginTop: 12 }}>
                <div className="agent-error-title"><Settings size={14} /> Set up an AI model</div>
                <div className="agent-error-body">No provider key is configured. Add a key or choose a local model in Settings to start chatting.</div>
                <div className="agent-error-actions"><Button variant="secondary" size="sm" onClick={onOpenSettings}>Open settings</Button></div>
              </div>
            )}
          </div>
        ) : (
          messages.map((m) => <MessageView key={m.id} message={m} />)
        )}

        {pendingPreview && (
          <div className={`agent-error-card ${pendingPreview.destructive ? "" : ""}`} role="region" aria-label="Pending change preview" style={{ borderColor: pendingPreview.destructive ? "var(--danger, #d35)" : "var(--accent, #7c5cff)" }}>
            <div className="agent-error-title">
              {pendingPreview.destructive ? <AlertTriangle size={14} /> : <Check size={14} />} {pendingPreview.destructive ? "Confirm changes" : "Proposed changes"}
            </div>
            <div className="agent-error-body">
              <div><strong>{pendingPreview.summary}</strong>{pendingPreview.stale ? " (stale — project changed)" : ""}</div>
              {pendingPreview.changeSet?.changes?.length ? (
                <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                  {pendingPreview.changeSet.changes.slice(0, 8).map((c, i) => (
                    <li key={i}>{c.op} {c.entityKind} “{c.entityName}”{c.fields.length ? ` (${c.fields.length} field${c.fields.length === 1 ? "" : "s"})` : ""}</li>
                  ))}
                </ul>
              ) : <div className="muted">Review the previewed command batch before applying.</div>}
              {pendingPreview.destructive && <div style={{ marginTop: 6, color: "var(--danger, #d35)" }}>This includes destructive changes. Applying may remove content.</div>}
            </div>
            <div className="agent-error-actions">
              <Button variant="primary" size="sm" onClick={onApplyPreview} disabled={pendingPreview.stale}>{pendingPreview.destructive ? "Delete / Apply" : "Apply"}</Button>
              <Button variant="secondary" size="sm" onClick={onDiscardPreview}>Discard</Button>
            </div>
          </div>
        )}

        {error && status === "error" && (
          <div className="agent-error-card" role="alert">
            <div className="agent-error-title"><AlertTriangle size={14} /> {errorTitle(error.code)}</div>
            <div className="agent-error-body">{error.message}</div>
            <div className="agent-error-actions">
              {(error.action === "open-settings" || error.code === "no-key" || error.code === "invalid-key" || error.code === "provider-timeout") && (
                <Button variant="secondary" size="sm" onClick={onOpenSettings}><Settings size={12} /> Open settings</Button>
              )}
              {(error.action === "choose-model" || error.code === "no-model" || error.code === "model-unavailable" || error.code === "no-tools" || error.code === "no-vision") && (
                <Button variant="secondary" size="sm" onClick={() => { (document.querySelector('.agent-model') as HTMLButtonElement | null)?.click(); }}>Choose another model</Button>
              )}
              <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showJump && (
        <button className="agent-jump" onClick={() => { stickRef.current = true; bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }}>Jump to latest</button>
      )}

      <div className="agent-composer">
        {input.startsWith("/") && (
          <div className="agent-preset-menu" role="listbox" aria-label="Preset suggestions">
            {PROMPT_PRESETS.filter((preset) => `${preset.label} ${preset.id}`.toLowerCase().includes(input.slice(1).toLowerCase())).map((preset) => (
              <button key={preset.id} role="option" type="button" onClick={() => setInput(preset.prompt)}>
                <strong>{preset.label}</strong> <span>{preset.description}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          className="agent-input"
          rows={1}
          placeholder="Ask, build, or fix anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === "Escape" && isBusy) { e.preventDefault(); onStop(); }
          }}
          disabled={false}
        />
        <div className="agent-composer-actions">
          {isBusy ? (
            <Button variant="secondary" size="sm" onClick={onStop} aria-label="Stop"><Square size={12} /> Stop</Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => submit()} disabled={!input.trim()} aria-label="Send"><Send size={12} /> Send</Button>
          )}
        </div>
        <div className="agent-composer-hint">⏎ send · ⇧⏎ newline · Esc stop</div>
      </div>
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

function MessageView({ message }: { message: DisplayMessage }) {
  if (message.role === "user") {
    return <div className="agent-msg agent-msg-user"><div className="agent-msg-content">{message.content}</div></div>;
  }
  if (message.role === "tool" && message.toolCard) {
    return <ToolCardView name={message.toolCard.name} args={message.toolCard.args} status={message.toolCard.status} result={message.toolCard.result} />;
  }
  if (message.role === "assistant") {
    if (!message.content && message.streaming) return <div className="agent-msg agent-msg-assistant"><span className="agent-cursor" /></div>;
    if (!message.content) return null;
    return <div className="agent-msg agent-msg-assistant"><div className="agent-msg-content">{message.content}{message.streaming && <span className="agent-cursor" />}</div></div>;
  }
  return null;
}

function ToolCardView({ name, args, status, result }: { name: string; args: unknown; status: string; result?: any }) {
  const [open, setOpen] = useState(false);
  const label: Record<string, string> = {
    list_scenes: "Listing scenes",
    get_scene: "Inspecting scene",
    search_entities: "Searching entities",
    get_object: "Inspecting object",
    get_variables: "Reading variables",
    get_selection: "Reading selection",
    capture_viewport: "Capturing viewport",
    apply_commands: "Applying commands",
    preview_commands: "Previewing commands",
    select_entities: "Selecting entities",
    open_panel: "Opening panel",
    start_playtest: "Starting playtest",
    undo_last_agent_change: "Undoing agent change",
  };
  return (
    <div className={`agent-tool-card ${status}`}>
      <button className="agent-tool-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="agent-tool-label">{label[name] ?? name}</span>
        <span className="agent-tool-status">
          {status === "running" ? <><Loader2 size={12} className="spin" /> running</> : status === "done" ? "done" : status === "error" ? "error" : status}
        </span>
      </button>
      {open && (
        <div className="agent-tool-body">
          <div className="agent-tool-section"><div className="agent-tool-key">Input</div><pre>{JSON.stringify(args, null, 2)}</pre></div>
          {result && <div className="agent-tool-section"><div className="agent-tool-key">Result</div><pre>{JSON.stringify({ ok: result.ok, error: result.error, revision: result.revision, preview: result.preview, changeSet: result.changeSet, data: result.imageDataUrl ? { ...(result.data ?? {}), image: "[png]" } : result.data }, null, 2)}</pre></div>}
          {result?.imageDataUrl && <div className="agent-tool-image"><div className="agent-tool-key"><ImageIcon size={12} /> Captured viewport</div><img src={result.imageDataUrl} alt="Viewport capture" /></div>}
        </div>
      )}
    </div>
  );
}
