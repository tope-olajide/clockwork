import { useEffect, useRef, useState } from "react";
import { Boxes, Film, Grid3X3, ImagePlus, Pencil, Scissors, Search, Trash2, Upload } from "lucide-react";
import { Button, Input, Modal, NumberInput, useToast } from "../../components/ui";
import { makeObject } from "../../engine/model/factory";
import { importAssetFile, readAssetBlob } from "../../engine/assets/asset-store";
import { assetUsage } from "../../engine/commands/registry";
import { useEngineStore } from "../../engine/store/engine-store";
import type { Asset } from "../../engine/model/schema";

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type KindFilter = "all" | "image" | "audio" | "tileset";
type SliceMode = "grid" | "manual";

const KIND_FILTERS: Array<{ key: KindFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "image", label: "Images" },
  { key: "audio", label: "Audio" },
  { key: "tileset", label: "Tilesets" },
];

export function AssetBrowser() {
  const document = useEngineStore((state) => state.document);
  const dispatch = useEngineStore((state) => state.dispatch);
  const saveNow = useEngineStore((state) => state.saveNow);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const [sliceAsset, setSliceAsset] = useState<Asset | null>(null);
  const [sliceMode, setSliceMode] = useState<SliceMode>("grid");
  const [sliceCols, setSliceCols] = useState(4);
  const [sliceRows, setSliceRows] = useState(2);
  const [slicePadding, setSlicePadding] = useState(0);
  const [sliceSpacing, setSliceSpacing] = useState(0);
  const [manualFrames, setManualFrames] = useState<FrameRect[]>([]);
  const [sliceImageUrl, setSliceImageUrl] = useState<string | null>(null);

  const [animAsset, setAnimAsset] = useState<Asset | null>(null);
  const [animName, setAnimName] = useState("clip");
  const [animFps, setAnimFps] = useState(12);
  const [animLoop, setAnimLoop] = useState(true);
  const [animFrames, setAnimFrames] = useState("");
  const [animPlaying, setAnimPlaying] = useState(false);
  const [animIndex, setAnimIndex] = useState(0);
  const [animImageUrl, setAnimImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sliceAsset) {
      setSliceImageUrl(null);
      return;
    }
    let url: string | null = null;
    void (async () => {
      const blob = await readAssetBlob(sliceAsset.id);
      if (!blob) return;
      url = URL.createObjectURL(blob);
      setSliceImageUrl(url);
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [sliceAsset]);

  useEffect(() => {
    if (!animAsset) {
      setAnimImageUrl(null);
      return;
    }
    let url: string | null = null;
    void (async () => {
      const blob = await readAssetBlob(animAsset.id);
      if (!blob) return;
      url = URL.createObjectURL(blob);
      setAnimImageUrl(url);
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [animAsset]);

  useEffect(() => {
    if (!animPlaying || !animAsset) return;
    const frames = parseFrames(animFrames, animAsset);
    if (frames.length === 0) return;
    const interval = window.setInterval(() => {
      setAnimIndex((index) => (index + 1) % frames.length);
    }, 1000 / Math.max(1, animFps));
    return () => window.clearInterval(interval);
  }, [animPlaying, animFps, animFrames, animAsset]);

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

  async function renameAsset(asset: Asset) {
    const name = window.prompt("Rename asset", asset.name)?.trim();
    if (!name || name === asset.name) return;
    if (name.length > 120) {
      toast.push("Rename failed", "Asset names are limited to 120 characters.");
      return;
    }
    const outcome = dispatch("asset.update", { assetId: asset.id, patch: { name } });
    if (!outcome.ok) {
      toast.push("Rename failed", outcome.error);
      return;
    }
    await saveNow();
    toast.push("Asset renamed", name);
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

  function createTilemap(asset: Asset) {
    const state = useEngineStore.getState();
    const sceneId = state.activeSceneId ?? document!.scenes[0]?.id;
    const scene = document!.scenes.find((candidate) => candidate.id === sceneId);
    const layerId = scene?.layers[0]?.id;
    if (!scene || !layerId) {
      toast.push("No scene", "Open a scene before creating a tilemap.");
      return;
    }
    const cols = Number(window.prompt("Tilemap columns", "20") ?? 0);
    const rows = Number(window.prompt("Tilemap rows", "10") ?? 0);
    const tileSize = Number(window.prompt("Tile size", "32") ?? 0);
    if (!cols || !rows || !tileSize) return;
    const outcome = dispatch("tilemap.create", {
      sceneId: scene.id,
      layerId,
      tilesetId: asset.id,
      cols,
      rows,
      tileSize,
      name: `${asset.name} tilemap`,
    });
    if (!outcome.ok) toast.push("Tilemap failed", outcome.error);
    else toast.push("Tilemap created", asset.name);
  }

  function openSlicer(asset: Asset) {
    setSliceAsset(asset);
    setSliceMode("grid");
    setSliceCols(4);
    setSliceRows(2);
    setSlicePadding(0);
    setSliceSpacing(0);
    setManualFrames(asset.slices ? asset.slices.map((frame) => ({ ...frame })) : []);
  }

  function gridSlices(): FrameRect[] {
    if (!sliceAsset || !sliceAsset.width || !sliceAsset.height) return [];
    const cols = Math.max(1, sliceCols);
    const rows = Math.max(1, sliceRows);
    const cellW = Math.floor((sliceAsset.width - slicePadding * 2 - sliceSpacing * (cols - 1)) / cols);
    const cellH = Math.floor((sliceAsset.height - slicePadding * 2 - sliceSpacing * (rows - 1)) / rows);
    const slices: FrameRect[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        slices.push({
          x: slicePadding + col * (cellW + sliceSpacing),
          y: slicePadding + row * (cellH + sliceSpacing),
          w: Math.max(1, cellW),
          h: Math.max(1, cellH),
        });
      }
    }
    return slices;
  }

  function activeSlices(): FrameRect[] {
    return sliceMode === "manual" ? manualFrames : gridSlices();
  }

  async function autoDetectSlices() {
    if (!sliceAsset) return;
    const blob = await readAssetBlob(sliceAsset.id);
    if (!blob) return;
    const bitmap = await createImageBitmap(blob);
    const canvas = window.document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return;
    }
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    bitmap.close();

    const colOpaque = Array.from({ length: bitmap.width }, (_, x) => {
      for (let y = 0; y < bitmap.height; y += 1) {
        if ((data[(y * bitmap.width + x) * 4 + 3] as number) > 8) return true;
      }
      return false;
    });
    const rowOpaque = Array.from({ length: bitmap.height }, (_, y) => {
      for (let x = 0; x < bitmap.width; x += 1) {
        if ((data[(y * bitmap.width + x) * 4 + 3] as number) > 8) return true;
      }
      return false;
    });

    const bands = (opaque: boolean[]) => {
      const result: { start: number; end: number }[] = [];
      let start: number | null = null;
      for (let i = 0; i < opaque.length; i += 1) {
        if (opaque[i] && start === null) start = i;
        if ((!opaque[i] || i === opaque.length - 1) && start !== null) {
          const end = opaque[i] ? i : i - 1;
          result.push({ start, end });
          start = null;
        }
      }
      return result;
    };

    const vBands = bands(colOpaque);
    const hBands = bands(rowOpaque);
    const slices: FrameRect[] = [];
    for (const hb of hBands) {
      for (const vb of vBands) {
        slices.push({ x: vb.start, y: hb.start, w: vb.end - vb.start + 1, h: hb.end - hb.start + 1 });
      }
    }
    if (slices.length === 0) {
      slices.push({ x: 0, y: 0, w: bitmap.width, h: bitmap.height });
    }
    const outcome = dispatch("asset.setSlices", { assetId: sliceAsset.id, slices });
    if (outcome.ok) {
      toast.push("Slices detected", `${slices.length} frames`);
      setSliceAsset(null);
      await saveNow();
    } else toast.push("Slice failed", outcome.error);
  }

  async function saveSlices() {
    if (!sliceAsset) return;
    const slices = activeSlices();
    if (slices.length === 0) {
      toast.push("Slice failed", "Add at least one frame.");
      return;
    }
    const width = sliceAsset.width ?? 0;
    const height = sliceAsset.height ?? 0;
    const invalid = slices.find(
      (frame) =>
        !Number.isFinite(frame.x) ||
        !Number.isFinite(frame.y) ||
        frame.w <= 0 ||
        frame.h <= 0 ||
        frame.x < 0 ||
        frame.y < 0 ||
        (width > 0 && frame.x + frame.w > width) ||
        (height > 0 && frame.y + frame.h > height),
    );
    if (invalid) {
      toast.push("Slice failed", "Every frame must have a positive size and fit inside the image.");
      return;
    }
    const outcome = dispatch("asset.setSlices", { assetId: sliceAsset.id, slices });
    if (!outcome.ok) {
      toast.push("Slice failed", outcome.error);
      return;
    }
    toast.push("Slices saved", `${slices.length} frames`);
    setSliceAsset(null);
    await saveNow();
  }

  function updateFrame(index: number, patch: Partial<FrameRect>) {
    setManualFrames((frames) => frames.map((frame, current) => (current === index ? { ...frame, ...patch } : frame)));
  }

  async function saveAnimation() {
    if (!animAsset) return;
    const frames = parseFrames(animFrames, animAsset);
    const animation = {
      id: `anim_${Math.random().toString(36).slice(2, 10)}`,
      name: animName.trim() || "clip",
      frameIndices: frames,
      fps: Math.max(1, animFps),
      loop: animLoop,
    };
    const outcome = dispatch("asset.addAnimation", { assetId: animAsset.id, animation });
    if (!outcome.ok) {
      toast.push("Animation failed", outcome.error);
      return;
    }
    toast.push("Animation saved", animation.name);
    setAnimAsset(null);
    await saveNow();
  }

  const currentAnimFrames = animAsset ? parseFrames(animFrames, animAsset) : [];
  const currentAnimFrame = currentAnimFrames.length > 0 ? (currentAnimFrames[animIndex % currentAnimFrames.length] as number) : 0;
  const currentAnimRect = animAsset?.slices?.[currentAnimFrame] ?? undefined;

  const normalizedQuery = query.trim().toLowerCase();
  const counts: Record<KindFilter, number> = {
    all: document.assets.length,
    image: document.assets.filter((asset) => asset.kind === "image").length,
    audio: document.assets.filter((asset) => asset.kind === "audio").length,
    tileset: document.assets.filter((asset) => asset.kind === "tileset").length,
  };
  const visibleAssets = document.assets.filter((asset) => {
    if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
    if (!normalizedQuery) return true;
    return `${asset.name} ${asset.tags.join(" ")}`.toLowerCase().includes(normalizedQuery);
  });

  return (
    <div className="assets-browser">
      <div className="assets-toolbar">
        <h2>Assets</h2>
        <label className="assets-search">
          <Search size={14} />
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets…"
            aria-label="Search assets"
          />
        </label>
        <div className="assets-filters" role="group" aria-label="Filter assets by kind">
          {KIND_FILTERS.map((filter) => (
            <Button
              key={filter.key}
              size="sm"
              variant={kindFilter === filter.key ? "primary" : "secondary"}
              aria-pressed={kindFilter === filter.key}
              onClick={() => setKindFilter(filter.key)}
            >
              {filter.label} <span className="row-meta">{counts[filter.key]}</span>
            </Button>
          ))}
        </div>
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
      ) : visibleAssets.length === 0 ? (
        <div className="workspace-placeholder">
          <Boxes size={32} />
          <p>No assets match “{query}”.</p>
          <Button variant="secondary" onClick={() => { setQuery(""); setKindFilter("all"); }}>Clear filters</Button>
        </div>
      ) : (
        <div className="assets-grid">
          {visibleAssets.map((asset) => {
            const usage = assetUsage(document, asset.id);
            return (
              <div
                key={asset.id}
                className="asset-card"
                draggable={asset.kind === "image"}
                onDragStart={(event) => {
                  if (asset.kind !== "image") return;
                  event.dataTransfer.setData("application/x-clockwork-asset", asset.id);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                title={asset.kind === "image" ? "Drag onto the canvas to place it" : asset.name}
              >
                {asset.thumbnail ? (
                  <img src={asset.thumbnail} alt={asset.name} draggable={false} />
                ) : (
                  <div className="asset-thumb-placeholder">{asset.kind}</div>
                )}
                <div className="asset-card-body">
                  <strong title={asset.name}>{asset.name}</strong>
                  <span>{asset.kind} · {Math.round(asset.size / 1024)} KB</span>
                  {asset.width && asset.height ? <span>{asset.width}×{asset.height}</span> : null}
                  {asset.slices?.length ? <span>{asset.slices.length} frames</span> : null}
                  {asset.animations?.length ? <span>{asset.animations.length} clips</span> : null}
                  <span className={`asset-usage${usage.length > 0 ? " in-use" : ""}`}>
                    {usage.length > 0 ? `Used by: ${[...new Set(usage)].join(", ")}` : "Unused"}
                  </span>
                </div>
                <div className="asset-card-actions">
                  {asset.kind === "image" && (
                    <>
                      <button className="icon-button" aria-label={`Add ${asset.name} to scene`} onClick={() => addToScene(asset)}>
                        <ImagePlus size={12} />
                      </button>
                      <button className="icon-button" aria-label={`Slice ${asset.name}`} onClick={() => openSlicer(asset)}>
                        <Scissors size={12} />
                      </button>
                      <button className="icon-button" aria-label={`Animate ${asset.name}`} onClick={() => { setAnimAsset(asset); setAnimFrames(asset.slices?.map((_, index) => index).join(", ") ?? ""); }}>
                        <Film size={12} />
                      </button>
                      <button className="icon-button" aria-label={`Create tilemap from ${asset.name}`} onClick={() => createTilemap(asset)}>
                        <Grid3X3 size={12} />
                      </button>
                    </>
                  )}
                  <button className="icon-button" aria-label={`Rename ${asset.name}`} onClick={() => void renameAsset(asset)}>
                    <Pencil size={12} />
                  </button>
                  <button className="icon-button danger" aria-label={`Delete ${asset.name}`} onClick={() => onDelete(asset)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(sliceAsset)} onOpenChange={(open) => !open && setSliceAsset(null)} title="Slice sprite sheet">
        {sliceAsset && (
          <div className="slice-editor">
            <div className="assets-filters" role="tablist" aria-label="Slice mode">
              <Button size="sm" variant={sliceMode === "grid" ? "primary" : "secondary"} role="tab" aria-selected={sliceMode === "grid"} onClick={() => setSliceMode("grid")}>Grid</Button>
              <Button size="sm" variant={sliceMode === "manual" ? "primary" : "secondary"} role="tab" aria-selected={sliceMode === "manual"} onClick={() => setSliceMode("manual")}>Manual frames</Button>
            </div>
            {sliceMode === "grid" ? (
              <div className="slice-controls">
                <label>Columns <NumberInput value={sliceCols} min={1} onChange={(event) => setSliceCols(Number(event.target.value))} /></label>
                <label>Rows <NumberInput value={sliceRows} min={1} onChange={(event) => setSliceRows(Number(event.target.value))} /></label>
                <label>Padding <NumberInput value={slicePadding} min={0} onChange={(event) => setSlicePadding(Number(event.target.value))} /></label>
                <label>Spacing <NumberInput value={sliceSpacing} min={0} onChange={(event) => setSliceSpacing(Number(event.target.value))} /></label>
              </div>
            ) : (
              <div className="manual-frames">
                {manualFrames.length === 0 && <p className="panel-helper">No manual frames yet. Add one and set its position and size.</p>}
                {manualFrames.map((frame, index) => (
                  <div className="manual-frame-row" key={index}>
                    <span className="row-meta">#{index}</span>
                    <label>X <NumberInput value={frame.x} onChange={(event) => updateFrame(index, { x: Number(event.target.value) })} aria-label={`Frame ${index} x`} /></label>
                    <label>Y <NumberInput value={frame.y} onChange={(event) => updateFrame(index, { y: Number(event.target.value) })} aria-label={`Frame ${index} y`} /></label>
                    <label>W <NumberInput value={frame.w} min={1} onChange={(event) => updateFrame(index, { w: Number(event.target.value) })} aria-label={`Frame ${index} width`} /></label>
                    <label>H <NumberInput value={frame.h} min={1} onChange={(event) => updateFrame(index, { h: Number(event.target.value) })} aria-label={`Frame ${index} height`} /></label>
                    <Button variant="ghost" size="sm" onClick={() => setManualFrames((frames) => frames.filter((_, current) => current !== index))}>Remove</Button>
                  </div>
                ))}
                <div className="dialog-footer">
                  <Button
                    variant="secondary"
                    onClick={() => setManualFrames((frames) => [...frames, { x: 0, y: 0, w: Math.min(64, sliceAsset.width ?? 64), h: Math.min(64, sliceAsset.height ?? 64) }])}
                  >
                    + Add frame
                  </Button>
                </div>
              </div>
            )}
            <div className="slice-preview">
              {sliceImageUrl && (
                <div className="slice-image-wrap">
                  <img src={sliceImageUrl} alt={sliceAsset.name} />
                  <svg className="slice-overlay" viewBox={`0 0 ${sliceAsset.width ?? 1} ${sliceAsset.height ?? 1}`} preserveAspectRatio="none">
                    {activeSlices().map((frame, index) => (
                      <g key={index}>
                        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="none" stroke="#ff856f" strokeWidth={Math.max(1, (sliceAsset.width ?? 1) / 200)} />
                        <text x={frame.x + 4} y={frame.y + 14} fill="#f1f0ed" fontSize={Math.max(8, (sliceAsset.width ?? 1) / 40)}>{index}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              )}
            </div>
            <div className="dialog-footer">
              <Button variant="secondary" onClick={() => void autoDetectSlices()}>Auto-detect</Button>
              <Button onClick={() => void saveSlices()}>Save slices</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(animAsset)} onOpenChange={(open) => !open && setAnimAsset(null)} title="Animation clip">
        {animAsset && (
          <div className="animation-editor">
            <label>Name <Input value={animName} onChange={(event) => setAnimName(event.target.value)} /></label>
            <label>FPS <NumberInput value={animFps} min={1} onChange={(event) => setAnimFps(Number(event.target.value))} /></label>
            <label>Frames <Input value={animFrames} onChange={(event) => setAnimFrames(event.target.value)} placeholder="0,1,2,3" /></label>
            <label><input type="checkbox" checked={animLoop} onChange={(event) => setAnimLoop(event.target.checked)} /> Loop</label>
            <div className="animation-preview">
              {animImageUrl && currentAnimRect && (
                <canvas
                  width={currentAnimRect.w}
                  height={currentAnimRect.h}
                  ref={(canvas) => {
                    if (!canvas || !animImageUrl) return;
                    const context = canvas.getContext("2d");
                    if (!context) return;
                    const image = new Image();
                    image.onload = () => {
                      context.clearRect(0, 0, canvas.width, canvas.height);
                      context.drawImage(image, currentAnimRect.x, currentAnimRect.y, currentAnimRect.w, currentAnimRect.h, 0, 0, canvas.width, canvas.height);
                    };
                    image.src = animImageUrl;
                  }}
                />
              )}
            </div>
            <div className="dialog-footer">
              <Button variant="secondary" onClick={() => setAnimPlaying((value) => !value)}>{animPlaying ? "Pause" : "Play"}</Button>
              <Button onClick={() => void saveAnimation()}>Save clip</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function parseFrames(value: string, asset: Asset): number[] {
  const total = asset.slices?.length ?? 0;
  const parsed = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((number) => Number.isInteger(number) && number >= 0 && (total === 0 || number < total));
  return parsed.length > 0 ? parsed : Array.from({ length: total }, (_, index) => index);
}
