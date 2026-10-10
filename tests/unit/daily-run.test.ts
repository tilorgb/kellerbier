import { describe, expect, it } from 'vitest';
import { dailyDateKey, dailyRunParameters } from '../../src/app/daily.js';
import { withDailyRunOutcome } from '../../src/app/meta/progress.js';
import { migrateSave } from '../../src/app/save/migrations.js';
import { ActiveRunRecorder, recorderFrom } from '../../src/app/save/active-run.js';
import { createDefaultSave, sanitizeSave, SAVE_SCHEMA_VERSION } from '../../src/app/save/schema.js';
import { dailySeed } from '../../src/sim/rng/daily.js';

/**
 * The daily run (#494): one set of parameters per UTC date, shared by every
 * player, and the first attempt on a date is the one that counts.
 */
describe('the daily run (#494)', () => {
  it('fixes every parameter from the date alone — the same run for everyone', () => {
    const daily = dailyRunParameters('2026-10-10');
    expect(daily).toEqual({
      date: '2026-10-10',
      seed: dailySeed('2026-10-10'),
      character: 'alois',
      tier: 0,
      lockedItems: [],
      promilleUnlocked: true,
    });
    expect(dailyRunParameters('2026-10-10')).toEqual(daily);
    expect(dailyRunParameters('2026-10-11').seed).not.toBe(daily.seed);
  });

  it('turns over at UTC midnight, whatever the local time', () => {
    expect(dailyDateKey(new Date('2026-10-10T23:59:59Z'))).toBe('2026-10-10');
    expect(dailyDateKey(new Date('2026-10-11T00:00:00Z'))).toBe('2026-10-11');
  });

  it('keeps the first result of a day; a practice run the same day does not replace it', () => {
    const first = withDailyRunOutcome(createDefaultSave(), {
      date: '2026-10-10',
      seed: 1,
      ticksSurvived: 100,
      kills: 3,
    });
    const practice = withDailyRunOutcome(first, {
      date: '2026-10-10',
      seed: 1,
      ticksSurvived: 9000,
      kills: 80,
    });
    expect(practice.dailyRunHistory).toEqual(first.dailyRunHistory);
  });

  it('remembers which daily a run in progress is, through a save and back', () => {
    const recorder = new ActiveRunRecorder(5, true, 'alois', [], 0, '2026-10-10');
    expect(recorderFrom(recorder.toSave()).dailyDate).toBe('2026-10-10');
    expect(new ActiveRunRecorder(5).dailyDate).toBeNull();
  });

  it('back-fills a v11 run in progress as an ordinary run, and refuses a malformed date', () => {
    const migrated = sanitizeSave(
      migrateSave({
        schemaVersion: 11,
        activeRun: {
          seed: 3,
          frames: [0, 0, 0, 0, 0],
          promilleUnlocked: true,
          character: 'alois',
          lockedItems: [],
          tier: 0,
        },
      }),
    );
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.activeRun?.dailyDate).toBeNull();
    const bad = sanitizeSave({
      schemaVersion: SAVE_SCHEMA_VERSION,
      activeRun: { seed: 1, frames: [0, 0, 0, 0, 0], dailyDate: 'yesterday' },
    });
    expect(bad.activeRun?.dailyDate).toBeNull();
  });
});
