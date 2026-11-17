import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Boxes,
  ChevronDown,
  FileDown,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import {
  Button,
  Menu,
  MenuItem,
  MenuSeparator,
  Select,
  useToast,
} from "../../components/ui";
import { TopBar } from "../../shell/TopBar";
import { CommandPalette, buildStubCommands } from "../../shell/CommandPalette";
import { runCommand } from "../../engine/commands/registry";
import { createProjectFromTemplate } from "../../engine/model/templates";
import { applyStarterVisuals, seedStarterAssets } from "../../engine/assets/starter-seed";
import type { ProjectDocument, TemplateOrigin } from "../../engine/model/schema";
import {
  deleteProjectRecord,
  listProjectRecords,
  readProjectDocument,
  saveProjectDocument,
  StorageError,
} from "../../engine/persistence/indexeddb";
import { downloadProject, readProjectFile } from "../../engine/persistence/transfer";
import { duplicateProjectRecord, ensureDemoProject } from "../../engine/store/engine-store";
import {
  TEMPLATE_LABELS,
  toProjectSummary,
  type ProjectSummary,
} from "./project-view";
import { NewProjectDialog, type CreatedProject } from "./NewProjectDialog";

type Sort = "recent" | "name";
type StatusFilter = "active" | "archived" | "all";
type OriginFilter = "all" | TemplateOrigin;

interface SavedFilters {
  sort: Sort;
  status: StatusFilter;
  origin: OriginFilter;
}

const FILTER_KEY = "clockwork:project-filters";

function loadFilters(): SavedFilters {
  try {
    const saved = window.localStorage.getItem(FILTER_KEY);
    if (!saved) throw new Error("no saved filters");
    const parsed = JSON.parse(saved) as Partial<SavedFilters>;
    return {
      sort: parsed.sort === "name" ? "name" : "recent",
      status:
        parsed.status === "archived" || parsed.status === "all" ? parsed.status : "active",
      origin:
        parsed.origin && (parsed.origin === "all" || parsed.origin in TEMPLATE_LABELS)
          ? parsed.origin
          : "all",
    };
  } catch {
    return { sort: "recent", status: "active", origin: "all" };
  }
}

function activeFilterCount(filters: SavedFilters) {
  return Number(filters.sort !== "recent") + Number(filters.status !== "active") + Number(filters.origin !== "all");
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<SavedFilters>(loadFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const previewState = new URLSearchParams(location.search).get("state");
  const forcedEmpty = previewState === "empty";
  const forcedLoading = previewState === "loading";
  const forcedError = previewState === "error";

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!forcedEmpty) await ensureDemoProject();
      const records = await listProjectRecords();
      setProjects(records.map(toProjectSummary));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The local project index is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [forcedEmpty]);

  useEffect(() => {
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    if (forcedLoading || forcedError) {
      setLoading(forcedLoading);
      if (forcedError) setError("The local project index is unavailable. Retry, or import a project file to keep working.");
      return;
    }
    void loadProjects();
  }, [forcedError, forcedLoading, loadProjects]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const next = projects.filter((project) => {
      if (normalizedSearch && !project.name.toLowerCase().includes(normalizedSearch)) return false;
      if (filters.status === "active" && project.archived) return false;
      if (filters.status === "archived" && !project.archived) return false;
      if (filters.origin !== "all" && project.template !== filters.origin) return false;
      return true;
    });
    return next.sort((a, b) => {
      if (filters.sort === "name") return a.name.localeCompare(b.name);
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [filters, projects, search]);

  const hasFilters = search.trim().length > 0 || activeFilterCount(filters) > 0;
  const isEmpty = forcedEmpty || projects.length === 0;
  const isNoResults = !isEmpty && filtered.length === 0;

  async function createProject(created: CreatedProject) {
    setBusy(true);
    try {
      let document: ProjectDocument;
      if (created.mode === "import") {
        if (!created.file) throw new Error("Choose a project file to import.");
        const parsed = await readProjectFile(created.file);
        document = parsed.document;
        document.updatedAt = new Date().toISOString();
      } else {
        document = createProjectFromTemplate(created.template, created.name || "Untitled project");
        if (created.settings) {
          document.settings = {
            ...document.settings,
            width: created.settings.width,
            height: created.settings.height,
            pixelArt: created.settings.pixelArt,
            gravity: { x: 0, y: created.settings.gravity },
          };
        }
        document = applyStarterVisuals(document);
        document = await seedStarterAssets(document);
      }
      await saveProjectDocument(document);
      navigate(`/project/${document.id}/scene/${document.startSceneId}`);
      toast.push("Project created", `${document.name} is ready in the editor.`);
    } catch (createError) {
      toast.push(
        created.mode === "import" ? "Import failed" : "Project could not be created",
        createError instanceof Error ? createError.message : "The project could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openProject(project: ProjectSummary) {
    if (project.archived) {
      toast.push("Archived project", "Unarchive it before editing. Opening the read-only overview.");
      navigate(`/project/${project.id}`);
      return;
    }
    try {
      const document = await readProjectDocument(project.id);
      if (!document) throw new StorageError("That project is no longer in local storage.");
      navigate(`/project/${document.id}/scene/${document.startSceneId}`);
    } catch (openError) {
      toast.push("Project could not open", openError instanceof Error ? openError.message : "Try again.");
    }
  }

  async function toggleArchive(project: ProjectSummary) {
    try {
      const document = await readProjectDocument(project.id);
      if (!document) throw new StorageError("That project is no longer in local storage.");
      const next = runCommand(document, {
        type: "project.setArchived",
        args: { archived: !project.archived },
      }).document;
      await saveProjectDocument(next);
      await loadProjects();
      toast.push(project.archived ? "Project restored" : "Project archived", project.name);
    } catch (archiveError) {
      toast.push("Archive failed", archiveError instanceof Error ? archiveError.message : "Try again.");
    }
  }

  async function renameProject(project: ProjectSummary) {
    const name = window.prompt("Rename project", project.name)?.trim();
    if (!name || name === project.name) return;
    try {
      const document = await readProjectDocument(project.id);
      if (!document) throw new StorageError("That project is no longer in local storage.");
      const next = runCommand(document, { type: "project.rename", args: { name } }).document;
      await saveProjectDocument(next);
      await loadProjects();
      toast.push("Project renamed", name);
    } catch (renameError) {
      toast.push("Rename failed", renameError instanceof Error ? renameError.message : "Try again.");
    }
  }

  async function duplicateProject(project: ProjectSummary) {
    try {
      const record = await duplicateProjectRecord(project.id);
      if (!record) throw new StorageError("That project is no longer in local storage.");
      await loadProjects();
      toast.push("Project duplicated", `${project.name} copy is ready.`);
    } catch (duplicateError) {
      toast.push("Duplicate failed", duplicateError instanceof Error ? duplicateError.message : "Try again.");
    }
  }

  async function exportProject(project: ProjectSummary) {
    try {
      const document = await readProjectDocument(project.id);
      if (!document) throw new StorageError("That project is no longer in local storage.");
      downloadProject(document);
      toast.push("Project exported", "The .clockwork.json file is downloading.");
    } catch (exportError) {
      toast.push("Export failed", exportError instanceof Error ? exportError.message : "Try again.");
    }
  }

  async function deleteProject(project: ProjectSummary) {
    const confirmed = window.confirm(
      `Delete “${project.name}” permanently?\n\nIts scenes, project settings, and saved revisions in this browser will be removed. This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await deleteProjectRecord(project.id);
      await loadProjects();
      toast.push("Project deleted", project.name);
    } catch (deleteError) {
      toast.push("Delete failed", deleteError instanceof Error ? deleteError.message : "Try again.");
    }
  }

  const commands = buildStubCommands({
    onCreate: () => setDialogOpen(true),
    onProjects: () => navigate("/"),
    onHierarchy: () => toast.push("Hierarchy", "Open a project to use the editor docks."),
    onInspector: () => toast.push("Inspector", "Open a project to use the inspector."),
    onPlay: () => toast.push("Play", "Open a scene to play it."),
    onAiPlay: () => toast.push("AI Play", "AI Play arrives with Kane in Slice 10."),
    onSettings: () => toast.push("Settings", "AI settings arrive in Slice 6.5."),
    onToast: toast.push,
  });

  return (
    <div className="projects-page">
      <TopBar
        crumbs={[{ label: "Projects" }]}
        onSearch={() => setPaletteOpen(true)}
        onOpenHierarchy={() => toast.push("Hierarchy", "Open a project to use the editor docks.")}
        onOpenInspector={() => toast.push("Inspector", "Open a project to use the inspector.")}
      />
      <main className="projects-scroll">
        <div className="projects-content">
          <div className="projects-head">
            <h1 className="projects-title">Projects</h1>
            <span className="project-count">{filtered.length}</span>
            <div className="projects-head-spacer" />
            <div className="projects-search">
              <Search className="projects-search-icon" size={14} />
              <input
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search projects…"
                aria-label="Search projects"
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowFilters((open) => !open)}
              aria-expanded={showFilters}
              aria-controls="project-filters"
            >
              Filters
              {activeFilterCount(filters) > 0 && <span className="chip coral">{activeFilterCount(filters)}</span>}
              <ChevronDown size={13} />
            </Button>
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setDialogOpen(true)} disabled={busy}>
              New project
            </Button>
          </div>

          {showFilters && (
            <div className="filters-panel" id="project-filters">
              <label className="filter-field">
                <span className="filter-label">Sort</span>
                <Select
                  value={filters.sort}
                  onValueChange={(value) => setFilters((current) => ({ ...current, sort: value as Sort }))}
                  options={[
                    { value: "recent", label: "Recently edited" },
                    { value: "name", label: "Name" },
                  ]}
                  ariaLabel="Sort projects"
                />
              </label>
              <label className="filter-field">
                <span className="filter-label">Status</span>
                <Select
                  value={filters.status}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, status: value as StatusFilter }))
                  }
                  options={[
                    { value: "active", label: "Active" },
                    { value: "archived", label: "Archived" },
                    { value: "all", label: "All" },
                  ]}
                  ariaLabel="Filter by status"
                />
              </label>
              <label className="filter-field">
                <span className="filter-label">Template</span>
                <Select
                  value={filters.origin}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, origin: value as OriginFilter }))
                  }
                  options={[
                    { value: "all", label: "All templates" },
                    { value: "platformer", label: "Platformer" },
                    { value: "topdown", label: "Top-down" },
                    { value: "puzzle", label: "Puzzle" },
                    { value: "blank", label: "Blank" },
                    { value: "import", label: "Imported" },
                  ]}
                  ariaLabel="Filter by template"
                />
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ sort: "recent", status: "active", origin: "all" })}
              >
                Reset filters
              </Button>
            </div>
          )}

          {loading ? (
            <div className="skeleton-grid" aria-label="Loading projects" aria-busy="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="skeleton-card" key={index} />
              ))}
            </div>
          ) : error ? (
            <div className="empty-state" role="alert">
              <Boxes size={22} />
              <strong>Projects could not load</strong>
              <p>{error}</p>
              <div className="empty-actions">
                <Button variant="secondary" onClick={() => void loadProjects()}>Retry</Button>
                <Button variant="ghost" onClick={() => setDialogOpen(true)} icon={<FileDown size={14} />}>
                  Import project
                </Button>
              </div>
            </div>
          ) : isEmpty ? (
            <div className="empty-state">
              <Boxes size={22} />
              <strong>Create your first project</strong>
              <p>Start blank, pick a playable template, or import a Clockwork file. You can change everything later.</p>
              <div className="empty-actions">
                <Button variant="primary" onClick={() => setDialogOpen(true)} icon={<Plus size={14} />}>
                  New project
                </Button>
              </div>
            </div>
          ) : isNoResults ? (
            <div className="empty-state">
              <Search size={22} />
              <strong>No projects match</strong>
              <p>Clear the search or filters to see the rest of your projects.</p>
              <div className="empty-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setFilters({ sort: "recent", status: "active", origin: "all" });
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          ) : (
            <div className="project-grid">
              {filtered.map((project) => (
                <article className={`project-card${project.archived ? " archived-card" : ""}`} key={project.id}>
                  <button
                    className={`project-cover cover-${project.cover}`}
                    onClick={() => void openProject(project)}
                    aria-label={`Open ${project.name}`}
                  >
                    {project.archived && <span className="chip archived card-archived-chip">Archived</span>}
                    <span className="project-cover-art">{project.name}</span>
                  </button>
                  <div className="project-card-body">
                    <div className="project-card-title-row">
                      <h2 className="project-card-title">{project.name}</h2>
                      <Menu
                        align="end"
                        trigger={
                          <button className="icon-button project-card-menu" aria-label={`Actions for ${project.name}`} title={`Actions for ${project.name}`}>
                            <MoreHorizontal size={15} />
                          </button>
                        }
                      >
                        <MenuItem onSelect={() => void openProject(project)}>Open</MenuItem>
                        <MenuItem onSelect={() => void renameProject(project)}>
                          Rename
                        </MenuItem>
                        <MenuItem onSelect={() => void duplicateProject(project)}>
                          Duplicate
                        </MenuItem>
                        <MenuItem onSelect={() => void exportProject(project)}>
                          Export
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem onSelect={() => void toggleArchive(project)}>
                          {project.archived ? "Unarchive" : "Archive"}
                        </MenuItem>
                        <MenuItem danger onSelect={() => void deleteProject(project)}>
                          Delete
                        </MenuItem>
                      </Menu>
                    </div>
                    <div className="project-meta">
                      <span>{project.editedLabel}</span>
                      <span className="dot" />
                      <span>{project.sceneCount} {project.sceneCount === 1 ? "scene" : "scenes"}</span>
                      <span className="dot" />
                      <span className="template-chip">{TEMPLATE_LABELS[project.template]}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && !error && !isEmpty && hasFilters && !isNoResults && (
            <div className="project-meta" style={{ marginTop: 14 }}>
              <span>Showing {filtered.length} of {projects.length} projects</span>
              <button
                className="button button-ghost button-sm"
                onClick={() => {
                  setSearch("");
                  setFilters({ sort: "recent", status: "active", origin: "all" });
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </main>

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreate={(project) => void createProject(project)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    </div>
  );
}
