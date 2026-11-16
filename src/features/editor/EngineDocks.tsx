import { useEffect, useState, type ReactNode } from "react";
import {
  Box,
  Bot,
  CircleDollarSign,
  Eye,
  EyeOff,
  Flag,
  GripVertical,
  Lock,
  Plus,
  Search,
  Square,
  Trash2,
  Type,
  Unlock,
  User,
} from "lucide-react";
import {
  Button,
  Input,
  NumberInput,
  Tabs,
  TabsContent,
  Tooltip,
  useToast,
} from "../../components/ui";
import { makeBehavior, makeBody, makeLayer, makeObject } from "../../engine/model/factory";
import type {
  BehaviorType,
  GameObject,
  Layer,
  Scene,
} from "../../engine/model/schema";
import { useEngineStore } from "../../engine/store/engine-store";

export type WorkspaceTab = "scene" | "content" | "logic" | "presentation";
export type PresentationTab = "look" | "animation" | "audio" | "ui";
export type InspectorTab = "scene" | "object";

const BEHAVIOR_TYPES: BehaviorType[] = [
  "platformer-controller",
  "top-down-controller",
  "patrol",
  "follow",
  "collectible",
  "hazard",
  "checkpoint",
  "camera-follow",
  "spawner",
  "timer",
  "variable-set",
  "health",
];

function TinyButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip content={label}>
      <button
        className="tiny-icon"
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

function objectIcon(object: GameObject) {
  if (object.tags.includes("player")) return User;
  if (object.tags.includes("coin") || object.tags.includes("core") || object.tags.includes("key")) return CircleDollarSign;
  if (object.tags.includes("goal") || object.tags.includes("checkpoint")) return Flag;
  if (object.behaviors.some((behavior) => behavior.type.includes("controller"))) return Bot;
  if (object.visual?.kind === "text") return Type;
  if (object.visual?.kind === "sprite") return Box;
  return Square;
}

function useActiveScene() {
  const document = useEngineStore((state) => state.document);
  const activeSceneId = useEngineStore((state) => state.activeSceneId);
  const scene = document?.scenes.find((candidate) => candidate.id === activeSceneId) ?? document?.scenes[0] ?? null;
  return { document, scene };
}

export function EngineLeftDock() {
  const { document, scene } = useActiveScene();
  const activeLayerId = useEngineStore((state) => state.activeLayerId);
  const selection = useEngineStore((state) => state.selection);
  const setActiveLayer = useEngineStore((state) => state.setActiveLayer);
  const setSelection = useEngineStore((state) => state.setSelection);
  const dispatch = useEngineStore((state) => state.dispatch);
  const readOnly = Boolean(document?.archivedAt);
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [layerName, setLayerName] = useState("");

  const activeLayer = scene?.layers.find((layer) => layer.id === activeLayerId) ?? scene?.layers[0] ?? null;

  useEffect(() => {
    setLayerName(activeLayer?.name ?? "");
  }, [activeLayer?.id, activeLayer?.name]);

  function run(type: string, args: unknown) {
    const result = dispatch(type, args);
    if (!result.ok) {
      toast.push("Change rejected", result.error);
      return false;
    }
    return true;
  }

  if (!document || !scene) {
    return <div className="panel-helper" style={{ padding: 14 }}>No scene is open.</div>;
  }

  const layers = [...scene.layers].sort((a, b) => b.order - a.order);
  const filtered = scene.objects.filter((object) =>
    `${object.name} ${object.tags.join(" ")} ${object.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedOutside = selection[0] && !filtered.some((object) => object.id === selection[0]);

  function addLayer() {
    if (readOnly) return;
    const layer = makeLayer(`Layer ${scene!.layers.length + 1}`, scene!.layers.length);
    if (run("layer.create", { sceneId: scene!.id, layer })) {
      setActiveLayer(layer.id);
      setSelection([]);
    }
  }

  function addObject() {
    if (readOnly || !activeLayer) return;
    const object = makeObject({
      name: `Object ${scene!.objects.length + 1}`,
      layerId: activeLayer.id,
      x: Math.round(scene!.size.w / 2),
      y: Math.round(scene!.size.h / 2),
      width: 72,
      height: 72,
      color: "#a9b4ff",
    });
    if (run("object.create", { sceneId: scene!.id, object })) {
      setSelection([object.id]);
    }
  }

  function deleteLayer(layer: Layer) {
    if (readOnly || scene!.layers.length <= 1) return;
    const count = scene!.objects.filter((object) => object.layerId === layer.id).length;
    if (count > 0 && !window.confirm(`Delete “${layer.name}” and its ${count} object${count === 1 ? "" : "s"}?`)) return;
    if (run("layer.delete", { sceneId: scene!.id, layerId: layer.id, strategy: "delete" })) {
      setActiveLayer(scene!.layers.find((candidate) => candidate.id !== layer.id)?.id ?? null);
      setSelection([]);
    }
  }

  function deleteObject(object: GameObject) {
    if (readOnly) return;
    if (!window.confirm(`Delete “${object.name}”${object.behaviors.length ? " and its children" : ""}?`)) return;
    if (run("object.delete", { sceneId: scene!.id, objectId: object.id })) setSelection([]);
  }

  function renameLayer() {
    if (readOnly || !activeLayer || !layerName.trim() || layerName.trim() === activeLayer.name) return;
    run("layer.update", { sceneId: scene!.id, layerId: activeLayer.id, patch: { name: layerName.trim() } });
  }

  return (
    <>
      <section className="dock-section layers-section">
        <div className="dock-section-head">
          <span className="panel-title">Layers</span>
          <TinyButton label="Add layer" icon={<Plus size={13} />} onClick={addLayer} disabled={readOnly} />
        </div>
        <p className="panel-helper" style={{ padding: "0 10px 6px" }}>
          Topmost first. New objects use the active layer.
        </p>
        <div className="dock-list">
          {layers.map((layer) => {
            const count = scene.objects.filter((object) => object.layerId === layer.id).length;
            return (
              <div
                key={layer.id}
                className={`layer-row${layer.id === activeLayer?.id ? " active" : ""}${!layer.visible ? " dim" : ""}`}
                onClick={() => setActiveLayer(layer.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setActiveLayer(layer.id);
                }}
                aria-pressed={layer.id === activeLayer?.id}
              >
                <GripVertical size={10} className="row-meta" />
                <TinyButton
                  label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  icon={layer.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                  disabled={readOnly}
                  onClick={() => run("layer.update", { sceneId: scene.id, layerId: layer.id, patch: { visible: !layer.visible } })}
                />
                <span className="layer-name">{layer.name}</span>
                <span className="layer-count">{count}</span>
                <span className="row-actions">
                  <TinyButton
                    label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                    icon={layer.locked ? <Lock size={10} /> : <Unlock size={10} />}
                    disabled={readOnly}
                    onClick={() => run("layer.update", { sceneId: scene.id, layerId: layer.id, patch: { locked: !layer.locked } })}
                  />
                  <TinyButton
                    label={`Delete ${layer.name}`}
                    icon={<Trash2 size={10} />}
                    disabled={readOnly || scene.layers.length <= 1}
                    onClick={() => deleteLayer(layer)}
                  />
                </span>
              </div>
            );
          })}
        </div>
        {activeLayer && (
          <div className="layer-editor">
            <label className="field-row">
              <span>Active layer</span>
              <Input
                value={layerName}
                onChange={(event) => setLayerName(event.target.value)}
                onBlur={renameLayer}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                aria-label="Active layer name"
                disabled={readOnly}
              />
            </label>
            <div className="layer-editor-grid">
              <label className="field-row">
                <span>Opacity</span>
                <NumberInput
                  value={Math.round(activeLayer.opacity * 100)}
                  min={0}
                  max={100}
                  aria-label="Layer opacity"
                  disabled={readOnly}
                  onChange={(event) => {
                    const value = Math.max(0, Math.min(100, Number(event.target.value))) / 100;
                    run("layer.update", { sceneId: scene.id, layerId: activeLayer.id, patch: { opacity: value } });
                  }}
                />
              </label>
              <label className="field-row">
                <span>Parallax X</span>
                <NumberInput
                  value={activeLayer.parallax.x}
                  step={0.05}
                  aria-label="Layer parallax X"
                  disabled={readOnly}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      run("layer.update", { sceneId: scene.id, layerId: activeLayer.id, patch: { parallax: { ...activeLayer.parallax, x: value } } });
                    }
                  }}
                />
              </label>
              <label className="field-row">
                <span>Parallax Y</span>
                <NumberInput
                  value={activeLayer.parallax.y}
                  step={0.05}
                  aria-label="Layer parallax Y"
                  disabled={readOnly}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      run("layer.update", { sceneId: scene.id, layerId: activeLayer.id, patch: { parallax: { ...activeLayer.parallax, y: value } } });
                    }
                  }}
                />
              </label>
            </div>
            <div className="layer-editor-actions">
              <Button
                variant="ghost"
                size="sm"
                disabled={readOnly}
                onClick={() => setSelection(scene.objects.filter((object) => object.layerId === activeLayer.id).map((object) => object.id))}
              >
                Select objects
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="dock-section hierarchy-section">
        <div className="dock-section-head">
          <span className="panel-title">Hierarchy</span>
          <span className="row-meta">{scene.objects.length}</span>
          <TinyButton label="Add object" icon={<Plus size={13} />} onClick={addObject} disabled={readOnly || !activeLayer} />
        </div>
        <p className="panel-helper" style={{ padding: "0 10px 6px" }}>
          Topmost first. Select an object to inspect it.
        </p>
        <div className="hierarchy-search">
          <div className="search-wrap">
            <Search className="search-icon" size={12} />
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
              }}
              placeholder="Find object"
              aria-label="Find object"
              data-hierarchy-search
              style={{ paddingLeft: 26 }}
            />
          </div>
        </div>
        <div className="hierarchy-stats">
          {search ? `${filtered.length} of ${scene.objects.length}` : `${scene.layers.length} layers · ${scene.objects.length} objects`}
          {selectedOutside && <span> · 1 selected outside filter</span>}
        </div>
        <div className="dock-list">
          {[...filtered].reverse().map((object) => {
            const Icon = objectIcon(object);
            const layer = scene.layers.find((candidate) => candidate.id === object.layerId);
            return (
              <div
                key={object.id}
                className={`object-row${selection.includes(object.id) ? " selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelection([object.id])}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelection([object.id]);
                  }
                }}
                aria-pressed={selection.includes(object.id)}
              >
                <Icon size={12} className="row-icon" />
                <span className="object-name">{object.name}</span>
                <span className="row-meta">{layer?.name ?? "No layer"} · {object.visual?.kind ?? "empty"}</span>
                <span className="row-actions">
                  <TinyButton
                    label={`Delete ${object.name}`}
                    icon={<Trash2 size={10} />}
                    disabled={readOnly}
                    onClick={() => deleteObject(object)}
                  />
                </span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="panel-helper" style={{ padding: "8px 10px" }}>
              {scene.objects.length === 0 ? "No objects yet. Use + to add one." : `No objects match “${search}”.`}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function EngineInspector({
  tab,
  onTab,
}: {
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
}) {
  const { document, scene } = useActiveScene();
  const selection = useEngineStore((state) => state.selection);
  const dispatch = useEngineStore((state) => state.dispatch);
  const toast = useToast();
  const readOnly = Boolean(document?.archivedAt);
  const selected = scene?.objects.find((object) => object.id === selection[0]) ?? null;

  if (!document || !scene) {
    return <div className="panel-helper" style={{ padding: 14 }}>No scene is open.</div>;
  }

  function run(type: string, args: unknown) {
    const result = dispatch(type, args);
    if (!result.ok) {
      toast.push("Change rejected", result.error);
      return false;
    }
    return true;
  }

  return (
    <div className="inspector-content">
      <div className="inspector-head">
        <span className="panel-title" style={{ marginRight: "auto" }}>Inspector</span>
        <span className="chip">{scene.kind}</span>
      </div>
      <div className="inspector-head">
        <div className="inspector-segment" role="group" aria-label="Inspector target">
          <button aria-pressed={tab === "scene"} onClick={() => onTab("scene")}>Scene</button>
          <button aria-pressed={tab === "object"} disabled={!selected} onClick={() => onTab("object")}>Object</button>
        </div>
      </div>
      <div className="inspector-scroll">
        {tab === "scene" || !selected ? (
          <SceneInspector scene={scene} readOnly={readOnly} onSave={(patch) => run("scene.update", { sceneId: scene.id, patch })} />
        ) : (
          <ObjectInspector
            key={`${selected.id}-${document.revision}`}
            object={selected}
            scene={scene}
            readOnly={readOnly}
            onSave={(patch) => run("object.update", { sceneId: scene.id, objectId: selected.id, patch })}
            onAddBehavior={(type) => run("behavior.add", { sceneId: scene.id, objectId: selected.id, behavior: makeBehavior(type) })}
            onRemoveBehavior={(behaviorId) => run("behavior.remove", { sceneId: scene.id, objectId: selected.id, behaviorId })}
          />
        )}
      </div>
    </div>
  );
}

function SceneInspector({
  scene,
  readOnly,
  onSave,
}: {
  scene: Scene;
  readOnly: boolean;
  onSave: (patch: Record<string, unknown>) => boolean;
}) {
  const [name, setName] = useState(scene.name);
  const [kind, setKind] = useState(scene.kind);
  const [width, setWidth] = useState(String(scene.size.w));
  const [height, setHeight] = useState(String(scene.size.h));
  const [background, setBackground] = useState(scene.background.color);

  useEffect(() => {
    setName(scene.name);
    setKind(scene.kind);
    setWidth(String(scene.size.w));
    setHeight(String(scene.size.h));
    setBackground(scene.background.color);
  }, [scene.id, scene.name, scene.kind, scene.size.w, scene.size.h, scene.background.color]);

  function save() {
    if (readOnly) return;
    const parsedWidth = Number(width);
    const parsedHeight = Number(height);
    if (!name.trim() || !Number.isFinite(parsedWidth) || parsedWidth <= 0 || !Number.isFinite(parsedHeight) || parsedHeight <= 0) return;
    onSave({
      name: name.trim(),
      kind,
      size: { w: parsedWidth, h: parsedHeight },
      background: { ...scene.background, color: background },
    });
  }

  return (
    <>
      <section className="inspector-section">
        <div className="inspector-section-title">Scene</div>
        <div className="field-grid">
          <label className="field-row full"><span>Name</span><Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Scene name" disabled={readOnly} /></label>
          <label className="field-row full">
            <span>Kind</span>
            <select className="input" value={kind} onChange={(event) => setKind(event.target.value as Scene["kind"])} aria-label="Scene kind" disabled={readOnly}>
              <option value="level">Level</option>
              <option value="menu">Menu</option>
              <option value="ui">UI</option>
            </select>
          </label>
          <label className="field-row"><span>World width</span><NumberInput value={width} onChange={(event) => setWidth(event.target.value)} aria-label="World width" disabled={readOnly} /></label>
          <label className="field-row"><span>World height</span><NumberInput value={height} onChange={(event) => setHeight(event.target.value)} aria-label="World height" disabled={readOnly} /></label>
          <label className="field-row full"><span>Background</span><Input value={background} onChange={(event) => setBackground(event.target.value)} className="input-mono" aria-label="Background color" disabled={readOnly} /></label>
        </div>
        <Button variant="primary" className="inspector-save" onClick={save} disabled={readOnly}>
          Save scene
        </Button>
      </section>
      <section className="inspector-section">
        <div className="inspector-section-title">Details</div>
        <div className="details-list">
          <div className="detail-row"><span>Scene ID</span><span className="value input-mono">{scene.id}</span></div>
          <div className="detail-row"><span>Layers</span><span className="value">{scene.layers.length}</span></div>
          <div className="detail-row"><span>Objects</span><span className="value">{scene.objects.length}</span></div>
          <div className="detail-row"><span>Rules</span><span className="value">{scene.rules.length}</span></div>
        </div>
      </section>
    </>
  );
}

function ObjectInspector({
  object,
  scene,
  readOnly,
  onSave,
  onAddBehavior,
  onRemoveBehavior,
}: {
  object: GameObject;
  scene: Scene;
  readOnly: boolean;
  onSave: (patch: Record<string, unknown>) => boolean;
  onAddBehavior: (type: BehaviorType) => boolean;
  onRemoveBehavior: (behaviorId: string) => boolean;
}) {
  const [name, setName] = useState(object.name);
  const [tags, setTags] = useState(object.tags.join(", "));
  const [x, setX] = useState(String(object.transform.x));
  const [y, setY] = useState(String(object.transform.y));
  const [rotation, setRotation] = useState(String(object.transform.rotation));
  const [scaleX, setScaleX] = useState(String(object.transform.scaleX));
  const [bodyType, setBodyType] = useState(object.body?.type ?? "none");
  const [width, setWidth] = useState(String(object.body?.width ?? (object.visual?.kind === "rect" ? object.visual.width : 0)));
  const [height, setHeight] = useState(String(object.body?.height ?? (object.visual?.kind === "rect" ? object.visual.height : 0)));
  const [behaviorType, setBehaviorType] = useState<BehaviorType>("platformer-controller");

  function save() {
    if (readOnly) return;
    const parsedX = Number(x);
    const parsedY = Number(y);
    const parsedRotation = Number(rotation);
    const parsedScaleX = Number(scaleX);
    if (!name.trim() || !Number.isFinite(parsedX) || !Number.isFinite(parsedY) || !Number.isFinite(parsedRotation) || !Number.isFinite(parsedScaleX)) return;
    const parsedWidth = Number(width);
    const parsedHeight = Number(height);
    let body = object.body;
    if (bodyType === "none") body = undefined;
    else {
      const validWidth = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 64;
      const validHeight = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 64;
      body = body
        ? { ...body, type: bodyType, width: validWidth, height: validHeight }
        : makeBody(validWidth, validHeight, bodyType);
    }
    let visual = object.visual;
    if (visual?.kind === "rect" && Number.isFinite(parsedWidth) && parsedWidth > 0 && Number.isFinite(parsedHeight) && parsedHeight > 0) {
      visual = { ...visual, width: parsedWidth, height: parsedHeight };
    }
    onSave({
      name: name.trim(),
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      transform: { ...object.transform, x: parsedX, y: parsedY, rotation: parsedRotation, scaleX: parsedScaleX },
      body: body ?? null,
      visual: visual ?? null,
    });
  }

  return (
    <>
      <section className="inspector-section">
        <div className="inspector-section-title">Identity</div>
        <div className="field-grid">
          <label className="field-row full"><span>Name</span><Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Object name" disabled={readOnly} /></label>
          <label className="field-row full"><span>Tags</span><Input value={tags} onChange={(event) => setTags(event.target.value)} aria-label="Object tags" disabled={readOnly} /></label>
          <label className="field-row full">
            <span>Layer</span>
            <select className="input" value={object.layerId} disabled aria-label="Object layer">
              {scene.layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
            </select>
          </label>
        </div>
      </section>
      <section className="inspector-section">
        <div className="inspector-section-title">Transform</div>
        <div className="field-grid">
          <label className="field-row"><span>X</span><NumberInput value={x} onChange={(event) => setX(event.target.value)} aria-label="Object X" disabled={readOnly} /></label>
          <label className="field-row"><span>Y</span><NumberInput value={y} onChange={(event) => setY(event.target.value)} aria-label="Object Y" disabled={readOnly} /></label>
          <label className="field-row"><span>Width</span><NumberInput value={width} onChange={(event) => setWidth(event.target.value)} aria-label="Object width" disabled={readOnly} /></label>
          <label className="field-row"><span>Height</span><NumberInput value={height} onChange={(event) => setHeight(event.target.value)} aria-label="Object height" disabled={readOnly} /></label>
          <label className="field-row"><span>Rotation</span><NumberInput value={rotation} onChange={(event) => setRotation(event.target.value)} aria-label="Object rotation" disabled={readOnly} /></label>
          <label className="field-row"><span>Scale</span><NumberInput value={scaleX} onChange={(event) => setScaleX(event.target.value)} aria-label="Object scale" disabled={readOnly} /></label>
        </div>
      </section>
      <section className="inspector-section">
        <div className="inspector-section-title">Body</div>
        <div className="field-grid">
          <label className="field-row full">
            <span>Type</span>
            <select className="input" value={bodyType} onChange={(event) => setBodyType(event.target.value as NonNullable<GameObject["body"]>["type"] | "none")} aria-label="Body type" disabled={readOnly}>
              <option value="none">None</option>
              <option value="dynamic">Dynamic</option>
              <option value="static">Static</option>
              <option value="kinematic">Kinematic</option>
            </select>
          </label>
          <div className="detail-row"><span>Gravity</span><span className="value">{object.body?.gravityScale ?? 1}</span></div>
          <div className="detail-row"><span>One-way</span><span className="value">{object.body?.oneWay ? "On" : "Off"}</span></div>
        </div>
      </section>
      <section className="inspector-section">
        <div className="inspector-section-title">Behaviors</div>
        {object.behaviors.length === 0 && <p className="panel-helper">No behaviors on this object.</p>}
        {object.behaviors.map((behavior) => (
          <div className="behavior-row" key={behavior.id}>
            <Box size={12} />
            <span className="input-mono">{behavior.type}</span>
            <TinyButton
              label={`Remove ${behavior.type}`}
              icon={<Trash2 size={11} />}
              disabled={readOnly}
              onClick={() => onRemoveBehavior(behavior.id)}
            />
          </div>
        ))}
        <div className="behavior-add">
          <select className="input" value={behaviorType} onChange={(event) => setBehaviorType(event.target.value as BehaviorType)} aria-label="Behavior type" disabled={readOnly}>
            {BEHAVIOR_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => onAddBehavior(behaviorType)}>
            <Plus size={12} /> Add
          </Button>
        </div>
      </section>
      <Button variant="primary" className="inspector-save" onClick={save} disabled={readOnly}>
        Save object
      </Button>
    </>
  );
}

export function EngineViewport() {
  const { document, scene } = useActiveScene();
  const selection = useEngineStore((state) => state.selection);
  const setSelection = useEngineStore((state) => state.setSelection);
  const toast = useToast();

  if (!document || !scene) {
    return <div className="workspace-placeholder"><h2>No scene</h2><p>Open a scene to see it here.</p></div>;
  }

  const visibleLayers = new Map(scene.layers.filter((layer) => layer.visible).map((layer) => [layer.id, layer]));
  const objects = scene.objects.filter((object) => visibleLayers.has(object.layerId));
  const ticks = Array.from({ length: 21 }, (_, index) => index * 5);

  return (
    <div className="viewport">
      <div className="viewport-ruler" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick} style={{ display: "contents" }}>
            <span className={`ruler-tick${tick % 25 === 0 ? " major" : ""}`} style={{ left: `${tick}%` }} />
            {tick % 25 === 0 && <span className="ruler-label" style={{ left: `${tick}%` }}>{tick === 0 ? "0" : `${Math.round((scene.size.w * tick) / 100)}`}</span>}
          </span>
        ))}
      </div>
      <div className="viewport-canvas-wrap">
        <div className="zoom-cluster" aria-label="Zoom controls">
          <button className="icon-button" aria-label="Fit scene" title="Fit scene" onClick={() => toast.push("Fit", "Viewport controls arrive with the renderer in Slice 2.")}>⌂</button>
          <span className="zoom-value">Fit</span>
          <button className="icon-button" aria-label="Reset zoom" title="Reset zoom" onClick={() => toast.push("Zoom", "Viewport controls arrive with the renderer in Slice 2.")}>1:1</button>
        </div>
        <div className="viewport-canvas">
          <div className="world-frame" style={{ background: scene.background.color }}>
            {objects.map((object) => {
              const layer = visibleLayers.get(object.layerId);
              const dims =
                object.body
                  ? { w: object.body.width, h: object.body.height }
                  : object.visual?.kind === "rect"
                    ? { w: object.visual.width, h: object.visual.height }
                    : object.visual?.kind === "sprite"
                      ? { w: object.visual.width ?? 32, h: object.visual.height ?? 32 }
                      : { w: 24, h: 24 };
              const selected = selection.includes(object.id);
              if (object.visual?.kind === "text") {
                return (
                  <button
                    key={object.id}
                    className={`world-object world-object-text${selected ? " selected" : ""}`}
                    style={{
                      left: `${(object.transform.x / scene.size.w) * 100}%`,
                      top: `${(object.transform.y / scene.size.h) * 100}%`,
                      width: `${(dims.w / scene.size.w) * 100}%`,
                      color: object.visual.style.color,
                      fontSize: `${Math.max(8, object.visual.style.size * 0.45)}px`,
                      opacity: layer?.opacity ?? 1,
                      textAlign: object.visual.style.align,
                    }}
                    onClick={() => setSelection([object.id])}
                  >
                    {object.visual.text}
                  </button>
                );
              }
              const color =
                object.visual?.kind === "rect"
                  ? object.visual.color
                  : object.visual?.kind === "sprite"
                    ? object.visual.tint ?? "#a9b4ff"
                    : "#8a94ad";
              return (
                <button
                  key={object.id}
                  className={`world-object${selected ? " selected" : ""}`}
                  title={`${object.name} · ${Math.round(object.transform.x)}, ${Math.round(object.transform.y)}`}
                  aria-label={`Select ${object.name}`}
                  style={{
                    left: `${(object.transform.x / scene.size.w) * 100}%`,
                    top: `${(object.transform.y / scene.size.h) * 100}%`,
                    width: `${(dims.w / scene.size.w) * 100}%`,
                    height: `${(dims.h / scene.size.h) * 100}%`,
                    background: color,
                    borderColor: object.visual?.kind === "rect" ? object.visual.stroke ?? color : color,
                    transform: `translate(-50%, -50%) rotate(${object.transform.rotation}deg) scale(${object.transform.scaleX}, ${object.transform.scaleY})`,
                    opacity: layer?.opacity ?? 1,
                  }}
                  onClick={() => setSelection([object.id])}
                />
              );
            })}
            {objects.length === 0 && (
              <div className="world-empty">This scene is empty. Add an object from the hierarchy dock.</div>
            )}
            <div className="world-label">{scene.name.toUpperCase()} · {scene.size.w} × {scene.size.h}</div>
          </div>
        </div>
      </div>
      <div className="viewport-hint">
        <span>{document.archivedAt ? "Archived project · read-only" : "Click an object to select it · debug renderer"}</span>
        <span className="right">{scene.size.w} × {scene.size.h}</span>
      </div>
    </div>
  );
}

export function EngineWorkspace({
  tab,
  presentationTab,
  onPresentationTab,
  onToast,
}: {
  tab: WorkspaceTab;
  presentationTab: PresentationTab;
  onPresentationTab: (tab: PresentationTab) => void;
  onToast: (title: string, message?: string) => void;
}) {
  const { document, scene } = useActiveScene();

  if (tab === "scene") return <EngineViewport />;

  if (tab === "presentation") {
    return (
      <div className="workspace-placeholder" style={{ margin: "20px auto", width: "min(760px, calc(100% - 40px))" }}>
        <h2>Presentation</h2>
        <p>Look, animation, audio, and Game UI live inside this workspace, not in the top navigation.</p>
        <div style={{ marginTop: 16 }}>
          <Tabs
            value={presentationTab}
            onValueChange={(value) => onPresentationTab(value as PresentationTab)}
            items={[
              { value: "look", label: "Look" },
              { value: "animation", label: "Animation" },
              { value: "audio", label: "Audio" },
              { value: "ui", label: "Game UI" },
            ]}
          >
            <TabsContent value={presentationTab}>
              <div style={{ paddingTop: 12 }}>
                <div className="field-grid" style={{ maxWidth: 430 }}>
                  <label className="field-row"><span>Resolution</span><span className="value">{document?.settings.width ?? 1280} × {document?.settings.height ?? 720}</span></label>
                  <label className="field-row"><span>Pixel art</span><span className="value">{document?.settings.pixelArt ? "On" : "Off"}</span></label>
                  <label className="field-row"><span>Scene background</span><span className="value input-mono">{scene?.background.color ?? "—"}</span></label>
                  <label className="field-row"><span>Camera zoom</span><span className="value">{scene?.camera.zoom ?? 1}</span></label>
                </div>
                <Button variant="secondary" size="sm" style={{ marginTop: 12 }} onClick={() => onToast("Presentation", "Visual editing arrives in Slice 5. Project settings are editable in the project overview.")}>
                  Open project settings
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  if (tab === "content") {
    return (
      <div className="workspace-placeholder" style={{ margin: "auto", width: "min(720px, calc(100% - 40px))" }}>
        <h2>Content</h2>
        <p>Scene authoring lives here: object palette, prefabs, tilesets, and animation clips.</p>
        <div className="details-list" style={{ marginTop: 14 }}>
          <div className="detail-row"><span>Objects</span><span className="value">{scene?.objects.length ?? 0}</span></div>
          <div className="detail-row"><span>Assets</span><span className="value">{document?.assets.length ?? 0}</span></div>
          <div className="detail-row"><span>Prefabs</span><span className="value">{document?.prefabs.length ?? 0}</span></div>
          <div className="detail-row"><span>Layers</span><span className="value">{scene?.layers.length ?? 0}</span></div>
        </div>
        <p className="panel-helper" style={{ marginTop: 12 }}>Asset and prefab authoring arrive in Slice 3.</p>
      </div>
    );
  }

  return (
    <div className="workspace-placeholder" style={{ margin: "auto", width: "min(720px, calc(100% - 40px))" }}>
      <h2>Logic</h2>
      <p>Variables and rules are stored in this project. Visual editing arrives in Slice 5.</p>
      <div className="details-list" style={{ marginTop: 14 }}>
        <div className="detail-row"><span>Variables</span><span className="value">{document?.variables.length ?? 0}</span></div>
        <div className="detail-row"><span>Rules</span><span className="value">{scene?.rules.length ?? 0}</span></div>
        <div className="detail-row"><span>Input map</span><span className="value">{document ? Object.keys(document.settings.inputMap).join(" · ") : "—"}</span></div>
      </div>
    </div>
  );
}
