import { useMemo, useState } from "react";
import type { ModelInfo, ProviderInfo } from "../../engine/ai/api";

interface Props {
  value: string | null;
  onChange: (modelId: string | null) => void;
  onOpenSettings?: () => void;
  models: ModelInfo[];
  providers: ProviderInfo[];
  settings: { defaultModelId: string | null; mock: boolean } | null;
  label?: string;
}

export function ModelPicker({ value, onChange, onOpenSettings, models, providers, settings, label }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return models.filter((m) => !needle || m.label.toLowerCase().includes(needle) || m.id.toLowerCase().includes(needle) || m.providerId.toLowerCase().includes(needle));
  }, [models, q]);

  const effective = value ?? settings?.defaultModelId ?? null;
  const selected = effective ? models.find((m) => m.id === effective) : null;
  const resolvedLabel = label ?? (settings?.mock ? "MOCK" : (selected?.label ?? (effective ? effective : "Select model")));

  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="agent-model" onClick={() => setOpen((v) => !v)} title="Model picker">
        {resolvedLabel}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 80, width: 360, maxHeight: 360, overflow: "auto", background: "var(--bg-1, #16181d)", border: "1px solid var(--border, #2a2f3a)", borderRadius: 8, padding: 8, boxShadow: "0 12px 30px rgba(0,0,0,.35)" }}>
          {settings?.mock ? (
            <div className="muted" style={{ fontSize: 12, padding: 6 }}>AI_MOCK=1 enabled. Mock transport is active.</div>
          ) : (
            <>
              <input className="agent-input" style={{ minHeight: 30, marginBottom: 8 }} placeholder="Search models…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div style={{ display: "grid", gap: 4 }}>
                <button className="agent-suggestion" onClick={() => { onChange(null); setOpen(false); }}>Use default {settings?.defaultModelId ? `(${settings.defaultModelId})` : "(none)"}</button>
                {filtered.map((m) => {
                  const p = providerById.get(m.providerId);
                  const configured = Boolean(p?.key.configured || p?.local);
                  return (
                    <button key={m.id} className="agent-suggestion" disabled={!configured} onClick={() => { onChange(m.id); setOpen(false); }} title={!configured ? "No key configured for this provider" : m.id} style={{ opacity: configured ? 1 : 0.5, textAlign: "left" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span>{m.label}{m.recommended ? " ★" : ""}</span>
                        <span className="muted" style={{ fontSize: 11 }}>{m.providerId}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {m.tools ? "TOOLS " : ""}{m.vision ? "VISION " : ""}{p?.local ? "LOCAL " : ""}{Math.round(m.contextWindow / 1000)}k ctx{!configured ? " · no key" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
              {onOpenSettings && <button className="agent-suggestion" onClick={() => { setOpen(false); onOpenSettings(); }} style={{ marginTop: 8 }}>Open settings</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
