import { FileUp, Layers, LayoutTemplate, PenLine } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Modal, Select } from "../../components/ui";
import type { TemplateId } from "../../engine/model/templates";

export type CreationMode = "blank" | "template" | "brief" | "import";

export interface CreatedProject {
  mode: CreationMode;
  name: string;
  template: TemplateId;
  brief?: string;
  file?: File;
  settings?: {
    width: number;
    height: number;
    pixelArt: boolean;
    gravity: number;
  };
}

const modes: Array<{
  key: CreationMode;
  label: string;
  description: string;
  icon: typeof Layers;
}> = [
  { key: "blank", label: "Blank", description: "An empty scene, one layer, and a clean start.", icon: Layers },
  { key: "template", label: "Template", description: "Start from a playable genre skeleton.", icon: LayoutTemplate },
  { key: "brief", label: "From brief", description: "Describe the game and let the agent build the first pass.", icon: PenLine },
  { key: "import", label: "Import", description: "Open an existing .clockwork.json project.", icon: FileUp },
];

const templates: Array<{ key: TemplateId; name: string; description: string }> = [
  { key: "platformer", name: "Platformer", description: "Player, jump, platforms, coins, goal." },
  { key: "topdown", name: "Top-down", description: "Eight-way movement and camera follow." },
  { key: "puzzle", name: "Puzzle", description: "Grid, collectibles, and a win rule." },
];

const resolutionOptions = [
  { value: "1280x720", label: "1280 × 720" },
  { value: "1920x1080", label: "1920 × 1080" },
  { value: "custom", label: "Custom…" },
];

const gravityOptions = [
  { value: "standard", label: "Standard" },
  { value: "light", label: "Light" },
  { value: "heavy", label: "Heavy" },
  { value: "none", label: "None" },
];

const gravityValues: Record<string, number> = {
  standard: 980,
  light: 500,
  heavy: 1800,
  none: 0,
};

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (project: CreatedProject) => void;
}) {
  const [mode, setMode] = useState<CreationMode>("template");
  const [name, setName] = useState("Untitled project");
  const [template, setTemplate] = useState<TemplateId>("platformer");
  const [brief, setBrief] = useState("");
  const [resolution, setResolution] = useState("1280x720");
  const [customWidth, setCustomWidth] = useState("1280");
  const [customHeight, setCustomHeight] = useState("720");
  const [pixelArt, setPixelArt] = useState(false);
  const [gravity, setGravity] = useState("standard");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const canCreate = useMemo(() => {
    if (mode === "import") return Boolean(importFile);
    if (mode === "brief") return Boolean(name.trim() && brief.trim());
    if (!name.trim()) return false;
    if (mode === "template" || mode === "blank") {
      const width = resolution === "custom" ? Number(customWidth) : Number(resolution.split("x")[0]);
      const height = resolution === "custom" ? Number(customHeight) : Number(resolution.split("x")[1]);
      return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
    }
    return true;
  }, [brief, customHeight, customWidth, importFile, mode, name, resolution]);

  function reset() {
    setMode("template");
    setName("Untitled project");
    setTemplate("platformer");
    setBrief("");
    setResolution("1280x720");
    setCustomWidth("1280");
    setCustomHeight("720");
    setPixelArt(false);
    setGravity("standard");
    setImportFile(null);
    setImportError(null);
  }

  function submit() {
    if (!canCreate) return;
    const width = resolution === "custom" ? Number(customWidth) : Number(resolution.split("x")[0]);
    const height = resolution === "custom" ? Number(customHeight) : Number(resolution.split("x")[1]);
    onCreate({
      mode,
      name: importFile ? importFile.name.replace(/\.clockwork\.json$/i, "").replace(/\.json$/i, "") : name.trim(),
      template: mode === "blank" ? "blank" : template,
      brief: mode === "brief" ? brief.trim() : undefined,
      file: importFile ?? undefined,
      settings:
        mode === "import"
          ? undefined
          : {
              width: Math.round(width),
              height: Math.round(height),
              pixelArt,
              gravity: gravityValues[gravity] ?? 980,
            },
    });
    onOpenChange(false);
    reset();
  }

  function handleFile(file: File | undefined) {
    setImportFile(file ?? null);
    if (!file) {
      setImportError(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".json")) {
      setImportError("That is not a Clockwork project export. Choose a .clockwork.json file.");
      setImportFile(null);
    } else if (file.size > 20 * 1024 * 1024) {
      setImportError("That file is larger than 20 MB.");
      setImportFile(null);
    } else {
      setImportError(null);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title="New project"
      description="Choose one starting point. You can change the name, resolution, and template later."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!canCreate} data-testid="project-create">
            Create project
          </Button>
        </>
      }
    >
      <div className="mode-grid" role="group" aria-label="Project creation mode">
        {modes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className="mode-card"
              aria-pressed={mode === item.key}
              data-testid={`project-mode-${item.key}`}
              onClick={() => setMode(item.key)}
            >
              <span className="mode-title">
                <Icon size={15} />
                {item.label}
              </span>
              <span className="mode-desc">{item.description}</span>
            </button>
          );
        })}
      </div>

      <div className="form-stack">
        {mode !== "import" && (
          <label className="field">
            <span className="field-label">Project name</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Untitled project" data-testid="project-name" autoFocus />
          </label>
        )}

        {(mode === "template" || mode === "brief") && (
          <div className="field">
            <span className="field-label">{mode === "brief" ? "Style / template (optional base)" : "Template"}</span>
            <div className="template-list" role="group" aria-label="Template">
              {templates.map((item) => (
                <button key={item.key} className="template-option" aria-pressed={template === item.key} data-testid={`project-template-${item.key}`} onClick={() => setTemplate(item.key)}>
                  <span className="template-name">{item.name}</span>
                  <span className="template-desc">{item.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "brief" && (
          <label className="field">
            <span className="field-label">Brief</span>
            <textarea
              className="input"
              rows={5}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Describe the game you want to start with: genre, goal, characters, mechanics, mood…"
            />
            <span className="muted" style={{ fontSize: 12 }}>Clockwork will create the project and ask the agent to build the first playable scene in one undoable turn.</span>
          </label>
        )}

        {mode === "import" && (
          <div className="field">
            <span className="field-label">Project file</span>
            <label className="import-drop">
              <input
                type="file"
                accept=".json,application/json"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <span>{importFile ? importFile.name : "Choose a .clockwork.json export"}</span>
            </label>
            {importError && <span className="field-error">{importError}</span>}
          </div>
        )}

        {mode !== "import" && (
          <details className="more-settings">
            <summary>More settings</summary>
            <div className="more-settings-body">
              <label className="field">
                <span className="field-label">Resolution</span>
                <Select value={resolution} onValueChange={setResolution} options={resolutionOptions} ariaLabel="Design resolution" />
              </label>
              {resolution === "custom" && (
                <div className="custom-res">
                  <label className="field">
                    <span className="field-label">Width</span>
                    <input className="input" inputMode="numeric" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field-label">Height</span>
                    <input className="input" inputMode="numeric" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} />
                  </label>
                </div>
              )}
              <label className="field">
                <span className="field-label">Gravity</span>
                <Select value={gravity} onValueChange={setGravity} options={gravityOptions} ariaLabel="Gravity preset" />
              </label>
              <label className="check-field">
                <input type="checkbox" checked={pixelArt} onChange={(e) => setPixelArt(e.target.checked)} />
                <span>Pixel art mode</span>
              </label>
            </div>
          </details>
        )}
      </div>
    </Modal>
  );
}
