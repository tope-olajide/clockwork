import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  FileDown,
  Hand,
  HelpCircle,
  Layers,
  PanelRight,
  Play,
  Redo2,
  Sparkles,
  SquareDashedMousePointer,
  Undo2,
} from "lucide-react";
import {
  Button,
  Drawer,
  IconButton,
  Kbd,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  useToast,
} from "../../components/ui";
import { CommandPalette, buildStubCommands, type PaletteCommand } from "../../shell/CommandPalette";
import { LeftRail } from "../../shell/LeftRail";
import { TopBar } from "../../shell/TopBar";
import { useShellBreakpoints } from "../../lib/useMediaQuery";
import { makeLayer, makeObject, makeScene } from "../../engine/model/factory";
import { downloadProject } from "../../engine/persistence/transfer";
import { useEngineStore } from "../../engine/store/engine-store";
import {
  EngineInspector,
  EngineLeftDock,
  EngineWorkspace,
  type InspectorTab,
  type PresentationTab,
  type WorkspaceTab,
} from "./EngineDocks";

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "scene", label: "Scene" },
  { key: "content", label: "Content" },
  { key: "logic", label: "Logic" },
  { key: "presentation", label: "Presentation" },
];

const PRESENTATION_TABS: PresentationTab[] = ["look", "animation", "audio", "ui"];

const EDITOR_UI_KEY = "clockwork:editor-ui";

interface EditorUiPrefs {
  inspectorOpen: boolean;
  tool: "select" | "hand";
  inspectorTab: InspectorTab;
}

function loadEditorUi(): EditorUiPrefs {
  try {
    const raw = window.localStorage.getItem(EDITOR_UI_KEY);
    if (!raw) throw new Error("no prefs");
    const parsed = JSON.parse(raw) as Partial<EditorUiPrefs>;
    return {
      inspectorOpen: Boolean(parsed.inspectorOpen),
      tool: parsed.tool === "hand" ? "hand" : "select",
      inspectorTab: parsed.inspectorTab === "object" ? "object" : "scene",
    };
  } catch {
    return { inspectorOpen: false, tool: "select", inspectorTab: "scene" };
  }
}

export function EditorPage() {
  const { projectId = "", sceneId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { wide, huge, tooSmall } = useShellBreakpoints();

  const document = useEngineStore((state) => state.document);
  const activeProjectId = useEngineStore((state) => state.activeProjectId);
  const activeSceneId = useEngineStore((state) => state.activeSceneId);
  const activeLayerId = useEngineStore((state) => state.activeLayerId);
  const selection = useEngineStore((state) => state.selection);
  const history = useEngineStore((state) => state.history);
  const future = useEngineStore((state) => state.future);
  const saveState = useEngineStore((state) => state.saveState);
  const storageError = useEngineStore((state) => state.storageError);
  const isLoading = useEngineStore((state) => state.isLoading);
  const loadProject = useEngineStore((state) => state.loadProject);
  const dispatch = useEngineStore((state) => state.dispatch);
  const undo = useEngineStore((state) => state.undo);
  const redo = useEngineStore((state) => state.redo);
  const saveNow = useEngineStore((state) => state.saveNow);
  const setActiveScene = useEngineStore((state) => state.setActiveScene);
  const setActiveLayer = useEngineStore((state) => state.setActiveLayer);
  const setSelection = useEngineStore((state) => state.setSelection);
  const deleteActiveProject = useEngineStore((state) => state.deleteActiveProject);
  const snapGrid = useEngineStore((state) => state.snapGrid);
  const setSnapGrid = useEngineStore((state) => state.setSnapGrid);

  const current = document?.id === projectId ? document : null;
  const scene =
    current?.scenes.find((candidate) => candidate.id === sceneId) ??
    current?.scenes.find((candidate) => candidate.id === activeSceneId) ??
    null;
  const selected = scene?.objects.find((object) => object.id === selection[0]) ?? null;
  const readOnly = Boolean(current?.archivedAt);

  const rawTab = searchParams.get("tab");
  const activeTab: WorkspaceTab = WORKSPACE_TABS.some((tab) => tab.key === rawTab)
    ? (rawTab as WorkspaceTab)
    : "scene";
  const rawPresentation = searchParams.get("ptab");
  const presentationTab: PresentationTab = PRESENTATION_TABS.includes(rawPresentation as PresentationTab)
    ? (rawPresentation as PresentationTab)
    : "look";
  const debug = searchParams.get("debug") === "1";

  const [prefs] = useState(loadEditorUi);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(prefs.inspectorTab);
  const [inspectorOpen, setInspectorOpen] = useState(prefs.inspectorOpen);
  const [hierarchyDrawer, setHierarchyDrawer] = useState(false);
  const [inspectorDrawer, setInspectorDrawer] = useState(false);
  const [tool, setTool] = useState<"select" | "hand">(prefs.tool);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(
      EDITOR_UI_KEY,
      JSON.stringify({ inspectorOpen, tool, inspectorTab } satisfies EditorUiPrefs),
    );
  }, [inspectorOpen, tool, inspectorTab]);

  useEffect(() => {
    if (activeProjectId !== projectId) void loadProject(projectId);
  }, [activeProjectId, loadProject, projectId]);

  useEffect(() => {
    if (!current) return;
    const target = current.scenes.find((candidate) => candidate.id === sceneId);
    if (!target) {
      const next = new URLSearchParams(searchParams);
      navigate(
        {
          pathname: `/project/${current.id}/scene/${current.startSceneId}`,
          search: next.toString() ? `?${next.toString()}` : "",
        },
        { replace: true },
      );
      return;
    }
    if (activeSceneId !== sceneId) setActiveScene(sceneId);
  }, [activeSceneId, current, navigate, sceneId, searchParams, setActiveScene]);

  useEffect(() => {
    if (selection.length > 0) {
      setInspectorTab("object");
      setInspectorOpen(true);
    } else {
      setInspectorTab("scene");
    }
  }, [selection.length]);

  useEffect(() => {
    if (huge && selection.length === 0) setInspectorOpen(true);
  }, [huge, selection.length]);

  useEffect(() => {
    if (!wide) setInspectorOpen(false);
  }, [wide]);

  function setTab(tab: WorkspaceTab) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    if (tab === "presentation") next.set("ptab", presentationTab);
    else next.delete("ptab");
    setSearchParams(next, { replace: true });
  }

  function setPresentation(tab: PresentationTab) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "presentation");
    next.set("ptab", tab);
    setSearchParams(next, { replace: true });
  }

  function setDebug(nextDebug: boolean) {
    const next = new URLSearchParams(searchParams);
    if (nextDebug) next.set("debug", "1");
    else next.delete("debug");
    setSearchParams(next, { replace: true });
  }

  function addLayer() {
    if (!current || !scene || readOnly) return;
    const layer = makeLayer(`Layer ${scene.layers.length + 1}`, scene.layers.length);
    const result = dispatch("layer.create", { sceneId: scene.id, layer });
    if (result.ok) {
      setActiveLayer(layer.id);
      toast.push("Layer created", layer.name);
    } else {
      toast.push("Layer could not be created", result.error);
    }
  }

  function addObject() {
    if (!current || !scene || readOnly) return;
    const layerId = activeLayerId ?? scene.layers[0]?.id;
    if (!layerId) return;
    const object = makeObject({
      name: `Object ${scene.objects.length + 1}`,
      layerId,
      x: Math.round(scene.size.w / 2),
      y: Math.round(scene.size.h / 2),
      width: 72,
      height: 72,
      color: "#a9b4ff",
    });
    const result = dispatch("object.create", { sceneId: scene.id, object });
    if (result.ok) {
      setSelection([object.id]);
      toast.push("Object created", object.name);
    } else {
      toast.push("Object could not be created", result.error);
    }
  }

  function addScene() {
    if (!current || readOnly) return;
    const layer = makeLayer("Objects", 0);
    const nextScene = makeScene({
      name: `Scene ${current.scenes.length + 1}`,
      width: 1600,
      height: 900,
      background: current.settings.background,
      layers: [layer],
    });
    const result = dispatch("scene.create", { scene: nextScene });
    if (result.ok) {
      setActiveScene(nextScene.id);
      navigate(`/project/${current.id}/scene/${nextScene.id}`);
      toast.push("Scene created", nextScene.name);
    } else {
      toast.push("Scene could not be created", result.error);
    }
  }

  function deleteSelected() {
    if (!current || !scene || !selected || readOnly) return;
    if (!window.confirm(`Delete “${selected.name}”?`)) return;
    const result = dispatch("object.delete", { sceneId: scene.id, objectId: selected.id });
    if (result.ok) setSelection([]);
    else toast.push("Delete failed", result.error);
  }

  async function restoreProject() {
    if (!current) return;
    const result = dispatch("project.setArchived", { archived: false });
    if (result.ok) {
      await saveNow();
      toast.push("Project restored", current.name);
    } else {
      toast.push("Restore failed", result.error);
    }
  }

  function exportCurrent() {
    if (!current) return;
    downloadProject(current);
    toast.push("Project exported", "The .clockwork.json file is downloading.");
  }

  function openHierarchy() {
    if (readOnly) return;
    if (wide) toast.push("Hierarchy", "The hierarchy is already open on this width.");
    else setHierarchyDrawer(true);
  }

  function openInspector() {
    if (wide) setInspectorOpen(true);
    else setInspectorDrawer(true);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow().then(() => toast.push("Saved", "Project saved to this browser."));
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          if (!redo()) toast.push("Nothing to redo", "Redo history is empty or the project is read-only.");
        } else if (!undo()) {
          toast.push("Nothing to undo", "Undo history is empty or the project is read-only.");
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (!wide) setHierarchyDrawer(true);
        window.setTimeout(() => {
          window.document.querySelector<HTMLInputElement>("[data-hierarchy-search]")?.focus();
        }, 80);
        return;
      }
      if (!isEditing && (event.key === "Delete" || event.key === "Backspace") && selected) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (event.key === "Escape" && !paletteOpen) {
        setSelection([]);
        setInspectorTab("scene");
        if (!huge) setInspectorOpen(false);
        return;
      }
      if (!isEditing && /^[1-4]$/.test(event.key)) {
        const tab = WORKSPACE_TABS[Number(event.key) - 1];
        if (tab) setTab(tab.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const projectName = current?.name ?? "Loading project";
  const revision = current ? `r${current.revision}` : "r—";
  const toastSave = (title: string, message?: string) => toast.push(title, message);

  const commands: PaletteCommand[] = buildStubCommands({
    onCreate: () => toast.push("New project", "Use Projects → New project."),
    onProjects: () => navigate("/"),
    onHierarchy: openHierarchy,
    onInspector: openInspector,
    onPlay: () => toast.push("Play", "Manual Play arrives in Slice 4."),
    onAiPlay: () => toast.push("AI Play", "AI Play arrives with Kane in Slice 10."),
    onSettings: () => toast.push("Settings", "AI settings arrive in Slice 6.5."),
    onToast: toast.push,
  });

  if (tooSmall) {
    return (
      <div className="app">
        <TopBar
          crumbs={[{ label: "Projects", to: "/" }, { label: projectName }]}
          revision={revision}
          projectChip
          onSearch={() => setPaletteOpen(true)}
        />
        <div className="too-small">
          <div className="too-small-card">
            <h1>Clockwork needs a wider window</h1>
            <p>
              The editor is designed for a 1366×768 desktop first. Widen the window to keep editing, or
              open the shared player on this device.
            </p>
            <div className="empty-actions" style={{ justifyContent: "flex-start" }}>
              <Button variant="secondary" onClick={() => navigate("/")}>Back to projects</Button>
              <Button variant="ghost" onClick={exportCurrent} icon={<FileDown size={14} />} disabled={!current}>
                Export project
              </Button>
            </div>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      </div>
    );
  }

  if (isLoading && !current) {
    return (
      <div className="app">
        <TopBar crumbs={[{ label: "Projects", to: "/" }, { label: "Opening project" }]} onSearch={() => setPaletteOpen(true)} />
        <div className="workspace">
          <div className="editor" style={{ padding: 24 }}>
            <div className="skeleton-card" style={{ height: 420 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!current || !scene) {
    return (
      <div className="app">
        <TopBar crumbs={[{ label: "Projects", to: "/" }, { label: "Project unavailable" }]} onSearch={() => setPaletteOpen(true)} />
        <div className="too-small">
          <div className="too-small-card">
            <h1>Project could not open</h1>
            <p>{storageError ?? "That project or scene is no longer in local storage."}</p>
            <div className="empty-actions" style={{ justifyContent: "flex-start" }}>
              <Button variant="secondary" onClick={() => navigate("/")}>Back to projects</Button>
              <Button
                variant="danger"
                onClick={() => {
                  void deleteActiveProject().then(() => navigate("/"));
                }}
              >
                Delete project
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const saveLabel =
    saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Unsaved";

  const savePill = (
    <span className={`save-pill${saveState === "error" ? " error" : ""}`} aria-label={`Save state: ${saveLabel}`}>
      <span className="save-dot" />
      <span>{saveLabel} · {revision}</span>
    </span>
  );

  return (
    <div className="app">
      <TopBar
        crumbs={[{ label: "Projects", to: "/" }, { label: current.name }, { label: scene.name }]}
        revision={revision}
        projectChip
        onSearch={() => setPaletteOpen(true)}
        onOpenHierarchy={openHierarchy}
        onOpenInspector={openInspector}
      />
      <div className="workspace">
        <LeftRail projectId={current.id} active="overview" />
        <div className="editor">
          <div className="tabstrip">
            <div className="scene-breadcrumbs">
              <span>Projects</span>
              <span>/</span>
              <span>{current.name}</span>
              <span>/</span>
              <span className="current">{scene.name}</span>
            </div>
            <div className="workspace-tabs" role="tablist" aria-label="Scene workspaces">
              {WORKSPACE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  className="workspace-tab"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="tabstrip-spacer" />
            <Menu
              align="end"
              trigger={
                <Button variant="secondary" size="sm">
                  Project scenes <ChevronDown size={12} />
                </Button>
              }
            >
              <MenuLabel>Scenes</MenuLabel>
              {current.scenes.map((item) => (
                <MenuItem
                  key={item.id}
                  onSelect={() => navigate(`/project/${current.id}/scene/${item.id}`)}
                  shortcut={item.id === current.startSceneId ? "Start" : undefined}
                >
                  {item.name}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onSelect={addScene} disabled={readOnly}>+ New scene</MenuItem>
            </Menu>
          </div>

          <div className="toolbar">
            <div className="toolbar-group" role="group" aria-label="Tools">
              <IconButton
                label="Select tool"
                tooltip="Select tool · V"
                aria-pressed={tool === "select"}
                onClick={() => setTool("select")}
              >
                <SquareDashedMousePointer size={15} />
              </IconButton>
              <IconButton
                label="Hand tool"
                tooltip="Hand tool · H"
                aria-pressed={tool === "hand"}
                onClick={() => setTool("hand")}
              >
                <Hand size={15} />
              </IconButton>
            </div>
            <span className="toolbar-divider" />
            <div className="toolbar-group">
              <IconButton label="Undo" tooltip="Undo · ⌘Z" disabled={history.length === 0 || readOnly} onClick={undo}>
                <Undo2 size={15} />
              </IconButton>
              <IconButton label="Redo" tooltip="Redo · ⇧⌘Z" disabled={future.length === 0 || readOnly} onClick={redo}>
                <Redo2 size={15} />
              </IconButton>
            </div>
            <span className="toolbar-divider" />
            <Menu
              trigger={<Button variant="secondary" size="sm" disabled={readOnly}>+ Add <ChevronDown size={11} /></Button>}
            >
              <MenuItem onSelect={addObject} disabled={readOnly}>Add object</MenuItem>
              <MenuItem onSelect={addScene} disabled={readOnly}>Add scene</MenuItem>
              <MenuItem onSelect={addLayer} disabled={readOnly}>Add layer</MenuItem>
              <MenuItem onSelect={() => toast.push("Import asset", "Asset import arrives in Slice 3.")}>Import asset</MenuItem>
            </Menu>
            <Menu
              trigger={
                <Button variant="ghost" size="sm">
                  Snap <ChevronDown size={11} />
                </Button>
              }
            >
              <MenuLabel>Snap</MenuLabel>
              <MenuItem onSelect={() => setSnapGrid(8)} shortcut={snapGrid === 8 ? "On" : undefined}>Grid 8</MenuItem>
              <MenuItem onSelect={() => setSnapGrid(16)} shortcut={snapGrid === 16 ? "On" : undefined}>Grid 16</MenuItem>
              <MenuItem onSelect={() => setSnapGrid(32)} shortcut={snapGrid === 32 ? "On" : undefined}>Grid 32</MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => setSnapGrid(0)} shortcut={snapGrid === 0 ? "On" : undefined}>Snap off</MenuItem>
            </Menu>
            <Menu
              trigger={
                <Button variant="ghost" size="sm" className="toolbar-secondary">
                  Arrange <ChevronDown size={11} />
                </Button>
              }
            >
              <MenuItem>Bring forward</MenuItem>
              <MenuItem>Send backward</MenuItem>
              <MenuSeparator />
              <MenuItem>Align left</MenuItem>
              <MenuItem>Align center</MenuItem>
              <MenuItem>Align right</MenuItem>
              <MenuItem>Distribute</MenuItem>
              <MenuSeparator />
              <MenuItem shortcut="⌘G">Group</MenuItem>
              <MenuItem shortcut="⇧⌘G">Ungroup</MenuItem>
            </Menu>
            <div className="toolbar-spacer" />
            {savePill}
            <Menu
              trigger={
                <Button variant="violet" size="sm">
                  <Sparkles size={13} />
                  <span className="ask-agent-label">Ask agent</span>
                  <ChevronDown size={11} />
                </Button>
              }
            >
              <MenuLabel>Game Director</MenuLabel>
              <MenuItem onSelect={() => toast.push("Ask agent", "The live agent arrives in Slice 6.")}>Ask about this scene</MenuItem>
              <MenuItem onSelect={() => toast.push("Plan a change", "Plan mode arrives in Slice 7.")}>Plan a change</MenuItem>
              <MenuItem onSelect={() => toast.push("Open chat", "The agent drawer arrives in Slice 6.")}>Open chat</MenuItem>
            </Menu>
            <TooltipPlayButtons onToast={toastSave} />
            <Menu
              trigger={
                <Button variant="ghost" size="sm">
                  View <ChevronDown size={11} />
                </Button>
              }
            >
              <MenuItem onSelect={openHierarchy} shortcut={!wide ? "Drawer" : undefined}>
                <Layers size={13} /> Hierarchy
              </MenuItem>
              <MenuItem onSelect={openInspector} shortcut={!wide ? "Drawer" : undefined}>
                <PanelRight size={13} /> Inspector
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => setTab("scene")}>Focus canvas</MenuItem>
              <MenuItem onSelect={() => setDebug(!debug)}>{debug ? "Hide debug JSON" : "Debug JSON"} · ?debug=1</MenuItem>
              <MenuItem onSelect={() => toast.push("Help", "Shortcuts: ⌘K commands, ⌘Z undo, ⌘S save, 1–4 workspaces.")}>
                <HelpCircle size={13} /> Help & shortcuts
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={exportCurrent} icon={<FileDown size={13} />}>Export project</MenuItem>
            </Menu>
          </div>

          {current.archivedAt && (
            <div className="archived-banner" role="status">
              <span>This project is archived and read-only. Restore it to edit.</span>
              <Button variant="secondary" size="sm" onClick={() => void restoreProject()}>Restore project</Button>
            </div>
          )}

          <div className="editor-body">
            {wide && (
              <aside className="left-dock" aria-label="Hierarchy and layers">
                <EngineLeftDock />
              </aside>
            )}
            <main className="center-stage">
              <EngineWorkspace
                tab={activeTab}
                presentationTab={presentationTab}
                onPresentationTab={setPresentation}
                onToast={toastSave}
              />
            </main>
            {wide && (
              <aside className={`right-dock${inspectorOpen ? "" : " inspector-closed"}`} aria-label="Inspector">
                <EngineInspector tab={inspectorTab} onTab={setInspectorTab} />
              </aside>
            )}
          </div>

          <footer className="statusbar">
            <span>One completed gesture = one revision and one undo entry.</span>
            <strong>{selection.length ? `${selection.length} selected` : "0 selected"}</strong>
            <span className="save-mobile">{saveLabel} · {revision}</span>
            <span className="statusbar-right">
              <span>{history.length} undo · {future.length} redo</span>
              <span>{scene.name} · {scene.size.w} × {scene.size.h}</span>
              <span><Kbd>⌘K</Kbd> commands</span>
            </span>
          </footer>
        </div>
      </div>

      <Drawer open={hierarchyDrawer} onOpenChange={setHierarchyDrawer} title="Hierarchy" side="left">
        <EngineLeftDock />
      </Drawer>
      <Drawer open={inspectorDrawer} onOpenChange={setInspectorDrawer} title="Inspector" side="right">
        <EngineInspector tab={inspectorTab} onTab={setInspectorTab} />
      </Drawer>
      {debug && <DebugPanel navigate={navigate} onClose={() => setDebug(false)} />}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    </div>
  );
}

function TooltipPlayButtons({ onToast }: { onToast: (title: string, message?: string) => void }) {
  return (
    <div className="play-group">
      <Button
        variant="primary"
        size="sm"
        icon={<Play size={13} />}
        onClick={() => onToast("Manual Play", "The runtime arrives in Slice 4. Manual Play needs no model.")}
      >
        Play
      </Button>
      <Button
        variant="violet"
        size="sm"
        icon={<Sparkles size={13} />}
        onClick={() => onToast("AI Play", "Kane AI Play arrives in Slice 10.")}
        title="AI Play requires Kane and a configured model; manual Play always works."
      >
        AI Play
      </Button>
    </div>
  );
}

function DebugPanel({
  navigate,
  onClose,
}: {
  navigate: (path: string) => void;
  onClose: () => void;
}) {
  const document = useEngineStore((state) => state.document);
  const activeSceneId = useEngineStore((state) => state.activeSceneId);
  const activeLayerId = useEngineStore((state) => state.activeLayerId);
  const dispatch = useEngineStore((state) => state.dispatch);
  const setActiveScene = useEngineStore((state) => state.setActiveScene);
  const setSelection = useEngineStore((state) => state.setSelection);
  const [copied, setCopied] = useState(false);
  if (!document) return null;
  const scene = document.scenes.find((candidate) => candidate.id === activeSceneId) ?? document.scenes[0];

  function addScene() {
    const layer = makeLayer("Objects", 0);
    const nextScene = makeScene({
      name: `Debug ${document!.scenes.length + 1}`,
      width: 1600,
      height: 900,
      background: document!.settings.background,
      layers: [layer],
    });
    const result = dispatch("scene.create", { scene: nextScene });
    if (result.ok) {
      setActiveScene(nextScene.id);
      navigate(`/project/${document!.id}/scene/${nextScene.id}?debug=1`);
    }
  }

  function addLayer() {
    if (!scene) return;
    const layer = makeLayer(`Debug layer ${scene.layers.length + 1}`, scene.layers.length);
    const result = dispatch("layer.create", { sceneId: scene.id, layer });
    if (result.ok) {
      useEngineStore.getState().setActiveLayer(layer.id);
    }
  }

  function addObject() {
    if (!scene) return;
    const layerId = activeLayerId ?? scene.layers[0]?.id;
    if (!layerId) return;
    const object = makeObject({
      name: `Debug object ${scene.objects.length + 1}`,
      layerId,
      x: scene.size.w / 2,
      y: scene.size.h / 2,
      width: 64,
      height: 64,
      color: "#8fe3c0",
    });
    const result = dispatch("object.create", { sceneId: scene.id, object });
    if (result.ok) setSelection([object.id]);
  }

  async function copy() {
    await navigator.clipboard.writeText(JSON.stringify(document, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <aside className="debug-panel" aria-label="Debug JSON panel">
      <header className="debug-panel-head">
        <strong>Debug · r{document.revision}</strong>
        <button className="icon-button" onClick={onClose} aria-label="Close debug panel">×</button>
      </header>
      <div className="debug-panel-actions">
        <Button variant="secondary" size="sm" onClick={addScene}>Add scene</Button>
        <Button variant="secondary" size="sm" onClick={addLayer}>Add layer</Button>
        <Button variant="secondary" size="sm" onClick={addObject}>Add object</Button>
        <Button variant="ghost" size="sm" onClick={() => void copy()}>{copied ? "Copied" : "Copy JSON"}</Button>
      </div>
      <pre className="debug-panel-json">{JSON.stringify(document, null, 2)}</pre>
    </aside>
  );
}
