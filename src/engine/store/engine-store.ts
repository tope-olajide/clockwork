import { applyPatches, produce, type Patch } from "immer";
import { create } from "zustand";
import { runCommand } from "../commands/registry";
import { CommandError, validateDocument } from "../commands/validation";
import { duplicateProjectDocument } from "../model/clone";
import { createProjectFromTemplate } from "../model/templates";
import { applyStarterVisuals, seedStarterAssets } from "../assets/starter-seed";
import { captureViewportCover } from "../ai/viewport-capture";
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
  prevRevision: number;
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
  snapGrid: 0 | 8 | 16 | 32;
  playtestRunning: boolean;

  setSnapGrid: (size: 0 | 8 | 16 | 32) => void;
  setPlaytestRunning: (running: boolean) => void;
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
  snapGrid: 8,
  playtestRunning: false,

  setSnapGrid: (size) => set({ snapGrid: size }),
  setPlaytestRunning: (running) => set({ playtestRunning: running }),

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
    const document = await seedStarterAssets(applyStarterVisuals(createProjectFromTemplate(template, name)));
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
        const cover = await captureViewportCover();
        await saveProjectDocument(current, cover ?? undefined);
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
    if (get().playtestRunning) return { ok: false, error: "The project is read-only while playtesting.", code: "READ_ONLY" };
    try {
      const result = runCommand(current, { type, args }, { expectedRevision: options.expectedRevision });
      const editor = editorAfterDocument(result.document, get().activeSceneId, get().activeLayerId, get().selection);
      const entry: HistoryEntry = {
        label: result.label,
        patches: result.patches,
        inversePatches: result.inversePatches,
        timestamp: Date.now(),
        transactionId: options.transactionId,
        prevRevision: current.revision,
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
        draft.revision = entry.prevRevision;
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
        draft.revision = entry.prevRevision + 1;
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

const DEMO_COVER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10162a"/><stop offset="0.58" stop-color="#1d2340"/><stop offset="1" stop-color="#0b0d12"/></linearGradient></defs><rect width="640" height="360" fill="url(#sky)"/><circle cx="498" cy="86" r="38" fill="#f6e7c8" opacity="0.9"/><path d="M0 238 L120 168 L212 224 L320 150 L430 230 L520 184 L640 244 L640 360 L0 360 Z" fill="#252f4a"/><path d="M0 286 L170 226 L300 278 L430 238 L560 284 L640 266 L640 360 L0 360 Z" fill="#1a2137"/><rect y="318" width="640" height="42" fill="#29314b"/><rect x="84" y="282" width="42" height="36" rx="5" fill="#ff856f"/><rect x="238" y="262" width="18" height="18" rx="9" fill="#f4c56a"/><rect x="316" y="230" width="18" height="18" rx="9" fill="#f4c56a"/><rect x="392" y="274" width="18" height="18" rx="9" fill="#f4c56a"/><text x="24" y="42" fill="#f1f0ed" font-family="monospace" font-size="20" letter-spacing="4">NEON RUNNER</text><text x="24" y="62" fill="#a9b4ff" font-family="monospace" font-size="11" letter-spacing="2">CLOCKWORK DEMO</text></svg>`)}`;

async function buildDemoProject(): Promise<ProjectDocument> {
  const demo = await seedStarterAssets(applyStarterVisuals(createProjectFromTemplate("platformer", "Neon Runner")));
  // Seeded defect for the Slice 10 negative control: Core B sits inside the
  // solid Ledge B body, so manual play can reach the relay but cannot collect
  // all three cores. `?demoReset=1` restores this exact state.
  const scene = demo.scenes.find((candidate) => candidate.id === demo.startSceneId) ?? demo.scenes[0];
  const coreB = scene?.objects.find((object) => object.name === "Core B");
  if (coreB) {
    coreB.transform.x = 1080;
    coreB.transform.y = 566;
  }
  return demo;
}

export async function ensureDemoProject(): Promise<void> {
  try {
    const records = await listProjectRecords();
    if (records.length > 0) return;
    if (localStorage.getItem("clockwork:seeded:v1")) return;
    const demo = await buildDemoProject();
    await saveProjectDocument(demo, DEMO_COVER);
    localStorage.setItem("clockwork:seeded:v1", "1");
  } catch {
    // The dashboard will show its own storage error if storage is unavailable.
  }
}

/** Restore the intentional Neon Runner defect for AI Play rehearsals. */
export async function resetDemoProject(): Promise<void> {
  const records = await listProjectRecords();
  for (const record of records) {
    if (record.name === "Neon Runner") await deleteProjectRecord(record.id);
  }
  const demo = await buildDemoProject();
  await saveProjectDocument(demo, DEMO_COVER);
  localStorage.setItem("clockwork:seeded:v1", "1");
}

export async function createAndSaveProject(
  template: Exclude<TemplateOrigin, "brief" | "import">,
  name: string,
): Promise<ProjectDocument> {
  const document = await seedStarterAssets(applyStarterVisuals(createProjectFromTemplate(template, name)));
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
