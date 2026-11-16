import { FileUp, Layers, LayoutTemplate, PenLine, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Modal, Select } from "../../components/ui";
import type { TemplateId } from "../../engine/model/templates";

export type CreationMode = "blank" | "template" | "brief" | "import";

export interface CreatedProject {
  mode: CreationMode;
  name: string;
  template: TemplateId;
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
  disabled?: boolean;
  reason?: string;
}> = [
  { key: "blank", label: "Blank", description: "An empty scene, one layer, and a clean start.", icon: Layers },
  { key: "template", label: "Template", description: "Start from a playable genre skeleton.", icon: LayoutTemplate },
  {
    key: "brief",
    label: "From brief",
    description: "Describe the game and let the agent build the first pass.",
    icon: PenLine,
    disabled: true,
    reason: "Available in Slice 7, when the agent can write to the project.",
  },
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

  const briefReason = modes.find((item) => item.key === "brief")?.reason;

  const canCreate = useMemo(() => {
    if (mode === "import") return Boolean(importFile);
    if (mode === "brief") return false;
    if (!name.trim()) return false;
    if (mode === "template" || mode === "blank") {
      const width = resolution === "custom" ? Number(customWidth) : Number(resolution.split("x")[0]);
      const height = resolution === "custom" ? Number(customHeight) : Number(resolution.split("x")[1]);
      return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
    }
    return true;
  }, [customHeight, customWidth, importFile, mode, name, resolution]);

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
          <Button variant="primary" onClick={submit} disabled={!canCreate}>
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
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (!item.disabled) setMode(item.key);
              }}
            >
              <span className="mode-title">
                <Icon size={15} />
                {item.label}
              </span>
              <span className="mode-desc">{item.description}</span>
              {item.disabled && <span className="mode-reason">{item.reason}</span>}
            </button>
          );
        })}
      </div>

      <div className="form-stack">
        {mode !== "import" && (
          <label className="field">
            <span className="field-label">Project name</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Untitled project"
              autoFocus
            />
          </label>
        )}

        {mode === "template" && (
          <div className="field">
            <span className="field-label">Template</span>
            <div className="template-list" role="group" aria-label="Template">
              {templates.map((item) => (
                <button
                  key={item.key}
                  className="template-option"
                  aria-pressed={template === item.key}
                  onClick={() => setTemplate(item.key)}
                >
                  <span className="template-diagram" aria-hidden="true" />
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "brief" && (
          <>
            <label className="field">
              <span className="field-label">Brief</span>
              <textarea
                className="brief-textarea"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="A dusk platformer with a double jump, drifting drones, and three coins…"
              />
            </label>
            <div className="archived-banner" aria-live="polite">
              <Sparkles size={14} />
              {briefReason}
            </div>
          </>
        )}

        {mode === "import" && (
          <div className="field">
            <span className="field-label">Project file</span>
            <label className="import-drop">
              <FileUp size={21} />
              <strong>{importFile ? importFile.name : "Drop a .clockwork.json file"}</strong>
              <span className="field-hint">or click to browse · max 20 MB</span>
              <input
                type="file"
                accept=".json,.clockwork.json"
                hidden
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </label>
            {importError && (
              <span className="field-hint" style={{ color: "var(--red)" }} role="alert">
                {importError}
              </span>
            )}
          </div>
        )}

        {(mode === "blank" || mode === "template") && (
          <details className="disclosure">
            <summary>More settings</summary>
            <div className="disclosure-body">
              <label className="field">
                <span className="field-label">Design resolution</span>
                <Select
                  value={resolution}
                  onValueChange={setResolution}
                  options={resolutionOptions}
                  ariaLabel="Design resolution"
                />
              </label>
              {resolution === "custom" && (
                <div className="field-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label className="field-row">
                    <span>Width</span>
                    <input className="input input-mono" type="number" min={64} value={customWidth} onChange={(event) => setCustomWidth(event.target.value)} aria-label="Custom width" />
                  </label>
                  <label className="field-row">
                    <span>Height</span>
                    <input className="input input-mono" type="number" min={64} value={customHeight} onChange={(event) => setCustomHeight(event.target.value)} aria-label="Custom height" />
                  </label>
                </div>
              )}
              <label className="field">
                <span className="field-label">Gravity</span>
                <Select
                  value={gravity}
                  onValueChange={setGravity}
                  options={gravityOptions}
                  ariaLabel="Gravity preset"
                />
              </label>
              <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <input
                  type="checkbox"
                  checked={pixelArt}
                  onChange={(event) => setPixelArt(event.target.checked)}
                />
                <span className="field-label">Pixel art rendering</span>
              </label>
            </div>
          </details>
        )}
      </div>
    </Modal>
  );
}
