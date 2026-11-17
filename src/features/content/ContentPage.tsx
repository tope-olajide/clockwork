import { useMemo, useState } from "react";
import { Boxes, Pencil, Plus, Scissors, Undo2 } from "lucide-react";
import { Button, Input, NumberInput } from "../../components/ui";
import { useEngineStore } from "../../engine/store/engine-store";
import type { Prefab } from "../../engine/model/schema";

export function ContentPage() {
  const document = useEngineStore((state) => state.document);
  const activeSceneId = useEngineStore((state) => state.activeSceneId);
  const activeLayerId = useEngineStore((state) => state.activeLayerId);
  const selection = useEngineStore((state) => state.selection);
  const dispatch = useEngineStore((state) => state.dispatch);
  const [count, setCount] = useState(1);
  const [spacing, setSpacing] = useState(48);
  const [message, setMessage] = useState<string | null>(null);
  const [editingPrefabId, setEditingPrefabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const scene = document?.scenes.find((candidate) => candidate.id === activeSceneId) ?? document?.scenes[0] ?? null;
  const readOnly = Boolean(document?.archivedAt);

  const instanceCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (!document) return map;
    const byPrefab = new Map<string, Set<string>>();
    for (const s of document.scenes) {
      for (const o of s.objects) {
        if (!o.prefabId || !o.prefabInstanceId) continue;
        if (!byPrefab.has(o.prefabId)) byPrefab.set(o.prefabId, new Set());
        byPrefab.get(o.prefabId)!.add(o.prefabInstanceId);
      }
    }
    for (const [id, set] of byPrefab) map.set(id, set.size);
    return map;
  }, [document]);

  if (!document || !scene) return <div className="panel-helper" style={{ padding: 16 }}>No scene is open.</div>;

  const selected = scene.objects.find((object) => object.id === selection[0]) ?? null;
  const selectedInstanceId = selected?.prefabInstanceId ?? null;

  function instantiate(prefabId: string) {
    const layerId = activeLayerId ?? scene!.layers[0]?.id;
    const result = dispatch("prefab.instantiate", { prefabId, sceneId: scene!.id, layerId, count, spacing });
    if (result.ok) setMessage(`Instantiated prefab${count === 1 ? "" : ` ×${count}`}.`);
    else setMessage(result.error);
  }

  function detach() {
    if (!selectedInstanceId) return;
    const result = dispatch("prefab.detach", { sceneId: scene!.id, instanceId: selectedInstanceId });
    if (result.ok) setMessage("Prefab instance detached. Future prefab edits will no longer affect it.");
    else setMessage(result.error);
  }

  function revert() {
    if (!selectedInstanceId) return;
    const result = dispatch("prefab.revert", { sceneId: scene!.id, instanceId: selectedInstanceId });
    if (result.ok) setMessage("Prefab overrides reverted.");
    else setMessage(result.error);
  }

  function beginEdit(prefab: Prefab) {
    setEditingPrefabId(prefab.id);
    setEditingName(prefab.name);
  }

  function savePrefabEdit(prefabId: string) {
    const prefab = document!.prefabs.find((p) => p.id === prefabId);
    if (!prefab) return;
    const result = dispatch("prefab.update", { prefabId, patch: { name: editingName.trim() || prefab.name } });
    const instances = instanceCounts.get(prefabId) ?? 0;
    if (result.ok) setMessage(`Prefab updated. Applied to ${instances} instance${instances === 1 ? "" : "s"}.`);
    else setMessage(result.error);
    setEditingPrefabId(null);
  }

  function applySelectedToPrefab() {
    if (!selected?.prefabId) return;
    const prefab = document!.prefabs.find((p) => p.id === selected.prefabId);
    if (!prefab) return;
    const rootPatch = {
      name: selected.name,
      visual: selected.visual ?? null,
      body: selected.body ?? null,
      behaviors: selected.behaviors,
      animations: selected.animations ?? null,
      properties: selected.properties,
      tags: selected.tags,
    };
    const result = dispatch("prefab.update", { prefabId: prefab.id, patch: { root: rootPatch } });
    const instances = instanceCounts.get(prefab.id) ?? 0;
    if (result.ok) setMessage(`Prefab updated from selection. Applied to ${instances} instance${instances === 1 ? "" : "s"} (overrides preserved).`);
    else setMessage(result.error);
  }

  return (
    <div className="content-page">
      <section className="content-panel">
        <div className="logic-section-head">
          <h2>Prefabs</h2>
          <span className="row-meta">{document.prefabs.length}</span>
        </div>
        <p className="panel-helper">Create prefabs from the scene canvas context menu, instantiate reusable objects here, and update prefabs with changes applied to all instances (overrides preserved).</p>
        <div className="prefab-controls">
          <label className="field-row"><span>Count</span><NumberInput value={count} min={1} max={100} aria-label="Prefab instance count" disabled={readOnly} onChange={(event) => setCount(Math.max(1, Number(event.target.value) || 1))} /></label>
          <label className="field-row"><span>Spacing</span><NumberInput value={spacing} aria-label="Prefab spacing" disabled={readOnly} onChange={(event) => setSpacing(Number(event.target.value) || 0)} /></label>
        </div>
        <div className="prefab-grid">
          {document.prefabs.map((prefab) => {
            const instances = instanceCounts.get(prefab.id) ?? 0;
            return (
              <article key={prefab.id} className="prefab-card">
                <div className="prefab-card-head">
                  <Boxes size={14} />
                  {editingPrefabId === prefab.id ? (
                    <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} aria-label={`Prefab ${prefab.name} name`} disabled={readOnly} />
                  ) : (
                    <strong>{prefab.name}</strong>
                  )}
                </div>
                <div className="panel-helper">{prefab.objects.length + 1} objects · {instances} instance{instances === 1 ? "" : "s"}</div>
                <div className="prefab-card-actions">
                  <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => instantiate(prefab.id)}>
                    <Plus size={12} /> Instantiate
                  </Button>
                  {editingPrefabId === prefab.id ? (
                    <Button variant="primary" size="sm" disabled={readOnly} onClick={() => savePrefabEdit(prefab.id)}>Save ({instances} inst.)</Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => beginEdit(prefab)}><Pencil size={12} /> Edit</Button>
                  )}
                </div>
              </article>
            );
          })}
          {document.prefabs.length === 0 && <div className="panel-helper">No prefabs yet. Right-click an object in the scene and choose “Create prefab”.</div>}
        </div>
      </section>

      <section className="content-panel">
        <div className="logic-section-head">
          <h2>Selection</h2>
        </div>
        {selected ? (
          <>
            <div className="details-list">
              <div className="detail-row"><span>Object</span><span className="value">{selected.name}</span></div>
              <div className="detail-row"><span>Prefab</span><span className="value">{selected.prefabId ?? "—"}</span></div>
              <div className="detail-row"><span>Instance</span><span className="value input-mono">{selected.prefabInstanceId ?? "—"}</span></div>
              <div className="detail-row"><span>Overrides</span><span className="value">{selected.prefabOverrides ? Object.keys(selected.prefabOverrides).join(", ") : "none"}</span></div>
            </div>
            <div className="prefab-instance-actions">
              <Button variant="secondary" size="sm" disabled={readOnly || !selectedInstanceId} onClick={detach}><Scissors size={12} /> Detach instance</Button>
              <Button variant="ghost" size="sm" disabled={readOnly || !selectedInstanceId || !selected.prefabOverrides} onClick={revert}><Undo2 size={12} /> Revert overrides</Button>
              <Button variant="primary" size="sm" disabled={readOnly || !selected.prefabId} onClick={applySelectedToPrefab}>Update prefab from selection</Button>
            </div>
            {selected.prefabOverrides && <p className="panel-helper">This instance has overrides; prefab edits update it but keep overridden fields.</p>}
            {selectedInstanceId && !selected.prefabOverrides && <p className="panel-helper">This instance follows its prefab.</p>}
            {selected.prefabId && <p className="panel-helper">Updating the prefab applies to {instanceCounts.get(selected.prefabId) ?? 0} instance(s).</p>}
          </>
        ) : (
          <p className="panel-helper">Select a scene object to inspect prefab overrides and detach/revert controls.</p>
        )}
      </section>

      <section className="content-panel">
        <div className="logic-section-head"><h2>Assets & clips</h2></div>
        <div className="details-list">
          <div className="detail-row"><span>Assets</span><span className="value">{document.assets.length}</span></div>
          <div className="detail-row"><span>Animation clips</span><span className="value">{document.assets.reduce((sum, asset) => sum + (asset.animations?.length ?? 0), 0)}</span></div>
        </div>
        <p className="panel-helper">Animation clips are authored in the Presentation workspace and assigned to sprite objects.</p>
      </section>
      {message && <div className="logic-error">{message}</div>}
    </div>
  );
}
