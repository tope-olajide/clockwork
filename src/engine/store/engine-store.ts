import { applyPatches, produce, type Patch } from "immer";
import { create } from "zustand";
import { runCommand } from "../commands/registry";
import { CommandError, validateDocument } from "../commands/validation";
import { duplicateProjectDocument } from "../model/clone";
import { createProjectFromTemplate } from "../model/templates";
import type { ProjectDocument, ProjectRecord, TemplateOrigin } from "../model/schema";
import {
  deleteProjectRecord,
  listProjectRecords,
  readProjectDocument,
  saveProjectDocument,
  StorageError,
} from "../persistence/indexeddb";
import { readProjectFile } from "../persistence/transfer";

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  timestamp: number;
  transactionId?: string;
}

export interface DispatchOptions {
  expectedRevision?: number;
  transactionId?: string;
}

export type DispatchOutcome =
  | { ok: true; revision: number }
  | { ok: false; error: string; code?: string };

interface EngineStore {
  document: ProjectDocument | null;
  activeProjectId: string | null;
  activeSceneId: string | null;
  activeLayerId: string | null;
  selection: string[];
  isLoading: boolean;
  storageError: string | null;
  saveState: "saved" | "dirty" | "saving" | "error";
  lastSavedAt: string | null;
  history: HistoryEntry[];
  future: HistoryEntry[];

  loadProject: (projectId: string) => Promise<boolean>;
  createFromTemplate: (template: Exclude<TemplateOrigin, "brief" | "import">, name: string) => Promise<ProjectDocument>;
  importProject: (document: ProjectDocument) => Promise<ProjectDocument>;
  importProjectFromFile: (file: File) => Promise<ProjectDocument>;
  duplicateActiveProject: (name?: string) => Promise<ProjectRecord | null>;
  deleteActiveProject: () => Promise<void>;
  saveNow: () => Promise<void>;
  dispatch: (type: string, args: unknown, options?: DispatchOptions) => DispatchOutcome;
  undo: () => boolean;
  redo: () => boolean;
  setActiveScene: (sceneId: string) => void;
  setActiveLayer: (layerId: string | null) => void;
  setSelection: (ids: string[]) => void;
  clearStorageError: () => void;
  reset: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let savePromise: Promise<void> | null = null;

function scheduleAutosave(): void {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void useEngineStore.getState().saveNow();
  }, 500);
}

function editorAfterDocument(
  document: ProjectDocument,
  sceneId: string | null,
  layerId: string | null,
  selection: string[],
) {
  const scene = document.scenes.find((candidate) => candidate.id === sceneId) ?? document.scenes[0];
  if (!scene) return { activeSceneId: null, activeLayerId: null, selection: [] };
  const ids = new Set(scene.objects.map((object) => object.id));
  return {
    activeSceneId: scene.id,
    activeLayerId: scene.layers.some((layer) => layer.id === layerId) ? layerId : scene.layers[0]?.id ?? null,
    selection: selection.filter((id) => ids.has(id)),
  };
}

function nextEditorState(document: ProjectDocument, previousSceneId: string | null) {
  const sceneId =
    document.scenes.find((scene) => scene.id === previousSceneId)?.id ?? document.startSceneId ?? document.scenes[0]?.id ?? null;
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  return {
    activeSceneId: sceneId,
    activeLayerId: scene?.layers[0]?.id ?? null,
    selection: [],
  };
}

export const useEngineStore = create<EngineStore>((set, get) => ({
  document: null,
  activeProjectId: null,
  activeSceneId: null,
  activeLayerId: null,
  selection: [],
  isLoading: false,
  storageError: null,
  saveState: "saved",
  lastSavedAt: null,
  history: [],
  future: [],

  loadProject: async (projectId) => {
    set({ isLoading: true, storageError: null, activeProjectId: projectId });
    try {
      const document = await readProjectDocument(projectId);
      if (!document) {
        set({ isLoading: false, document: null, storageError: "That project is no longer in local storage." });
        return false;
      }
      validateDocument(document);
      set({
        document,
        activeProjectId: projectId,
        ...nextEditorState(document, null),
        isLoading: false,
        saveState: "saved",
        lastSavedAt: new Date().toISOString(),
        history: [],
        future: [],
      });
      return true;
    } catch (error) {
      set({
        isLoading: false,
        document: null,
        storageError: error instanceof Error ? error.message : "The project could not be opened.",
      });
      return false;
    }
  },

  createFromTemplate: async (template, name) => {
    const document = createProjectFromTemplate(template, name);
    await saveProjectDocument(document);
    set({
      document,
      activeProjectId: document.id,
      ...nextEditorState(document, null),
      isLoading: false,
      storageError: null,
      saveState: "saved",
      lastSavedAt: new Date().toISOString(),
      history: [],
      future: [],
    });
    return document;
  },

  importProject: async (projectDocument) => {
    validateDocument(projectDocument);
    const document: ProjectDocument = {
      ...projectDocument,
      updatedAt: new Date().toISOString(),
    };
    await saveProjectDocument(document);
    set({
      document,
      activeProjectId: document.id,
      ...nextEditorState(document, null),
      isLoading: false,
      storageError: null,
      saveState: "saved",
      lastSavedAt: new Date().toISOString(),
      history: [],
      future: [],
    });
    return document;
  },

  importProjectFromFile: async (file) => {
    const { document } = await readProjectFile(file);
    return get().importProject(document);
  },

  duplicateActiveProject: async (name) => {
    const current = get().document;
    if (!current) return null;
    const copy = duplicateProjectDocument(current, name ?? `${current.name} copy`);
    return saveProjectDocument(copy);
  },

  deleteActiveProject: async () => {
    const projectId = get().activeProjectId ?? get().document?.id;
    if (projectId) await deleteProjectRecord(projectId);
    get().reset();
  },

  saveNow: async () => {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    const current = get().document;
    if (!current) return;
    if (savePromise) {
      await savePromise;
      if (get().saveState === "dirty") await get().saveNow();
      return;
    }
    const revision = current.revision;
    set({ saveState: "saving" });
    savePromise = (async () => {
      try {
        await saveProjectDocument(current);
        if (get().document?.id === current.id && get().document?.revision === revision) {
          set({ saveState: "saved", lastSavedAt: new Date().toISOString(), storageError: null });
        } else {
          set({ saveState: "dirty" });
          scheduleAutosave();
        }
      } catch (error) {
        set({
          saveState: "error",
          storageError: error instanceof Error ? error.message : "Autosave failed.",
        });
      } finally {
        savePromise = null;
      }
    })();
    await savePromise;
  },

  dispatch: (type, args, options = {}) => {
    const current = get().document;
    if (!current) return { ok: false, error: "No project is open." };
    try {
      const result = runCommand(current, { type, args }, { expectedRevision: options.expectedRevision });
      const editor = editorAfterDocument(result.document, get().activeSceneId, get().activeLayerId, get().selection);
      const entry: HistoryEntry = {
        label: result.label,
        patches: result.patches,
        inversePatches: result.inversePatches,
        timestamp: Date.now(),
        transactionId: options.transactionId,
      };
      let history = get().history;
      const last = history[history.length - 1];
      if (options.transactionId && last?.transactionId === options.transactionId) {
        history = [
          ...history.slice(0, -1),
          {
            ...last,
            label: result.label,
            patches: [...last.patches, ...entry.patches],
            inversePatches: [...entry.inversePatches, ...last.inversePatches],
            timestamp: entry.timestamp,
          },
        ];
      } else {
        history = [...history, entry].slice(-200);
      }
      set({
        document: result.document,
        history,
        future: [],
        ...editor,
        saveState: "dirty",
        storageError: null,
      });
      scheduleAutosave();
      return { ok: true, revision: result.document.revision };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Command failed.",
        code: error instanceof CommandError ? error.code : undefined,
      };
    }
  },

  undo: () => {
    const current = get().document;
    if (!current) return false;
    if (current.archivedAt) {
      set({ storageError: "This project is archived. Restore it to undo changes." });
      return false;
    }
    const history = get().history;
    const entry = history[history.length - 1];
    if (!entry) return false;
    try {
      const reverted = applyPatches(current, entry.inversePatches) as ProjectDocument;
      const next = produce(reverted, (draft) => {
        draft.revision = current.revision + 1;
        draft.updatedAt = new Date().toISOString();
      });
      validateDocument(next);
      set({
        document: next,
        history: history.slice(0, -1),
        future: [entry, ...get().future].slice(0, 200),
        ...editorAfterDocument(next, get().activeSceneId, get().activeLayerId, get().selection),
        saveState: "dirty",
        storageError: null,
      });
      scheduleAutosave();
      return true;
    } catch (error) {
      set({ storageError: error instanceof Error ? error.message : "Undo failed." });
      return false;
    }
  },

  redo: () => {
    const current = get().document;
    if (!current) return false;
    if (current.archivedAt) {
      set({ storageError: "This project is archived. Restore it to redo changes." });
      return false;
    }
    const entry = get().future[0];
    if (!entry) return false;
    try {
      const reapplied = applyPatches(current, entry.patches) as ProjectDocument;
      const next = produce(reapplied, (draft) => {
        draft.revision = current.revision + 1;
        draft.updatedAt = new Date().toISOString();
      });
      validateDocument(next);
      set({
        document: next,
        history: [...get().history, entry].slice(-200),
        future: get().future.slice(1),
        ...editorAfterDocument(next, get().activeSceneId, get().activeLayerId, get().selection),
        saveState: "dirty",
        storageError: null,
      });
      scheduleAutosave();
      return true;
    } catch (error) {
      set({ storageError: error instanceof Error ? error.message : "Redo failed." });
      return false;
    }
  },

  setActiveScene: (sceneId) => {
    const current = get().document;
    const scene = current?.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) return;
    set({
      activeSceneId: sceneId,
      activeLayerId: scene.layers[0]?.id ?? null,
      selection: [],
    });
  },

  setActiveLayer: (layerId) => set({ activeLayerId: layerId }),

  setSelection: (ids) => {
    const single = ids.length === 1 ? ids[0] : undefined;
    const current = get().document;
    const scene = current?.scenes.find((candidate) => candidate.id === get().activeSceneId);
    const object = single ? scene?.objects.find((candidate) => candidate.id === single) : undefined;
    set({ selection: ids, activeLayerId: object?.layerId ?? get().activeLayerId });
  },

  clearStorageError: () => set({ storageError: null }),

  reset: () =>
    set({
      document: null,
      activeProjectId: null,
      activeSceneId: null,
      activeLayerId: null,
      selection: [],
      isLoading: false,
      storageError: null,
      saveState: "saved",
      lastSavedAt: null,
      history: [],
      future: [],
    }),
}));

export async function ensureDemoProject(): Promise<void> {
  try {
    const records = await listProjectRecords();
    if (records.length > 0) return;
    if (localStorage.getItem("clockwork:seeded:v1")) return;
    const demo = createProjectFromTemplate("platformer", "Neon Runner");
    await saveProjectDocument(demo);
    localStorage.setItem("clockwork:seeded:v1", "1");
  } catch {
    // The dashboard will show its own storage error if storage is unavailable.
  }
}

export async function createAndSaveProject(
  template: Exclude<TemplateOrigin, "brief" | "import">,
  name: string,
): Promise<ProjectDocument> {
  const document = createProjectFromTemplate(template, name);
  await saveProjectDocument(document);
  return document;
}

export async function archiveProjectRecord(projectId: string, archived: boolean): Promise<void> {
  const document = await readProjectDocument(projectId);
  if (!document) throw new StorageError("That project is no longer in local storage.");
  const result = runCommand(document, { type: "project.setArchived", args: { archived } });
  await saveProjectDocument(result.document);
}

export async function duplicateProjectRecord(projectId: string): Promise<ProjectRecord | null> {
  const document = await readProjectDocument(projectId);
  if (!document) return null;
  const copy = duplicateProjectDocument(document, `${document.name} copy`);
  return saveProjectDocument(copy);
}

export function isReadOnly(document: ProjectDocument | null): boolean {
  return Boolean(document?.archivedAt);
}
