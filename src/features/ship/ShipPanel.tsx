import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, FileDown, Loader2, Rocket, Share2, Trash2 } from "lucide-react";
import { Button, Select, useToast } from "../../components/ui";
import { downloadProject } from "../../engine/persistence/transfer";
import { exportStaticGame, sizeLabel } from "../../engine/io/build";
import { collectProjectAssets, createSnapshot, deleteSnapshot } from "../../engine/io/snapshot";
import { useEngineStore } from "../../engine/store/engine-store";
import type { ProjectDocument } from "../../engine/model/schema";

interface ShareState {
  id: string;
  url: string;
  expiresAt: string;
}

export function ShipPanel({ document }: { document: ProjectDocument }) {
  const toast = useToast();
  const saveNow = useEngineStore((state) => state.saveNow);
  const [ttl, setTtl] = useState("24");
  const [busy, setBusy] = useState<"zip" | "share" | "json" | null>(null);
  const [share, setShare] = useState<ShareState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => {
    const objectCount = document.scenes.reduce((sum, scene) => sum + scene.objects.length, 0);
    const assetBytes = document.assets.reduce((sum, asset) => sum + (asset.size || 0), 0);
    return {
      scenes: document.scenes.length,
      objects: objectCount,
      assets: document.assets.length,
      bytes: assetBytes,
    };
  }, [document]);

  async function flushAssets() {
    await saveNow();
    return collectProjectAssets(document);
  }

  async function exportZip() {
    setBusy("zip");
    setError(null);
    try {
      const result = await exportStaticGame(document);
      toast.push("Game exported", `${result.filename} · ${sizeLabel(result.bytes)}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The export failed.";
      setError(message);
      toast.push("Export failed", message);
    } finally {
      setBusy(null);
    }
  }

  async function exportJson() {
    setBusy("json");
    setError(null);
    try {
      const assets = await flushAssets();
      downloadProject(document, assets);
      toast.push("Project exported", "The .clockwork.json file includes its assets.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The export failed.";
      setError(message);
      toast.push("Export failed", message);
    } finally {
      setBusy(null);
    }
  }

  async function shareLink() {
    setBusy("share");
    setError(null);
    try {
      const assets = await flushAssets();
      const created = await createSnapshot(document, { assets, ttlHours: Number(ttl) || 24 });
      setShare(created);
      try {
        await navigator.clipboard.writeText(created.url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        setCopied(false);
      }
      toast.push("Share link created", `Expires ${new Date(created.expiresAt).toLocaleString()}.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The snapshot could not be created.";
      setError(message);
      toast.push("Share failed", message);
    } finally {
      setBusy(null);
    }
  }

  async function copyAgain() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.push("Copy failed", "Select the link and copy it manually.");
    }
  }

  async function removeShare() {
    if (!share) return;
    try {
      await deleteSnapshot(share.id);
      setShare(null);
      toast.push("Share link deleted", "The snapshot URL no longer works.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The link could not be deleted.";
      toast.push("Delete failed", message);
    }
  }

  return (
    <div className="ship-grid">
      <section className="settings-card ship-summary">
        <div className="section-heading-row">
          <h2><Rocket size={16} /> Ship this game</h2>
          <span className="chip">{summary.scenes} scene{summary.scenes === 1 ? "" : "s"}</span>
        </div>
        <p className="panel-helper">Export a self-contained playable build, or create a read-only share link. Assets are flushed from local storage before either action.</p>
        <div className="ship-stats">
          <div><span className="filter-label">Scenes</span><strong>{summary.scenes}</strong></div>
          <div><span className="filter-label">Objects</span><strong>{summary.objects}</strong></div>
          <div><span className="filter-label">Assets</span><strong>{summary.assets}</strong></div>
          <div><span className="filter-label">Asset size</span><strong>{sizeLabel(summary.bytes)}</strong></div>
        </div>
        <div className="layer-editor-actions" style={{ marginTop: 14 }}>
          <Button variant="primary" size="sm" icon={busy === "zip" ? <Loader2 size={13} className="spin" /> : <FileDown size={13} />} disabled={busy !== null} onClick={() => void exportZip()}>
            {busy === "zip" ? "Building…" : "Export .zip"}
          </Button>
          <Button variant="secondary" size="sm" icon={busy === "json" ? <Loader2 size={13} className="spin" /> : <FileDown size={13} />} disabled={busy !== null} onClick={() => void exportJson()}>
            Export .clockwork.json
          </Button>
        </div>
        {error && <div className="ship-error" role="alert">{error}</div>}
      </section>

      <section className="settings-card">
        <div className="section-heading-row">
          <h2><Share2 size={16} /> Share link</h2>
        </div>
        <p className="panel-helper">A snapshot is immutable and read-only. It keeps the current revision, assets and start scene.</p>
        <div className="ship-share-row">
          <Select
            value={ttl}
            onValueChange={setTtl}
            options={[{ value: "24", label: "Expires in 24 hours" }, { value: "168", label: "Expires in 7 days" }]}
            ariaLabel="Share link expiration"
          />
          <Button variant="primary" size="sm" icon={busy === "share" ? <Loader2 size={13} className="spin" /> : <Share2 size={13} />} disabled={busy !== null} onClick={() => void shareLink()}>
            {busy === "share" ? "Creating…" : share ? "Create another link" : "Create share link"}
          </Button>
        </div>

        {share ? (
          <div className="ship-link-card">
            <div className="ship-link-url input-mono" title={share.url}>{share.url}</div>
            <div className="ship-link-meta">Expires {new Date(share.expiresAt).toLocaleString()}</div>
            <div className="layer-editor-actions" style={{ marginTop: 10 }}>
              <Button variant="secondary" size="sm" onClick={() => void copyAgain()} icon={copied ? <Check size={13} /> : <Copy size={13} />}>
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open(share.url, "_blank", "noopener,noreferrer")} icon={<ExternalLink size={13} />}>
                Open as player
              </Button>
              <Button variant="danger" size="sm" onClick={() => void removeShare()} icon={<Trash2 size={13} />}>
                Delete link
              </Button>
            </div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 12 }}>No share link yet. The link works without the editor; gameplay needs only this snapshot.</p>
        )}
      </section>
    </div>
  );
}
