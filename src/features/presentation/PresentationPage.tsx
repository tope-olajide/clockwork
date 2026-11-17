import { useEffect, useMemo, useState } from "react";
import { Button, Input, NumberInput } from "../../components/ui";
import { newId } from "../../engine/model/factory";
import type { HudWidget } from "../../engine/model/schema";
import { useEngineStore } from "../../engine/store/engine-store";
import type { PresentationTab } from "../editor/EngineDocks";

const KEY_OPTIONS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Enter", "Escape", "KeyA", "KeyD", "KeyW", "KeyS", "KeyE", "KeyQ", "ShiftLeft"];

export function PresentationPage({ tab }: { tab: PresentationTab }) {
  const document = useEngineStore((state) => state.document);
  const activeSceneId = useEngineStore((state) => state.activeSceneId);
  const dispatch = useEngineStore((state) => state.dispatch);
  const scene = document?.scenes.find((candidate) => candidate.id === activeSceneId) ?? document?.scenes[0] ?? null;
  const readOnly = Boolean(document?.archivedAt);
  if (!document || !scene) return <div className="panel-helper" style={{ padding: 16 }}>No scene is open.</div>;

  if (tab === "look") return <LookTab document={document} scene={scene} dispatch={dispatch} readOnly={readOnly} />;
  if (tab === "animation") return <AnimationTab document={document} scene={scene} dispatch={dispatch} readOnly={readOnly} />;
  if (tab === "audio") return <AudioTab document={document} scene={scene} dispatch={dispatch} readOnly={readOnly} />;
  return <UiTab document={document} dispatch={dispatch} readOnly={readOnly} />;
}

function LookTab({ document, scene, dispatch, readOnly }: { document: NonNullable<ReturnType<typeof useEngineStore.getState>["document"]>; scene: NonNullable<ReturnType<typeof useActiveScene>>; dispatch: ReturnType<typeof useEngineStore.getState>["dispatch"]; readOnly: boolean }) {
  const [width, setWidth] = useState(String(document.settings.width));
  const [height, setHeight] = useState(String(document.settings.height));
  const [background, setBackground] = useState(scene.background.color);

  useEffect(() => {
    setWidth(String(document.settings.width));
    setHeight(String(document.settings.height));
    setBackground(scene.background.color);
  }, [document.id, document.settings.width, document.settings.height, scene.id, scene.background.color]);

  function save() {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    dispatch("project.updateSettings", { settings: { ...document.settings, width: w, height: h, background } });
    dispatch("scene.update", { sceneId: scene.id, patch: { background: { ...scene.background, color: background } } });
  }

  return (
    <div className="presentation-tab">
      <section className="content-panel">
        <h3>Look</h3>
        <div className="field-grid">
          <label className="field-row"><span>Resolution W</span><NumberInput value={width} onChange={(event) => setWidth(event.target.value)} aria-label="Resolution width" disabled={readOnly} /></label>
          <label className="field-row"><span>Resolution H</span><NumberInput value={height} onChange={(event) => setHeight(event.target.value)} aria-label="Resolution height" disabled={readOnly} /></label>
          <label className="field-row full"><span>Scene background</span><Input value={background} onChange={(event) => setBackground(event.target.value)} aria-label="Scene background" disabled={readOnly} className="input-mono" /></label>
          <label className="logic-check"><input type="checkbox" checked={document.settings.pixelArt} disabled={readOnly} onChange={(event) => dispatch("project.updateSettings", { settings: { ...document.settings, pixelArt: event.target.checked } })} /> Pixel art mode</label>
        </div>
        <Button variant="primary" size="sm" onClick={save} disabled={readOnly}>Save look</Button>
      </section>
    </div>
  );
}

function useActiveScene() {
  const document = useEngineStore((state) => state.document);
  const activeSceneId = useEngineStore((state) => state.activeSceneId);
  return document?.scenes.find((candidate) => candidate.id === activeSceneId) ?? document?.scenes[0] ?? null;
}

function AudioTab({ document, scene, dispatch, readOnly }: { document: NonNullable<ReturnType<typeof useEngineStore.getState>["document"]>; scene: NonNullable<ReturnType<typeof useActiveScene>>; dispatch: ReturnType<typeof useEngineStore.getState>["dispatch"]; readOnly: boolean }) {
  const audioAssets = document.assets.filter((asset) => asset.kind === "audio");
  const musicAssetId = scene.audio?.musicAssetId ?? "";
  const loop = scene.audio?.loop ?? true;
  const sceneVolume = scene.audio?.volume ?? 1;

  function updateSceneAudio(patch: Partial<{ musicAssetId: string; loop: boolean; volume: number }>) {
    const nextMusic = patch.musicAssetId !== undefined ? patch.musicAssetId : musicAssetId;
    const nextLoop = patch.loop !== undefined ? patch.loop : loop;
    const nextVolume = patch.volume !== undefined ? patch.volume : sceneVolume;
    dispatch("scene.update", {
      sceneId: scene.id,
      patch: { audio: nextMusic ? { musicAssetId: nextMusic, loop: nextLoop, volume: nextVolume } : null },
    });
  }

  return (
    <div className="presentation-tab">
      <section className="content-panel">
        <h3>Scene music</h3>
        <div className="field-grid">
          <label className="field-row full">
            <span>Track</span>
            <select className="input" value={musicAssetId} aria-label="Scene music track" disabled={readOnly} onChange={(event) => updateSceneAudio({ musicAssetId: event.target.value })}>
              <option value="">None</option>
              {audioAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </select>
          </label>
          <label className="logic-check"><input type="checkbox" checked={loop} disabled={readOnly || !musicAssetId} onChange={(event) => updateSceneAudio({ loop: event.target.checked })} /> Loop</label>
          <label className="field-row"><span>Scene volume</span><NumberInput value={sceneVolume} min={0} max={1} step={0.05} aria-label="Scene music volume" disabled={readOnly} onChange={(event) => updateSceneAudio({ volume: Number(event.target.value) })} /></label>
        </div>
      </section>
      <section className="content-panel">
        <h3>Project audio</h3>
        <div className="field-grid">
          <label className="field-row"><span>Master</span><NumberInput value={document.settings.audio.masterVolume} min={0} max={1} step={0.05} aria-label="Master volume" disabled={readOnly} onChange={(event) => dispatch("project.updateSettings", { settings: { ...document.settings, audio: { ...document.settings.audio, masterVolume: Number(event.target.value) } } })} /></label>
          <label className="field-row"><span>Music</span><NumberInput value={document.settings.audio.musicVolume} min={0} max={1} step={0.05} aria-label="Music volume" disabled={readOnly} onChange={(event) => dispatch("project.updateSettings", { settings: { ...document.settings, audio: { ...document.settings.audio, musicVolume: Number(event.target.value) } } })} /></label>
          <label className="field-row"><span>SFX</span><NumberInput value={document.settings.audio.sfxVolume} min={0} max={1} step={0.05} aria-label="SFX volume" disabled={readOnly} onChange={(event) => dispatch("project.updateSettings", { settings: { ...document.settings, audio: { ...document.settings.audio, sfxVolume: Number(event.target.value) } } })} /></label>
        </div>
        {audioAssets.length === 0 && <p className="panel-helper">No audio assets in this project yet. Import audio in Assets to use SFX or music.</p>}
      </section>
    </div>
  );
}

function UiTab({ document, dispatch, readOnly }: { document: NonNullable<ReturnType<typeof useEngineStore.getState>["document"]>; dispatch: ReturnType<typeof useEngineStore.getState>["dispatch"]; readOnly: boolean }) {
  const [label, setLabel] = useState("Coins");
  const [variable, setVariable] = useState(document.variables[0]?.name ?? "coins");
  const [corner, setCorner] = useState<HudWidget["corner"]>("top-left");
  const [style, setStyle] = useState<HudWidget["style"]>("text");
  const [max, setMax] = useState(10);
  const inputMap = document.settings.inputMap;
  const conflicts = useMemo(() => findInputConflicts(inputMap), [inputMap]);

  function addHud() {
    dispatch("hud.add", {
      widget: { id: newId("hud"), variable, label, corner, style, visible: true, max: style === "bar" ? max : undefined } satisfies HudWidget,
    });
  }

  function setInput(action: string, nextKeys: string[]) {
    dispatch("project.updateSettings", { settings: { ...document.settings, inputMap: { ...document.settings.inputMap, [action]: nextKeys } } });
  }

  return (
    <div className="presentation-tab">
      <section className="content-panel">
        <h3>HUD</h3>
        <div className="hud-list">
          {document.settings.ui.hud.map((widget) => (
            <div key={widget.id} className="hud-row">
              <Input value={widget.label} disabled={readOnly} aria-label={`${widget.label} label`} onChange={(event) => dispatch("hud.update", { widgetId: widget.id, patch: { label: event.target.value } })} />
              <select className="input" value={widget.variable} disabled={readOnly} aria-label={`${widget.label} variable`} onChange={(event) => dispatch("hud.update", { widgetId: widget.id, patch: { variable: event.target.value } })}>
                {document.variables.map((candidate) => <option key={candidate.id} value={candidate.name}>{candidate.name}</option>)}
                {!document.variables.some((candidate) => candidate.name === widget.variable) && <option value={widget.variable}>{widget.variable}</option>}
              </select>
              <select className="input" value={widget.style} disabled={readOnly} aria-label={`${widget.label} style`} onChange={(event) => dispatch("hud.update", { widgetId: widget.id, patch: { style: event.target.value as HudWidget["style"] } })}>
                <option value="text">Text</option>
                <option value="bar">Bar</option>
              </select>
              {widget.style === "bar" && <NumberInput value={widget.max ?? 10} disabled={readOnly} aria-label={`${widget.label} max`} onChange={(event) => dispatch("hud.update", { widgetId: widget.id, patch: { max: Number(event.target.value) || 1 } })} />}
              <select className="input" value={widget.corner} disabled={readOnly} aria-label={`${widget.label} corner`} onChange={(event) => dispatch("hud.update", { widgetId: widget.id, patch: { corner: event.target.value as HudWidget["corner"] } })}>
                <option value="top-left">Top left</option>
                <option value="top-right">Top right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </select>
              <label className="logic-check"><input type="checkbox" checked={widget.visible !== false} disabled={readOnly} onChange={(event) => dispatch("hud.update", { widgetId: widget.id, patch: { visible: event.target.checked } })} /> Visible</label>
              <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => dispatch("hud.delete", { widgetId: widget.id })}>Remove</Button>
            </div>
          ))}
        </div>
        <div className="logic-add-row">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} aria-label="HUD label" disabled={readOnly} />
          <select className="input" value={variable} onChange={(event) => setVariable(event.target.value)} aria-label="HUD variable" disabled={readOnly}>
            {document.variables.map((candidate) => <option key={candidate.id} value={candidate.name}>{candidate.name}</option>)}
          </select>
          <select className="input" value={style} onChange={(event) => setStyle(event.target.value as HudWidget["style"])} aria-label="HUD style" disabled={readOnly}>
            <option value="text">Text</option>
            <option value="bar">Bar</option>
          </select>
          {style === "bar" && <NumberInput value={max} onChange={(event) => setMax(Number(event.target.value) || 1)} aria-label="HUD max" disabled={readOnly} />}
          <select className="input" value={corner} onChange={(event) => setCorner(event.target.value as HudWidget["corner"])} aria-label="HUD corner" disabled={readOnly}>
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
          </select>
          <Button variant="secondary" size="sm" onClick={addHud} disabled={readOnly}>+ HUD widget</Button>
        </div>
      </section>

      <section className="content-panel">
        <h3>Input map</h3>
        <p className="panel-helper">Bindings feed runtime input actions. Duplicate bindings show conflict warnings.</p>
        <div className="input-map-list">
          {Object.entries(inputMap).map(([action, keys]) => (
            <div key={action} className="input-map-row">
              <strong>{action}</strong>
              <div className="key-chip-row">
                {keys.map((key) => (
                  <button key={key} className="key-chip" disabled={readOnly} onClick={() => setInput(action, keys.filter((candidate) => candidate !== key))} aria-label={`Remove ${key} from ${action}`}>
                    {key} ×
                  </button>
                ))}
                <select className="input" aria-label={`Add key to ${action}`} disabled={readOnly} value="" onChange={(event) => {
                  if (!event.target.value) return;
                  if (!keys.includes(event.target.value)) setInput(action, [...keys, event.target.value]);
                }}>
                  <option value="">+ key</option>
                  {KEY_OPTIONS.map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
        {conflicts.length > 0 ? (
          <div className="rule-flag" role="status">
            Conflicts: {conflicts.map((conflict) => `${conflict.key} (${conflict.actions.join(", ")})`).join("; ")}
          </div>
        ) : (
          <p className="panel-helper">No duplicate bindings detected.</p>
        )}
      </section>

      <section className="content-panel">
        <h3>Messages</h3>
        <div className="field-grid">
          <label className="field-row full"><span>Text color</span><Input value={document.settings.ui.message.color} disabled={readOnly} className="input-mono" aria-label="Message text color" onChange={(event) => dispatch("project.updateSettings", { settings: { ...document.settings, ui: { ...document.settings.ui, message: { ...document.settings.ui.message, color: event.target.value } } } })} /></label>
          <label className="field-row full"><span>Background</span><Input value={document.settings.ui.message.background} disabled={readOnly} className="input-mono" aria-label="Message background" onChange={(event) => dispatch("project.updateSettings", { settings: { ...document.settings, ui: { ...document.settings.ui, message: { ...document.settings.ui.message, background: event.target.value } } } })} /></label>
          <label className="field-row"><span>Font size</span><NumberInput value={document.settings.ui.message.fontSize} disabled={readOnly} aria-label="Message font size" onChange={(event) => dispatch("project.updateSettings", { settings: { ...document.settings, ui: { ...document.settings.ui, message: { ...document.settings.ui.message, fontSize: Number(event.target.value) || 18 } } } })} /></label>
        </div>
      </section>
    </div>
  );
}

function AnimationTab({ document, scene, dispatch, readOnly }: { document: NonNullable<ReturnType<typeof useEngineStore.getState>["document"]>; scene: NonNullable<ReturnType<typeof useActiveScene>>; dispatch: ReturnType<typeof useEngineStore.getState>["dispatch"]; readOnly: boolean }) {
  const selection = useEngineStore((state) => state.selection);
  const selected = scene.objects.find((object) => object.id === selection[0]) ?? null;
  const spriteAssets = document.assets.filter((asset) => asset.kind === "image");
  const [name, setName] = useState("idle");
  const [fps, setFps] = useState(8);
  const [loop, setLoop] = useState(true);
  const [frames, setFrames] = useState("0,1,2,3");
  const [targetAssetId, setTargetAssetId] = useState(spriteAssets[0]?.id ?? "");

  const asset = document.assets.find((candidate) => candidate.id === (selected?.visual?.kind === "sprite" ? selected.visual.assetId : targetAssetId)) ?? document.assets.find((candidate) => candidate.id === targetAssetId) ?? null;

  function addClip() {
    if (!asset) return;
    const frameIndices = frames.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
    dispatch("asset.addAnimation", { assetId: asset.id, animation: { id: newId("anim"), name: name.trim() || "clip", fps: Math.max(1, fps), loop, frameIndices: frameIndices.length ? frameIndices : [0] } });
  }

  function assign(key: "idle" | "run" | "jump", animationId: string) {
    if (!selected) return;
    const animations = { ...(selected.animations ?? {}) };
    if (animationId) animations[key] = animationId;
    else delete animations[key];
    dispatch("object.update", { sceneId: scene.id, objectId: selected.id, patch: { animations } });
  }

  return (
    <div className="presentation-tab">
      <section className="content-panel">
        <h3>Animation clips</h3>
        <div className="logic-add-row">
          <select className="input" value={asset?.id ?? ""} aria-label="Animation asset" disabled={readOnly} onChange={(event) => setTargetAssetId(event.target.value)}>
            <option value="">Select sprite asset…</option>
            {spriteAssets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
          <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Animation name" disabled={readOnly} placeholder="Clip name" />
          <NumberInput value={fps} onChange={(event) => setFps(Number(event.target.value) || 1)} aria-label="Animation fps" disabled={readOnly} />
          <Input value={frames} onChange={(event) => setFrames(event.target.value)} aria-label="Animation frames" disabled={readOnly} placeholder="0,1,2" />
          <label className="logic-check"><input type="checkbox" checked={loop} disabled={readOnly} onChange={(event) => setLoop(event.target.checked)} /> Loop</label>
          <Button variant="secondary" size="sm" onClick={addClip} disabled={readOnly || !asset}>Add clip</Button>
        </div>
        <div className="clip-list">
          {(asset?.animations ?? []).map((clip) => (
            <div key={clip.id} className="clip-row">
              <strong>{clip.name}</strong>
              <span className="row-meta">{clip.fps} fps · {clip.loop ? "loop" : "once"} · [{clip.frameIndices.join(", ")}]</span>
              <ClipPreview clip={clip} />
              <Button variant="ghost" size="sm" disabled={readOnly || !asset} onClick={() => asset && dispatch("asset.deleteAnimation", { assetId: asset.id, animationId: clip.id })}>Delete</Button>
            </div>
          ))}
          {asset && (asset.animations?.length ?? 0) === 0 && <p className="panel-helper">No clips on this asset yet.</p>}
        </div>
      </section>
      <section className="content-panel">
        <h3>Assign to selected sprite</h3>
        {selected?.visual?.kind === "sprite" ? (
          <div className="field-grid">
            {(["idle", "run", "jump"] as const).map((key) => (
              <label key={key} className="field-row full">
                <span>{key}</span>
                <select className="input" value={selected.animations?.[key] ?? ""} disabled={readOnly} aria-label={`${key} animation`} onChange={(event) => assign(key, event.target.value)}>
                  <option value="">None</option>
                  {(asset?.animations ?? []).map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        ) : (
          <p className="panel-helper">Select a sprite object in the scene to assign idle/run/jump clips.</p>
        )}
      </section>
    </div>
  );
}

function ClipPreview({ clip }: { clip: { fps: number; loop: boolean; frameIndices: number[] } }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (clip.frameIndices.length === 0) return;
    const interval = window.setInterval(() => {
      setIndex((current) => {
        const next = current + 1;
        if (clip.loop) return next % clip.frameIndices.length;
        return Math.min(clip.frameIndices.length - 1, next);
      });
    }, Math.max(50, 1000 / Math.max(1, clip.fps)));
    return () => window.clearInterval(interval);
  }, [clip.fps, clip.loop, clip.frameIndices]);
  const frame = clip.frameIndices[index % Math.max(1, clip.frameIndices.length)] ?? 0;
  return <span className="chip">Frame {frame}</span>;
}

function findInputConflicts(inputMap: Record<string, string[]>): Array<{ key: string; actions: string[] }> {
  const byKey = new Map<string, string[]>();
  for (const [action, keys] of Object.entries(inputMap)) {
    for (const key of keys) {
      const actions = byKey.get(key) ?? [];
      actions.push(action);
      byKey.set(key, actions);
    }
  }
  return [...byKey.entries()].filter(([, actions]) => actions.length > 1).map(([key, actions]) => ({ key, actions }));
}
