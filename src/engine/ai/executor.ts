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

function summarizePatchPath(path: (string | number)[]): { entityKind: ChangeSetChange["entityKind"]; entityId: string; fieldPath: string } {
  const [root, id, ...rest] = path;
  if (root === "scenes" && typeof id === "string") return { entityKind: "scene", entityId: id, fieldPath: rest.join(".") || "(scene)" };
  if (root === "assets" && typeof id === "string") return { entityKind: "asset", entityId: id, fieldPath: rest.join(".") || "(asset)" };
  if (root === "prefabs" && typeof id === "string") return { entityKind: "prefab", entityId: id, fieldPath: rest.join(".") || "(prefab)" };
  if (root === "variables" && typeof id === "string") return { entityKind: "variable", entityId: id, fieldPath: rest.join(".") || "(variable)" };
  if (root === "settings") return { entityKind: "project", entityId: "project", fieldPath: ["settings", ...(rest as string[])].join(".") };
  // nested scene entities best-effort
  if (root === "scenes" && typeof path[1] === "number") {
    // rare path form; fallback
  }
  return { entityKind: "project", entityId: String(id ?? "project"), fieldPath: rest.length ? rest.join(".") : String(root ?? "") };
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
    const info = summarizePatchPath(patch.path ?? []);
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
