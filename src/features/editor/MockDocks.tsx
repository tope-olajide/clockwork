import { useState, type ReactNode } from "react";
import {
  Bot,
  Box,
  CircleDollarSign,
  Eye,
  EyeOff,
  Flag,
  GripVertical,
  Layers,
  Lock,
  Plus,
  Search,
  Square,
  Trash2,
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
} from "../../components/ui";

export type WorkspaceTab = "scene" | "content" | "logic" | "presentation";
export type PresentationTab = "look" | "animation" | "audio" | "ui";
export type InspectorTab = "scene" | "object";

interface MockObject {
  id: string;
  name: string;
  type: string;
  z: number;
  icon: typeof User;
}

const LAYERS = [
  { id: "lay_fx", name: "FX", count: 1, visible: true, locked: false },
  { id: "lay_gameplay", name: "Gameplay", count: 8, visible: true, locked: false },
  { id: "lay_background", name: "Background", count: 3, visible: true, locked: true },
  { id: "lay_lighting", name: "Lighting", count: 2, visible: true, locked: true },
  { id: "lay_ui", name: "UI", count: 0, visible: false, locked: false },
];

const OBJECTS: MockObject[] = [
  { id: "obj_drone", name: "Drone", type: "sprite", z: 8, icon: Bot },
  { id: "obj_coin_1", name: "Coin 1", type: "sprite", z: 7, icon: CircleDollarSign },
  { id: "obj_coin_2", name: "Coin 2", type: "sprite", z: 6, icon: CircleDollarSign },
  { id: "obj_coin_3", name: "Coin 3", type: "sprite", z: 5, icon: CircleDollarSign },
  { id: "obj_goal", name: "Goal", type: "sprite", z: 4, icon: Flag },
  { id: "obj_bridge", name: "Bridge", type: "rect", z: 3, icon: Square },
  { id: "obj_ground", name: "Ground", type: "rect", z: 2, icon: Square },
  { id: "obj_player", name: "Player", type: "sprite", z: 1, icon: User },
];

function TinyButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Tooltip content={label}>
      <button
        className="tiny-icon"
        aria-label={label}
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

export function MockLeftDock({
  selectedId,
  onSelect,
  onToast,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToast: (title: string, message?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(LAYERS.map((layer) => [layer.id, layer.visible])),
  );
  const [locked, setLocked] = useState<Record<string, boolean>>(
    Object.fromEntries(LAYERS.map((layer) => [layer.id, layer.locked])),
  );

  const filtered = OBJECTS.filter((object) =>
    `${object.name} ${object.type} ${object.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedOutside = selectedId && !filtered.some((object) => object.id === selectedId);

  return (
    <>
      <section className="dock-section layers-section">
        <div className="dock-section-head">
          <span className="panel-title">Layers</span>
          <TinyButton label="Add layer" icon={<Plus size={13} />} onClick={() => onToast("Add layer", "Slice 1 enables document layers.")} />
        </div>
        <p className="panel-helper" style={{ padding: "0 10px 6px" }}>
          Topmost first. New objects use the active layer.
        </p>
        <div className="dock-list">
          {LAYERS.map((layer) => (
            <div
              key={layer.id}
              className={`layer-row${layer.id === "lay_gameplay" ? " active" : ""}${!visible[layer.id] ? " dim" : ""}`}
            >
              <GripVertical size={10} className="row-meta" />
              <TinyButton
                label={visible[layer.id] ? `Hide ${layer.name}` : `Show ${layer.name}`}
                icon={visible[layer.id] ? <Eye size={11} /> : <EyeOff size={11} />}
                onClick={() => setVisible((current) => ({ ...current, [layer.id]: !current[layer.id] }))}
              />
              <span className="layer-name">{layer.name}</span>
              <span className="layer-count">{layer.count}</span>
              <span className="row-actions">
                <TinyButton
                  label={locked[layer.id] ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                  icon={locked[layer.id] ? <Lock size={10} /> : <Unlock size={10} />}
                  onClick={() => setLocked((current) => ({ ...current, [layer.id]: !current[layer.id] }))}
                />
                <TinyButton
                  label={`Delete ${layer.name}`}
                  icon={<Trash2 size={10} />}
                  onClick={() => onToast("Layer delete", "Slice 1 enables layer deletion.")}
                />
              </span>
            </div>
          ))}
        </div>
        <div className="layer-editor">
          <label className="field-row">
            <span>Active layer</span>
            <Input defaultValue="Gameplay" aria-label="Active layer name" />
          </label>
          <div className="layer-editor-grid">
            <label className="field-row"><span>Opacity</span><NumberInput defaultValue={100} aria-label="Layer opacity" /></label>
            <label className="field-row"><span>Parallax X</span><NumberInput defaultValue={0} aria-label="Layer parallax X" /></label>
            <label className="field-row"><span>Parallax Y</span><NumberInput defaultValue={0} aria-label="Layer parallax Y" /></label>
          </div>
          <div className="layer-editor-actions">
            <Button variant="ghost" size="sm">Select objects</Button>
          </div>
        </div>
        <p className="panel-helper" style={{ padding: "0 10px 8px" }}>Visible in the canvas.</p>
      </section>

      <section className="dock-section hierarchy-section">
        <div className="dock-section-head">
          <span className="panel-title">Hierarchy</span>
          <span className="row-meta">{OBJECTS.length}</span>
          <TinyButton label="Collapse hierarchy" icon={<Layers size={13} />} />
          <TinyButton label="Add object" icon={<Plus size={13} />} onClick={() => onToast("Add object", "Slice 1 enables object creation.")} />
        </div>
        <p className="panel-helper" style={{ padding: "0 10px 6px" }}>
          Topmost first. Groups select together from the canvas.
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
          {search ? `${filtered.length} of ${OBJECTS.length}` : "2 groups · 1 hidden · 2 locked"}
          {selectedOutside && <span> · 1 selected outside filter</span>}
        </div>
        <div className="dock-list">
          {filtered.map((object) => {
            const Icon = object.icon;
            return (
              <div
                key={object.id}
                className={`object-row${selectedId === object.id ? " selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(object.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(object.id);
                  }
                }}
                aria-pressed={selectedId === object.id}
              >
                <Icon size={12} className="row-icon" />
                <span className="object-name">{object.name}</span>
                <span className="row-meta">{object.type} · {object.z}</span>
                <span className="row-actions">
                  <TinyButton label={`Select ${object.name}`} icon={<Eye size={10} />} />
                  <TinyButton label={`Lock ${object.name}`} icon={<Lock size={10} />} />
                </span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="panel-helper" style={{ padding: "8px 10px" }}>
              No objects match “{search}”.
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function MockInspector({
  selected,
  tab,
  onTab,
  onToast,
}: {
  selected: MockObject | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  onToast: (title: string, message?: string) => void;
}) {
  return (
    <div className="inspector-content">
      <div className="inspector-head">
        <span className="panel-title" style={{ marginRight: "auto" }}>Inspector</span>
        <span className="chip">Level</span>
      </div>
      <div className="inspector-head">
        <div className="inspector-segment" role="group" aria-label="Inspector target">
          <button aria-pressed={tab === "scene"} onClick={() => onTab("scene")}>Scene</button>
          <button aria-pressed={tab === "object"} disabled={!selected} onClick={() => onTab("object")}>Object</button>
        </div>
      </div>
      <div className="inspector-scroll">
        {tab === "scene" || !selected ? (
          <SceneInspector onToast={onToast} />
        ) : (
          <ObjectInspector selected={selected} onToast={onToast} />
        )}
      </div>
    </div>
  );
}

function SceneInspector({ onToast }: { onToast: (title: string, message?: string) => void }) {
  return (
    <>
      <section className="inspector-section">
        <div className="inspector-section-title">Scene</div>
        <div className="field-grid">
          <label className="field-row full"><span>Name</span><Input defaultValue="Track" aria-label="Scene name" /></label>
          <label className="field-row full">
            <span>Kind</span>
            <select className="input" defaultValue="platformer" aria-label="Scene kind">
              <option value="platformer">Platformer</option>
              <option value="topdown">Top-down</option>
              <option value="puzzle">Puzzle</option>
            </select>
          </label>
          <label className="field-row"><span>World width</span><NumberInput defaultValue={2560} aria-label="World width" /></label>
          <label className="field-row"><span>World height</span><NumberInput defaultValue={1080} aria-label="World height" /></label>
          <label className="field-row full"><span>Background</span><Input defaultValue="#151a2c" className="input-mono" aria-label="Background color" /></label>
        </div>
        <Button variant="primary" className="inspector-save" onClick={() => onToast("Scene saved", "Static Slice 0 shell; persistence arrives in Slice 1.")}>
          Save scene
        </Button>
      </section>
      <section className="inspector-section">
        <div className="inspector-section-title">Details</div>
        <div className="details-list">
          <div className="detail-row"><span>Scene ID</span><span className="value">scn_track</span></div>
          <div className="detail-row"><span>Project ID</span><span className="value">prj_neonrunner</span></div>
          <div className="detail-row"><span>Order</span><span className="value">0</span></div>
          <div className="detail-row"><span>Background</span><span className="value">Dusk / parallax</span></div>
        </div>
      </section>
    </>
  );
}

function ObjectInspector({
  selected,
  onToast,
}: {
  selected: MockObject;
  onToast: (title: string, message?: string) => void;
}) {
  return (
    <>
      <section className="inspector-section">
        <div className="inspector-section-title">Identity</div>
        <div className="field-grid">
          <label className="field-row full"><span>Name</span><Input key={selected.id} defaultValue={selected.name} aria-label="Object name" /></label>
          <label className="field-row full"><span>Tags</span><Input defaultValue="player, controllable" aria-label="Object tags" /></label>
        </div>
      </section>
      <section className="inspector-section">
        <div className="inspector-section-title">Transform</div>
        <div className="field-grid">
          <label className="field-row"><span>X</span><NumberInput defaultValue={320} aria-label="Object X" /></label>
          <label className="field-row"><span>Y</span><NumberInput defaultValue={700} aria-label="Object Y" /></label>
          <label className="field-row"><span>Width</span><NumberInput defaultValue={56} aria-label="Object width" /></label>
          <label className="field-row"><span>Height</span><NumberInput defaultValue={84} aria-label="Object height" /></label>
          <label className="field-row"><span>Rotation</span><NumberInput defaultValue={0} aria-label="Object rotation" /></label>
          <label className="field-row"><span>Scale</span><NumberInput defaultValue={1} aria-label="Object scale" /></label>
        </div>
      </section>
      <section className="inspector-section">
        <div className="inspector-section-title">Body</div>
        <div className="field-grid">
          <label className="field-row full">
            <span>Type</span>
            <select className="input" defaultValue="dynamic" aria-label="Body type">
              <option value="dynamic">Dynamic</option>
              <option value="static">Static</option>
              <option value="kinematic">Kinematic</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="field-row"><span>Gravity</span><NumberInput defaultValue={1} aria-label="Gravity scale" /></label>
          <label className="field-row"><span>One-way</span><select className="input" defaultValue="off" aria-label="One way"><option value="off">Off</option><option value="on">On</option></select></label>
        </div>
      </section>
      <section className="inspector-section">
        <div className="inspector-section-title">Behaviors</div>
        <div className="archived-banner" style={{ marginBottom: 7 }}>
          <Box size={13} />
          platformer-controller
        </div>
        <Button variant="secondary" size="sm" onClick={() => onToast("Add behavior", "Behavior editing arrives in Slice 4.")}>
          <Plus size={12} /> Add behavior
        </Button>
      </section>
    </>
  );
}

export function MockViewport({ onToast }: { onToast: (title: string, message?: string) => void }) {
  const ticks = Array.from({ length: 21 }, (_, index) => index * 5);
  return (
    <div className="viewport">
      <div className="viewport-ruler" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick} style={{ display: "contents" }}>
            <span className={`ruler-tick${tick % 25 === 0 ? " major" : ""}`} style={{ left: `${tick}%` }} />
            {tick % 25 === 0 && <span className="ruler-label" style={{ left: `${tick}%` }}>{tick === 0 ? "0" : `${tick * 10}`}</span>}
          </span>
        ))}
      </div>
      <div className="viewport-canvas-wrap">
        <div className="zoom-cluster" aria-label="Zoom controls">
          <button className="icon-button" aria-label="Fit scene" title="Fit scene" onClick={() => onToast("Fit", "Viewport controls are visual-only in Slice 0.")}>⌂</button>
          <button className="icon-button" aria-label="Zoom out" title="Zoom out">−</button>
          <span className="zoom-value">100%</span>
          <button className="icon-button" aria-label="Zoom in" title="Zoom in">+</button>
          <button className="icon-button" aria-label="Reset zoom" title="Reset zoom">1:1</button>
        </div>
        <div className="viewport-canvas">
          <div className="world-frame">
            <div className="world-label">TRACK · DUSK LAYER</div>
            <div className="world-sun" />
            <div className="world-mountain" />
            <div className="world-mountain two" />
            <div className="world-platform one" />
            <div className="world-platform two" />
            <div className="world-platform three" />
            <div className="world-ground" />
            <div className="world-player" />
            <div className="world-drone" />
            <div className="world-coin one" />
            <div className="world-coin two" />
            <div className="world-coin three" />
            <div className="world-goal" />
          </div>
        </div>
      </div>
      <div className="viewport-hint">
        <span>Drag to move · Shift-click for multi-select · drag empty space to marquee</span>
        <span className="right">2560 × 1080 · snap 8</span>
      </div>
    </div>
  );
}

export function MockWorkspace({
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
  if (tab === "scene") return <MockViewport onToast={onToast} />;

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
                  <label className="field-row"><span>Background</span><input className="input" defaultValue="#151a2c" aria-label="Presentation background" /></label>
                  <label className="field-row"><span>Pixel art</span><select className="input" defaultValue="off" aria-label="Pixel art"><option value="off">Off</option><option value="on">On</option></select></label>
                  <label className="field-row full"><span>Master volume</span><input className="input" type="range" defaultValue={70} aria-label="Master volume" /></label>
                </div>
                <Button variant="secondary" size="sm" style={{ marginTop: 12 }} onClick={() => onToast("Presentation", "These fields become live in Slice 5.")}>
                  Save presentation
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
        <div className="workspace-placeholder-grid">
          <div>Objects</div>
          <div>Prefabs</div>
          <div>Tilesets</div>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-placeholder" style={{ margin: "auto", width: "min(720px, calc(100% - 40px))" }}>
      <h2>Logic</h2>
      <p>Variables, rules, and input mapping live here. The command-backed behaviors arrive in Slice 5.</p>
      <div className="details-list" style={{ marginTop: 14 }}>
        <div className="detail-row"><span>Variables</span><span className="value">coins · won</span></div>
        <div className="detail-row"><span>Rules</span><span className="value">Reach goal · Collect all coins</span></div>
        <div className="detail-row"><span>Input map</span><span className="value">Arrows · Space</span></div>
      </div>
    </div>
  );
}

export { OBJECTS };
export type { MockObject };
