import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  FileDown,
  FileUp,
  MoreHorizontal,
  Play,
  Rocket,
  Share2,
  Settings2,
  Star,
  Trash2,
} from "lucide-react";
import { Button, Menu, MenuItem, MenuSeparator, Select, useToast } from "../../components/ui";
import { LeftRail } from "../../shell/LeftRail";
import { TopBar } from "../../shell/TopBar";
import { makeLayer, makeScene } from "../../engine/model/factory";
import type { ProjectDocument, ProjectSettings, Scene } from "../../engine/model/schema";
import { downloadProject, readProjectFile } from "../../engine/persistence/transfer";
import { useEngineStore } from "../../engine/store/engine-store";
import { AssetBrowser } from "../assets/AssetBrowser";
import { TEMPLATE_LABELS, formatEdited } from "../projects/project-view";

const placeholderSections = {
  assets: {
    title: "Assets",
    body: "The project-wide asset library lands in Slice 3. Scene-level content stays in the Content workspace.",
  },
  playtest: {
    title: "Playtest",
    body: "Manual Play and runtime telemetry arrive in Slice 4. AI Play with Kane arrives in Slice 10.",
  },
  ship: {
    title: "Ship",
    body: "Share links and playable exports arrive in Slice 8.",
  },
} as const;

export function ProjectOverviewPage() {
  const { projectId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const document = useEngineStore((state) => state.document);
  const activeProjectId = useEngineStore((state) => state.activeProjectId);
  const loadProject = useEngineStore((state) => state.loadProject);
  const dispatch = useEngineStore((state) => state.dispatch);
  const saveNow = useEngineStore((state) => state.saveNow);
  const deleteActiveProject = useEngineStore((state) => state.deleteActiveProject);
  const isLoading = useEngineStore((state) => state.isLoading);
  const storageError = useEngineStore((state) => state.storageError);

  const current = document?.id === projectId ? document : null;
  const sectionKey = searchParams.get("section");
  const section = sectionKey && sectionKey in placeholderSections ? placeholderSections[sectionKey as keyof typeof placeholderSections] : null;
  const readOnly = Boolean(current?.archivedAt);

  useEffect(() => {
    if (activeProjectId !== projectId || (!current && !storageError)) {
      void loadProject(projectId);
    }
  }, [activeProjectId, current, loadProject, projectId, storageError]);

  function run(type: string, args: unknown) {
    const result = dispatch(type, args);
    if (!result.ok) {
      toast.push("Change rejected", result.error);
      return false;
    }
    return true;
  }

  async function rename() {
    if (!current || readOnly) return;
    const name = window.prompt("Rename project", current.name)?.trim();
    if (!name || name === current.name) return;
    if (run("project.rename", { name })) {
      await saveNow();
      toast.push("Project renamed", name);
    }
  }

  async function addScene() {
    if (!current || readOnly) return;
    const layer = makeLayer("Objects", 0);
    const scene = makeScene({
      name: `Scene ${current.scenes.length + 1}`,
      width: 1600,
      height: 900,
      background: current.settings.background,
      layers: [layer],
    });
    if (run("scene.create", { scene })) {
      await saveNow();
      navigate(`/project/${current.id}/scene/${scene.id}`);
    }
  }

  async function deleteScene(scene: Scene) {
    if (!current || readOnly) return;
    if (!window.confirm(`Delete “${scene.name}”? All of its layers, objects, and rules will be removed.`)) return;
    if (run("scene.delete", { sceneId: scene.id })) {
      await saveNow();
      toast.push("Scene deleted", scene.name);
    }
  }

  async function setStartScene(sceneId: string) {
    if (!current || readOnly) return;
    if (run("project.setStartScene", { sceneId })) {
      await saveNow();
      toast.push("Start scene updated", current.scenes.find((scene) => scene.id === sceneId)?.name ?? "");
    }
  }

  async function archive(archived: boolean) {
    if (!current) return;
    if (run("project.setArchived", { archived })) {
      await saveNow();
      toast.push(archived ? "Project archived" : "Project restored", current.name);
    }
  }

  async function removeUnavailableProject() {
    try {
      await deleteActiveProject();
      navigate("/");
      toast.push("Project deleted", "The damaged project was removed from this browser.");
    } catch (error) {
      toast.push("Delete failed", error instanceof Error ? error.message : "Try again.");
    }
  }

  async function removeProject() {
    if (!current) return;
    if (!window.confirm(`Delete “${current.name}” permanently?\n\nThis removes the project and its saved document from this browser. This cannot be undone.`)) return;
    try {
      await deleteActiveProject();
      navigate("/");
      toast.push("Project deleted", current.name);
    } catch (error) {
      toast.push("Delete failed", error instanceof Error ? error.message : "Try again.");
    }
  }

  async function exportProject() {
    if (!current) return;
    downloadProject(current);
    toast.push("Project exported", "The .clockwork.json file is downloading.");
  }

  async function importIntoProject(file: File | undefined) {
    if (!file || !current) return;
    try {
      const { document: imported } = await readProjectFile(file);
      await useEngineStore.getState().importProject(imported);
      toast.push("Project imported", imported.name);
      navigate(`/project/${imported.id}`);
    } catch (error) {
      toast.push("Import failed", error instanceof Error ? error.message : "That file could not be read.");
    }
  }

  if (isLoading && !current) {
    return (
      <div className="projects-page">
        <TopBar crumbs={[{ label: "Projects", to: "/" }, { label: "Loading project" }]} onSearch={() => undefined} />
        <main className="projects-scroll">
          <div className="projects-content">
            <div className="skeleton-grid" aria-label="Loading project" aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => <div className="skeleton-card" key={index} />)}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="projects-page">
        <TopBar crumbs={[{ label: "Projects", to: "/" }, { label: "Project unavailable" }]} onSearch={() => undefined} />
        <main className="projects-scroll">
          <div className="projects-content">
            <div className="empty-state" role="alert">
              <Boxes size={22} />
              <strong>Project could not open</strong>
              <p>{storageError ?? "That project is no longer in local storage."}</p>
              <div className="empty-actions">
                <Button variant="secondary" onClick={() => navigate("/")}>Back to projects</Button>
                <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => void removeUnavailableProject()}>
                  Delete damaged project
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="projects-page">
      <TopBar
        crumbs={[{ label: "Projects", to: "/" }, { label: current.name }]}
        revision={`r${current.revision}`}
        projectChip
        onSearch={() => toast.push("Command palette", "Use ⌘K from the editor for the full palette.")}
        onOpenHierarchy={() => toast.push("Hierarchy", "Open a scene to use the editor docks.")}
        onOpenInspector={() => toast.push("Inspector", "Open a scene to use the inspector.")}
      />
      <div className="workspace" style={{ flex: 1, minHeight: 0 }}>
        <LeftRail projectId={current.id} active={sectionKey ?? "overview"} />
        <main className="projects-scroll">
          <div className="projects-content">
            <div className="projects-head">
              <div>
                <div className="project-meta" style={{ marginBottom: 4 }}>
                  <span className="chip">{TEMPLATE_LABELS[current.templateOrigin]}</span>
                  {current.archivedAt && <span className="chip archived">Archived</span>}
                </div>
                <h1 className="projects-title">{current.name}</h1>
              </div>
              <div className="projects-head-spacer" />
              <Button
                variant="primary"
                icon={<Play size={14} />}
                onClick={() => navigate(`/project/${current.id}/scene/${current.startSceneId}`)}
              >
                Open scene
              </Button>
              <Button
                variant="secondary"
                disabled
                title="Manual Play arrives in Slice 4"
                aria-label="Play (available in Slice 4)"
              >
                Play
              </Button>
              <Button
                variant="ghost"
                disabled
                icon={<Share2 size={14} />}
                title="Share links arrive in Slice 8"
                aria-label="Share (available in Slice 8)"
              >
                Share
              </Button>
              <Menu
                align="end"
                trigger={
                  <button className="icon-button" aria-label={`Project actions for ${current.name}`} title="Project actions">
                    <MoreHorizontal size={16} />
                  </button>
                }
              >
                <MenuItem onSelect={() => void rename()} disabled={readOnly}>Rename</MenuItem>
                <MenuItem onSelect={() => void exportProject()}>Export .clockwork.json</MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={() => void archive(!current.archivedAt)}>
                  {current.archivedAt ? "Restore project" : "Archive project"}
                </MenuItem>
                <MenuItem danger onSelect={() => void removeProject()}>Delete project</MenuItem>
              </Menu>
            </div>

            {current.archivedAt && (
              <div className="archived-banner" role="status">
                <span>This project is archived and read-only. Restore it to edit scenes.</span>
                <Button variant="secondary" size="sm" onClick={() => void archive(false)}>Restore project</Button>
              </div>
            )}

            {sectionKey === "project" ? (
              <ProjectSettingsPanel
                document={current}
                readOnly={readOnly}
                onRename={rename}
                onRun={run}
                onSave={saveNow}
                onDelete={removeProject}
                onExport={exportProject}
                onImport={importIntoProject}
              />
            ) : sectionKey === "assets" ? (
              <AssetBrowser />
            ) : section ? (
              <div className="empty-state" style={{ minHeight: 300 }}>
                <Settings2 size={22} />
                <strong>{section.title}</strong>
                <p>{section.body}</p>
                <div className="empty-actions">
                  <Button variant="secondary" onClick={() => navigate(`/project/${current.id}`)}>
                    Back to overview
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="overview-stats">
                  <div><span className="filter-label">Scenes</span><strong>{current.scenes.length}</strong></div>
                  <div><span className="filter-label">Last edit</span><strong>{formatEdited(current.updatedAt).replace("Edited ", "")}</strong></div>
                  <div><span className="filter-label">Revision</span><strong className="input-mono">r{current.revision}</strong></div>
                  <div>
                    <span className="filter-label">Start scene</span>
                    <strong>{current.scenes.find((scene) => scene.id === current.startSceneId)?.name ?? "Missing"}</strong>
                  </div>
                </div>

                <div className="section-heading-row">
                  <h2>Scenes</h2>
                  <Button variant="ghost" size="sm" onClick={() => void addScene()} disabled={readOnly}>
                    + New scene
                  </Button>
                </div>
                <div className="scene-list">
                  {current.scenes.map((scene) => {
                    const objectCount = scene.objects.length;
                    const isStart = scene.id === current.startSceneId;
                    return (
                      <div className="scene-row" key={scene.id}>
                        <button
                          className="scene-thumb"
                          style={{ background: scene.background.color }}
                          aria-label={`Open ${scene.name}`}
                          onClick={() => navigate(`/project/${current.id}/scene/${scene.id}`)}
                        />
                        <button
                          className="scene-row-main"
                          onClick={() => navigate(`/project/${current.id}/scene/${scene.id}`)}
                        >
                          <span>
                            <strong>{scene.name}</strong>
                            <span className="project-meta">
                              {scene.size.w} × {scene.size.h} · {objectCount} {objectCount === 1 ? "object" : "objects"}
                              {isStart ? " · Start scene" : ""}
                            </span>
                          </span>
                          <ArrowRight size={14} />
                        </button>
                        <div className="scene-row-actions">
                          {!isStart && (
                            <button
                              className="tiny-icon"
                              aria-label={`Set ${scene.name} as start scene`}
                              title="Set as start scene"
                              disabled={readOnly}
                              onClick={() => void setStartScene(scene.id)}
                            >
                              <Star size={12} />
                            </button>
                          )}
                          <button
                            className="tiny-icon"
                            aria-label={`Delete ${scene.name}`}
                            title="Delete scene"
                            disabled={readOnly || current.scenes.length <= 1}
                            onClick={() => void deleteScene(scene)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="section-heading-row">
                  <h2>Project</h2>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${current.id}?section=project`)}>
                    Settings
                  </Button>
                </div>
                <div className="overview-cards">
                  <button className="overview-card" onClick={() => navigate(`/project/${current.id}?section=assets`)}>
                    <Boxes size={17} />
                    <strong>Assets</strong>
                    <span>Project-wide library</span>
                  </button>
                  <button className="overview-card" onClick={() => navigate(`/project/${current.id}?section=playtest`)}>
                    <Play size={17} />
                    <strong>Playtest</strong>
                    <span>Run and inspect</span>
                  </button>
                  <button className="overview-card" onClick={() => navigate(`/project/${current.id}?section=ship`)}>
                    <Rocket size={17} />
                    <strong>Ship</strong>
                    <span>Share and export</span>
                  </button>
                  <button className="overview-card" onClick={() => void exportProject()}>
                    <FileDown size={17} />
                    <strong>Export</strong>
                    <span>.clockwork.json</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ProjectSettingsPanel({
  document,
  readOnly,
  onRename,
  onRun,
  onSave,
  onDelete,
  onExport,
  onImport,
}: {
  document: ProjectDocument;
  readOnly: boolean;
  onRename: () => Promise<void>;
  onRun: (type: string, args: unknown) => boolean;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onExport: () => Promise<void>;
  onImport: (file: File | undefined) => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState(document.name);
  const [startSceneId, setStartSceneId] = useState(document.startSceneId);
  const [width, setWidth] = useState(String(document.settings.width));
  const [height, setHeight] = useState(String(document.settings.height));
  const [pixelArt, setPixelArt] = useState(document.settings.pixelArt);
  const [gravity, setGravity] = useState(String(document.settings.gravity.y));
  const [background, setBackground] = useState(document.settings.background);

  useEffect(() => {
    setName(document.name);
    setStartSceneId(document.startSceneId);
    setWidth(String(document.settings.width));
    setHeight(String(document.settings.height));
    setPixelArt(document.settings.pixelArt);
    setGravity(String(document.settings.gravity.y));
    setBackground(document.settings.background);
  }, [document.id]);

  async function save() {
    if (readOnly) return;
    const parsedWidth = Number(width);
    const parsedHeight = Number(height);
    const parsedGravity = Number(gravity);
    if (!Number.isFinite(parsedWidth) || parsedWidth <= 0 || !Number.isFinite(parsedHeight) || parsedHeight <= 0) {
      toast.push("Invalid resolution", "Width and height must be greater than zero.");
      return;
    }
    const settings: ProjectSettings = {
      ...document.settings,
      width: Math.round(parsedWidth),
      height: Math.round(parsedHeight),
      pixelArt,
      gravity: { x: document.settings.gravity.x, y: Number.isFinite(parsedGravity) ? parsedGravity : 0 },
      background,
    };
    if (name.trim() && name.trim() !== document.name) {
      if (!onRun("project.rename", { name: name.trim() })) return;
    }
    if (startSceneId !== document.startSceneId && !onRun("project.setStartScene", { sceneId: startSceneId })) return;
    if (!onRun("project.updateSettings", { settings })) return;
    await onSave();
    toast.push("Project settings saved", "Changes are stored in this browser.");
  }

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <div className="section-heading-row">
          <h2>Project</h2>
          <Button variant="ghost" size="sm" onClick={() => void onRename()} disabled={readOnly}>Rename</Button>
        </div>
        <div className="field-grid">
          <label className="field-row full">
            <span>Name</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} disabled={readOnly} />
          </label>
          <label className="field-row full">
            <span>Start scene</span>
            <Select
              value={startSceneId}
              onValueChange={setStartSceneId}
              options={document.scenes.map((scene) => ({ value: scene.id, label: scene.name }))}
              ariaLabel="Start scene"
            />
          </label>
          <div className="detail-row"><span>Project ID</span><span className="value input-mono">{document.id}</span></div>
          <div className="detail-row"><span>Template</span><span className="value">{TEMPLATE_LABELS[document.templateOrigin]}</span></div>
          <div className="detail-row"><span>Created</span><span className="value">{new Date(document.createdAt).toLocaleDateString()}</span></div>
          <div className="detail-row"><span>Updated</span><span className="value">{formatEdited(document.updatedAt)}</span></div>
        </div>
      </section>

      <section className="settings-card">
        <div className="section-heading-row"><h2>Presentation</h2></div>
        <div className="field-grid">
          <label className="field-row"><span>Width</span><input className="input input-mono" type="number" value={width} onChange={(event) => setWidth(event.target.value)} disabled={readOnly} /></label>
          <label className="field-row"><span>Height</span><input className="input input-mono" type="number" value={height} onChange={(event) => setHeight(event.target.value)} disabled={readOnly} /></label>
          <label className="field-row"><span>Gravity Y</span><input className="input input-mono" type="number" value={gravity} onChange={(event) => setGravity(event.target.value)} disabled={readOnly} /></label>
          <label className="field-row"><span>Background</span><input className="input input-mono" value={background} onChange={(event) => setBackground(event.target.value)} disabled={readOnly} /></label>
          <label className="field-row full" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={pixelArt} onChange={(event) => setPixelArt(event.target.checked)} disabled={readOnly} />
            <span>Pixel art rendering</span>
          </label>
        </div>
        <div className="layer-editor-actions" style={{ marginTop: 12 }}>
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={readOnly}>Save changes</Button>
        </div>
      </section>

      <section className="settings-card">
        <div className="section-heading-row"><h2>Files</h2></div>
        <p className="panel-helper">Export a portable project file, or replace this project by importing one.</p>
        <div className="layer-editor-actions" style={{ marginTop: 12 }}>
          <Button variant="secondary" size="sm" icon={<FileDown size={13} />} onClick={() => void onExport()}>
            Export
          </Button>
          <label className={`button button-secondary button-sm${readOnly ? " disabled" : ""}`} style={{ cursor: readOnly ? "not-allowed" : "pointer" }}>
            <FileUp size={13} /> Import
            <input
              type="file"
              accept=".json,.clockwork.json"
              hidden
              disabled={readOnly}
              onChange={(event) => void onImport(event.target.files?.[0])}
            />
          </label>
        </div>
      </section>

      <section className="settings-card danger-card">
        <div className="section-heading-row"><h2>Danger zone</h2></div>
        <p className="panel-helper">Deleting removes this project from local storage. Export first if you want a copy.</p>
        <div className="layer-editor-actions" style={{ marginTop: 12 }}>
          <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={() => void onDelete()}>
            Delete project
          </Button>
        </div>
      </section>
    </div>
  );
}
