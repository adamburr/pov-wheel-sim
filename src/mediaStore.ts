// Uploaded images and clips, kept in IndexedDB so presets that use them survive a reload.
// Falls back to memory only (lost on reload) where IndexedDB is blocked.

const DB_NAME = 'pov-wheel-sim';
const STORE = 'media';
const memory = new Map<string, Blob>();
let dbPromise: Promise<IDBDatabase | undefined> | undefined;

function db(): Promise<IDBDatabase | undefined> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

export async function putMedia(id: string, blob: Blob) {
  memory.set(id, blob);
  await run('readwrite', (s) => s.put(blob, id));
}

export async function getMedia(id: string): Promise<Blob | undefined> {
  const hit = memory.get(id);
  if (hit) return hit;
  const blob = await run<Blob>('readonly', (s) => s.get(id));
  if (blob) memory.set(id, blob);
  return blob;
}

/** Delete every stored blob whose id isn't in `keep`. */
export async function pruneMedia(keep: Set<string>) {
  for (const id of memory.keys()) if (!keep.has(id)) memory.delete(id);
  const keys = (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? [];
  for (const k of keys) if (typeof k === 'string' && !keep.has(k)) await run('readwrite', (s) => s.delete(k));
}
