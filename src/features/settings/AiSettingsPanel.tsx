import { useEffect, useMemo, useState } from "react";
import { Button, Input, useToast } from "../../components/ui";
import type { KaneCliStatus } from "@shared/protocol/kane";
import { fetchKaneStatus } from "../../engine/ai/kane-api";
import {
  createCustomModel,
  createCustomProvider,
  deleteCustomProvider,
  deleteProviderKey,
  fetchAiSettings,
  fetchModels,
  fetchProviders,
  saveAiSettings,
  saveProviderKey,
  testProvider,
  type ModelInfo,
  type ProviderInfo,
} from "../../engine/ai/api";

export function AiSettingsPanel() {
  const toast = useToast();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [keyMode, setKeyMode] = useState<Record<string, "vault" | "session">>({});
  const [customProvider, setCustomProvider] = useState({ name: "", baseUrl: "" });
  const [customModel, setCustomModel] = useState({ providerId: "", model: "", label: "", contextWindow: "8192", tools: true, vision: false });
  const [kane, setKane] = useState<KaneCliStatus | null>(null);
  const [kaneBusy, setKaneBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [p, m, s] = await Promise.all([fetchProviders(), fetchModels(), fetchAiSettings()]);
      setProviders(p.providers);
      setModels(m.models);
      setDefaultModelId(s.settings.defaultModelId);
      setMock(s.settings.mock);
    } catch (e) {
      toast.push("AI settings unavailable", e instanceof Error ? e.message : "Could not load AI settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function testKane() {
    setKaneBusy(true);
    try {
      setKane(await fetchKaneStatus(true));
      toast.push("Kane checked", "Status refreshed from the local Kane CLI.");
    } catch (e) {
      toast.push("Kane unavailable", e instanceof Error ? e.message : "Could not reach Kane.");
    } finally { setKaneBusy(false); }
  }

  const modelsByProvider = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const arr = map.get(m.providerId) ?? [];
      arr.push(m);
      map.set(m.providerId, arr);
    }
    return map;
  }, [models]);

  async function onSaveDefault(id: string | null) {
    try {
      const res = await saveAiSettings({ defaultModelId: id });
      setDefaultModelId(res.settings.defaultModelId);
      toast.push("Default model updated", id || "None");
    } catch (e) { toast.push("Could not save default", e instanceof Error ? e.message : "Failed"); }
  }
  async function onSaveKey(providerId: string) {
    const key = (keyDrafts[providerId] ?? "").trim();
    if (!key) return;
    setBusy(`key:${providerId}`);
    try {
      await saveProviderKey(providerId, { key, mode: keyMode[providerId] ?? "vault" });
      setKeyDrafts((d) => ({ ...d, [providerId]: "" }));
      toast.push("Key saved", `${providerId} (${keyMode[providerId] ?? "vault"})`);
      await refresh();
    } catch (e) { toast.push("Could not save key", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }
  async function onDeleteKey(providerId: string) {
    setBusy(`del:${providerId}`);
    try { await deleteProviderKey(providerId); toast.push("Key removed", providerId); await refresh(); }
    catch (e) { toast.push("Could not remove key", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }
  async function onTest(providerId: string) {
    setBusy(`test:${providerId}`);
    try { await testProvider(providerId); toast.push("Connection OK", providerId); }
    catch (e) { toast.push("Connection failed", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }
  async function onAddCustomProvider() {
    if (!customProvider.name.trim() || !customProvider.baseUrl.trim()) return;
    setBusy("custom-provider");
    try {
      await createCustomProvider({ name: customProvider.name.trim(), baseUrl: customProvider.baseUrl.trim() });
      setCustomProvider({ name: "", baseUrl: "" });
      toast.push("Custom provider added");
      await refresh();
    } catch (e) { toast.push("Could not add provider", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }
  async function onAddCustomModel() {
    if (!customModel.providerId || !customModel.model.trim()) return;
    setBusy("custom-model");
    try {
      await createCustomModel({ providerId: customModel.providerId, model: customModel.model.trim(), label: customModel.label.trim() || undefined, contextWindow: Number(customModel.contextWindow) || 8192, tools: customModel.tools, vision: customModel.vision });
      setCustomModel((s) => ({ ...s, model: "", label: "" }));
      toast.push("Custom model added");
      await refresh();
    } catch (e) { toast.push("Could not add model", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="settings-card"><p>Loading AI settings…</p></div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="settings-card">
        <div className="section-heading-row"><h2>AI Models</h2></div>
        <p className="muted">Keys are stored server-side only (env, encrypted vault in <code>.data</code>, or session memory) and are never sent to the browser.</p>
        {mock && <p className="muted"><strong>AI_MOCK=1</strong> enabled — agent labeled <strong>MOCK</strong>.</p>}
        <label className="field-row full"><span>Default model</span>
          <select value={defaultModelId ?? ""} onChange={(e) => void onSaveDefault(e.target.value || null)}>
            <option value="">(none)</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.providerId}{m.tools ? " · tools" : ""}{m.vision ? " · vision" : ""} · {Math.round(m.contextWindow / 1000)}k</option>)}
          </select>
        </label>
      </section>

      <section className="settings-card">
        <div className="section-heading-row"><h2>Providers &amp; keys</h2></div>
        <div style={{ display: "grid", gap: 12 }}>
          {providers.map((p) => (
            <div key={p.id} style={{ border: "1px solid var(--border, #2a2f3a)", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div><strong>{p.name}</strong> <span className="muted">({p.id})</span></div>
                <div className="muted">Key: <strong>{p.key.source.toUpperCase()}</strong>{p.key.hint ? ` · ${p.key.hint}` : ""}</div>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>{p.baseUrl}{p.envKeyName ? ` · env ${p.envKeyName}` : ""}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {p.key.source === "env" ? (
                  <span className="muted">Environment key is read-only.</span>
                ) : (
                  <>
                    <Input placeholder="API key" type="password" value={keyDrafts[p.id] ?? ""} onChange={(e) => setKeyDrafts((d) => ({ ...d, [p.id]: e.target.value }))} style={{ minWidth: 220 }} />
                    <select value={keyMode[p.id] ?? "vault"} onChange={(e) => setKeyMode((m) => ({ ...m, [p.id]: e.target.value as "vault" | "session" }))}>
                      <option value="vault">Save to vault</option>
                      <option value="session">Session only</option>
                    </select>
                    <Button variant="secondary" size="sm" disabled={!keyDrafts[p.id]?.trim() || busy === `key:${p.id}`} onClick={() => void onSaveKey(p.id)}>Save key</Button>
                    {p.key.configured && <Button variant="ghost" size="sm" disabled={busy === `del:${p.id}`} onClick={() => void onDeleteKey(p.id)}>Remove</Button>}
                  </>
                )}
                <Button variant="ghost" size="sm" disabled={busy === `test:${p.id}`} onClick={() => void onTest(p.id)}>Test connection</Button>
                {!p.builtIn && <Button variant="ghost" size="sm" onClick={() => void deleteCustomProvider(p.id).then(refresh)}>Delete provider</Button>}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Models: {(modelsByProvider.get(p.id) ?? []).map((m) => `${m.label}${m.tools ? " [tools]" : ""}${m.vision ? " [vision]" : ""}`).join(", ") || "none"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="section-heading-row"><h2>Custom provider</h2></div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr auto" }}>
          <Input placeholder="Name" value={customProvider.name} onChange={(e) => setCustomProvider((s) => ({ ...s, name: e.target.value }))} />
          <Input placeholder="Base URL (https://.../v1)" value={customProvider.baseUrl} onChange={(e) => setCustomProvider((s) => ({ ...s, baseUrl: e.target.value }))} />
          <Button variant="secondary" onClick={() => void onAddCustomProvider()} disabled={busy === "custom-provider"}>Add</Button>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>OpenAI-compatible providers only. HTTPS required (HTTP allowed for localhost).</p>
      </section>

      <section className="settings-card">
        <div className="section-heading-row"><h2>Custom model</h2></div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr" }}>
          <label className="field-row full"><span>Provider</span>
            <select value={customModel.providerId} onChange={(e) => setCustomModel((s) => ({ ...s, providerId: e.target.value }))}>
              <option value="">Select provider</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field-row full"><span>Model id</span><Input placeholder="e.g. gpt-4o-mini" value={customModel.model} onChange={(e) => setCustomModel((s) => ({ ...s, model: e.target.value }))} /></label>
          <label className="field-row full"><span>Label</span><Input placeholder="Optional" value={customModel.label} onChange={(e) => setCustomModel((s) => ({ ...s, label: e.target.value }))} /></label>
          <label className="field-row full"><span>Context window</span><Input value={customModel.contextWindow} onChange={(e) => setCustomModel((s) => ({ ...s, contextWindow: e.target.value }))} /></label>
          <label className="logic-check"><input type="checkbox" checked={customModel.tools} onChange={(e) => setCustomModel((s) => ({ ...s, tools: e.target.checked }))} /> Tools</label>
          <label className="logic-check"><input type="checkbox" checked={customModel.vision} onChange={(e) => setCustomModel((s) => ({ ...s, vision: e.target.checked }))} /> Vision</label>
        </div>
        <div style={{ marginTop: 8 }}><Button variant="secondary" onClick={() => void onAddCustomModel()} disabled={busy === "custom-model"}>Add model</Button></div>
      </section>

      <section className="settings-card" data-testid="settings-kane">
        <div className="section-heading-row"><h2>Kane</h2></div>
        <p className="muted">Kane is the browser verification layer. AI Play uses it to play an immutable snapshot and reports the run back to the editor. Kane never receives an API key or provider secret.</p>
        <div className="field-grid" style={{ marginTop: 8 }}>
          <div className="detail-row"><span>CLI</span><span className="value input-mono">{kane?.installed ? (kane.version ?? "installed") : "not checked"}</span></div>
          <div className="detail-row"><span>Signed in</span><span className="value">{kane?.authenticated ? (kane.user ?? "yes") : "no"}</span></div>
          <div className="detail-row"><span>Engine QA</span><span className="value">{kane?.qaEnabled ? "enabled" : "disabled"}</span></div>
          <div className="detail-row"><span>AI Play</span><span className="value">{kane?.aiPlayEnabled ? "enabled" : "disabled"}</span></div>
          <div className="detail-row"><span>Evidence folder</span><span className="value input-mono">{kane?.evidenceDir ?? ".data/ai-play"}</span></div>
        </div>
        {kane?.reason && <p className="muted" style={{ color: "var(--amber)" }}>{kane.reason}</p>}
        <div className="layer-editor-actions" style={{ marginTop: 10 }}>
          <Button variant="secondary" size="sm" disabled={kaneBusy} onClick={() => void testKane()} data-testid="kane-test">{kaneBusy ? "Checking…" : "Test Kane"}</Button>
          <span className="muted" style={{ fontSize: 11 }}>Set KANE_ENABLED=1 and KANE_AI_PLAY_ENABLED=1 on the server to enable runs.</span>
        </div>
      </section>

      <section className="settings-card">
        <div className="section-heading-row"><h2>Data</h2></div>
        <p className="muted">Project data is local in this browser. AI keys are stored server-side. See <code>docs/model-setup.md</code>.</p>
      </section>
    </div>
  );
}
