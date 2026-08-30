import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCESSIBILITY_SETTINGS } from '../../src/app/settings.js';
import { createDefaultSave, sanitizeSave } from '../../src/app/save/schema.js';

describe('save schema sanitisation (#45)', () => {
  it('produces the default save from anything that is not a plain object', () => {
    for (const junk of [null, undefined, 42, 'nope', [1, 2, 3]]) {
      expect(sanitizeSave(junk)).toEqual(createDefaultSave());
    }
  });

  it('falls back to defaults field-by-field rather than all-or-nothing', () => {
    const sanitized = sanitizeSave({
      schemaVersion: 1,
      settings: { swayScale: 0.5 },
      unlocks: ['boss-kellerassel', 42, null],
      achievements: 'not-an-array',
      statistics: { kills: 3, deaths: 'not-a-number' },
      dailyRunHistory: [{ date: '2026-01-01', seed: 1, ticksSurvived: 100, kills: 2 }],
      bestRuns: 'not-an-array',
      activeRun: { seed: 7, frames: [1, 2, 3, 4, 5] },
    });

    expect(sanitized.settings).toEqual({ ...DEFAULT_ACCESSIBILITY_SETTINGS, swayScale: 0.5 });
    // Non-string entries are dropped, not enough to throw the whole array away.
    expect(sanitized.unlocks).toEqual(['boss-kellerassel']);
    expect(sanitized.achievements).toEqual([]);
    expect(sanitized.statistics).toEqual({ kills: 3 });
    expect(sanitized.dailyRunHistory).toEqual([
      { date: '2026-01-01', seed: 1, ticksSurvived: 100, kills: 2 },
    ]);
    expect(sanitized.bestRuns).toEqual([]);
    expect(sanitized.activeRun).toEqual({ seed: 7, frames: [1, 2, 3, 4, 5] });
  });

  it('treats an active run with a non-numeric frame, or no frames at all, as no run in progress', () => {
    expect(
      sanitizeSave({ activeRun: { seed: 1, frames: [1, 2, 'nope', 4, 5] } }).activeRun,
    ).toBeNull();
    expect(sanitizeSave({ activeRun: { seed: 1, frames: [] } }).activeRun).toBeNull();
    expect(sanitizeSave({ activeRun: { seed: 1 } }).activeRun).toBeNull();
    expect(sanitizeSave({ activeRun: null }).activeRun).toBeNull();
  });

  it('drops a bestRuns entry missing a required numeric field instead of keeping it half-formed', () => {
    const sanitized = sanitizeSave({
      bestRuns: [
        { seed: 1, floor: 1, ticksSurvived: 100, kills: 5, recordedAt: 1000 },
        { seed: 2, floor: 1, kills: 5, recordedAt: 1000 }, // missing ticksSurvived
      ],
    });
    expect(sanitized.bestRuns).toEqual([
      { seed: 1, floor: 1, ticksSurvived: 100, kills: 5, deathWord: null, recordedAt: 1000 },
    ]);
  });

  it('always stamps the current schema version, regardless of what was asked for', () => {
    expect(sanitizeSave({ schemaVersion: 999 }).schemaVersion).toBe(1);
  });
});
