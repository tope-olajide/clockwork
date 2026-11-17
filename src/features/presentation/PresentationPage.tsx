import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Button, Input, NumberInput } from "../../components/ui";
import { readAssetBlob } from "../../engine/persistence/indexeddb";
import { newId } from "../../engine/model/factory";
import type { HudWidget, ProjectDocument, Scene } from "../../engine/model/schema";
import { useEngineStore } from "../../engine/store/engine-store";
import type { PresentationTab } from "../editor/EngineDocks";

const KEY_OPTIONS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Enter", "Escape", "KeyA", "KeyD", "KeyW", "KeyS", "KeyE", "KeyQ", "ShiftLeft", "ShiftRight", "ControlLeft", "Tab"];

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

function LookTab({ document, scene, dispatch, readOnly }: { document: ProjectDocument; scene: Scene; dispatch: ReturnType<typeof useEngineStore.getState>["dispatch"]; readOnly: boolean }) {
  const [width, setWidth] = useState(String(document.settings.width));
  const [height, setHeight] = useState(String(document.settings.height));
  const [background, setBackground] = useState(scene.background.color);
  const [gravityY, setGravityY] = useState(String(document.settings.gravity.y));
  const [gravityX, setGravityX] = useState(String(document.settings.gravity.x));

  useEffect(() => {
    setWidth(String(document.settings.width));
    setHeight(String(document.settings.height));
    setBackground(scene.background.color);
    setGravityX(String(document.settings.gravity.x));
    setGravityY(String(document.settings.gravity.y));
  }, [document.id, document.settings.width, document.settings.height, document.settings.gravity.x, document.settings.gravity.y, scene.id, scene.background.color]);

  function save() {
    const w = Number(width);
    const h = Number(height);
    const gx = Number(gravityX);
    const gy = Number(gravityY);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    dispatch("project.updateSettings", {
      settings: {
        ...document.settings,
        width: w,
        height: h,
        background,
        gravity: { x: Number.isFinite(gx) ? gx : 0, y: Number.isFinite(gy) ? gy : 980 },
      },
    });
    dispatch("scene.update", { sceneId: scene.id, patch: { background: { ...scene.background, color: background } } });
  }

  const transitions = document.scenes.flatMap((s) =>
    s.rules.flatMap((r) =>
      r.do.filter((a) => a.kind === "go-scene").map((a) => ({
        from: s.name,
        rule: r.name,
        to: document.scenes.find((t) => t.id === (a as { kind: "go-scene"; sceneId: string }).sceneId)?.name ?? "Missing scene",
      })),
    ),
  );

  return (
    <div className="presentation-tab">
      <section className="content-panel">
        <h3>Look</h3>
        <div className="field-grid">
          <label className="field-row"><span>Resolution W</span><NumberInput value={width} onChange={(event) => setWidth(event.target.value)} aria-label="Resolution width" disabled={readOnly} /></label>
          <label className="field-row"><span>Resolution H</span><NumberInput value={height} onChange={(event) => setHeight(event.target.value)} aria-label="Resolution height" disabled={readOnly} /></label>
          <label className="field-row"><span>Gravity X</span><NumberInput value={gravityX} onChange={(event) => setGravityX(event.target.value)} aria-label="Gravity X" disabled={readOnly} /></label>
          <label className="field-row"><span>Gravity Y</span><NumberInput value={gravityY} onChange={(event) => setGravityY(event.target.value)} aria-label="Gravity Y" disabled={readOnly} /></label>
          <label className="field-row full"><span>Default/scene background</span><Input value={background} onChange={(event) => setBackground(event.target.value)} aria-label="Scene background" disabled={readOnly} className="input-mono" /></label>
          <label className="logic-check"><input type="checkbox" checked={document.settings.pixelArt} disabled={readOnly} onChange={(event) => dispatch("project.updateSettings", { settings: { ...document.settings, pixelArt: event.target.checked } })} /> Pixel art mode</label>
        </div>
        <Button variant="primary" size="sm" onClick={save} disabled={readOnly}>Save look</Button>
      </section>
      <section className="content-panel">
        <h3>Camera defaults</h3>
        <div className="details-list">
          <div className="detail-row"><span>Scene camera X</span><span className="value">{scene.camera.x}</span></div>
          <div className="detail-row"><span>Scene camera Y</span><span className="value">{scene.camera.y}</span></div>
          <div className="detail-row"><span>Scene camera zoom</span><span className="value">{scene.camera.zoom}</span></div>
        </div>
        <p className="panel-helper">Camera defaults are scene-based and preserved by runtime/camera behaviors during play.</p>
      </section>
      <section className="content-panel">
        <h3>Scene flow</h3>
        <div className="details-list">
          <div className="detail-row"><span>Start scene</span><span className="value">{document.scenes.find((s) => s.id === document.startSceneId)?.name ?? "None"}</span></div>
        </div>
        <div className="details-list" style={{ marginTop: 8 }}>
          {transitions.map((t, i) => (
            <div key={`${t.from}-${t.to}-${i}`} className="detail-row"><span>{t.from}</span><span className="value">{t.rule} → {t.to}</span></div>
          ))}
          {transitions.length === 0 && <div className="panel-helper">No scene transitions defined by rules yet.</div>}
        </div>
      </section>
    </div>
  );
}

function AudioTab({ document, scene, dispatch, readOnly }: { document: ProjectDocument; scene: Scene; dispatch: ReturnType<typeof useEngineStore.getState>["dispatch"]; readOnly: boolean }) {
  const audioAssets = document.assets.filter((asset) => asset.kind === "audio");
  const musicAssetId = scene.audio?.musicAssetId ?? "";
  const loop = scene.audio?.loop ?? true;
  const sceneVolume = scene.audio?.volume ?? 1;
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);
  useEffect(() => { audioRef.current?.pause(); setPreviewing(false); }, [musicAssetId]);

  function updateSceneAudio(patch: Partial<{ musicAssetId: string; loop: boolean; volume: number }>) {
    const nextMusic = patch.musicAssetId !== undefined ? patch.musicAssetId : musicAssetId;
    const nextLoop = patch.loop !== undefined ? patch.loop : loop;
    const nextVolume = patch.volume !== undefined ? patch.volume : sceneVolume;
    dispatch("scene.update", {
      sceneId: scene.id,
      patch: { audio: nextMusic ? { musicAssetId: nextMusic, loop: nextLoop, volume: nextVolume } : null },
    });
  }

  async function togglePreview() {
    if (previewing) {
      audioRef.current?.pause();
      setPreviewing(false);
      return;
    }
    const blob = await readAssetBlob(musicAssetId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const el = audioRef.current ?? new Audio();
    if (audioRef.current?.src && audioRef.current.src.startsWith("blob:")) URL.revokeObjectURL(audioRef.current.src);
    el.src = url;
    el.loop = loop;
    el.volume = Math.max(0, Math.min(1, sceneVolume * document.settings.audio.musicVolume * document.settings.audio.masterVolume));
    audioRef.current = el;
    try {
      await el.play();
      setPreviewing(true);
      el.onended = () => setPreviewing(false);
    } catch {
      setPreviewing(false);
    }
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
        <div className="logic-add-row">
          <Button variant="secondary" size="sm" disabled={!musicAssetId} onClick={togglePreview}>{previewing ? <><Square size={12} /> Stop</> : <><Play size={12} /> Preview</>}</Button>
          {!musicAssetId && <span className="panel-helper">No audio asset selected for this scene.</span>}
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
        {audioAssets.length > 0 && <p className="panel-helper">Volume changes affect runtime playback immediately.</p>}
      </section>
    </div>
  );
}

function UiTab({ document, dispatch, readOnly }: { document: ProjectDocument; dispatch: ReturnType<typeof useEngineStore.getState>["dispatch"]; readOnly: boolean }) {
  const [label, setLabel] = useState("Coins");
  const [variable, setVariable] = useState(document.variables[0]?.name ?? "coins");
  const [corner, setCorner] = useState<HudWidget["corner"]>("top-left");
  const [style, setStyle] = useState<HudWidget["style"]>("text");
  const [max, setMax] = useState(10);
  const [capturingAction, setCapturingAction] = useState<string | null>(null);
  const inputMap = document.settings.inputMap;
  const conflicts = useMemo(() => findInputConflicts(inputMap), [inputMap]);

  useEffect(() => {
    if (!capturingAction) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const code = event.code || event.key;
      const actionKey = capturingAction as keyof typeof inputMap;
      const keys = inputMap[actionKey] ?? [];
      if (!keys.includes(code)) setInput(capturingAction, [...keys, code]);
      setCapturingAction(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturingAction, inputMap]);

  function addHud() {
    dispatch("hud.add", {
      widget: { id: newId("hud"), variable, label, corner, style, visible: true, max: style === "bar" ? max : undefined } satisfies HudWidget,
    });
  }

  function setInput(action: string, nextKeys: string[]) {
    dispatch("project.updateSettings", { settings: { ...document.settings, inputMap: { ...document.settings.inputMap, [action]: nextKeys } } });
  }

  void variable; // preview uses HUD widget values below

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
        <div className="hud-preview" aria-label="HUD live preview" style={{ marginTop: 10, padding: 10, border: "1px solid var(--border)", borderRadius: 8, position: "relative", minHeight: 80 }}>
          <div className="panel-helper" style={{ marginBottom: 6 }}>Live preview (initial values)</div>
          {document.settings.ui.hud.filter((w) => w.visible !== false).map((w) => {
            const val = document.variables.find((v) => v.name === w.variable)?.initial ?? 0;
            return (
              <div key={w.id} className="chip" style={{ display: "inline-flex", margin: 4 }}>
                {w.style === "bar" ? `${w.label}: ${String(val)} / ${w.max ?? 1}` : `${w.label} ${String(val)}`}
              </div>
            );
          })}
          {document.settings.ui.hud.filter((w) => w.visible !== false).length === 0 && <div className="panel-helper">No visible HUD widgets.</div>}
        </div>
      </section>

      <section className="content-panel">
        <h3>Input map</h3>
        <p className="panel-helper">Bindings feed runtime input actions. Use key capture or the dropdown. Duplicate bindings show conflict warnings.</p>
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
                <Button variant="secondary" size="sm" disabled={readOnly || capturingAction === action} onClick={() => setCapturingAction(action)}>
                  {capturingAction === action ? "Press key…" : "Capture key"}
                </Button>
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
        <div aria-label="Message live preview" style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: document.settings.ui.message.background, color: document.settings.ui.message.color, fontSize: document.settings.ui.message.fontSize }}>
          Example runtime message preview
        </div>
      </section>
    </div>
  );
}

function AnimationTab({ document, scene, dispatch, readOnly }: { document: ProjectDocument; scene: Scene; dispatch: ReturnType<typeof useEngineStore.getState>["dispatch"]; readOnly: boolean }) {
  const selection = useEngineStore((state) => state.selection);
  const selected = scene.objects.find((object) => object.id === selection[0]) ?? null;
  const spriteAssets = document.assets.filter((asset) => asset.kind === "image");
  const [name, setName] = useState("idle");
  const [fps, setFps] = useState(8);
  const [loop, setLoop] = useState(true);
  const [frames, setFrames] = useState("0,1,2,3");
  const [targetAssetId, setTargetAssetId] = useState(spriteAssets[0]?.id ?? "");

  const asset = document.assets.find((candidate) => candidate.id === (selected?.visual?.kind === "sprite" ? selected.visual.assetId : targetAssetId)) ?? document.assets.find((candidate) => candidate.id === targetAssetId) ?? null;

  function parseFrames(input: string): number[] {
    return input.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value >= 0);
  }

  function addClip() {
    if (!asset) return;
    const frameIndices = parseFrames(frames);
    dispatch("asset.addAnimation", { assetId: asset.id, animation: { id: newId("anim"), name: name.trim() || "clip", fps: Math.max(1, fps), loop, frameIndices } });
  }

  function assign(key: "idle" | "run" | "jump", animationId: string) {
    if (!selected) return;
    const animations = { ...(selected.animations ?? {}) };
    if (animationId) animations[key] = animationId;
    else delete animations[key];
    dispatch("object.update", { sceneId: scene.id, objectId: selected.id, patch: { animations } });
  }

  const clips = asset?.animations ?? [];

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
          {clips.map((clip) => {
            const empty = clip.frameIndices.length === 0;
            return (
              <div key={clip.id} className="clip-row">
                <strong>{clip.name}</strong>
                <span className="row-meta">{clip.fps} fps · {clip.loop ? "loop" : "once"} · [{clip.frameIndices.join(", ")}]</span>
                <ClipPreview clip={clip} />
                {empty && <div className="rule-flag" role="status">Empty clip: add frame indices.</div>}
                <Button variant="ghost" size="sm" disabled={readOnly || !asset} onClick={() => asset && dispatch("asset.deleteAnimation", { assetId: asset.id, animationId: clip.id })}>Delete</Button>
              </div>
            );
          })}
          {asset && clips.length === 0 && <p className="panel-helper">No clips on this asset yet.</p>}
          {!asset && <p className="panel-helper">Select a sprite asset to manage clips.</p>}
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
                  {clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
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
    setIndex(0);
  }, [clip.frameIndices.join(","), clip.fps, clip.loop]);
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
  }, [clip.fps, clip.loop, clip.frameIndices.join(",")]);
  const maxIdx = Math.max(0, clip.frameIndices.length - 1);
  const frame = clip.frameIndices[index % Math.max(1, clip.frameIndices.length)] ?? 0;
  return (
    <div className="clip-preview">
      <span className="chip">Frame {frame}</span>
      <input
        type="range"
        min={0}
        max={maxIdx}
        value={Math.min(index, maxIdx)}
        aria-label="Animation preview scrubber"
        onChange={(event) => setIndex(Number(event.target.value))}
      />
    </div>
  );
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
