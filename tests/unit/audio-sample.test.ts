import { describe, expect, it } from 'vitest';
import { resolveSampleTiming } from '../../src/app/audio/sample-player.js';
import type { SampleEdit } from '../../src/app/audio/types.js';

/**
 * The pure half of `sample-player.ts` — clamping a `SampleEdit` against a
 * real buffer's duration — exercised with no `AudioContext`/`AudioBuffer` at
 * all, the same "keep the arithmetic testable off-browser" reasoning
 * `music.ts`'s `audioTimeForTick` and `synth.ts`'s `noteToFrequency` already
 * follow.
 */
describe('resolveSampleTiming', () => {
  const baseEdit: SampleEdit = {
    trimStartSeconds: 0,
    trimEndSeconds: 2,
    fadeInSeconds: 0.1,
    fadeOutSeconds: 0.1,
    gain: 1,
  };

  it('passes through an edit that already fits inside the buffer', () => {
    const timing = resolveSampleTiming(baseEdit, 5);
    expect(timing.trimStartSeconds).toBe(0);
    expect(timing.trimEndSeconds).toBe(2);
    expect(timing.durationSeconds).toBe(2);
    expect(timing.fadeInSeconds).toBe(0.1);
    expect(timing.fadeOutSeconds).toBe(0.1);
  });

  it('clamps a trim end past the buffer duration', () => {
    const timing = resolveSampleTiming({ ...baseEdit, trimEndSeconds: 10 }, 3);
    expect(timing.trimEndSeconds).toBe(3);
    expect(timing.durationSeconds).toBe(3);
  });

  it('clamps a trim start past the buffer duration to the end, giving a zero-length clip rather than a negative one', () => {
    const timing = resolveSampleTiming(
      { ...baseEdit, trimStartSeconds: 10, trimEndSeconds: 20 },
      3,
    );
    expect(timing.trimStartSeconds).toBe(3);
    expect(timing.trimEndSeconds).toBe(3);
    expect(timing.durationSeconds).toBe(0);
  });

  it('never lets the fades outlast the trimmed region between them', () => {
    const timing = resolveSampleTiming(
      {
        ...baseEdit,
        trimStartSeconds: 0,
        trimEndSeconds: 1,
        fadeInSeconds: 0.8,
        fadeOutSeconds: 0.8,
      },
      5,
    );
    expect(timing.fadeInSeconds).toBe(0.8);
    // The fade-out is clamped to whatever's left after the fade-in, not the
    // full 0.8s requested — otherwise the two fades would overlap and the
    // "fade out starts no earlier than the fade in ends" invariant
    // `playSampleBuffer` relies on would break.
    expect(timing.fadeOutSeconds).toBeCloseTo(0.2, 10);
  });

  it('clamps negative trim/fade input to zero rather than propagating it', () => {
    const timing = resolveSampleTiming({ ...baseEdit, trimStartSeconds: -5, fadeInSeconds: -1 }, 5);
    expect(timing.trimStartSeconds).toBe(0);
    expect(timing.fadeInSeconds).toBe(0);
  });
});
