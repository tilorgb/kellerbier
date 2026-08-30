import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeLocalStorage } from '../helpers/fake-local-storage.js';
import { exportSaveText, importSaveText } from '../../src/app/save/export-import.js';
import { createDefaultSave } from '../../src/app/save/schema.js';
import { loadSave } from '../../src/app/save/storage.js';

describe('save export/import (#45)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a save through exportSaveText and importSaveText', () => {
    installFakeLocalStorage();
    const save = {
      ...createDefaultSave(),
      unlocks: ['boss-kellerassel'],
      achievements: ['first-blood'],
    };
    const text = exportSaveText(save);
    const imported = importSaveText(text);
    expect(imported).toEqual(save);
  });

  it('persists the imported save, so it survives the next reload', () => {
    installFakeLocalStorage();
    const save = { ...createDefaultSave(), unlocks: ['imported-from-a-file'] };
    importSaveText(exportSaveText(save));
    expect(loadSave().unlocks).toEqual(['imported-from-a-file']);
  });

  it('sanitizes an imported blob field-by-field, same as a normal load', () => {
    installFakeLocalStorage();
    const imported = importSaveText(JSON.stringify({ schemaVersion: 1, unlocks: ['ok', 42] }));
    expect(imported.unlocks).toEqual(['ok']);
  });

  it('throws on text that is not valid JSON at all, rather than substituting a fresh save', () => {
    installFakeLocalStorage();
    expect(() => importSaveText('definitely not json')).toThrow();
  });
});
