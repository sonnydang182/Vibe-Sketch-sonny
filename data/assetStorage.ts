// IndexedDB-backed storage for large project assets (scene images +
// thumbnail). localStorage caps at ~5–10 MB and a single project's
// base64-encoded images can exceed that, so we keep metadata in
// localStorage (the HistoryEntry minus heavy fields) and offload
// pixels here.

const DB_NAME = 'vibesketch-assets';
const DB_VERSION = 1;
const STORE = 'projects';

let dbPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

export interface ProjectAssets {
  /** sceneId → image data URL */
  sceneImages: Record<string, string>;
  thumbnailUrl?: string;
  /**
   * Combined voiceover blob (mp3 / wav depending on provider).
   * Stored natively by IndexedDB — no base64 conversion needed.
   * The accompanying object URL is recreated at hydrate time.
   */
  audioBlob?: Blob;
  /**
   * Final rendered mp4 from step 7. Persisted so refreshing the page after
   * a successful render doesn't force a re-encode (which takes 1-3 minutes).
   * Same Blob-storage strategy as audioBlob.
   */
  videoBlob?: Blob;
  /**
   * Whisper alignment outputs — persisted so the user doesn't lose ~$0.005
   * of API spend whenever they reload or switch projects. Both fields are
   * serialised as plain JSON arrays in IDB.
   */
  whisperTimings?: Array<{ sceneId: string; start: number; end: number; source: 'whisper' | 'estimated' }>;
  whisperWords?: Array<{ text: string; start: number; end: number }>;
}

const tx = (db: IDBDatabase, mode: IDBTransactionMode) =>
  db.transaction(STORE, mode).objectStore(STORE);

/**
 * Save assets. To prevent races (e.g. autosave running before hydration
 * completes — thumbnailUrl briefly `undefined` in state would clobber the
 * saved value), we MERGE: undefined fields in the new payload keep the
 * previously-stored value; non-undefined fields overwrite. For
 * sceneImages we always take the new map (so removed scene images are
 * actually removed).
 */
export const saveProjectAssets = async (id: string, assets: ProjectAssets): Promise<void> => {
  try {
    const db = await getDB();
    // Use a single readwrite transaction so the read+write is atomic.
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const prev: ProjectAssets | null = await new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as ProjectAssets | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    const merged: ProjectAssets = {
      // sceneImages is authoritative on the new payload — caller computes
      // it from current scenes, so it must reflect deletions.
      sceneImages: assets.sceneImages,
      // The rest preserve previous values when the new one is undefined.
      thumbnailUrl: assets.thumbnailUrl ?? prev?.thumbnailUrl,
      audioBlob: assets.audioBlob ?? prev?.audioBlob,
      videoBlob: assets.videoBlob ?? prev?.videoBlob,
      whisperTimings: assets.whisperTimings ?? prev?.whisperTimings,
      whisperWords: assets.whisperWords ?? prev?.whisperWords,
    };
    await new Promise<void>((resolve, reject) => {
      const req = store.put(merged, id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('saveProjectAssets failed', e);
  }
};

export const loadProjectAssets = async (id: string): Promise<ProjectAssets | null> => {
  try {
    const db = await getDB();
    return await new Promise<ProjectAssets | null>((resolve, reject) => {
      const req = tx(db, 'readonly').get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('loadProjectAssets failed', e);
    return null;
  }
};

export const deleteProjectAssets = async (id: string): Promise<void> => {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const req = tx(db, 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('deleteProjectAssets failed', e);
  }
};

export const listProjectAssetIds = async (): Promise<string[]> => {
  try {
    const db = await getDB();
    return await new Promise<string[]>((resolve, reject) => {
      const req = tx(db, 'readonly').getAllKeys();
      req.onsuccess = () => resolve((req.result as string[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('listProjectAssetIds failed', e);
    return [];
  }
};

/** Remove asset entries for project IDs that no longer appear in history. */
export const pruneOrphanAssets = async (keepIds: Set<string>): Promise<void> => {
  const ids = await listProjectAssetIds();
  await Promise.all(ids.filter(id => !keepIds.has(id)).map(deleteProjectAssets));
};
