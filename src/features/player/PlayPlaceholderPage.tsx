import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Play } from "lucide-react";

export function PlayPlaceholderPage() {
  const { projectId = "" } = useParams();

  return (
    <div className="player-page">
      <header className="player-bar">
        <Link to={`/project/${projectId}`} className="button button-ghost button-sm">
          <ArrowLeft size={13} /> Back to project
        </Link>
        <span className="project-meta">{projectId}</span>
        <span className="chip violet">Player</span>
      </header>
      <main className="player-stage">
        <div className="player-placeholder">
          <Play size={20} />
          <h1>Player unavailable</h1>
          <p>
            This reserved player route is not used by the current build. Open the project and use Play,
            or export the project to run its standalone player.
          </p>
          <Link className="button button-secondary" to={`/project/${projectId}`}>
            Return to project
          </Link>
        </div>
      </main>
    </div>
  );
}
