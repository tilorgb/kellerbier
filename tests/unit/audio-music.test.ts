import { describe, expect, it } from 'vitest';
import { audioTimeForTick, buildScheduleIndex } from '../../src/app/audio/music.js';
import { noteToFrequency } from '../../src/app/audio/synth.js';
import type { TrackDefinition } from '../../src/app/audio/types.js';

/**
 * The pure half of `music.ts` — tick-to-time conversion and schedule
 * lookup — exercised with no `AudioContext` at all, per #51's own
 * requirement that this stay a function of `sim.tick`, never of audio
 * playback position.
 */
describe('audioTimeForTick', () => {
  it('is the identity at the anchor tick', () => {
    expect(audioTimeForTick(1.5, 100, 100)).toBe(1.5);
  });

  it('advances one real second for every 60 ticks (TICKS_PER_SECOND)', () => {
    expect(audioTimeForTick(0, 0, 60)).toBeCloseTo(1, 10);
    expect(audioTimeForTick(10, 0, 120)).toBeCloseTo(12, 10);
  });

  it('runs backward for a tick before the anchor, symmetrically', () => {
    expect(audioTimeForTick(2, 60, 0)).toBeCloseTo(1, 10);
  });
});

describe('buildScheduleIndex', () => {
  const track: TrackDefinition = {
    id: 'test-track',
    title: 'Test',
    ticksPerBeat: 10,
    loopBeats: 4,
    events: [
      { beat: 0, durationBeats: 1, instrument: 'x', note: 'A4' },
      { beat: 1.5, durationBeats: 0.5, instrument: 'x', note: 'B4' },
      { beat: 2, durationBeats: 1, instrument: 'x', note: 'C4' },
    ],
  };

  it('keys every event by its rounded tick offset', () => {
    const index = buildScheduleIndex(track, 10);
    expect(index.get(0)?.[0]?.note).toBe('A4');
    expect(index.get(15)?.[0]?.note).toBe('B4');
    expect(index.get(20)?.[0]?.note).toBe('C4');
    expect(index.get(5)).toBeUndefined();
  });

  it('groups two events that land on the same tick', () => {
    const chordTrack: TrackDefinition = {
      ...track,
      events: [
        { beat: 0, durationBeats: 1, instrument: 'a', note: 'A4' },
        { beat: 0, durationBeats: 1, instrument: 'b', note: 'C4' },
      ],
    };
    const index = buildScheduleIndex(chordTrack, 10);
    expect(index.get(0)?.length).toBe(2);
  });

  it('rebuilds to a different tick grid when the effective ticksPerBeat changes (Promille tempo drift)', () => {
    const slow = buildScheduleIndex(track, 20);
    expect(slow.get(0)?.[0]?.note).toBe('A4');
    expect(slow.get(30)?.[0]?.note).toBe('B4');
    expect(slow.get(40)?.[0]?.note).toBe('C4');
  });
});

describe('noteToFrequency', () => {
  it('is 440Hz at A4, the reference pitch', () => {
    expect(noteToFrequency('A4')).toBeCloseTo(440, 5);
  });

  it('doubles an octave up and halves an octave down', () => {
    expect(noteToFrequency('A5')).toBeCloseTo(880, 5);
    expect(noteToFrequency('A3')).toBeCloseTo(220, 5);
  });

  it('accepts sharps and flats', () => {
    expect(noteToFrequency('C#4')).toBeCloseTo(noteToFrequency('Db4'), 5);
  });

  it('throws on malformed input rather than returning NaN', () => {
    expect(() => noteToFrequency('H4')).toThrow();
    expect(() => noteToFrequency('not a note')).toThrow();
    expect(() => noteToFrequency('')).toThrow();
  });
});
