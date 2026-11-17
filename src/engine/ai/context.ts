import type { ContextPacket } from "@shared/protocol";
import type { ProjectDocument, Scene } from "../model/schema";

interface EditorContextInput {
  document: ProjectDocument;
  activeSceneId: string | null;
  activeLayerId: string | null;
  selection: string[];
  tab: string;
  tool: string;
  playtestRunning: boolean;
  history: Array<{ label: string; timestamp: number; prevRevision: number }>;
  camera?: { x: number; y: number; zoom: number };
  viewportSize?: { w: number; h: number };
}

function sceneSummary(scene: Scene) {
  const counts = new Map<string, number>();
  for (const obj of scene.objects) counts.set(obj.layerId, (counts.get(obj.layerId) ?? 0) + 1);
  return {
    id: scene.id,
    name: scene.name,
    size: scene.size,
    layers: scene.layers.map((l) => ({ id: l.id, name: l.name, order: l.order, objectCount: counts.get(l.id) ?? 0 })),
    objects: scene.objects.slice(0, 400).map((o) => ({
      id: o.id,
      name: o.name,
      layerId: o.layerId,
      x: Math.round(o.transform.x),
      y: Math.round(o.transform.y),
      w: o.visual && "width" in o.visual ? Number(o.visual.width) : undefined,
      h: o.visual && "height" in o.visual ? Number(o.visual.height) : undefined,
      behaviors: o.behaviors.map((b) => b.type),
      tags: o.tags ?? [],
      prefabId: o.prefabId,
    })),
    rules: scene.rules.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      summary: `when ${r.when.length} condition(s) → ${r.do.length} action(s)`,
    })),
  };
}

export function buildContextPacket(input: EditorContextInput): ContextPacket {
  const { document, activeSceneId, activeLayerId, selection, tab, tool, playtestRunning, history } = input;
  const scene = document.scenes.find((s) => s.id === activeSceneId) ?? document.scenes.find((s) => s.id === document.startSceneId) ?? null;
  const layerNames = new Map(scene?.layers.map((l) => [l.id, l.name]) ?? []);
  const selectionObjects = scene ? scene.objects.filter((o) => selection.includes(o.id)) : [];
  const settingsAny = document.settings as any;

  return {
    app: { name: "Clockwork", schemaVersion: 1 },
    project: {
      id: document.id,
      name: document.name,
      revision: document.revision,
      width: Number(settingsAny.worldWidth ?? settingsAny.width ?? scene?.size.w ?? 0),
      height: Number(settingsAny.worldHeight ?? settingsAny.height ?? scene?.size.h ?? 0),
      pixelArt: document.settings.pixelArt,
      startSceneId: document.startSceneId,
      sceneCount: document.scenes.length,
      assetCount: document.assets.length,
      prefabCount: document.prefabs.length,
      settings: {
        gravity: document.settings.gravity,
        background: document.settings.background,
        audio: document.settings.audio,
      },
    },
    editor: {
      tab,
      activeSceneId: scene?.id ?? null,
      activeSceneName: scene?.name ?? null,
      activeLayerId,
      selection: selectionObjects.map((o) => ({ id: o.id, name: o.name, type: o.visual?.kind, layerName: layerNames.get(o.layerId) })),
      tool,
      playtest: playtestRunning ? "running" : "off",
      camera: input.camera ?? { x: 0, y: 0, zoom: 1 },
      viewportSize: input.viewportSize ?? { w: 0, h: 0 },
    },
    activeScene: scene ? sceneSummary(scene) : null,
    selectionDetails: selectionObjects.slice(0, 10).map((o) => ({
      id: o.id,
      name: o.name,
      layerId: o.layerId,
      transform: o.transform,
      visual: o.visual,
      body: o.body,
      behaviors: o.behaviors,
      animations: o.animations,
      properties: o.properties,
      tags: o.tags,
      prefabId: o.prefabId,
      prefabOverrides: o.prefabOverrides,
    })),
    assets: document.assets.slice(0, 200).map((a) => ({ id: a.id, name: a.name, kind: a.kind, type: a.kind })),
    prefabs: document.prefabs.map((p) => ({ id: p.id, name: p.name, objectCount: 1 + (p.objects?.length ?? 0) })),
    variables: document.variables.map((v) => ({ name: v.name, type: v.type, initial: v.initial })),
    recentActions: history.slice(-8).map((h) => ({
      label: h.label,
      source: "ui" as const,
      revision: h.prevRevision + 1,
      at: new Date(h.timestamp).toISOString(),
    })),
    availableCommands: [
      "list_scenes (read)",
      "get_scene (read)",
      "search_entities (read)",
      "get_object (read)",
      "get_variables (read)",
      "get_selection (read)",
      "capture_viewport (read)",
    ],
    warnings: [],
  };
}
