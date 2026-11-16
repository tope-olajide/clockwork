import { migrateDocument, type ProjectDocument } from "../model/schema";

export const TRANSFER_FORMAT = "clockwork-project";
export const TRANSFER_VERSION = 1;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export interface TransferAsset {
  id: string;
  dataUrl: string;
}

export interface ProjectTransferFile {
  format: typeof TRANSFER_FORMAT;
  version: typeof TRANSFER_VERSION;
  exportedAt: string;
  project: ProjectDocument;
  assets: TransferAsset[];
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export function buildTransferFile(document: ProjectDocument, assets: TransferAsset[] = []): ProjectTransferFile {
  return {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    project: document,
    assets,
  };
}

export function downloadProject(projectDocument: ProjectDocument, assets: TransferAsset[] = []): void {
  const payload = JSON.stringify(buildTransferFile(projectDocument, assets), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(projectDocument.name) || "clockwork-project"}.clockwork.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function parseProjectFile(text: string, bytes?: number): { document: ProjectDocument; assets: TransferAsset[] } {
  if (bytes !== undefined && bytes > MAX_IMPORT_BYTES) {
    throw new ImportError("That file is larger than 20 MB.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError("That file is not valid JSON.");
  }

  const candidate =
    parsed && typeof parsed === "object" && "format" in parsed
      ? (parsed as Partial<ProjectTransferFile>)
      : null;

  if (candidate) {
    if (candidate.format !== TRANSFER_FORMAT) throw new ImportError("This is not a Clockwork project file.");
    if (candidate.version !== TRANSFER_VERSION) {
      throw new ImportError(`This project uses transfer version ${String(candidate.version)}; this build reads version ${TRANSFER_VERSION}.`);
    }
    if (!candidate.project) throw new ImportError("The project file is missing its document.");
    const document = migrateDocument(candidate.project);
    return { document, assets: Array.isArray(candidate.assets) ? candidate.assets : [] };
  }

  return { document: migrateDocument(parsed), assets: [] };
}

export async function readProjectFile(file: File): Promise<{ document: ProjectDocument; assets: TransferAsset[] }> {
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError("That file is larger than 20 MB.");
  const text = await file.text();
  return parseProjectFile(text, file.size);
}
