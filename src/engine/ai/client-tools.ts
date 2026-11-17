import type { ToolResult } from "@shared/protocol";
import type { ProjectDocument } from "../model/schema";
import { captureViewportImage } from "./viewport-capture";

interface ToolExecInput {
  document: ProjectDocument;
  activeSceneId: string | null;
  selection: string[];
  name: string;
  args: Record<string, unknown>;
  allowViewportCapture?: boolean;
}

export interface ExecutedTool extends ToolResult {
  name: string;
  args: unknown;
  imageDataUrl?: string;
}

export function executeClientTool(input: ToolExecInput): ExecutedTool {
  const { document, activeSceneId, selection, name, args } = input;
  const allowViewportCapture = input.allowViewportCapture !== false;
  const revision = document.revision;
  const ok = (data: unknown, extra?: Partial<ExecutedTool>): ExecutedTool => ({ ok: true, data, revision, name, args, ...extra });
  const fail = (error: string): ExecutedTool => ({ ok: false, error, revision, name, args });

  try {
    if (name === "query_project") return executeClientTool({ ...input, name: "search_entities" });
    if (name === "inspect_entity") return executeClientTool({ ...input, name: "get_object" });
    if (name === "get_project_summary") {
      const scene = document.scenes.find((candidate) => candidate.id === activeSceneId) ?? null;
      return ok({
        id: document.id,
        name: document.name,
        revision: document.revision,
        sceneCount: document.scenes.length,
        startSceneId: document.startSceneId,
        activeSceneId: scene?.id ?? null,
        selection,
      });
    }
    if (name === "list_scenes") {
      return ok(document.scenes.map((s) => ({ id: s.id, name: s.name, objectCount: s.objects.length, layerCount: s.layers.length, isStart: s.id === document.startSceneId })));
    }
    if (name === "get_scene") {
      const sceneId = String(args.sceneId ?? activeSceneId ?? "");
      const scene = document.scenes.find((s) => s.id === sceneId);
      if (!scene) return fail(`Scene not found: ${sceneId}`);
      return ok(scene);
    }
    if (name === "search_entities") {
      const text = String(args.text ?? "").toLowerCase();
      const kind = typeof args.kind === "string" ? args.kind.toLowerCase() : "";
      const sceneId = typeof args.sceneId === "string" ? args.sceneId : "";
      const limit = Math.max(1, Math.min(200, Number(args.limit) || 50));
      const results: Array<Record<string, unknown>> = [];
      const push = (item: Record<string, unknown>) => { if (results.length < limit) results.push(item); };
      const match = (value: string) => !text || value.toLowerCase().includes(text);

      if (!kind || kind === "scene") {
        for (const s of document.scenes) if (match(`${s.name} ${s.id}`)) push({ kind: "scene", id: s.id, name: s.name, objectCount: s.objects.length });
      }
      if (!kind || kind === "object") {
        for (const s of document.scenes) {
          if (sceneId && s.id !== sceneId) continue;
          for (const o of s.objects) if (match(`${o.name} ${o.id} ${((o as any).tags ?? []).join(" ")}`)) push({ kind: "object", id: o.id, name: o.name, sceneId: s.id, sceneName: s.name, layerId: o.layerId, tags: (o as any).tags });
        }
      }
      if (!kind || kind === "prefab") {
        for (const p of document.prefabs) if (match(`${p.name} ${p.id}`)) push({ kind: "prefab", id: p.id, name: p.name });
      }
      if (!kind || kind === "asset") {
        for (const a of document.assets) if (match(`${a.name} ${a.id} ${((a as any).tags ?? []).join(" ")}`)) push({ kind: "asset", id: a.id, name: a.name, assetKind: (a as any).kind });
      }
      if (!kind || kind === "variable") {
        for (const v of document.variables) if (match(`${v.name} ${v.id}`)) push({ kind: "variable", id: v.id, name: v.name, type: v.type, initial: v.initial });
      }
      if (!kind || kind === "rule") {
        for (const s of document.scenes) {
          if (sceneId && s.id !== sceneId) continue;
          for (const r of s.rules) if (match(`${r.name} ${r.id}`)) push({ kind: "rule", id: r.id, name: r.name, sceneId: s.id, enabled: r.enabled });
        }
      }
      return ok({ results, count: results.length, truncated: results.length >= limit });
    }
    if (name === "get_object") {
      const objectId = String(args.objectId ?? "");
      for (const scene of document.scenes) {
        const obj = scene.objects.find((o) => o.id === objectId);
        if (obj) return ok({ ...obj, sceneId: scene.id, sceneName: scene.name });
      }
      return fail(`Object not found: ${objectId}`);
    }
    if (name === "get_variables") {
      return ok(document.variables);
    }
    if (name === "get_selection") {
      const scene = document.scenes.find((s) => s.id === activeSceneId) ?? null;
      const objects = scene ? scene.objects.filter((o) => selection.includes(o.id)) : [];
      return ok({ sceneId: scene?.id ?? null, selection, objects });
    }
    if (name === "capture_viewport") {
      if (!allowViewportCapture) return fail("Viewport capture is not available for the selected model (vision not supported).");
      const dataUrl = captureViewportImage();
      if (!dataUrl) return fail("Viewport capture is not available.");
      return ok({ captured: true, format: "image/png", bytesApprox: Math.round((dataUrl.length * 3) / 4) }, { imageDataUrl: dataUrl });
    }
    return fail(`Unknown or unsupported tool: ${name}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Tool execution failed");
  }
}
