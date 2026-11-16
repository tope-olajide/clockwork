import { useEffect, useMemo, useState } from "react";
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
import { MOCK_PROJECTS, TEMPLATE_LABELS, type ProjectSummary } from "./mockProjects";
import { NewProjectDialog, type CreatedProject } from "./NewProjectDialog";

type Sort = "recent" | "name";
type StatusFilter = "active" | "archived" | "all";
type OriginFilter = "all" | "platformer" | "topdown" | "puzzle" | "blank";

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
        parsed.origin === "platformer" ||
        parsed.origin === "topdown" ||
        parsed.origin === "puzzle" ||
        parsed.origin === "blank"
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
  const [projects, setProjects] = useState<ProjectSummary[]>(MOCK_PROJECTS);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<SavedFilters>(loadFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const previewState = new URLSearchParams(location.search).get("state");
  const loading = previewState === "loading";
  const error = previewState === "error";
  const forcedEmpty = previewState === "empty";

  useEffect(() => {
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
  }, [filters]);

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
      return 0;
    });
  }, [filters, projects, search]);

  const hasFilters = search.trim().length > 0 || activeFilterCount(filters) > 0;
  const isEmpty = forcedEmpty || projects.length === 0;
  const isNoResults = !isEmpty && filtered.length === 0;

  function createProject(created: CreatedProject) {
    const id = `prj_${Date.now().toString(36)}`;
    const project: ProjectSummary = {
      id,
      name: created.name || "Untitled project",
      template: created.template,
      sceneCount: 1,
      editedLabel: "Edited just now",
      archived: false,
      cover: created.template === "puzzle" ? "puzzle" : created.template === "blank" ? "blank" : "dusk",
      lastSceneId: "scn_scene",
    };
    setProjects((current) => [project, ...current]);
    navigate(`/project/${id}/scene/${project.lastSceneId}`);
    toast.push("Project created", `${project.name} is ready in the editor.`);
  }

  function openProject(project: ProjectSummary) {
    if (project.archived) {
      toast.push("Archived project", "Unarchive it before editing. Opening the read-only overview.");
      navigate(`/project/${project.id}`);
      return;
    }
    navigate(`/project/${project.id}/scene/${project.lastSceneId}`);
  }

  function toggleArchive(project: ProjectSummary) {
    setProjects((current) =>
      current.map((item) => (item.id === project.id ? { ...item, archived: !item.archived } : item)),
    );
    toast.push(project.archived ? "Project unarchived" : "Project archived", project.name);
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
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setDialogOpen(true)}>
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
              <p>The local project index is unavailable. Retry, or import a project file to keep working.</p>
              <div className="empty-actions">
                <Button variant="secondary" onClick={() => navigate("/")}>Retry</Button>
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
                    onClick={() => openProject(project)}
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
                        <MenuItem onSelect={() => openProject(project)}>Open</MenuItem>
                        <MenuItem onSelect={() => toast.push("Rename", "Rename arrives with the project store in Slice 1.")}>
                          Rename
                        </MenuItem>
                        <MenuItem onSelect={() => toast.push("Duplicate", "Duplicate arrives with the project store in Slice 1.")}>
                          Duplicate
                        </MenuItem>
                        <MenuItem onSelect={() => toast.push("Export", "Export arrives in Slice 8.")}>
                          Export
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem onSelect={() => toggleArchive(project)}>
                          {project.archived ? "Unarchive" : "Archive"}
                        </MenuItem>
                        <MenuItem danger onSelect={() => toast.push("Delete", "Delete arrives with the project store in Slice 1.")}>
                          Delete
                        </MenuItem>
                      </Menu>
                    </div>
                    <div className="project-meta">
                      <span>{project.editedLabel}</span>
                      <span className="dot" />
                      <span>{project.sceneCount} scenes</span>
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

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreate={createProject} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    </div>
  );
}
