import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  migrateSave,
  runMigrations,
  type SaveMigration,
} from '../../src/app/save/migrations.js';

describe('save migration chain (#45)', () => {
  it('has no real migrations yet — this is schema v1, the first version ever shipped', () => {
    expect(MIGRATIONS).toEqual([]);
    // migrateSave is a no-op today, and must stay that way until a v2 exists.
    const raw = { schemaVersion: 1, unlocks: ['a'] };
    expect(migrateSave(raw)).toBe(raw);
  });

  it('hands back non-object input unchanged, for sanitizeSave to turn into defaults', () => {
    for (const junk of [null, 'nope', 42, [1, 2, 3]]) {
      expect(runMigrations(junk, MIGRATIONS)).toBe(junk);
    }
  });

  /**
   * The runner is generic over its migration list precisely so this test can
   * prove the mechanism — walking an unversioned save through several steps
   * up to the current version — without a real historical schema version
   * existing to test it against yet. Once a real v1 -> v2 migration lands,
   * this synthetic chain stays exactly as useful for the sequencing behaviour
   * a single fixture can't isolate (does it stop at the target version, does
   * it skip a version, does an unversioned save start from 0).
   */
  describe('the runner, against a synthetic three-version chain', () => {
    const synthetic: readonly SaveMigration[] = [
      // v0 -> v1: an unversioned save gains a `settings` object.
      (raw) => ({ ...raw, schemaVersion: 1, settings: raw.settings ?? {} }),
      // v1 -> v2: `unlocks` is renamed to `unlockedIds`.
      (raw) => {
        const { unlocks, ...rest } = raw;
        return { ...rest, schemaVersion: 2, unlockedIds: unlocks ?? [] };
      },
      // v2 -> v3: `bestRuns` is introduced, empty.
      (raw) => ({ ...raw, schemaVersion: 3, bestRuns: [] }),
    ];

    it('walks an unversioned (pre-v1) save all the way to the newest version', () => {
      const migrated = runMigrations({ unlocks: ['boss-kellerassel'] }, synthetic) as Record<
        string,
        unknown
      >;
      expect(migrated).toEqual({
        schemaVersion: 3,
        settings: {},
        unlockedIds: ['boss-kellerassel'],
        bestRuns: [],
      });
    });

    it('starts from a save’s own declared version rather than replaying from scratch', () => {
      const migrated = runMigrations(
        { schemaVersion: 2, settings: { swayScale: 0.5 }, unlockedIds: ['x'] },
        synthetic,
      );
      expect(migrated).toEqual({
        schemaVersion: 3,
        settings: { swayScale: 0.5 },
        unlockedIds: ['x'],
        bestRuns: [],
      });
    });

    it('is a no-op on a save already at the newest version', () => {
      const upToDate = { schemaVersion: 3, settings: {}, unlockedIds: [], bestRuns: ['kept'] };
      expect(runMigrations(upToDate, synthetic)).toEqual(upToDate);
    });

    it('never runs a migration past the version it declares for', () => {
      // A save claiming a version beyond the chain's length must not index
      // past the array and silently run the wrong step.
      const fromFuture = { schemaVersion: 5, settings: {} };
      expect(runMigrations(fromFuture, synthetic)).toEqual(fromFuture);
    });
  });
});
