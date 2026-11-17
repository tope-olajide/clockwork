import { useRef, useState } from "react";
import { Boxes, ImagePlus, Trash2, Upload } from "lucide-react";
import { Button, useToast } from "../../components/ui";
import { makeObject } from "../../engine/model/factory";
import { importAssetFile } from "../../engine/assets/asset-store";
import { useEngineStore } from "../../engine/store/engine-store";
import type { Asset } from "../../engine/model/schema";

export function AssetBrowser() {
  const document = useEngineStore((state) => state.document);
  const dispatch = useEngineStore((state) => state.dispatch);
  const saveNow = useEngineStore((state) => state.saveNow);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  if (!document) {
    return <div className="workspace-placeholder"><h2>No project</h2><p>Open a project to manage assets.</p></div>;
  }

  async function onImport(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const result = await importAssetFile(file, document!);
        if (result.reused) {
          toast.push("Already in project", `${result.asset.name} is already imported.`);
          continue;
        }
        const outcome = dispatch("asset.add", { asset: result.asset });
        if (!outcome.ok) {
          toast.push("Import rejected", outcome.error);
          continue;
        }
        toast.push("Asset imported", result.asset.name);
      }
      await saveNow();
    } catch (error) {
      toast.push("Import failed", error instanceof Error ? error.message : "Could not import that file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDelete(asset: Asset) {
    if (!window.confirm(`Delete “${asset.name}”?`)) return;
    const outcome = dispatch("asset.delete", { assetId: asset.id });
    if (!outcome.ok) {
      toast.push("Delete refused", outcome.error);
      return;
    }
    void (async () => {
      const { deleteAssetBlob } = await import("../../engine/assets/asset-store");
      await deleteAssetBlob(asset.id);
      await saveNow();
      toast.push("Asset deleted", asset.name);
    })();
  }

  function addToScene(asset: Asset) {
    const state = useEngineStore.getState();
    const sceneId = state.activeSceneId ?? document!.scenes[0]?.id;
    const scene = document!.scenes.find((candidate) => candidate.id === sceneId);
    const layerId = scene?.layers[0]?.id;
    if (!scene || !layerId) {
      toast.push("No scene", "Open a scene before adding an asset.");
      return;
    }
    const outcome = dispatch("object.create", {
      sceneId: scene.id,
      object: makeObject({
        name: asset.name,
        layerId,
        x: scene.size.w / 2,
        y: scene.size.h / 2,
        width: asset.width ?? 64,
        height: asset.height ?? 64,
        color: "#a9b4ff",
        visual: { kind: "sprite", assetId: asset.id },
      }),
    });
    if (!outcome.ok) toast.push("Add failed", outcome.error);
    else toast.push("Sprite added", asset.name);
  }

  return (
    <div className="assets-browser">
      <div className="assets-toolbar">
        <h2>Assets</h2>
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload size={14} /> Import
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,audio/*"
          style={{ display: "none" }}
          onChange={(event) => void onImport(event.target.files)}
        />
      </div>
      {document.assets.length === 0 ? (
        <div className="workspace-placeholder">
          <Boxes size={32} />
          <p>No assets yet. Import an image or audio file to get started.</p>
        </div>
      ) : (
        <div className="assets-grid">
          {document.assets.map((asset) => (
            <div key={asset.id} className="asset-card">
              {asset.thumbnail ? (
                <img src={asset.thumbnail} alt={asset.name} />
              ) : (
                <div className="asset-thumb-placeholder">{asset.kind}</div>
              )}
              <div className="asset-card-body">
                <strong title={asset.name}>{asset.name}</strong>
                <span>{asset.kind} · {Math.round(asset.size / 1024)} KB</span>
                {asset.width && asset.height ? <span>{asset.width}×{asset.height}</span> : null}
              </div>
              {asset.kind === "image" && (
                <button className="icon-button" aria-label={`Add ${asset.name} to scene`} onClick={() => addToScene(asset)}>
                  <ImagePlus size={12} />
                </button>
              )}
              <button className="icon-button danger" aria-label={`Delete ${asset.name}`} onClick={() => onDelete(asset)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
