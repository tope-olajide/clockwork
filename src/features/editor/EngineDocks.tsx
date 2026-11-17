import { useEffect, useRef, useState, type ReactNode } from "react";
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
  Tooltip,
  useToast,
} from "../../components/ui";
import { behaviorSpec, BEHAVIOR_CATALOG } from "../../engine/model/behavior-catalog";
import { makeBehavior, makeBody, makeLayer, makeObject, makeTransform, newObjectId } from "../../engine/model/factory";
import type {
  BehaviorInstance,
  BehaviorType,
  GameObject,
  Layer,
  Scene,
} from "../../engine/model/schema";
import { useEngineStore } from "../../engine/store/engine-store";
import { EngineViewport } from "../../engine/render/PixiStage";
import { LogicPage } from "../logic/LogicPage";
import { ContentPage } from "../content/ContentPage";
import { PresentationPage } from "../presentation/PresentationPage";

export type WorkspaceTab = "scene" | "content" | "logic" | "presentation";
export type PresentationTab = "look" | "animation" | "audio" | "ui";
export type InspectorTab = "scene" | "object";

const BEHAVIOR_TYPES: BehaviorType[] = BEHAVIOR_CATALOG.map((spec) => spec.type);

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
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null);
  const dragRef = useRef<{ layerId: string | null; objectId: string | null }>({ layerId: null, objectId: null });
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const hierarchyListRef = useRef<HTMLDivElement | null>(null);
  const [hierarchyScroll, setHierarchyScroll] = useState(0);
  const [hierarchyHeight, setHierarchyHeight] = useState(320);

  const activeLayer = scene?.layers.find((layer) => layer.id === activeLayerId) ?? scene?.layers[0] ?? null;

  useEffect(() => {
    setLayerName(activeLayer?.name ?? "");
  }, [activeLayer?.id, activeLayer?.name]);

  useEffect(() => {
    const element = hierarchyListRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHierarchyHeight(element.clientHeight));
    observer.observe(element);
    setHierarchyHeight(element.clientHeight);
    return () => observer.disconnect();
  }, [scene?.id]);

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

  const HIERARCHY_ROW_HEIGHT = 28;
  const VIRTUALIZE_ABOVE = 500;
  const hierarchyRows = [...filtered].reverse();
  const virtualized = hierarchyRows.length > VIRTUALIZE_ABOVE;
  const visibleStart = virtualized
    ? Math.max(0, Math.floor(hierarchyScroll / HIERARCHY_ROW_HEIGHT) - 6)
    : 0;
  const visibleEnd = virtualized
    ? Math.min(hierarchyRows.length, visibleStart + Math.ceil(Math.max(hierarchyHeight, 160) / HIERARCHY_ROW_HEIGHT) + 12)
    : hierarchyRows.length;
  const visibleRows = hierarchyRows.slice(visibleStart, visibleEnd);

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

  function reorderLayer(draggedId: string, targetDisplayIndex: number) {
    if (readOnly || !scene) return;
    const ascending = [...scene.layers].sort((a, b) => a.order - b.order);
    const from = ascending.findIndex((layer) => layer.id === draggedId);
    if (from < 0) return;
    const targetIndex = ascending.length - 1 - targetDisplayIndex;
    if (targetIndex === from) return;
    run("layer.reorder", { sceneId: scene.id, layerId: draggedId, toIndex: Math.max(0, targetIndex) });
  }

  function toggleSelect(id: string, additive: boolean) {
    if (!additive) {
      setSelection([id]);
      return;
    }
    const current = useEngineStore.getState().selection;
    setSelection(current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]);
  }

  function commitObjectRename(object: GameObject) {
    const name = editingName.trim();
    setEditingObjectId(null);
    if (readOnly || !name || name === object.name) return;
    run("object.rename", { sceneId: scene!.id, objectId: object.id, name });
  }

  function reparentObject(objectId: string, target: { layerId?: string; parentId?: string | null }) {
    if (readOnly || !scene || objectId === target.parentId) return;
    run("object.reparent", {
      sceneId: scene.id,
      objectId,
      layerId: target.layerId ?? scene.objects.find((object) => object.id === objectId)?.layerId,
      parentId: target.parentId ?? undefined,
    });
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
                className={`layer-row${layer.id === activeLayer?.id ? " active" : ""}${!layer.visible ? " dim" : ""}${draggingLayerId === layer.id ? " dragging" : ""}`}
                onClick={() => setActiveLayer(layer.id)}
                role="button"
                tabIndex={0}
                draggable={!readOnly}
                onDragStart={(event) => {
                  dragRef.current = { layerId: layer.id, objectId: null };
                  setDraggingLayerId(layer.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  dragRef.current = { layerId: null, objectId: null };
                  setDraggingLayerId(null);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const drag = dragRef.current;
                  if (drag.layerId) reorderLayer(drag.layerId, layers.findIndex((candidate) => candidate.id === layer.id));
                  else if (drag.objectId) reparentObject(drag.objectId, { layerId: layer.id });
                  dragRef.current = { layerId: null, objectId: null };
                  setDraggingLayerId(null);
                  setDraggingObjectId(null);
                }}
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
        <div
          className={`dock-list${virtualized ? " virtualized" : ""}`}
          ref={hierarchyListRef}
          onScroll={(event) => {
            if (virtualized) setHierarchyScroll(event.currentTarget.scrollTop);
          }}
        >
          {virtualized && visibleStart > 0 && <div style={{ height: visibleStart * HIERARCHY_ROW_HEIGHT }} aria-hidden="true" />}
          {visibleRows.map((object) => {
            const Icon = objectIcon(object);
            const layer = scene.layers.find((candidate) => candidate.id === object.layerId);
            return (
              <div
                key={object.id}
                className={`object-row${selection.includes(object.id) ? " selected" : ""}${draggingObjectId === object.id ? " dragging" : ""}`}
                role="button"
                tabIndex={0}
                draggable={!readOnly && editingObjectId !== object.id}
                onDragStart={(event) => {
                  dragRef.current = { layerId: null, objectId: object.id };
                  setDraggingObjectId(object.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  dragRef.current = { layerId: null, objectId: null };
                  setDraggingObjectId(null);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const drag = dragRef.current;
                  if (drag.objectId && drag.objectId !== object.id) {
                    reparentObject(drag.objectId, { layerId: object.layerId, parentId: object.id });
                  }
                  dragRef.current = { layerId: null, objectId: null };
                  setDraggingObjectId(null);
                }}
                onClick={(event) => toggleSelect(object.id, event.shiftKey || event.metaKey || event.ctrlKey)}
                onDoubleClick={() => {
                  if (readOnly) return;
                  setEditingObjectId(object.id);
                  setEditingName(object.name);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSelect(object.id, event.shiftKey);
                  }
                }}
                aria-pressed={selection.includes(object.id)}
              >
                <Icon size={12} className="row-icon" />
                {editingObjectId === object.id ? (
                  <input
                    className="input object-rename-input"
                    autoFocus
                    value={editingName}
                    aria-label={`Rename ${object.name}`}
                    onChange={(event) => setEditingName(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={() => commitObjectRename(object)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setEditingObjectId(null);
                    }}
                  />
                ) : (
                  <span className="object-name">{object.name}{object.prefabId ? " · prefab" : ""}{object.prefabOverrides ? " *" : ""}</span>
                )}
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
          {virtualized && visibleEnd < hierarchyRows.length && (
            <div style={{ height: (hierarchyRows.length - visibleEnd) * HIERARCHY_ROW_HEIGHT }} aria-hidden="true" />
          )}
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
  const setSelection = useEngineStore((state) => state.setSelection);
  const dispatch = useEngineStore((state) => state.dispatch);
  const toast = useToast();
  const readOnly = Boolean(document?.archivedAt);
  const selected = scene?.objects.find((object) => object.id === selection[0]) ?? null;
  const selectedObjects = scene?.objects.filter((object) => selection.includes(object.id)) ?? [];

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
        {selectedObjects.length > 1 ? (
          <MultiInspector
            key={`${selection.join(",")}-${document.revision}`}
            objects={selectedObjects}
            readOnly={readOnly}
            onApply={(patch) =>
              run("objects.applyTransforms", {
                sceneId: scene.id,
                transforms: selectedObjects.map((object) => ({ objectId: object.id, transform: patch })),
              })
            }
            onGroup={() => {
              let sumX = 0;
              let sumY = 0;
              selectedObjects.forEach((object) => {
                sumX += object.transform.x;
                sumY += object.transform.y;
              });
              const group = {
                id: newObjectId(),
                name: "Group",
                layerId: selectedObjects[0]!.layerId,
                transform: makeTransform(sumX / selectedObjects.length, sumY / selectedObjects.length),
                behaviors: [],
                properties: {},
                tags: ["group"],
              };
              if (
                run("objects.group", {
                  sceneId: scene.id,
                  group,
                  objectIds: selectedObjects.map((object) => object.id),
                })
              ) {
                setSelection([group.id]);
              }
            }}
          />
        ) : tab === "scene" || !selected ? (
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

function commonNumberText(values: number[]): string {
  if (values.length === 0) return "";
  const first = values[0]!;
  return values.every((value) => Math.abs(value - first) < 0.0001) ? String(first) : "";
}

function MultiInspector({
  objects,
  readOnly,
  onApply,
  onGroup,
}: {
  objects: GameObject[];
  readOnly: boolean;
  onApply: (patch: { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number }) => boolean;
  onGroup: () => void;
}) {
  const [x, setX] = useState(() => commonNumberText(objects.map((object) => object.transform.x)));
  const [y, setY] = useState(() => commonNumberText(objects.map((object) => object.transform.y)));
  const [rotation, setRotation] = useState(() => commonNumberText(objects.map((object) => object.transform.rotation)));
  const [scaleX, setScaleX] = useState(() => commonNumberText(objects.map((object) => object.transform.scaleX)));
  const [scaleY, setScaleY] = useState(() => commonNumberText(objects.map((object) => object.transform.scaleY)));
  const layers = [...new Set(objects.map((object) => object.layerId))];

  function apply() {
    if (readOnly) return;
    const patch: { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number } = {};
    const parse = (value: string) => (value.trim() === "" ? undefined : Number(value));
    const nextX = parse(x);
    const nextY = parse(y);
    const nextRotation = parse(rotation);
    const nextScaleX = parse(scaleX);
    const nextScaleY = parse(scaleY);
    if (nextX !== undefined && Number.isFinite(nextX)) patch.x = nextX;
    if (nextY !== undefined && Number.isFinite(nextY)) patch.y = nextY;
    if (nextRotation !== undefined && Number.isFinite(nextRotation)) patch.rotation = nextRotation;
    if (nextScaleX !== undefined && Number.isFinite(nextScaleX) && nextScaleX !== 0) patch.scaleX = nextScaleX;
    if (nextScaleY !== undefined && Number.isFinite(nextScaleY) && nextScaleY !== 0) patch.scaleY = nextScaleY;
    if (Object.keys(patch).length === 0) return;
    onApply(patch);
  }

  return (
    <>
      <section className="inspector-section">
          <div className="inspector-section-title">Shared transform</div>
          <div className="field-grid">
            <label className="field-row"><span>X</span><NumberInput value={x} placeholder="mixed" onChange={(event) => setX(event.target.value)} aria-label="Selection X" disabled={readOnly} /></label>
            <label className="field-row"><span>Y</span><NumberInput value={y} placeholder="mixed" onChange={(event) => setY(event.target.value)} aria-label="Selection Y" disabled={readOnly} /></label>
            <label className="field-row"><span>Rotation</span><NumberInput value={rotation} placeholder="mixed" onChange={(event) => setRotation(event.target.value)} aria-label="Selection rotation" disabled={readOnly} /></label>
            <label className="field-row"><span>Scale X</span><NumberInput value={scaleX} placeholder="mixed" onChange={(event) => setScaleX(event.target.value)} aria-label="Selection scale X" disabled={readOnly} /></label>
            <label className="field-row"><span>Scale Y</span><NumberInput value={scaleY} placeholder="mixed" onChange={(event) => setScaleY(event.target.value)} aria-label="Selection scale Y" disabled={readOnly} /></label>
          </div>
          <p className="panel-helper">Blank fields keep each object&apos;s own value. Applying is one revision and one undo entry.</p>
          <Button variant="primary" className="inspector-save" onClick={apply} disabled={readOnly}>
            Apply to {objects.length} objects
          </Button>
          <div className="layer-editor-actions" style={{ marginTop: 8 }}>
            <Button variant="secondary" size="sm" onClick={onGroup} disabled={readOnly}>
              Group selection
            </Button>
          </div>
        </section>
      <section className="inspector-section">
        <div className="inspector-section-title">Selection</div>
        <div className="details-list">
          <div className="detail-row"><span>Objects</span><span className="value">{objects.length}</span></div>
          <div className="detail-row"><span>Layers</span><span className="value">{layers.length}</span></div>
        </div>
        <div className="details-list" style={{ marginTop: 8 }}>
          {objects.slice(0, 8).map((object) => (
            <div className="detail-row" key={object.id}><span>{object.name}</span><span className="value input-mono">{object.visual?.kind ?? "empty"}</span></div>
          ))}
          {objects.length > 8 && <div className="detail-row"><span>…</span><span className="value">{objects.length - 8} more</span></div>}
        </div>
      </section>
    </>
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
          <BehaviorEditor
            key={behavior.id}
            behavior={behavior}
            readOnly={readOnly}
            sceneId={scene.id}
            objectId={object.id}
            onRemove={() => onRemoveBehavior(behavior.id)}
          />
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
      {object.prefabId && (
        <section className="inspector-section">
          <div className="inspector-section-title">Prefab</div>
          <div className="details-list">
            <div className="detail-row"><span>Prefab</span><span className="value input-mono">{object.prefabId}</span></div>
            <div className="detail-row"><span>Instance</span><span className="value input-mono">{object.prefabInstanceId ?? "—"}</span></div>
            <div className="detail-row"><span>Overrides</span><span className="value">{object.prefabOverrides ? Object.keys(object.prefabOverrides).join(", ") : "none"}</span></div>
          </div>
          <p className="panel-helper">Manage detach/revert in the Content workspace.</p>
        </section>
      )}
      <Button variant="primary" className="inspector-save" onClick={save} disabled={readOnly}>
        Save object
      </Button>
    </>
  );
}

// The scene viewport lives in engine/render/PixiStage (Slice 2).

export function EngineWorkspace({
  tab,
  presentationTab,
  onPresentationTab,
}: {
  tab: WorkspaceTab;
  presentationTab: PresentationTab;
  onPresentationTab: (tab: PresentationTab) => void;
  onToast: (title: string, message?: string) => void;
}) {
  if (tab === "scene") return <EngineViewport />;
  if (tab === "logic") return <LogicPage />;
  if (tab === "content") return <ContentPage />;
  return (
    <div className="workspace-placeholder" style={{ margin: "20px auto", width: "min(980px, calc(100% - 40px))", height: "calc(100% - 40px)", maxHeight: "none" }}>
      <h2 style={{ marginBottom: 8 }}>Presentation</h2>
      <div className="inspector-segment" role="group" aria-label="Presentation tabs" style={{ marginBottom: 12 }}>
        {([
          ["look", "Look"],
          ["animation", "Animation"],
          ["audio", "Audio"],
          ["ui", "Game UI"],
        ] as const).map(([value, label]) => (
          <button key={value} aria-pressed={presentationTab === value} onClick={() => onPresentationTab(value)}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
        <PresentationPage tab={presentationTab} />
      </div>
    </div>
  );
}

function BehaviorEditor({
  behavior,
  sceneId,
  objectId,
  readOnly,
  onRemove,
}: {
  behavior: BehaviorInstance;
  sceneId: string;
  objectId: string;
  readOnly: boolean;
  onRemove: () => void;
}) {
  const dispatch = useEngineStore((state) => state.dispatch);
  const spec = behaviorSpec(behavior.type);

  function updateParam(key: string, value: unknown) {
    dispatch("behavior.update", { sceneId, objectId, behaviorId: behavior.id, patch: { params: { [key]: value } } });
  }

  return (
    <div className="behavior-editor">
      <div className="behavior-row">
        <Box size={12} />
        <span className="input-mono">{spec.label}</span>
        <label className="logic-check" style={{ marginLeft: "auto" }}>
          <input
            type="checkbox"
            checked={behavior.enabled}
            disabled={readOnly}
            aria-label={`${spec.label} enabled`}
            onChange={(event) => dispatch("behavior.update", { sceneId, objectId, behaviorId: behavior.id, patch: { enabled: event.target.checked } })}
          />
          On
        </label>
        <TinyButton label={`Remove ${spec.label}`} icon={<Trash2 size={11} />} disabled={readOnly} onClick={onRemove} />
      </div>
      {spec.params.length > 0 && (
        <div className="behavior-param-grid">
          {spec.params.map((param) => {
            const value = behavior.params[param.key] ?? param.default;
            if (param.type === "boolean") {
              return (
                <label key={param.key} className="logic-check">
                  <input type="checkbox" checked={Boolean(value)} disabled={readOnly} onChange={(event) => updateParam(param.key, event.target.checked)} />
                  {param.label}
                </label>
              );
            }
            return (
              <label key={param.key} className="field-row">
                <span>{param.label}</span>
                <Input
                  value={String(value ?? "")}
                  disabled={readOnly}
                  aria-label={`${spec.label} ${param.label}`}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (param.type === "number") updateParam(param.key, raw === "" ? 0 : Number(raw));
                    else updateParam(param.key, raw);
                  }}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
