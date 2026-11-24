import { commandDefinitions, runCommand } from "../commands/registry";
import { CommandError } from "../commands/validation";
import { expectedArgsHint } from "./command-help";
import type { ProjectDocument } from "../model/schema";

export interface AgentCommand {
  type: string;
  args: unknown;
}

export interface ApplyCommandsArgs {
  summary: string;
  expectedRevision: number;
  commands: AgentCommand[];
}

export interface ChangeSetChange {
  entityId: string;
  entityKind: "project" | "scene" | "object" | "layer" | "prefab" | "asset" | "rule" | "variable";
  entityName: string;
  fields: Array<{ path: string; before: unknown; after: unknown }>;
  op: "create" | "update" | "delete";
}

export interface ChangeSetSummary {
  transactionId: string;
  label: string;
  revision: number;
  changes: ChangeSetChange[];
  undoable: boolean;
}

export interface ApplyCommandsResult {
  ok: boolean;
  code?: string;
  message?: string;
  revision?: number;
  changedIds?: string[];
  changeSet?: ChangeSetSummary;
  document?: ProjectDocument;
}

export interface PreviewCommandsResult {
  ok: boolean;
  code?: string;
  message?: string;
  revision?: number;
  changedIds?: string[];
  changeSet?: ChangeSetSummary;
  document?: ProjectDocument;
  patches?: unknown[];
}

const MAX_COMMANDS = 50;

function summarizePatchPath(
  path: (string | number)[],
  after: ProjectDocument,
  before: ProjectDocument,
): { entityKind: ChangeSetChange["entityKind"]; entityId: string; fieldPath: string } {
  const [root, second, collection, index, ...rest] = path;
  if (root === "scenes") {
    // Immer writes nested entities by array index: ["scenes", 0, "objects", 5, "transform", "x"].
    // Resolving that index to an id is what makes ghosts and presence work.
    if (typeof second === "string" && path.length === 2) {
      return { entityKind: "scene", entityId: second, fieldPath: "(scene)" };
    }
    const sceneIndex = typeof second === "number" ? second : Number(second);
    const scene = after.scenes[sceneIndex] ?? before.scenes[sceneIndex];
    if (scene && (collection === "objects" || collection === "layers" || collection === "rules")) {
      const list = collection === "objects" ? scene.objects : collection === "layers" ? scene.layers : scene.rules;
      const itemIndex = typeof index === "number" ? index : Number(index);
      const item = list[itemIndex];
      const entityKind = collection === "objects" ? "object" : collection === "layers" ? "layer" : "rule";
      const fieldPath = rest.join(".") || `(${entityKind})`;
      if (item) return { entityKind, entityId: item.id, fieldPath };
      return { entityKind, entityId: `${collection}[${itemIndex}]`, fieldPath };
    }
    if (scene) return { entityKind: "scene", entityId: scene.id, fieldPath: path.slice(2).join(".") || "(scene)" };
  }
  if (root === "assets" || root === "prefabs" || root === "variables") {
    const itemIndex = typeof second === "number" ? second : Number(second);
    const list = root === "assets" ? after.assets : root === "prefabs" ? after.prefabs : after.variables;
    const item = list[itemIndex] ?? (root === "assets" ? before.assets : root === "prefabs" ? before.prefabs : before.variables)[itemIndex];
    const entityKind = root === "assets" ? "asset" : root === "prefabs" ? "prefab" : "variable";
    if (item) return { entityKind, entityId: item.id, fieldPath: path.slice(2).join(".") || `(${entityKind})` };
  }
  if (root === "settings") return { entityKind: "project", entityId: "project", fieldPath: ["settings", ...(path.slice(1) as string[])].join(".") };
  return { entityKind: "project", entityId: "project", fieldPath: path.join(".") || "project" };
}

function nameFor(document: ProjectDocument, kind: ChangeSetChange["entityKind"], id: string): string {
  if (kind === "project") return document.name;
  if (kind === "scene") return document.scenes.find((s) => s.id === id)?.name ?? id;
  if (kind === "asset") return document.assets.find((a) => a.id === id)?.name ?? id;
  if (kind === "prefab") return document.prefabs.find((p) => p.id === id)?.name ?? id;
  if (kind === "variable") return document.variables.find((v) => v.id === id)?.name ?? id;
  for (const scene of document.scenes) {
    if (kind === "layer") { const l = scene.layers.find((x) => x.id === id); if (l) return l.name; }
    if (kind === "object") { const o = scene.objects.find((x) => x.id === id); if (o) return o.name; }
    if (kind === "rule") { const r = scene.rules.find((x) => x.id === id); if (r) return r.name; }
  }
  return id;
}

function buildChangeSet(before: ProjectDocument, after: ProjectDocument, patches: any[], _inversePatches: any[], transactionId: string, label: string): ChangeSetSummary {
  const byKey = new Map<string, ChangeSetChange>();
  for (const patch of patches as Array<{ op: string; path: (string|number)[]; value?: unknown }>) {
    const info = summarizePatchPath(patch.path ?? [], after, before);
    const key = `${info.entityKind}:${info.entityId}`;
    if (!byKey.has(key)) {
      byKey.set(key, { entityId: info.entityId, entityKind: info.entityKind, entityName: nameFor(after, info.entityKind, info.entityId), fields: [], op: patch.op === "add" ? "create" : patch.op === "remove" ? "delete" : "update" });
    }
    const entry = byKey.get(key)!;
    if (entry.fields.length < 12) entry.fields.push({ path: info.fieldPath, before: undefined, after: patch.value });
    if (patch.op === "remove") entry.op = "delete";
    if (patch.op === "add" && entry.op !== "delete") entry.op = "create";
  }
  // fill names for deleted entities from before
  for (const change of byKey.values()) {
    if (change.op === "delete") change.entityName = nameFor(before, change.entityKind, change.entityId);
  }
  return { transactionId, label, revision: after.revision, changes: [...byKey.values()].slice(0, 50), undoable: true };
}

function isDestructiveCommand(cmd: AgentCommand): boolean {
  return /(\.delete$|asset\.delete|prefab\.delete|scene\.delete|object\.delete|project\.delete)/.test(cmd.type);
}

export function batchHasDestructive(commands: AgentCommand[]): boolean {
  return commands.some(isDestructiveCommand);
}

export function previewCommands(document: ProjectDocument, input: ApplyCommandsArgs): PreviewCommandsResult {
  try {
    if (!Array.isArray(input.commands) || input.commands.length === 0) return { ok: false, code: "SCHEMA", message: "No commands provided." };
    if (input.commands.length > MAX_COMMANDS) return { ok: false, code: "SCHEMA", message: `Too many commands (max ${MAX_COMMANDS}).` };
    if (input.expectedRevision !== document.revision) {
      return { ok: false, code: "revision", message: `Project changed (revision ${document.revision}).`, revision: document.revision };
    }
    let current = document;
    const allPatches: any[] = [];
    const allInverse: any[] = [];
    for (const cmd of input.commands) {
      try {
        const res = runCommand(current, cmd, { expectedRevision: current.revision });
        current = res.document;
        allPatches.push(...res.patches);
        allInverse.push(...res.inversePatches);
      } catch (error) {
        // Quote the real signature so the model's next attempt can be correct.
        const message = error instanceof Error ? error.message : "Command failed.";
        const code = error instanceof CommandError ? error.code : "SCHEMA";
        throw new CommandError(code, `${message} ${expectedArgsHint(cmd?.type ?? "")}`);
      }
    }
    const changeSet = buildChangeSet(document, current, allPatches, allInverse, "preview", input.summary || "Preview changes");
    const changedIds = changeSet.changes
      .filter((change) => change.entityKind === "object" || change.entityKind === "scene" || change.entityKind === "prefab" || change.entityKind === "asset")
      .map((change) => change.entityId);
    return { ok: true, revision: current.revision, changedIds, changeSet, document: current, patches: allPatches.slice(0, 200) };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof CommandError ? (error.code === "REVISION" ? "revision" : error.code) : "ERROR",
      message: error instanceof Error ? error.message : "Preview failed.",
      revision: document.revision,
    };
  }
}

export function applyCommandsInStore(
  dispatch: (type: string, args: unknown, options?: { expectedRevision?: number; transactionId?: string }) => { ok: boolean; revision?: number; error?: string; code?: string },
  getDocument: () => ProjectDocument | null,
  input: ApplyCommandsArgs,
  transactionId: string,
): ApplyCommandsResult {
  const doc = getDocument();
  if (!doc) return { ok: false, code: "NO_PROJECT", message: "No project open." };
  if (!Array.isArray(input.commands) || input.commands.length === 0) return { ok: false, code: "SCHEMA", message: "No commands provided." };
  if (input.commands.length > MAX_COMMANDS) return { ok: false, code: "SCHEMA", message: `Too many commands (max ${MAX_COMMANDS}).` };
  if (input.expectedRevision !== doc.revision) {
    return { ok: false, code: "revision", message: `Project changed (revision ${doc.revision}).`, revision: doc.revision };
  }

  // dry-run first for atomicity (no partial commit)
  const preview = previewCommands(doc, input);
  if (!preview.ok) return { ok: false, code: preview.code, message: preview.message, revision: preview.revision ?? doc.revision };

  let expected = doc.revision;
  const changedIds: string[] = [...(preview.changedIds ?? [])];
  for (let i = 0; i < input.commands.length; i++) {
    const cmd = input.commands[i]!;
    const result = dispatch(cmd.type, cmd.args, { expectedRevision: expected, transactionId });
    if (!result.ok) {
      return { ok: false, code: result.code, message: `Command ${i + 1}/${input.commands.length} failed: ${result.error} ${expectedArgsHint(cmd.type)}`, revision: getDocument()?.revision ?? expected };
    }
    expected = result.revision!;
  }
  const finalDoc = getDocument();
  const changeSet = preview.changeSet ? { ...preview.changeSet, transactionId, label: input.summary || preview.changeSet.label, revision: expected } : undefined;
  return { ok: true, revision: expected, changedIds, changeSet, document: finalDoc ?? undefined };
}

export function knownCommandTypes(): string[] {
  return commandDefinitions().map((c) => c.type);
}
