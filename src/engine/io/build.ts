import { strToU8, zipSync } from "fflate";
import type { SnapshotAsset } from "@shared/snapshot";
import type { ProjectDocument } from "../model/schema";
import { collectProjectAssets, SnapshotError, sizeLabel } from "./snapshot";

export const EXPORT_FORMAT = "clockwork-static";
export const EXPORT_VERSION = 1;

export interface StaticExportInput {
  document: ProjectDocument;
  assets: SnapshotAsset[];
  playerScript: string;
}

export interface StaticExportFiles {
  files: Record<string, Uint8Array>;
  bytes: number;
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "clockwork-game";
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return new Uint8Array();
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (!meta.includes(";base64")) return new TextEncoder().encode(decodeURIComponent(payload));
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function extensionFor(asset: SnapshotAsset): string {
  if (asset.mime?.includes("png")) return "png";
  if (asset.mime?.includes("jpeg")) return "jpg";
  if (asset.mime?.includes("svg")) return "svg";
  if (asset.mime?.includes("webp")) return "webp";
  if (asset.mime?.includes("wav")) return "wav";
  if (asset.mime?.includes("mpeg") || asset.mime?.includes("mp3")) return "mp3";
  if (asset.mime?.includes("ogg")) return "ogg";
  return "bin";
}

export function buildStaticExport(input: StaticExportInput): StaticExportFiles {
  const projectPayload = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    project: input.document,
    assets: input.assets,
  };
  const title = input.document.name.replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[char] ?? char);
  const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b0c0f; overflow: hidden; }
    body { font-family: Inter, system-ui, sans-serif; }
    #game { width: 100vw; height: 100vh; display: block; }
    .badge { position: fixed; top: 12px; left: 12px; z-index: 2; color: #d9d5ff; background: rgba(12, 14, 20, .72);
      border: 1px solid rgba(143, 107, 255, .45); border-radius: 999px; padding: 5px 9px; font-size: 11px; letter-spacing: .04em; }
    .fallback { color: #e8ecf4; padding: 24px; }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <div class="badge">Made with Clockwork</div>
  <div id="fallback" class="fallback" hidden></div>
  <script src="./clockwork.js"></script>
</body>
</html>
`;
  const readme = `Clockwork static export
========================

Project: ${input.document.name}
Exported: ${new Date().toISOString()}
Scenes: ${input.document.scenes.length}
Assets: ${input.assets.length}

Serve this folder over HTTP (not file://):
  python -m http.server 8080
Then open http://localhost:8080

Controls come from the project input map. R restarts the start scene.
This build contains its own runtime and does not need the Clockwork editor.
`;
  const files: Record<string, Uint8Array> = {
    "index.html": strToU8(indexHtml),
    "clockwork.js": strToU8(input.playerScript),
    "project.json": strToU8(JSON.stringify(projectPayload)),
    "README.txt": strToU8(readme),
  };
  for (const asset of input.assets) {
    files[`assets/${asset.id}.${extensionFor(asset)}`] = dataUrlToBytes(asset.dataUrl);
  }
  const zipped = zipSync(files, { level: 6 });
  return { files, bytes: zipped.length };
}

async function readPlayerScript(): Promise<string> {
  const response = await fetch("/api/build/player.js");
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new SnapshotError(result?.error || "The player bundle could not be built.");
  }
  return response.text();
}

export async function exportStaticGame(document: ProjectDocument): Promise<{ filename: string; bytes: number }> {
  const assets = await collectProjectAssets(document);
  const playerScript = await readPlayerScript();
  const built = buildStaticExport({ document, assets, playerScript });
  const blob = new Blob([zipSync(built.files, { level: 6 })], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(document.name)}-clockwork.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename: anchor.download, bytes: built.bytes };
}

export function estimateProjectBytes(assets: SnapshotAsset[]): number {
  return assets.reduce((sum, asset) => sum + Math.floor((asset.dataUrl.length * 3) / 4), 0);
}

export { sizeLabel };
