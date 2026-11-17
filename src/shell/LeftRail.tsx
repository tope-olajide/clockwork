import { useNavigate } from "react-router-dom";
import {
  Boxes,
  Grid2X2,
  Play,
  Rocket,
  Settings,
} from "lucide-react";
import { Tooltip, useToast } from "../components/ui";

const items = [
  { key: "overview", label: "Overview", icon: Grid2X2 },
  { key: "assets", label: "Assets", icon: Boxes },
  { key: "playtest", label: "Playtest", icon: Play },
  { key: "ship", label: "Ship", icon: Rocket },
  { key: "project", label: "Project", icon: Settings },
] as const;

export function LeftRail({
  projectId,
  active = "overview",
}: {
  projectId: string;
  active?: string;
}) {
  const navigate = useNavigate();
  const toast = useToast();

  return (
    <aside className="rail" aria-label="Project navigation">
      <nav className="rail-items">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.key} content={item.label} side="right">
              <button
                className={`rail-item${active === item.key ? " active" : ""}`}
                onClick={() => navigate(item.key === "playtest" ? `/play/${projectId}` : `/project/${projectId}?section=${item.key}`)}
                aria-current={active === item.key ? "page" : undefined}
                aria-label={item.label}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            </Tooltip>
          );
        })}
      </nav>
      <div className="rail-spacer" />
      <div className="rail-bottom">
        <Tooltip content="App settings" side="right">
          <button
            className="avatar-button"
            aria-label="App settings"
            onClick={() => toast.push("Settings", "AI providers and preferences arrive in Slice 6.5.")}
          >
            CW
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
