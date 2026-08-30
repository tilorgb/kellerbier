import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeLocalStorage } from '../helpers/fake-local-storage.js';
import {
  SAVE_BACKUP_KEY,
  SAVE_CORRUPT_KEY,
  SAVE_KEY,
  loadSave,
  updateSave,
  writeSave,
} from '../../src/app/save/storage.js';
import { createDefaultSave } from '../../src/app/save/schema.js';

describe('save storage (#45)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to a fresh default save with no localStorage available at all', () => {
    // This project's vitest.config.ts runs environment: 'node' — no
    // localStorage global exists unless a test installs one, which this one
    // deliberately does not, to pin the same fallback settings.ts relies on.
    expect(loadSave()).toEqual(createDefaultSave());
  });

  it('never throws writing with no localStorage available', () => {
    expect(() => {
      writeSave(createDefaultSave());
    }).not.toThrow();
  });

  it('round-trips a save written and reloaded in the same session', () => {
    installFakeLocalStorage();
    const save = { ...createDefaultSave(), unlocks: ['boss-kellerassel'] };
    writeSave(save);
    expect(loadSave()).toEqual(save);
  });

  it('recovers from the backup slot when the primary is corrupted, instead of losing progress', () => {
    const storage = installFakeLocalStorage();
    const first = { ...createDefaultSave(), unlocks: ['a'] };
    const second = { ...createDefaultSave(), unlocks: ['a', 'b'] };
    writeSave(first);
    writeSave(second);
    // writeSave demotes the previous primary to the backup slot on every
    // write, so at this point the backup holds `first`, not `second`.
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(JSON.stringify(first));

    storage.setItem(SAVE_KEY, '{ not valid json ]]]');
    expect(loadSave()).toEqual(first);
  });

  it('stashes an unreadable primary rather than silently discarding it', () => {
    const storage = installFakeLocalStorage();
    writeSave(createDefaultSave());
    const corrupted = '{ this is not json';
    storage.setItem(SAVE_KEY, corrupted);
    loadSave();
    expect(storage.getItem(SAVE_CORRUPT_KEY)).toBe(corrupted);
  });

  it('falls back to a fresh save only once both the primary and the backup are unreadable', () => {
    const storage = installFakeLocalStorage();
    storage.setItem(SAVE_KEY, 'not json');
    storage.setItem(SAVE_BACKUP_KEY, 'also not json');
    expect(loadSave()).toEqual(createDefaultSave());
  });

  it('adopts the pre-existing standalone accessibility-settings key on first load', () => {
    const storage = installFakeLocalStorage();
    storage.setItem(
      'kellerbier.settings.v1',
      JSON.stringify({
        swayScale: 0.25,
        noDrift: true,
        neutralReskin: false,
        reducedMotion: false,
        reduceFlashes: false,
      }),
    );
    const loaded = loadSave();
    expect(loaded.settings.swayScale).toBe(0.25);
    expect(loaded.settings.noDrift).toBe(true);
  });

  it('never re-adopts the legacy key once a real save exists', () => {
    const storage = installFakeLocalStorage();
    storage.setItem('kellerbier.settings.v1', JSON.stringify({ swayScale: 0.9 }));
    writeSave({ ...createDefaultSave(), unlocks: ['x'] });
    expect(loadSave().settings.swayScale).toBe(1); // the default, not the legacy 0.9
  });

  it('updateSave reads, mutates and persists in one step', () => {
    installFakeLocalStorage();
    const result = updateSave((save) => ({ ...save, unlocks: [...save.unlocks, 'new'] }));
    expect(result.unlocks).toEqual(['new']);
    expect(loadSave().unlocks).toEqual(['new']);
  });
});
