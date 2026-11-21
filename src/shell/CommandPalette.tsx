import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Boxes,
  Command,
  Grid2X2,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { Kbd, Modal } from "../components/ui";

export interface PaletteCommand {
  id: string;
  group: string;
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  run: () => void;
  keywords?: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.group} ${command.keywords ?? ""}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter") {
        const selected = filtered[activeIndex];
        if (selected) {
          event.preventDefault();
          onOpenChange(false);
          selected.run();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filtered, onOpenChange, open]);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let lastGroup = "";

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      className="palette"
      footer={
        <div className="palette-footer">
          <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
          <span><Kbd>↵</Kbd> run</span>
          <span><Kbd>esc</Kbd> close</span>
        </div>
      }
    >
      <div className="search-wrap" style={{ marginBottom: 8 }}>
        <Search className="search-icon" size={14} />
        <input
          className="input"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands and projects…"
          aria-label="Search commands and projects"
          style={{ paddingLeft: 28 }}
        />
      </div>
      <div className="palette-list" ref={listRef} role="listbox" aria-label="Commands">
        {filtered.length === 0 && (
          <div className="empty-state" style={{ minHeight: 160, margin: 6 }}>
            <strong>No commands match</strong>
            <p>Try “project”, “panel”, “play”, or “settings”.</p>
          </div>
        )}
        {filtered.map((command, index) => {
          const showGroup = command.group !== lastGroup;
          lastGroup = command.group;
          return (
            <div key={command.id}>
              {showGroup && <div className="palette-group">{command.group}</div>}
              <button
                className={`palette-item${index === activeIndex ? " active" : ""}`}
                data-active={index === activeIndex}
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onOpenChange(false);
                  command.run();
                }}
              >
                {command.icon}
                <span>{command.label}</span>
                {command.shortcut && <Kbd>{command.shortcut}</Kbd>}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function buildStubCommands({
  onCreate,
  onProjects,
  onHierarchy,
  onInspector,
  onPlay,
  onAiPlay,
  onSettings,
  onToast,
}: {
  onCreate: () => void;
  onProjects: () => void;
  onHierarchy: () => void;
  onInspector: () => void;
  onPlay: () => void;
  onAiPlay: () => void;
  onSettings: () => void;
  onToast: (title: string, message?: string) => void;
}): PaletteCommand[] {
  return [
    {
      id: "new-project",
      group: "Create",
      label: "New project",
      shortcut: "N",
      icon: <Plus size={14} />,
      run: onCreate,
    },
    {
      id: "go-projects",
      group: "Navigate",
      label: "Go to Projects",
      icon: <Grid2X2 size={14} />,
      run: onProjects,
    },
    {
      id: "toggle-hierarchy",
      group: "Panels",
      label: "Toggle Hierarchy",
      icon: <PanelLeft size={14} />,
      run: onHierarchy,
    },
    {
      id: "toggle-inspector",
      group: "Panels",
      label: "Toggle Inspector",
      shortcut: "I",
      icon: <PanelRight size={14} />,
      run: onInspector,
    },
    {
      id: "play",
      group: "Run",
      label: "Play current scene",
      shortcut: "⌘↵",
      icon: <Play size={14} />,
      run: onPlay,
    },
    {
      id: "ai-play",
      group: "Run",
      label: "AI Play with Kane",
      shortcut: "⌘⇧↵",
      icon: <Sparkles size={14} />,
      run: onAiPlay,
    },
    {
      id: "assets",
      group: "Navigate",
      label: "Open project assets",
      icon: <Boxes size={14} />,
      run: () => onToast("Assets", "Open a project and use the Assets workspace to browse project assets."),
    },
    {
      id: "settings",
      group: "Preferences",
      label: "Open settings",
      shortcut: "⌘,",
      icon: <Settings size={14} />,
      run: onSettings,
    },
    {
      id: "commands",
      group: "Preferences",
      label: "Keyboard shortcuts",
      icon: <Command size={14} />,
      run: () => onToast("Keyboard shortcuts", "Open the editor to use the current keyboard shortcuts."),
    },
  ];
}
