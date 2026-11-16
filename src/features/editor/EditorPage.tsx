import { useEffect, useMemo, useState } from "react";
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
import {
  MockInspector,
  MockLeftDock,
  MockWorkspace,
  OBJECTS,
  type InspectorTab,
  type MockObject,
  type PresentationTab,
  type WorkspaceTab,
} from "./MockDocks";
import { MOCK_PROJECTS } from "../projects/mockProjects";

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "scene", label: "Scene" },
  { key: "content", label: "Content" },
  { key: "logic", label: "Logic" },
  { key: "presentation", label: "Presentation" },
];

const PRESENTATION_TABS: PresentationTab[] = ["look", "animation", "audio", "ui"];

function getProjectName(projectId: string | undefined) {
  const found = MOCK_PROJECTS.find((project) => project.id === projectId);
  return found?.name ?? "Untitled project";
}

export function EditorPage() {
  const { projectId = "prj_neonrunner", sceneId = "scn_track" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { wide, huge, tooSmall } = useShellBreakpoints();

  const rawTab = searchParams.get("tab");
  const activeTab: WorkspaceTab = WORKSPACE_TABS.some((tab) => tab.key === rawTab)
    ? (rawTab as WorkspaceTab)
    : "scene";
  const rawPresentation = searchParams.get("ptab");
  const presentationTab: PresentationTab = PRESENTATION_TABS.includes(rawPresentation as PresentationTab)
    ? (rawPresentation as PresentationTab)
    : "look";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("scene");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [hierarchyDrawer, setHierarchyDrawer] = useState(false);
  const [inspectorDrawer, setInspectorDrawer] = useState(false);
  const [tool, setTool] = useState<"select" | "hand">("select");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const selected: MockObject | null = useMemo(
    () => OBJECTS.find((object) => object.id === selectedId) ?? null,
    [selectedId],
  );
  const projectName = getProjectName(projectId);

  useEffect(() => {
    if (huge && !selected) setInspectorOpen(true);
  }, [huge, selected]);

  useEffect(() => {
    if (!wide) setInspectorOpen(false);
  }, [wide]);

  function setTab(tab: WorkspaceTab) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    if (tab === "presentation") next.set("ptab", presentationTab);
    else next.delete("ptab");
    setSearchParams(next, { replace: true });
    if (tab === "presentation") {
      setInspectorDrawer(false);
    }
  }

  function setPresentation(tab: PresentationTab) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "presentation");
    next.set("ptab", tab);
    setSearchParams(next, { replace: true });
  }

  function selectObject(id: string) {
    setSelectedId(id);
    setInspectorTab("object");
    setInspectorOpen(true);
    if (!wide) {
      setHierarchyDrawer(false);
      setInspectorDrawer(true);
    }
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
        toast.push("Saved", "Static Slice 0 shell; persistence arrives in Slice 1.");
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (!wide) setHierarchyDrawer(true);
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>("[data-hierarchy-search]")?.focus();
        }, 80);
        return;
      }
      if (event.key === "Escape" && !paletteOpen) {
        setSelectedId(null);
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

  function openHierarchy() {
    if (wide) {
      toast.push("Hierarchy", "The hierarchy is already open on this width.");
    } else {
      setHierarchyDrawer(true);
    }
  }

  function openInspector() {
    if (wide) {
      setInspectorOpen(true);
    } else {
      setInspectorDrawer(true);
    }
  }

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

  const savePill = (
    <span className="save-pill" aria-label="Save state: saved">
      <span className="save-dot" />
      <span>Saved · r12</span>
    </span>
  );

  if (tooSmall) {
    return (
      <div className="app">
        <TopBar
          crumbs={[{ label: "Projects", to: "/" }, { label: projectName }, { label: "Track" }]}
          revision="r12"
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
              <Button variant="ghost" onClick={() => toast.push("Export", "Export arrives in Slice 8.")} icon={<FileDown size={14} />}>
                Export project
              </Button>
            </div>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar
        crumbs={[{ label: "Projects", to: "/" }, { label: projectName }, { label: "Track" }]}
        revision="r12"
        projectChip
        onSearch={() => setPaletteOpen(true)}
        onOpenHierarchy={openHierarchy}
        onOpenInspector={openInspector}
      />
      <div className="workspace">
        <LeftRail projectId={projectId} active="overview" />
        <div className="editor">
          <div className="tabstrip">
            <div className="scene-breadcrumbs">
              <span>Projects</span>
              <span>/</span>
              <span>{projectName}</span>
              <span>/</span>
              <span className="current">{sceneId === "scn_track" ? "Track" : "Scene"}</span>
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
              <MenuItem onSelect={() => undefined} shortcut="4 objects">Track</MenuItem>
              <MenuItem onSelect={() => toast.push("Scenes", "Scene switching arrives in Slice 1.")}>Win</MenuItem>
              <MenuItem onSelect={() => toast.push("Scenes", "Scene creation arrives in Slice 1.")}>Intro</MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => toast.push("New scene", "Scene creation arrives in Slice 1.")}>+ New scene</MenuItem>
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
              <IconButton label="Undo" tooltip="Undo · ⌘Z" disabled><Undo2 size={15} /></IconButton>
              <IconButton label="Redo" tooltip="Redo · ⇧⌘Z" disabled><Redo2 size={15} /></IconButton>
            </div>
            <span className="toolbar-divider" />
            <Menu
              trigger={<Button variant="secondary" size="sm">+ Add <ChevronDown size={11} /></Button>}
            >
              <MenuItem onSelect={() => toast.push("Add object", "Object creation arrives in Slice 1.")}>Add object</MenuItem>
              <MenuItem onSelect={() => toast.push("Add scene", "Scene creation arrives in Slice 1.")}>Add scene</MenuItem>
              <MenuItem onSelect={() => toast.push("Add layer", "Layer creation arrives in Slice 1.")}>Add layer</MenuItem>
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
              <MenuItem shortcut="8 px">Grid 8</MenuItem>
              <MenuItem shortcut="16 px">Grid 16</MenuItem>
              <MenuItem shortcut="32 px">Grid 32</MenuItem>
              <MenuSeparator />
              <MenuItem>Snap to objects</MenuItem>
              <MenuItem>Snap to guides</MenuItem>
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
            <TooltipPlayButtons onToast={toast.push} />
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
              <MenuItem onSelect={() => toast.push("Focus canvas", "Viewport navigation arrives in Slice 2.")}>Focus canvas</MenuItem>
              <MenuItem onSelect={() => toast.push("Debug overlay", "Debug overlay arrives in Slice 4.")}>Debug overlay</MenuItem>
              <MenuItem onSelect={() => toast.push("Help", "Shortcut sheet arrives in Slice 1.")}>
                <HelpCircle size={13} /> Help & shortcuts
              </MenuItem>
            </Menu>
          </div>

          <div className="editor-body">
            {wide && (
              <aside className="left-dock" aria-label="Hierarchy and layers">
                <MockLeftDock selectedId={selectedId} onSelect={selectObject} onToast={toast.push} />
              </aside>
            )}
            <main className="center-stage">
              <MockWorkspace
                tab={activeTab}
                presentationTab={presentationTab}
                onPresentationTab={setPresentation}
                onToast={toast.push}
              />
            </main>
            {wide && (
              <aside className={`right-dock${inspectorOpen ? "" : " inspector-closed"}`} aria-label="Inspector">
                <MockInspector selected={selected} tab={inspectorTab} onTab={setInspectorTab} onToast={toast.push} />
              </aside>
            )}
          </div>

          <footer className="statusbar">
            <span>One completed gesture = one revision and one undo entry.</span>
            <strong>{selected ? "1 selected" : "0 selected"}</strong>
            <span className="save-mobile">Saved · r12</span>
            <span className="statusbar-right">
              <span>0 undo · 0 redo</span>
              <span>Track · 2560 × 1080</span>
              <span><Kbd>⌘K</Kbd> commands</span>
            </span>
          </footer>
        </div>
      </div>

      <Drawer open={hierarchyDrawer} onOpenChange={setHierarchyDrawer} title="Hierarchy" side="left">
        <MockLeftDock selectedId={selectedId} onSelect={selectObject} onToast={toast.push} />
      </Drawer>
      <Drawer open={inspectorDrawer} onOpenChange={setInspectorDrawer} title="Inspector" side="right">
        <MockInspector selected={selected} tab={inspectorTab} onTab={setInspectorTab} onToast={toast.push} />
      </Drawer>
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
