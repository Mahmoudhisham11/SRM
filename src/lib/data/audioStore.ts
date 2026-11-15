"use client";

/**
 * Tiny IndexedDB store for audio blobs (localStorage only holds ~5 MB of text,
 * IndexedDB holds binary data and far more of it).
 *   - "clips":   demo-mode recordings (LocalRepo), keyed by case id.
 *   - "pending": recordings waiting for a connection to upload, keyed "owner/caseId".
 */
const DB_NAME = "srmVoiceLog-audio";
export type AudioStoreName = "clips" | "pending";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("clips")) db.createObjectStore("clips");
      if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function run<T>(store: AudioStoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const audioStore = {
  put: (store: AudioStoreName, key: string, blob: Blob) => run(store, "readwrite", (s) => s.put(blob, key)).then(() => undefined),
  get: (store: AudioStoreName, key: string) => run<Blob | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<Blob | undefined>),
  delete: (store: AudioStoreName, key: string) => run(store, "readwrite", (s) => s.delete(key)).then(() => undefined),
  keys: (store: AudioStoreName) => run(store, "readonly", (s) => s.getAllKeys()).then((k) => k.map(String)),
};

/** audioUrl of a demo-mode clip kept in IndexedDB. */
export const LOCAL_AUDIO_PREFIX = "local-audio:";
