import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Play } from "lucide-react";
import { MOCK_PROJECTS } from "../projects/mockProjects";

export function PlayPlaceholderPage() {
  const { projectId = "prj_neonrunner" } = useParams();
  const project = MOCK_PROJECTS.find((item) => item.id === projectId) ?? MOCK_PROJECTS[0]!;

  return (
    <div className="player-page">
      <header className="player-bar">
        <Link to={`/project/${project.id}/scene/${project.lastSceneId}`} className="button button-ghost button-sm">
          <ArrowLeft size={13} /> Back to editor
        </Link>
        <span className="project-meta">{project.name} · Track</span>
        <span className="chip violet">Player</span>
      </header>
      <main className="player-stage">
        <div className="player-placeholder">
          <Play size={20} />
          <h1>The runtime lands in Slice 4.</h1>
          <p>
            This route is reserved for the shared player and exported builds. It will open without the
            editor, and manual Play will never require a model or Kane.
          </p>
          <Link className="button button-secondary" to={`/project/${project.id}/scene/${project.lastSceneId}`}>
            Return to Track
          </Link>
        </div>
      </main>
    </div>
  );
}
