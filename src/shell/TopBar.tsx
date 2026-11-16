import { Link } from "react-router-dom";
import {
  CircleHelp,
  Command,
  MessageSquare,
  PanelRight,
  Search,
} from "lucide-react";
import { Kbd, Menu, MenuItem, MenuLabel, MenuSeparator, useToast } from "../components/ui";

export interface Crumb {
  label: string;
  to?: string;
}

export function TopBar({
  crumbs,
  revision,
  projectChip,
  onSearch,
  onOpenHierarchy,
  onOpenInspector,
}: {
  crumbs: Crumb[];
  revision?: string;
  projectChip?: boolean;
  onSearch: () => void;
  onOpenHierarchy?: () => void;
  onOpenInspector?: () => void;
}) {
  const toast = useToast();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to="/" className="brand" aria-label="Clockwork projects">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-name">Clockwork</span>
        </Link>
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} style={{ display: "contents" }}>
              {index > 0 && <span className="crumb-sep">/</span>}
              {crumb.to ? (
                <Link to={crumb.to}>{crumb.label}</Link>
              ) : (
                <span className="breadcrumb-current">{crumb.label}</span>
              )}
            </span>
          ))}
          {projectChip && <span className="chip">Project</span>}
          {revision && <span className="chip mono">{revision}</span>}
        </nav>
      </div>

      <div className="topbar-right">
        <button className="search-trigger" onClick={onSearch} aria-label="Search and commands">
          <Search size={14} />
          <span>Search projects, commands</span>
          <Kbd>⌘K</Kbd>
        </button>
        <Menu
          align="end"
          trigger={
            <button className="icon-button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
              <CircleHelp size={16} />
            </button>
          }
        >
          <MenuLabel>Keyboard</MenuLabel>
          <MenuItem shortcut="⌘K">Command palette</MenuItem>
          <MenuItem shortcut="⌘F">Focus hierarchy search</MenuItem>
          <MenuItem shortcut="1–4">Switch workspace</MenuItem>
          <MenuItem shortcut="⌘S">Save project</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => toast.push("Help is offline", "The full shortcut sheet arrives in Slice 1.")}>
            Open shortcut sheet
          </MenuItem>
        </Menu>
        <button
          className="icon-button feedback-button"
          aria-label="Send feedback"
          title="Send feedback"
          onClick={() => toast.push("Feedback", "Feedback capture is a Slice 10 feature.")}
        >
          <MessageSquare size={15} />
        </button>
        <Menu
          align="end"
          trigger={
            <button className="icon-button" aria-label="Layout panels" title="Layout panels" aria-haspopup="menu">
              <PanelRight size={16} />
            </button>
          }
        >
          <MenuLabel>Panels</MenuLabel>
          <MenuItem onSelect={onOpenHierarchy} disabled={!onOpenHierarchy} shortcut="⌘F">
            Hierarchy
          </MenuItem>
          <MenuItem onSelect={onOpenInspector} disabled={!onOpenInspector}>
            Inspector
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={onSearch} shortcut="⌘K">
            <Command size={13} />
            Command palette
          </MenuItem>
        </Menu>
      </div>
    </header>
  );
}
