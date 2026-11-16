import { Navigate, Route, Routes } from "react-router-dom";
import { EditorPage } from "./features/editor/EditorPage";
import { ProjectOverviewPage } from "./features/editor/ProjectOverviewPage";
import { PlayPlaceholderPage } from "./features/player/PlayPlaceholderPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ProjectsPage />} />
      <Route path="/project/:projectId" element={<ProjectOverviewPage />} />
      <Route path="/project/:projectId/scene/:sceneId" element={<EditorPage />} />
      <Route path="/play/:projectId" element={<PlayPlaceholderPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
