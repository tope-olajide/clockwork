import { useState } from "react";
import { Boxes, Plus, Scissors, Undo2 } from "lucide-react";
import { Button, NumberInput } from "../../components/ui";
import { useEngineStore } from "../../engine/store/engine-store";

export function ContentPage() {
  const document = useEngineStore((state) => state.document);
  const activeSceneId = useEngineStore((state) => state.activeSceneId);
  const activeLayerId = useEngineStore((state) => state.activeLayerId);
  const selection = useEngineStore((state) => state.selection);
  const setSelection = useEngineStore((state) => state.setSelection);
  const dispatch = useEngineStore((state) => state.dispatch);
  const [count, setCount] = useState(1);
  const [spacing, setSpacing] = useState(48);
  const [message, setMessage] = useState<string | null>(null);
  const scene = document?.scenes.find((candidate) => candidate.id === activeSceneId) ?? document?.scenes[0] ?? null;
  const readOnly = Boolean(document?.archivedAt);

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

  return (
    <div className="content-page">
      <section className="content-panel">
        <div className="logic-section-head">
          <h2>Prefabs</h2>
          <span className="row-meta">{document.prefabs.length}</span>
        </div>
        <p className="panel-helper">Create prefabs from the scene canvas context menu, then instantiate reusable objects here.</p>
        <div className="prefab-controls">
          <label className="field-row"><span>Count</span><NumberInput value={count} min={1} max={100} aria-label="Prefab instance count" disabled={readOnly} onChange={(event) => setCount(Math.max(1, Number(event.target.value) || 1))} /></label>
          <label className="field-row"><span>Spacing</span><NumberInput value={spacing} aria-label="Prefab spacing" disabled={readOnly} onChange={(event) => setSpacing(Number(event.target.value) || 0)} /></label>
        </div>
        <div className="prefab-grid">
          {document.prefabs.map((prefab) => (
            <article key={prefab.id} className="prefab-card">
              <div className="prefab-card-head">
                <Boxes size={14} />
                <strong>{prefab.name}</strong>
              </div>
              <div className="panel-helper">{prefab.objects.length + 1} objects</div>
              <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => instantiate(prefab.id)}>
                <Plus size={12} /> Instantiate
              </Button>
            </article>
          ))}
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
              <Button variant="ghost" size="sm" onClick={() => selected.prefabId && document.prefabs.find((prefab) => prefab.id === selected.prefabId) && setSelection([])}>Clear</Button>
            </div>
            {selected.prefabOverrides && <p className="panel-helper">This instance has overrides; prefab edits update it but keep these fields.</p>}
            {selectedInstanceId && !selected.prefabOverrides && <p className="panel-helper">This instance follows its prefab.</p>}
          </>
        ) : (
          <p className="panel-helper">Select a scene object to inspect prefab overrides and detach/revert controls.</p>
        )}
      </section>

      <section className="content-panel">
        <div className="logic-section-head"><h2>Assets & clips</h2></div>
        <div className="details-list">
          <div className="detail-row"><span>Assets</span><span className="value">{document.assets.length}</span></div>
          <div className="detail-row"><span>Animation clips</span><span className="value">{document.assets.reduce((count, asset) => count + (asset.animations?.length ?? 0), 0)}</span></div>
        </div>
        <p className="panel-helper">Animation clips are authored in the Presentation workspace and assigned to sprite objects.</p>
      </section>
      {message && <div className="logic-error">{message}</div>}
    </div>
  );
}
