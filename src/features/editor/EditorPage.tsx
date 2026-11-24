import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { useAgentPresenceStore } from "../../engine/store/agent-presence";import { CoachTour } from "../onboarding/CoachTour";
import { EngineInspector, EngineLeftDock, EngineWorkspace,
  type InspectorTab,
  type PresentationTab,
  type WorkspaceTab,
} from "./EngineDocks";
import { AgentDrawer } from "../agent/AgentDrawer";
import { ChatHistoryMenu } from "../agent/chat/ChatHistoryMenu";
import { useAgentSession } from "../agent/useAgentSession";
import { AiPlayPanel } from "../ai-play/AiPlayPanel";
import { useAiPlay } from "../ai-play/useAiPlay";
import { repairAiPlayFailure } from "../../engine/ai/ai-play-repair";

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
  leftDockWidth?: number;
  rightDockWidth?: number;
}

function clampWidth(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
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
      leftDockWidth: typeof parsed.leftDockWidth === "number" ? parsed.leftDockWidth : undefined,
      rightDockWidth: typeof parsed.rightDockWidth === "number" ? parsed.rightDockWidth : undefined,
    };
  } catch {
    return { inspectorOpen: false, tool: "select", inspectorTab: "scene" };
  }
}

export function EditorPage() {
  const { projectId = "", sceneId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const briefSentFor = useRef<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { wide, huge, tooSmall } = useShellBreakpoints();

  const document = useEngineStore((state) => state.document);
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

  const ui0 = useMemo(loadEditorUi, []);
  const [inspectorOpen, setInspectorOpen] = useState(ui0.inspectorOpen);
  const [tool, setTool] = useState<"select" | "hand">(ui0.tool);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(ui0.inspectorTab);
  const [leftDockWidth, setLeftDockWidth] = useState(ui0.leftDockWidth ?? 268);
  const [rightDockWidth, setRightDockWidth] = useState(ui0.rightDockWidth ?? 292);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hierarchyDrawer, setHierarchyDrawer] = useState(false);
  const [inspectorDrawer, setInspectorDrawer] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [aiPlayOpen, setAiPlayOpen] = useState(false);
  const [lockedSelectionId, setLockedSelectionId] = useState<string | null>(null);
  const [debug, setDebug] = useState(searchParams.get("debug") === "1");

  const tab = (searchParams.get("tab") as WorkspaceTab | null) ?? "scene";
  const activeTab: WorkspaceTab = WORKSPACE_TABS.some((t) => t.key === tab) ? tab : "scene";
  const ptab = (searchParams.get("ptab") as PresentationTab | null) ?? "look";
  const presentationTab: PresentationTab = PRESENTATION_TABS.includes(ptab) ? ptab : "look";

  useEffect(() => {
    if (!projectId) return;
    void loadProject(projectId);
  }, [projectId, loadProject]);

  useEffect(() => {
    if (!current || !sceneId) return;
    if (current.scenes.some((s) => s.id === sceneId) && activeSceneId !== sceneId) setActiveScene(sceneId);
  }, [current, sceneId, activeSceneId, setActiveScene]);

  useEffect(() => {
    if (!current) return;
    const desired = scene?.id ?? sceneId;
    if (desired && current.scenes.some((s) => s.id === desired)) return;
    const fallback = current.scenes.find((s) => s.id === current.startSceneId) ?? current.scenes[0];
    if (fallback) navigate(`/project/${current.id}/scene/${fallback.id}`, { replace: true });
  }, [current, scene, sceneId, navigate]);

  useEffect(() => {
    if (!scene) return;
    if (!activeLayerId || !scene.layers.some((l) => l.id === activeLayerId)) {
      const top = [...scene.layers].sort((a, b) => a.order - b.order)[0];
      if (top) setActiveLayer(top.id);
    }
  }, [scene, activeLayerId, setActiveLayer]);

  useEffect(() => {
    window.localStorage.setItem(
      EDITOR_UI_KEY,
      JSON.stringify({ inspectorOpen, tool, inspectorTab, leftDockWidth, rightDockWidth } satisfies EditorUiPrefs),
    );
  }, [inspectorOpen, tool, inspectorTab, leftDockWidth, rightDockWidth]);

  useEffect(() => {
    if (huge) setInspectorOpen(true);
  }, [huge]);

  useEffect(() => {
    if (selection.length > 0) {
      setInspectorTab("object");
      // At 1366–1599 the inspector starts collapsed; selecting an object must
      // reveal the fields the user just selected. Only the >=1600 layout keeps
      // it permanently open.
      if (wide) setInspectorOpen(true);
    }
  }, [selection, wide]);

  function setTab(next: WorkspaceTab) {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  }
  function setPresentation(next: PresentationTab) {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", "presentation");
    sp.set("ptab", next);
    setSearchParams(sp, { replace: true });
  }

  function addObject() {
    if (!current || !scene || readOnly) return;
    const layerId = activeLayerId ?? [...scene.layers].sort((a, b) => a.order - b.order)[0]?.id;
    if (!layerId) {
      toast.push("No layer available", "Create or select a layer first.");
      return;
    }
    const obj = makeObject({
      name: `Object ${scene.objects.length + 1}`,
      layerId,
      x: 160,
      y: 160,
      width: 96,
      height: 64,
      color: "#7c5cff",
    });
    const result = dispatch("object.create", { sceneId: scene.id, layerId, object: obj });
    if (result.ok) {
      setSelection([obj.id]);
      setInspectorTab("object");
      if (wide) setInspectorOpen(true); else setInspectorDrawer(true);
      toast.push("Object added", "A new shape object was created and selected.");
    } else toast.push("Object could not be added", result.error);
  }

  function addLayer() {
    if (!current || !scene || readOnly) return;
    const layer = makeLayer(`Layer ${scene.layers.length + 1}`, scene.layers.length);
    const result = dispatch("layer.create", { sceneId: scene.id, layer });
    if (result.ok) {
      setActiveLayer(layer.id);
      toast.push("Layer created", layer.name);
    } else toast.push("Layer could not be created", result.error);
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
    } else toast.push("Scene could not be created", result.error);
  }

  function deleteSelected() {
    if (!current || !scene || !selected || readOnly) return;
    if (!window.confirm(`Delete “${selected.name}”?`)) return;
    const result = dispatch("object.delete", { sceneId: scene.id, objectId: selected.id });
    if (result.ok) setSelection([]); else toast.push("Delete failed", result.error);
  }

  async function restoreProject() {
    if (!current) return;
    const result = dispatch("project.setArchived", { archived: false });
    if (result.ok) {
      await saveNow();
      toast.push("Project restored", current.name);
    } else toast.push("Restore failed", result.error);
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
    if (wide) setInspectorOpen(true); else setInspectorDrawer(true);
  }

  const projectName = current?.name ?? "Loading project";
  const revision = current ? `r${current.revision}` : "r—";

  function handleAgentOpenPanel(panel: string, subtab?: string) {
    const p = panel.toLowerCase();
    if (p === "hierarchy" || p === "layers") {
      if (wide) toast.push("Hierarchy", "The hierarchy is already open on this width.");
      else setHierarchyDrawer(true);
      return;
    }
    if (p === "inspector") {
      openInspector();
      return;
    }
    if (p === "assets" || p === "content") {
      setTab("content");
      return;
    }
    if (p === "logic" || p === "rules" || p === "variables") {
      setTab("logic");
      return;
    }
    if (p === "presentation" || p === "look" || p === "animation" || p === "audio" || p === "ui" || p === "game-ui") {
      setTab("presentation");
      if (subtab && ["look", "animation", "audio", "ui"].includes(subtab)) setPresentation(subtab as PresentationTab);
      return;
    }
    if (p === "scene") {
      setTab("scene");
      return;
    }
    if (p === "playtest" || p === "play") {
      navigate(`/play/${current?.id ?? projectId}`);
      return;
    }
    if (p === "settings" || p === "ai") {
      navigate(`/project/${current?.id ?? projectId}?section=ai`);
      return;
    }
    if (p === "ship" || p === "share") {
      navigate(`/project/${current?.id ?? projectId}?section=ship`);
      return;
    }
    toast.push("Panel", `Opened request: ${panel}`);
  }

  const agent = useAgentSession({
    projectId: current?.id ?? projectId,
    tab: activeTab,
    tool,
    onOpenPanel: handleAgentOpenPanel,
    lockedSelectionId,
  });

  const aiPlay = useAiPlay({
    projectId: current?.id ?? projectId,
    getDocument: () => useEngineStore.getState().document,
    saveNow,
    onRepair: async (result) => {
      const doc = useEngineStore.getState().document;
      if (!doc) return false;
      const repair = repairAiPlayFailure(doc, result);
      if (!repair) return false;
      const outcome = dispatch(repair.command.type, repair.command.args, { transactionId: `ai-play-repair-${Date.now()}` });
      if (!outcome.ok) {
        toast.push("AI fix rejected", outcome.error);
        return false;
      }
      setActiveScene(repair.sceneId);
      setSelection([repair.objectId]);
      setInspectorTab("object");
      await saveNow();
      toast.push("AI Play auto-fix", repair.diagnosis);
      return true;
    },
  });

  function openAiPlay() {
    setAiPlayOpen(true);
    setAgentOpen(false);
  }

  const lockedSelection = lockedSelectionId
    ? current?.scenes.flatMap((item) => item.objects).find((object) => object.id === lockedSelectionId) ?? null
    : null;

  function askAgentAbout(objectId: string, nextMode: "ask" | "build" | "plan" = "ask") {
    setSelection([objectId]);
    setLockedSelectionId(objectId);
    agent.setMode(nextMode);
    setAgentOpen(true);
  }

  useEffect(() => {
    const api = {
      getState: () => {
        const state = useEngineStore.getState();
        const active = state.document?.scenes.find((scene) => scene.id === state.activeSceneId) ?? state.document?.scenes[0];
        return {
          projectId: state.document?.id ?? null,
          revision: state.document?.revision ?? 0,
          sceneId: state.activeSceneId,
          selection: state.selection,
          objects: active?.objects.map((object) => ({ id: object.id, name: object.name, x: object.transform.x, y: object.transform.y })) ?? [],
          historyLength: state.history.length,
          futureLength: state.future.length,
          saveState: state.saveState,
          playtestRunning: state.playtestRunning,
          agentOpen,
          agentMode: agent.mode,
          pendingPreview: Boolean(agent.pendingPreview),
          agentPresence: useAgentPresenceStore.getState().presence,
          agentGhost: useAgentPresenceStore.getState().ghost,
        };
      },
      select: (ids: string[]) => setSelection(ids),
      undo,
      redo,
      openAgent: () => setAgentOpen(true),
      closeAgent: () => setAgentOpen(false),
      setTab: (next: WorkspaceTab) => setTab(next),
    };
    (window as unknown as { __clockwork?: typeof api }).__clockwork = api;
    return () => {
      const holder = window as unknown as { __clockwork?: typeof api };
      if (holder.__clockwork === api) delete holder.__clockwork;
    };
  }, [agent.mode, agent.pendingPreview, agentOpen, redo, setSelection, undo]);

  const commands: PaletteCommand[] = buildStubCommands({
    onCreate: () => toast.push("New project", "Use Projects → New project."),
    onProjects: () => navigate("/"),
    onHierarchy: openHierarchy,
    onInspector: openInspector,
    onPlay: () => navigate(`/play/${current?.id ?? projectId}`),
    onAiPlay: openAiPlay,
    onSettings: () => navigate(`/project/${current?.id ?? projectId}?section=ai`),
    onToast: toast.push,
  });

  useEffect(() => {
    const state = location.state as { agentBrief?: string; agentMode?: "build" | "ask" | "plan" } | null;
    const brief = state?.agentBrief?.trim();
    if (!brief || !current || isLoading) return;
    if (briefSentFor.current === current.id) return;
    briefSentFor.current = current.id;
    agent.setMode(state?.agentMode === "plan" ? "plan" : "build");
    setAgentOpen(true);
    const prompt = `Build the first playable draft of this project from the following brief. Create or update scenes, objects, rules, variables, and presentation as needed, and summarize what you built.\n\nBrief:\n${brief}`;
    void agent.send(prompt);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [agent, current, isLoading, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setAgentOpen((open) => !open);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow().then(() => toast.push("Saved", "Project saved to this browser."));
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) openAiPlay();
        else navigate(`/play/${current?.id ?? projectId}`);
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
        const parent = selected?.parentId ? scene?.objects.find((object) => object.id === selected.parentId) : null;
        if (parent) {
          setSelection([parent.id]);
          setInspectorTab("object");
          setInspectorOpen(true);
          return;
        }
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

  if (tooSmall) {
    return (
      <div className="app">
        <TopBar crumbs={[{ label: "Projects", to: "/" }, { label: projectName }]} revision={revision} projectChip onSearch={() => setPaletteOpen(true)} />
        <div className="too-small">
          <div className="too-small-card">
            <h1>Clockwork needs a wider window</h1>
            <p>The editor is designed for a 1366×768 desktop first. Widen the window to keep editing, or open the shared player on this device.</p>
            <div className="empty-actions" style={{ justifyContent: "flex-start" }}>
              <Button variant="secondary" onClick={() => navigate("/")}>Back to projects</Button>
              <Button variant="ghost" onClick={exportCurrent} icon={<FileDown size={14} />} disabled={!current}>Export project</Button>
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
        <div className="workspace"><div className="editor" style={{ padding: 24 }}><div className="skeleton-card" style={{ height: 420 }} /></div></div>
      </div>
    );
  }

  if (!current || !scene) {
    return (
      <div className="app">
        <TopBar crumbs={[{ label: "Projects", to: "/" }, { label: "Project unavailable" }]} onSearch={() => setPaletteOpen(true)} />
        <div className="too-small project-error">
          <div className="too-small-card">
            <h1>Project could not open</h1>
            <p>{storageError ?? "That project or scene is no longer in local storage."}</p>
            <div className="empty-actions" style={{ justifyContent: "flex-start" }}>
              <Button variant="secondary" onClick={() => navigate("/")}>Back to projects</Button>
              <Button variant="danger" onClick={() => { void deleteActiveProject().then(() => navigate("/")); }}>Delete project</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const saveLabel = saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Unsaved";
  const savePill = (
    <span className={`save-pill${saveState === "error" ? " error" : ""}`} aria-label={`Save state: ${saveLabel}`}>
      <span className="save-dot" />
      <span>{saveLabel} · {revision}</span>
    </span>
  );

  const openAiSettings = () => navigate(`/project/${current.id}?section=ai`);

  return (
    <div className={`app${agentOpen ? " agent-open" : ""}`}>
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
            <div className="scene-breadcrumbs"><span>Projects</span><span>/</span><span>{current.name}</span><span>/</span><span className="current">{scene.name}</span></div>
            <div className="workspace-tabs" role="tablist" aria-label="Scene workspaces">
              {WORKSPACE_TABS.map((t) => (
                <button key={t.key} className="workspace-tab" role="tab" aria-selected={activeTab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>
              ))}
            </div>
            <div className="tabstrip-spacer" />
            <Menu align="end" trigger={<Button variant="secondary" size="sm">Project scenes <ChevronDown size={12} /></Button>}>
              <MenuLabel>Scenes</MenuLabel>
              {current.scenes.map((item) => (
                <MenuItem key={item.id} onSelect={() => navigate(`/project/${current.id}/scene/${item.id}`)} shortcut={item.id === current.startSceneId ? "Start" : undefined}>{item.name}</MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onSelect={addScene} disabled={readOnly}>+ New scene</MenuItem>
            </Menu>
          </div>

          <div className="toolbar">
            <div className="toolbar-group" role="group" aria-label="Tools">
              <IconButton label="Select tool" tooltip="Select tool · V" aria-pressed={tool === "select"} onClick={() => setTool("select")}><SquareDashedMousePointer size={15} /></IconButton>
              <IconButton label="Hand tool" tooltip="Hand tool · H" aria-pressed={tool === "hand"} onClick={() => setTool("hand")}><Hand size={15} /></IconButton>
            </div>
            <span className="toolbar-divider" />
            <div className="toolbar-group">
              <IconButton label="Undo" tooltip="Undo · ⌘Z" disabled={history.length === 0 || readOnly} onClick={undo}><Undo2 size={15} /></IconButton>
              <IconButton label="Redo" tooltip="Redo · ⇧⌘Z" disabled={future.length === 0 || readOnly} onClick={redo}><Redo2 size={15} /></IconButton>
            </div>
            <span className="toolbar-divider" />
            <Menu trigger={<Button variant="secondary" size="sm" disabled={readOnly}>+ Add <ChevronDown size={11} /></Button>}>
              <MenuItem onSelect={addObject} disabled={readOnly}>Add object</MenuItem>
              <MenuItem onSelect={addScene} disabled={readOnly}>Add scene</MenuItem>
              <MenuItem onSelect={addLayer} disabled={readOnly}>Add layer</MenuItem>
              <MenuItem onSelect={() => toast.push("Import asset", "Open the Assets workspace to import or drag in an asset.")}>Import asset</MenuItem>
            </Menu>
            <Menu trigger={<Button variant="ghost" size="sm">Snap <ChevronDown size={11} /></Button>}>
              <MenuLabel>Snap</MenuLabel>
              <MenuItem onSelect={() => setSnapGrid(8)} shortcut={snapGrid === 8 ? "On" : undefined}>Grid 8</MenuItem>
              <MenuItem onSelect={() => setSnapGrid(16)} shortcut={snapGrid === 16 ? "On" : undefined}>Grid 16</MenuItem>
              <MenuItem onSelect={() => setSnapGrid(32)} shortcut={snapGrid === 32 ? "On" : undefined}>Grid 32</MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => setSnapGrid(0)} shortcut={snapGrid === 0 ? "On" : undefined}>Snap off</MenuItem>
            </Menu>
            <div className="toolbar-spacer" />
            {savePill}
            <div className="split-button" role="group" aria-label="Ask agent">
              <Button
                variant="violet"
                size="sm"
                data-testid="agent-open"
                aria-label="Ask agent"
                onClick={() => {
                  const nextMode = agent.canBuildPlan ? "build" : "ask";
                  if (selection[0]) askAgentAbout(selection[0], nextMode);
                  else { setLockedSelectionId(null); agent.setMode(nextMode); setAgentOpen(true); }
                }}
              >
                <Sparkles size={13} /><span className="ask-agent-label">Ask agent</span>
              </Button>
              <Menu trigger={<Button variant="violet" size="sm" data-testid="agent-menu" aria-label="More agent actions"><ChevronDown size={11} /></Button>}>
                <MenuLabel>Game Director</MenuLabel>
                <MenuItem onSelect={() => { if (selection[0]) askAgentAbout(selection[0], "ask"); else { agent.setMode("ask"); setAgentOpen(true); } }}>Ask about this scene</MenuItem>
                <MenuItem onSelect={() => { if (selection[0]) askAgentAbout(selection[0], agent.canBuildPlan ? "plan" : "ask"); else { agent.setMode(agent.canBuildPlan ? "plan" : "ask"); setAgentOpen(true); } }} disabled={!agent.canBuildPlan}>Plan a change</MenuItem>
                <MenuItem onSelect={() => { setLockedSelectionId(null); agent.setMode("ask"); setAgentOpen(true); }}>Explain this scene</MenuItem>
                <MenuItem onSelect={() => setAgentOpen(true)} shortcut="⌘J">Open chat</MenuItem>
              </Menu>
            </div>
            <Button variant="ghost" size="sm" icon={<Play size={13} />} onClick={() => navigate(`/play/${current.id}`)} data-testid="toolbar-play">Play</Button>
            <Button variant="violet" size="sm" icon={<Sparkles size={13} />} onClick={openAiPlay} data-testid="toolbar-ai-play" aria-label="AI Play with Kane">AI Play</Button>
            <Menu trigger={<Button variant="ghost" size="sm">View <ChevronDown size={11} /></Button>}>
              <MenuItem onSelect={openHierarchy} shortcut={!wide ? "Drawer" : undefined}><Layers size={13} /> Hierarchy</MenuItem>
              <MenuItem onSelect={openInspector} shortcut={!wide ? "Drawer" : undefined}><PanelRight size={13} /> Inspector</MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => setTab("scene")}>Focus canvas</MenuItem>
              <MenuItem onSelect={() => setDebug(!debug)}>{debug ? "Hide debug JSON" : "Debug JSON"} · ?debug=1</MenuItem>
              <MenuItem onSelect={() => toast.push("Help", "Shortcuts: ⌘K commands, ⌘Z undo, ⌘S save, 1–4 workspaces.")}><HelpCircle size={13} /> Help & shortcuts</MenuItem>
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
              <aside className="left-dock" style={{ width: leftDockWidth }} aria-label="Hierarchy and layers"><EngineLeftDock /></aside>
            )}
            {wide && <DockResizer side="left" width={leftDockWidth} min={200} max={Math.max(240, window.innerWidth - rightDockWidth - 520)} onChange={setLeftDockWidth} />}
            <main className="center-stage">
              <EngineWorkspace tab={activeTab} presentationTab={presentationTab} onPresentationTab={setPresentation} onToast={toast.push} onAskAgent={(objectId) => askAgentAbout(objectId, "ask")} />
            </main>
            {wide && <DockResizer side="right" width={rightDockWidth} min={240} max={Math.max(280, window.innerWidth - leftDockWidth - 520)} onChange={setRightDockWidth} />}
            {wide && (
              <aside className={`right-dock${inspectorOpen ? "" : " inspector-closed"}`} style={{ width: rightDockWidth }} aria-label="Inspector">
                <EngineInspector tab={inspectorTab} onTab={setInspectorTab} onAskAgent={(objectId) => askAgentAbout(objectId, "ask")} />
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

      <Drawer open={hierarchyDrawer} onOpenChange={setHierarchyDrawer} title="Hierarchy" side="left"><EngineLeftDock /></Drawer>
      <Drawer open={inspectorDrawer} onOpenChange={setInspectorDrawer} title="Inspector" side="right"><EngineInspector tab={inspectorTab} onTab={setInspectorTab} onAskAgent={(objectId) => askAgentAbout(objectId, "ask")} /></Drawer>
      {debug && <DebugPanel onClose={() => setDebug(false)} />}
      {agentOpen && <button className="agent-scrim" aria-label="Close agent" onClick={() => setAgentOpen(false)} />}
      {agent.pendingPreview && (
        <div className="plan-preview-pill" role="status" data-testid="plan-preview-pill">
          <span>
            {agent.pendingPreview.destructive ? "CONFIRM CHANGES" : agent.mode === "plan" ? "PLAN PREVIEW" : "PREVIEW"} ·{" "}
            {agent.pendingPreview.changeSet?.changes.length ?? agent.pendingPreview.commands.length} changes
          </span>
          <button type="button" onClick={agent.applyPendingPreview} disabled={agent.pendingPreview.stale}>Apply</button>
          <button type="button" onClick={agent.discardPendingPreview}>Discard</button>
        </div>
      )}
      <AiPlayPanel
        open={aiPlayOpen}
        onClose={() => setAiPlayOpen(false)}
        aiPlay={aiPlay}
        modelLabel={agent.modelLabel}
        document={current}
        onRequestPlan={(goal) => {
          setAgentOpen(true);
          agent.setMode(agent.canBuildPlan ? "plan" : "ask");
          void agent.send(
            `Draft a game-test plan for this project.\n\nUser goal (copy verbatim into userGoal): ${goal}\n\n`
            + "Call get_game_test_profile first, then propose_test_plan using only its control and observation ids. "
            + "Do not run Kane, do not edit the project, and if something the user asked for is not expressible, say so instead of approximating it.",
          );
        }}
        onPhaseResult={(result) => {
          setAgentOpen(true);
          void agent.continueWithPhaseResult(result);
        }}
        onUndoFix={() => { undo(); toast.push("AI fixes undone", "The last editor change was reverted."); }}
      />
      <AgentDrawer
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        projectId={current.id}
        projectName={current.name}
        sceneName={scene.name}
        revision={current.revision}
        selectionCount={selection.length}
        mode={agent.mode}
        onModeChange={agent.setMode}
        messages={agent.messages}
        status={agent.status}
        error={agent.error}
        isBusy={agent.isBusy}
        onSend={agent.send}
        onStop={agent.stop}
        onRetry={agent.retry}
        onRegenerate={agent.regenerate}
        onNewChat={agent.newChat}
        selectedModelId={agent.selectedModelId}
        onSelectModel={agent.setSelectedModelId}
        models={agent.models}
        providers={agent.providers}
        aiSettings={agent.aiSettings}
        modelLabel={agent.modelLabel}
        canBuildPlan={agent.canBuildPlan}
        onOpenSettings={openAiSettings}
        pendingPreview={agent.pendingPreview}
        onApplyPreview={agent.applyPendingPreview}
        onDiscardPreview={agent.discardPendingPreview}
        lockedSelection={lockedSelection ? { id: lockedSelection.id, name: lockedSelection.name } : null}
        onUnlockSelection={() => setLockedSelectionId(null)}
        document={current}
        draftKey={`clockwork:agent-draft:${current.id}:${agent.sessionId}`}
        history={<ChatHistoryMenu
          sessions={agent.sessions}
          activeSessionId={agent.sessionId}
          onOpen={agent.openChat}
          onNew={agent.newChat}
          onDelete={agent.deleteChatSession}
          onRename={agent.renameChatSession}
        />}
      />
      <CoachTour />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    </div>
  );
}

function DockResizer({ side, width, min, max, onChange }: { side: "left" | "right"; width: number; min: number; max: number; onChange: (width: number) => void }) {
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      onChange(clampWidth(startWidth + delta, min, max));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  return <div className="dock-resizer" role="separator" aria-orientation="vertical" aria-label={`Resize ${side === "left" ? "hierarchy" : "inspector"} dock`} onPointerDown={onPointerDown} />;
}

function DebugPanel({ onClose }: { onClose: () => void }) {
  const document = useEngineStore((s) => s.document);
  if (!document) return null;
  return (
    <div className="debug-panel" role="dialog" aria-label="Debug JSON">
      <div className="debug-header">
        <strong>Debug · r{document.revision}</strong>
        <div>
          <button onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(document, null, 2)); }}>Copy</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
      <pre className="debug-json">{JSON.stringify({ id: document.id, name: document.name, revision: document.revision, scenes: document.scenes.length, assets: document.assets.length, prefabs: document.prefabs.length, variables: document.variables.length }, null, 2)}</pre>
    </div>
  );
}
