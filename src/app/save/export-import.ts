import { migrateSave } from './migrations.js';
import { type SaveData, sanitizeSave } from './schema.js';
import { writeSave } from './storage.js';

/** The save, as a file — for backup, or moving progress to another browser. */
export function exportSaveText(data: SaveData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Parses, migrates and sanitizes `text` the same way `loadSave` treats
 * whatever is already in `localStorage`, then persists the result.
 *
 * Throws on text that isn't valid JSON at all — that is a file the caller
 * picked by mistake, not a corrupted save this module owns, so it is the
 * caller's job (a file-picker's error handler) to say so rather than this
 * silently substituting a fresh save for a typo'd file path.
 */
export function importSaveText(text: string): SaveData {
  const parsed: unknown = JSON.parse(text);
  const imported = sanitizeSave(migrateSave(parsed));
  writeSave(imported);
  return imported;
}
