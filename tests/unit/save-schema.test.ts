import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCESSIBILITY_SETTINGS } from '../../src/app/settings.js';
import { createDefaultPreferences } from '../../src/app/preferences.js';
import { SAVE_SCHEMA_VERSION, createDefaultSave, sanitizeSave } from '../../src/app/save/schema.js';

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
    // `promilleUnlocked` is back-filled `true` rather than dropped: an
    // active run that reaches here without it was recorded before the field
    // existed, and every one of those was a promilled run (#85). `character`
    // back-fills the same way and for the same reason: a log recorded before
    // there was a roster can only have been an Alois run (#47).
    expect(sanitized.activeRun).toEqual({
      seed: 7,
      frames: [1, 2, 3, 4, 5],
      promilleUnlocked: true,
      character: 'alois',
    });
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
    expect(sanitizeSave({ schemaVersion: 999 }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it('defaults preferences (#53) when absent, and sanitises them group-by-group when present', () => {
    expect(sanitizeSave({}).preferences).toEqual(createDefaultPreferences());
    const sanitized = sanitizeSave({
      preferences: { video: { scale: 2 }, mixer: { master: 0.5 } },
    });
    expect(sanitized.preferences.video).toEqual({ scale: 2 });
    expect(sanitized.preferences.mixer.master).toBe(0.5);
    expect(sanitized.preferences.controls).toEqual(createDefaultPreferences().controls);
  });

  it('keeps a well-formed lastRun and drops one that is missing a field (#46)', () => {
    const lastRun = {
      seed: 7,
      floor: 2,
      ticksSurvived: 900,
      kills: 12,
      deathWord: 'Hi',
      recordedAt: 5,
    };
    expect(sanitizeSave({ lastRun }).lastRun).toEqual(lastRun);
    expect(sanitizeSave({ lastRun: { seed: 7, floor: 2 } }).lastRun).toBeNull();
  });

  it('keeps a well-formed replay and drops one missing a field (#48)', () => {
    const replay = {
      id: 'a-b-c',
      seed: 7,
      frames: 'H4sI...',
      floor: 2,
      ticksSurvived: 900,
      kills: 12,
      deathWord: 'Hi',
      kind: 'daily',
      promilleUnlocked: false,
      character: 'resi',
      recordedAt: 5,
    };
    expect(sanitizeSave({ replays: [replay] }).replays).toEqual([replay]);
    expect(sanitizeSave({ replays: [{ id: 'x', seed: 1 }] }).replays).toEqual([]);
  });

  it('back-fills promilleUnlocked true for a replay recorded before that field existed (#85)', () => {
    const { promilleUnlocked: _omitted, ...withoutFlag } = {
      id: 'a-b-c',
      seed: 7,
      frames: 'H4sI...',
      floor: 2,
      ticksSurvived: 900,
      kills: 12,
      deathWord: 'Hi',
      kind: 'daily' as const,
      promilleUnlocked: false,
      recordedAt: 5,
    };
    expect(sanitizeSave({ replays: [withoutFlag] }).replays[0]?.promilleUnlocked).toBe(true);
    // And the same back-fill for the character a pre-#47 replay cannot name.
    expect(sanitizeSave({ replays: [withoutFlag] }).replays[0]?.character).toBe('alois');
  });

  it('falls back to "normal" for a replay kind that is not "daily"', () => {
    const replay = {
      id: 'a',
      seed: 1,
      frames: '',
      floor: 1,
      ticksSurvived: 1,
      kills: 0,
      deathWord: null,
      kind: 'something-else',
      recordedAt: 1,
    };
    expect(sanitizeSave({ replays: [replay] }).replays[0]?.kind).toBe('normal');
  });

  it('caps replays at MAX_REPLAYS, keeping the earliest entries in the array', () => {
    const many = Array.from({ length: 8 }, (_unused, index) => ({
      id: String(index),
      seed: index,
      frames: '',
      floor: 1,
      ticksSurvived: 1,
      kills: 0,
      deathWord: null,
      kind: 'normal',
      recordedAt: index,
    }));
    expect(sanitizeSave({ replays: many }).replays).toHaveLength(5);
  });
});
