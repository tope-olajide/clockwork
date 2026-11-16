import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Boxes, FileDown, Play, Rocket, Settings2 } from "lucide-react";
import { Button, useToast } from "../../components/ui";
import { LeftRail } from "../../shell/LeftRail";
import { TopBar } from "../../shell/TopBar";
import { MOCK_PROJECTS, TEMPLATE_LABELS } from "../projects/mockProjects";

const sections = {
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
  project: {
    title: "Project",
    body: "Rename, start scene, archive, delete, and import/export settings arrive in Slice 1.",
  },
} as const;

export function ProjectOverviewPage() {
  const { projectId = "prj_neonrunner" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const project = MOCK_PROJECTS.find((item) => item.id === projectId) ?? MOCK_PROJECTS[0]!;
  const sectionKey = searchParams.get("section");
  const section = sectionKey && sectionKey in sections ? sections[sectionKey as keyof typeof sections] : null;

  return (
    <div className="projects-page">
      <TopBar
        crumbs={[{ label: "Projects", to: "/" }, { label: project.name }]}
        projectChip
        onSearch={() => toast.push("Command palette", "Use ⌘K from the editor for the full palette.")}
        onOpenHierarchy={() => toast.push("Hierarchy", "Open a scene to use the editor docks.")}
        onOpenInspector={() => toast.push("Inspector", "Open a scene to use the inspector.")}
      />
      <div className="workspace" style={{ flex: 1, minHeight: 0 }}>
        <LeftRail projectId={project.id} active={sectionKey ?? "overview"} />
        <main className="projects-scroll">
          <div className="projects-content">
            <div className="projects-head">
              <div>
                <div className="project-meta" style={{ marginBottom: 4 }}>
                  <span className="chip">{TEMPLATE_LABELS[project.template]}</span>
                  {project.archived && <span className="chip archived">Archived</span>}
                </div>
                <h1 className="projects-title">{project.name}</h1>
              </div>
              <div className="projects-head-spacer" />
              <Button
                variant="primary"
                icon={<Play size={14} />}
                onClick={() => navigate(`/project/${project.id}/scene/${project.lastSceneId}`)}
              >
                Open scene
              </Button>
              <Button variant="secondary" onClick={() => toast.push("Play", "Manual Play arrives in Slice 4.")}>
                Play
              </Button>
            </div>

            {section ? (
              <div className="empty-state" style={{ minHeight: 300 }}>
                <Settings2 size={22} />
                <strong>{section.title}</strong>
                <p>{section.body}</p>
                <div className="empty-actions">
                  <Button variant="secondary" onClick={() => navigate(`/project/${project.id}`)}>
                    Back to overview
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="overview-stats">
                  <div><span className="filter-label">Scenes</span><strong>{project.sceneCount}</strong></div>
                  <div><span className="filter-label">Last edit</span><strong>{project.editedLabel.replace("Edited ", "")}</strong></div>
                  <div><span className="filter-label">Revision</span><strong className="input-mono">r12</strong></div>
                  <div><span className="filter-label">Start scene</span><strong>Track</strong></div>
                </div>

                <div className="section-heading-row">
                  <h2>Scenes</h2>
                  <Button variant="ghost" size="sm" onClick={() => toast.push("New scene", "Scene creation arrives in Slice 1.")}>
                    + New scene
                  </Button>
                </div>
                <div className="scene-list">
                  {["Track", "Win", "Intro"].slice(0, project.sceneCount).map((name, index) => (
                    <button
                      key={name}
                      className="scene-row"
                      onClick={() => navigate(`/project/${project.id}/scene/scn_${name.toLowerCase()}`)}
                    >
                      <span className="scene-thumb" aria-hidden="true" />
                      <span>
                        <strong>{name}</strong>
                        <span className="project-meta">2560 × 1080 · {index === 0 ? "Start scene" : `${4 + index} objects`}</span>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>

                <div className="section-heading-row">
                  <h2>Project</h2>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${project.id}?section=project`)}>
                    Settings
                  </Button>
                </div>
                <div className="overview-cards">
                  <button className="overview-card" onClick={() => navigate(`/project/${project.id}?section=assets`)}>
                    <Boxes size={17} />
                    <strong>Assets</strong>
                    <span>Project-wide library</span>
                  </button>
                  <button className="overview-card" onClick={() => navigate(`/project/${project.id}?section=playtest`)}>
                    <Play size={17} />
                    <strong>Playtest</strong>
                    <span>Run and inspect</span>
                  </button>
                  <button className="overview-card" onClick={() => navigate(`/project/${project.id}?section=ship`)}>
                    <Rocket size={17} />
                    <strong>Ship</strong>
                    <span>Share and export</span>
                  </button>
                  <button className="overview-card" onClick={() => toast.push("Export", "Export arrives in Slice 8.")}>
                    <FileDown size={17} />
                    <strong>Export</strong>
                    <span>Playable bundle</span>
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
