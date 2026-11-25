import type { ToolResult } from "@shared/protocol";
import type { GameObject, ProjectDocument, Scene, Visual } from "../model/schema";
import { behaviorParamReference, commandReference, signatureFor } from "./command-help";
import { captureViewportImage } from "./viewport-capture";
import { gameTestProfileForDocument, profileScenarios } from "../model/game-test-profile";
import { createDraft, estimateDraftCost } from "../model/game-test-draft";
import type { TestPlanBudget, TestPlanPhase } from "../model/game-test-plan";

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

const round2 = (n: number) => Math.round(n * 100) / 100;
const MAX_INDEXED_OBJECTS = 400;
/** Keep the default scene result small enough to survive the request budget intact. */
const MAX_INDEX_CHARS = 6000;

/**
 * Scene payloads are sent back to the model on every step of a turn, so the
 * default get_scene result keeps everything needed to author patches (ids,
 * hierarchy, transforms, bodies, behavior params, rules) and only summarizes
 * bulky visual data. get_object or detail:"full" still reach the raw values.
 */
function compactTransform(t: GameObject["transform"]) {
  const out: Record<string, number> = { x: round2(t.x), y: round2(t.y) };
  if (t.rotation) out.rotation = round2(t.rotation);
  if (t.scaleX !== 1) out.scaleX = round2(t.scaleX);
  if (t.scaleY !== 1) out.scaleY = round2(t.scaleY);
  if (t.originX !== 0.5) out.originX = round2(t.originX);
  if (t.originY !== 0.5) out.originY = round2(t.originY);
  return out;
}

function compactBody(body: NonNullable<GameObject["body"]>) {
  const out: Record<string, unknown> = { type: body.type, width: round2(body.width), height: round2(body.height) };
  if (body.offsetX) out.offsetX = round2(body.offsetX);
  if (body.offsetY) out.offsetY = round2(body.offsetY);
  if (body.gravityScale !== 1) out.gravityScale = round2(body.gravityScale);
  if (body.collideWorldBounds) out.collideWorldBounds = true;
  if (body.oneWay) out.oneWay = true;
  return out;
}

function compactVisual(visual: Visual) {
  if (visual.kind === "tilemap") {
    return {
      kind: visual.kind,
      tilesetId: visual.tilesetId,
      tileSize: visual.tileSize,
      cols: visual.cols,
      rows: visual.rows,
      nonEmptyTiles: visual.data.filter((tile) => tile > 0).length,
    };
  }
  if (visual.kind === "shape") {
    const shapes = visual.shapes.slice(0, 8).map((shape) => {
      const out: Record<string, unknown> = {
        kind: shape.kind,
        width: round2(shape.width),
        height: round2(shape.height),
        color: shape.color,
      };
      if (shape.x) out.x = round2(shape.x);
      if (shape.y) out.y = round2(shape.y);
      if (shape.rotation) out.rotation = round2(shape.rotation);
      if (shape.stroke) out.stroke = shape.stroke;
      if (shape.strokeWidth) out.strokeWidth = shape.strokeWidth;
      return out;
    });
    return { kind: visual.kind, width: round2(visual.width), height: round2(visual.height), shapeCount: visual.shapes.length, shapes };
  }
  // rect, sprite and text payloads are already small enough to pass through.
  return visual;
}

function compactObject(object: GameObject) {
  const out: Record<string, unknown> = {
    id: object.id,
    name: object.name,
    layerId: object.layerId,
    transform: compactTransform(object.transform),
  };
  if (object.parentId) out.parentId = object.parentId;
  if (object.prefabId) out.prefabId = object.prefabId;
  if (object.prefabInstanceId) out.prefabInstanceId = object.prefabInstanceId;
  if (object.prefabSlot) out.prefabSlot = object.prefabSlot;
  if (object.prefabOverrides) out.prefabOverrides = object.prefabOverrides;
  if (object.visual) out.visual = compactVisual(object.visual);
  if (object.body) out.body = compactBody(object.body);
  if (object.behaviors.length) {
    out.behaviors = object.behaviors.map((behavior) => {
      const entry: Record<string, unknown> = { id: behavior.id, type: behavior.type, params: behavior.params };
      if (!behavior.enabled) entry.enabled = false;
      return entry;
    });
  }
  if (object.animations) out.animations = object.animations;
  if (Object.keys(object.properties).length) out.properties = object.properties;
  if (object.tags.length) out.tags = object.tags;
  return out;
}

function compactScene(scene: Scene) {
  // When the budget cannot cover every object, spend it on the ones that carry
  // logic (behaviors, rule references, prefabs) and list the rest by id+name so
  // nothing becomes invisible; get_object still returns any full definition.
  const referenced = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === "string") referenced.add(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(scene.rules);

  const candidates = scene.objects.slice(0, MAX_INDEXED_OBJECTS).map((object, index) => {
    const rank = (object.behaviors.length ? 3 : 0) + (referenced.has(object.id) ? 2 : 0) + (object.prefabId ? 1 : 0);
    return { index, rank, entry: compactObject(object), size: 0 };
  });
  for (const candidate of candidates) candidate.size = JSON.stringify(candidate.entry).length + 1;
  candidates.sort((a, b) => b.rank - a.rank || a.index - b.index);

  const selected: typeof candidates = [];
  const otherObjects: Array<{ id: string; name: string }> = [];
  let used = 0;
  for (const candidate of candidates) {
    if (used + candidate.size <= MAX_INDEX_CHARS) {
      selected.push(candidate);
      used += candidate.size;
    }
  }
  const selectedIndexes = new Set(selected.map((candidate) => candidate.index));
  for (const candidate of candidates) {
    if (!selectedIndexes.has(candidate.index)) otherObjects.push({ id: String(candidate.entry.id), name: String(candidate.entry.name) });
  }
  selected.sort((a, b) => a.index - b.index);
  otherObjects.sort((a, b) => a.id.localeCompare(b.id));
  const objects = selected.map((candidate) => candidate.entry);
  const out: Record<string, unknown> = {
    id: scene.id,
    name: scene.name,
    kind: scene.kind,
    size: scene.size,
    background: scene.background,
    camera: scene.camera,
    layers: scene.layers,
    objectCount: scene.objects.length,
    objects,
    rules: scene.rules,
  };
  if (scene.audio) out.audio = scene.audio;
  if (objects.length < scene.objects.length) {
    out.otherObjects = otherObjects;
    out.note = `Full detail for ${objects.length} of ${scene.objects.length} objects; the rest are listed in otherObjects. Use get_object for one object's full definition or pass detail:"full" for the raw scene.`;
  }
  return out;
}

export function executeClientTool(input: ToolExecInput): ExecutedTool {
  const { document, activeSceneId, selection, name, args } = input;
  const allowViewportCapture = input.allowViewportCapture !== false;
  const revision = document.revision;
  const ok = (data: unknown, extra?: Partial<ExecutedTool>): ExecutedTool => ({ ok: true, data, revision, name, args, ...extra });
  const fail = (error: string): ExecutedTool => ({ ok: false, error, revision, name, args });

  try {
    if (name === "list_commands") {
      // Full objects ran to 16k chars and the transport keeps only the first
      // 8k, which cut off variable/hud/behavior commands. Signatures are compact.
      const prefixes = Array.isArray((args as any)?.prefixes)
        ? ((args as any).prefixes as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0).map((p) => p.replace(/\.$/, ""))
        : [];
      const types = commandReference()
        .map((help) => help.type)
        .filter((type) => prefixes.length === 0 || prefixes.some((prefix) => type === prefix || type.startsWith(`${prefix}.`)));
      const wantsBehaviors = prefixes.length === 0 || prefixes.some((prefix) => prefix === "behavior" || prefix === "object");
      return ok({
        commands: types.map((type) => signatureFor(type)).filter(Boolean),
        ...(wantsBehaviors ? { behaviors: behaviorParamReference() } : {}),
        note: "name?: means optional. apply_commands takes {type, args} with these args. A behavior is {id, type, enabled, params}; params use the names under `behaviors` (unset params take the default shown).",
      });
    }
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
      return ok(args.detail === "full" ? scene : compactScene(scene));
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
    if (name === "propose_test_plan") {
      const profile = gameTestProfileForDocument(document);
      if (!profile) {
        return fail("No game-test profile is registered for this template, so a plan cannot be validated. Report the mechanics as not testable instead of inventing controls.");
      }
      const result = createDraft(
        {
          userGoal: typeof args.userGoal === "string" ? args.userGoal : "",
          sceneId: typeof args.sceneId === "string" && args.sceneId ? args.sceneId : document.startSceneId,
          seed: Number.isFinite(Number(args.seed)) ? Number(args.seed) : 1234,
          scenarioId: typeof args.scenarioId === "string" ? args.scenarioId : undefined,
          phases: (Array.isArray(args.phases) ? args.phases : []) as TestPlanPhase[],
          budget: args.budget as TestPlanBudget,
        },
        { document, profile },
      );
      if (!result.ok) return ok({ accepted: false, errors: result.errors, profile: document.templateOrigin });
      return ok({
        accepted: true,
        draft: result.draft,
        estimate: estimateDraftCost(result.draft),
        note: "Draft only. Nothing runs until the user approves it.",
      });
    }
    if (name === "get_game_test_profile") {
      const profile = gameTestProfileForDocument(document);
      if (!profile) {
        return ok({
          available: false,
          templateOrigin: document.templateOrigin,
          reason: "No game-test profile is registered for this template; mechanics outside a profile are not testable.",
        });
      }
      return ok({
        available: true,
        templateOrigin: document.templateOrigin,
        profile,
        scenarios: profileScenarios(profile),
      });
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
