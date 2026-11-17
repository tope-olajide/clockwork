import type { ProjectRecord, TemplateOrigin } from "../../engine/model/schema";

export type ProjectSummary = {
  id: string;
  name: string;
  template: TemplateOrigin;
  sceneCount: number;
  editedLabel: string;
  archived: boolean;
  cover: "dusk" | "puzzle" | "blank";
  coverDataUrl?: string;
  updatedAt: string;
};

export const TEMPLATE_LABELS: Record<TemplateOrigin, string> = {
  platformer: "Platformer",
  topdown: "Top-down",
  puzzle: "Puzzle",
  blank: "Blank",
  brief: "From brief",
  import: "Imported",
};

export function formatEdited(value: string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Edited recently";
  const elapsed = Date.now() - time;
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "Edited just now";
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Edited yesterday";
  if (days < 30) return `Edited ${days}d ago`;
  return `Edited ${new Date(value).toLocaleDateString()}`;
}

export function coverFor(template: TemplateOrigin): ProjectSummary["cover"] {
  if (template === "puzzle") return "puzzle";
  if (template === "topdown" || template === "blank" || template === "brief" || template === "import") return "blank";
  return "dusk";
}

export function toProjectSummary(record: ProjectRecord): ProjectSummary {
  return {
    id: record.id,
    name: record.name,
    template: record.template,
    sceneCount: record.sceneCount,
    editedLabel: formatEdited(record.updatedAt),
    archived: Boolean(record.archivedAt),
    cover: coverFor(record.template),
    coverDataUrl: record.coverDataUrl,
    updatedAt: record.updatedAt,
  };
}
