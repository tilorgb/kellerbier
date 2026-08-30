import { sanitizeAccessibilitySettings } from '../settings.js';
import { migrateSave } from './migrations.js';
import { type SaveData, createDefaultSave, sanitizeSave } from './schema.js';

/** Where the unified save lives. Versioned in the key, same reasoning as `app/settings.ts`'s own key. */
export const SAVE_KEY = 'kellerbier.save.v1';
/** One generation behind `SAVE_KEY` — see `writeSave`. */
export const SAVE_BACKUP_KEY = 'kellerbier.save.v1.backup';
/** Where an unreadable primary is stashed before it is overwritten — see `loadSave`. */
export const SAVE_CORRUPT_KEY = 'kellerbier.save.v1.corrupt';

/**
 * The standalone key `app/settings.ts` used before this save existed (#33).
 * Adopted into a fresh save on its first load so an early tester's
 * accessibility settings survive this feature landing under them, rather
 * than silently reverting to defaults the first time `loadSave` runs.
 */
const LEGACY_SETTINGS_KEY = 'kellerbier.settings.v1';

function readLegacySettings(): ReturnType<typeof sanitizeAccessibilitySettings> | null {
  try {
    const raw = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (raw === null) {
      return null;
    }
    return sanitizeAccessibilitySettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseAndSanitize(raw: string): SaveData | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return sanitizeSave(migrateSave(parsed));
  } catch {
    return null;
  }
}

function stashCorrupt(raw: string): void {
  try {
    localStorage.setItem(SAVE_CORRUPT_KEY, raw);
  } catch {
    // Best-effort: if storage is full enough that even this write fails,
    // there is nothing more to do than fall through to a fresh save.
  }
}

/**
 * Loads the save, recovering from a corrupted primary rather than losing
 * progress to it (#45's "never silently wipe" acceptance criterion).
 *
 * Order: a valid primary wins outright. A primary that fails to parse or
 * validate is stashed under `SAVE_CORRUPT_KEY` — for export or manual
 * inspection, since overwriting it silently would be exactly the data loss
 * this exists to avoid — and the backup slot (`writeSave`'s previous
 * generation) is tried next. Only when neither primary nor backup is
 * readable, or `localStorage` isn't available at all (a private window, or
 * this project's own `vitest` config, which runs in `environment: 'node'`),
 * does this fall back to a fresh default save.
 *
 * Never throws.
 */
export function loadSave(): SaveData {
  try {
    const primaryRaw = localStorage.getItem(SAVE_KEY);
    if (primaryRaw !== null) {
      const primary = parseAndSanitize(primaryRaw);
      if (primary !== null) {
        return primary;
      }
      stashCorrupt(primaryRaw);
    }

    const backupRaw = localStorage.getItem(SAVE_BACKUP_KEY);
    if (backupRaw !== null) {
      const backup = parseAndSanitize(backupRaw);
      if (backup !== null) {
        return backup;
      }
    }

    if (primaryRaw === null && backupRaw === null) {
      // No unified save has ever been written on this machine — the one
      // moment legacy adoption applies. Once a real save exists, its own
      // `settings` field is authoritative and this is never consulted again.
      const legacySettings = readLegacySettings();
      if (legacySettings !== null) {
        return { ...createDefaultSave(), settings: legacySettings };
      }
    }
  } catch {
    // No localStorage at all — fall through to defaults, same as `settings.ts`.
  }
  return createDefaultSave();
}

/**
 * Persists `data`, demoting the previous primary to the backup slot first.
 *
 * That ordering is what makes `loadSave`'s recovery real: the backup always
 * holds the generation before whatever just got corrupted (by a crash
 * mid-write, disk-level bit rot, or a player hand-editing the JSON and
 * breaking it), rather than a second copy of the same broken bytes.
 *
 * Best-effort — a write that fails (storage full, private mode) never
 * throws; the save still applies for the rest of the session, it just won't
 * survive a reload, same as `app/settings.ts`'s `saveSettings`.
 */
export function writeSave(data: SaveData): void {
  try {
    const previous = localStorage.getItem(SAVE_KEY);
    if (previous !== null) {
      localStorage.setItem(SAVE_BACKUP_KEY, previous);
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Best-effort — see doc comment above.
  }
}

/** Reads, mutates, and persists the save in one step. Returns the new save. */
export function updateSave(mutate: (save: SaveData) => SaveData): SaveData {
  const next = mutate(loadSave());
  writeSave(next);
  return next;
}
