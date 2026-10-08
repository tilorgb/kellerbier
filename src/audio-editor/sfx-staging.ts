import type { SampleEdit } from '../app/audio/types.js';
import type { GeneratedOrigin } from './api-client.js';

/** A recording picked or generated but not written to the repo yet. */
export interface StagedFile {
  readonly name: string;
  readonly bytes: ArrayBuffer;
  readonly generated?: GeneratedOrigin;
}

/**
 * One SFX's pending sample change. `remove` means "back to the synth";
 * otherwise `edit` plays either `file` (a new recording) or the already-saved
 * `assetId` (an edit-only change).
 */
export interface StagedSample {
  readonly sfxId: string;
  readonly remove: boolean;
  readonly edit?: SampleEdit;
  readonly file?: StagedFile;
  readonly assetId?: string;
}

/**
 * The SFX panel's pending changes. Saving a sample writes a file under
 * `assets/audio/`, which makes the dev server reload the game — so the panel
 * stages instead, and everything is written in one batch ("Apply").
 *
 * Mirrored to IndexedDB so a refresh or crash of the editor tab loses
 * nothing. Browser storage can be unavailable (private window, blocked site
 * data); the store then simply works from memory.
 */
export interface SfxStagingStore {
  get(sfxId: string): StagedSample | undefined;
  all(): readonly StagedSample[];
  put(item: StagedSample): Promise<void>;
  delete(sfxId: string): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'kellerbier-audio-editor';
const STORE = 'staged-sfx-samples';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'sfxId' });
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('indexedDB open failed'));
    };
  });
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('indexedDB request failed'));
    };
  });
}

export async function createSfxStagingStore(): Promise<SfxStagingStore> {
  const items = new Map<string, StagedSample>();
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    for (const item of await run(
      db,
      'readonly',
      (store) => store.getAll() as IDBRequest<StagedSample[]>,
    )) {
      items.set(item.sfxId, item);
    }
  } catch {
    db = null;
  }

  // A failed write must not lose the in-memory change, so persistence is best-effort.
  async function persist<T>(action: (store: IDBObjectStore) => IDBRequest<T>): Promise<void> {
    if (db === null) {
      return;
    }
    try {
      await run(db, 'readwrite', action);
    } catch {
      /* memory still holds it */
    }
  }

  return {
    get: (sfxId) => items.get(sfxId),
    all: () => [...items.values()],
    async put(item) {
      items.set(item.sfxId, item);
      await persist((store) => store.put(item));
    },
    async delete(sfxId) {
      items.delete(sfxId);
      await persist((store) => store.delete(sfxId));
    },
    async clear() {
      items.clear();
      await persist((store) => store.clear());
    },
  };
}
