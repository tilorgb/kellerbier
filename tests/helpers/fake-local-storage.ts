import { vi } from 'vitest';

/**
 * A minimal `Storage` stand-in for the save system's tests (#45).
 *
 * This project's `vitest.config.ts` runs `environment: 'node'`, which has no
 * `localStorage` global at all — the same absence `app/settings.ts`'s own
 * tests already lean on to prove the "no storage available" fallback. The
 * save system's tests need the opposite case too: a real, if tiny, backing
 * store to prove round-tripping, corruption recovery and the backup slot
 * actually work, not just that their absence is handled gracefully.
 */
export class FakeLocalStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

/** Installs a fresh `FakeLocalStorage` as `globalThis.localStorage`. Pair with `vi.unstubAllGlobals()`. */
export function installFakeLocalStorage(): FakeLocalStorage {
  const storage = new FakeLocalStorage();
  vi.stubGlobal('localStorage', storage);
  return storage;
}
