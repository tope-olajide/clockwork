import { migrateDocument, toProjectRecord, type ProjectDocument, type ProjectRecord } from "../model/schema";

const DB_NAME = "clockwork";
const DB_VERSION = 1;
const STORES = ["projects", "documents", "assets", "chats", "settings"] as const;

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new StorageError("This browser does not support IndexedDB. Clockwork needs local storage to save projects."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError(request.error?.message ?? "Could not open local storage."));
    request.onblocked = () => reject(new StorageError("Another Clockwork tab is holding an old database open."));
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError(request.error?.message ?? "Local storage request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new StorageError(transaction.error?.message ?? "Local storage transaction failed."));
    transaction.onabort = () => reject(new StorageError(transaction.error?.message ?? "Local storage transaction was aborted."));
  });
}

export async function listProjectRecords(): Promise<ProjectRecord[]> {
  const db = await openDatabase();
  const records = await requestToPromise(
    db.transaction("projects", "readonly").objectStore("projects").getAll() as IDBRequest<ProjectRecord[]>,
  );
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function readProjectDocument(projectId: string): Promise<ProjectDocument | undefined> {
  const db = await openDatabase();
  const stored = await requestToPromise(
    db.transaction("documents", "readonly").objectStore("documents").get(projectId) as IDBRequest<
      { id: string; document: unknown; savedAt: string } | undefined
    >,
  );
  if (!stored) return undefined;
  try {
    return migrateDocument(stored.document);
  } catch (error) {
    throw new StorageError(
      `The saved document could not be read. ${error instanceof Error ? error.message : "It may be damaged."}`,
    );
  }
}

export async function saveProjectDocument(document: ProjectDocument, coverDataUrl?: string): Promise<ProjectRecord> {
  const db = await openDatabase();
  const transaction = db.transaction(["projects", "documents"], "readwrite");
  const record = toProjectRecord(document, coverDataUrl);
  transaction.objectStore("projects").put(record);
  transaction.objectStore("documents").put({
    id: document.id,
    document,
    savedAt: new Date().toISOString(),
  });
  await transactionDone(transaction);
  return record;
}

export async function deleteProjectRecord(projectId: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(["projects", "documents", "assets"], "readwrite");
  transaction.objectStore("projects").delete(projectId);
  transaction.objectStore("documents").delete(projectId);
  await transactionDone(transaction);
}

export async function readAssetBlob(assetId: string): Promise<Blob | undefined> {
  const db = await openDatabase();
  const record = await requestToPromise(
    db.transaction("assets", "readonly").objectStore("assets").get(assetId) as IDBRequest<{ id: string; blob: Blob } | undefined>,
  );
  return record?.blob;
}

export async function writeAssetBlob(assetId: string, blob: Blob): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction("assets", "readwrite");
  transaction.objectStore("assets").put({ id: assetId, blob });
  await transactionDone(transaction);
}

export async function deleteAssetBlob(assetId: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction("assets", "readwrite");
  transaction.objectStore("assets").delete(assetId);
  await transactionDone(transaction);
}

export async function readSetting<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  const record = await requestToPromise(
    db.transaction("settings", "readonly").objectStore("settings").get(key) as IDBRequest<{ id: string; value: T } | undefined>,
  );
  return record?.value;
}

export async function writeSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction("settings", "readwrite");
  transaction.objectStore("settings").put({ id: key, value });
  await transactionDone(transaction);
}
