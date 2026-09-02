import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  migrateSave,
  runMigrations,
  type SaveMigration,
} from '../../src/app/save/migrations.js';
import { SAVE_SCHEMA_VERSION, sanitizeSave } from '../../src/app/save/schema.js';

describe('save migration chain (#45)', () => {
  it('carries exactly one step per shipped schema version', () => {
    // The chain is indexed by version: MIGRATIONS[i] takes a save at version
    // i to i + 1, so a chain shorter than the current version would silently
    // leave the newest saves un-migrated, and a longer one would run a step
    // that has no version to run for.
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION);
  });

  it('upgrades a real v1 save to the current version without touching what v1 already stored (#46, #85, #47)', () => {
    const v1 = {
      schemaVersion: 1,
      settings: { swayScale: 0.5 },
      unlocks: ['lore-opas-zettl'],
      achievements: [],
      statistics: { kills: 240 },
      dailyRunHistory: [],
      bestRuns: [
        { seed: 1, floor: 1, ticksSurvived: 9000, kills: 80, deathWord: 'Hi', recordedAt: 10 },
        { seed: 2, floor: 2, ticksSurvived: 300, kills: 4, deathWord: null, recordedAt: 99 },
      ],
      activeRun: null,
    };
    const migrated = sanitizeSave(migrateSave(v1));
    // Asserted against the constant rather than a literal: the point of the
    // chain is that a v1 save reaches *today's* version, whatever that has
    // become since, not that it reaches the one version that existed when
    // this test was written. `sanitizeSave` always stamps the current
    // version, not just the v2 step this test is otherwise about — see
    // `v2ToV3` for what the walk past v2 adds (nothing this test's own v1
    // fields touch).
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.unlocks).toEqual(['lore-opas-zettl']);
    expect(migrated.statistics).toEqual({ kills: 240 });
    // The most recently *recorded* run, not the longest one — the results
    // screen is about the run you just played.
    expect(migrated.lastRun?.seed).toBe(2);
    // v3 -> v4 (#47): a save from before characters existed walks in as the
    // only character it could ever have played.
    expect(migrated.selectedCharacter).toBe('alois');
  });

  it('back-fills a v3 in-progress run as an Alois run (#47)', () => {
    // The run parameter half of v3 -> v4: a log recorded before there was a
    // roster can only have been Alois, and a resume that rebuilt it as
    // whoever the table currently offers would replay those inputs at
    // somebody else's health and speed.
    const v3 = {
      schemaVersion: 3,
      unlocks: [],
      activeRun: { seed: 9, frames: [1, 2, 3, 4, 5], promilleUnlocked: false },
      lastRun: null,
      greetedRegulars: [],
    };
    const migrated = sanitizeSave(migrateSave(v3));
    expect(migrated.activeRun?.character).toBe('alois');
    // And the run's own recorded parameters are left exactly as they were.
    expect(migrated.activeRun?.promilleUnlocked).toBe(false);
  });

  it('back-fills a v2 in-progress run as promilled rather than reading the unlock set (#85)', () => {
    // The two genuinely differ, and the unlock set is the wrong source. A v2
    // tester who never beat Der Stier still recorded a promilled run —
    // `GameSim.promilleUnlocked` defaulted to true and nothing set it — so
    // deriving the flag from `unlocks` here would resume their run with the
    // beer taken out from under it.
    const v2 = {
      schemaVersion: 2,
      unlocks: [],
      activeRun: { seed: 4, frames: [1, 2, 3, 4, 5] },
      lastRun: null,
      greetedRegulars: [],
    };
    const migrated = sanitizeSave(migrateSave(v2));
    expect(migrated.activeRun?.promilleUnlocked).toBe(true);
    expect(migrated.activeRun?.seed).toBe(4);
    expect(migrated.activeRun?.frames).toEqual([1, 2, 3, 4, 5]);
  });

  it('drops a v4 save’s greetedRegulars without otherwise touching it', () => {
    const v4 = {
      schemaVersion: 4,
      unlocks: ['promille'],
      greetedRegulars: ['sepp'],
      selectedCharacter: 'resi',
    };
    const migrated = sanitizeSave(migrateSave(v4));
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.unlocks).toEqual(['promille']);
    expect(migrated.selectedCharacter).toBe('resi');
    expect(migrated).not.toHaveProperty('greetedRegulars');
  });

  it('migrates a v2 save with no run in progress without inventing one', () => {
    const migrated = sanitizeSave(migrateSave({ schemaVersion: 2, activeRun: null }));
    expect(migrated.activeRun).toBeNull();
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it('leaves lastRun null when a v1 save never finished a run', () => {
    const migrated = sanitizeSave(migrateSave({ schemaVersion: 1, bestRuns: [] }));
    expect(migrated.lastRun).toBeNull();
  });

  it('is a no-op on a save already at the current version', () => {
    const raw = { schemaVersion: SAVE_SCHEMA_VERSION, unlocks: ['a'] };
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
