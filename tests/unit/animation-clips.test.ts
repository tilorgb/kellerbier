import { describe, expect, it } from 'vitest';
import {
  AnimationState,
  ANIMATION_STATE_IDS,
  animationStateIndex,
  clipFrameAt,
  clipHasEnded,
  compileAnimationSet,
  type AnimationSidecar,
} from '../../src/render/animation/definition.js';
import { ANIMATION_STATES } from '../../tools/art/spec.mjs';

/**
 * Clip compilation: the construction-time half of #150's "validated, not
 * silently tolerated".
 *
 * The build already refuses to pack a sidecar whose clips do not make sense
 * (`tests/art/validate.test.ts`), so most of these are the second line of
 * defence. That is deliberate rather than redundant: the runtime loads a
 * *texture* as well as a sidecar, and the interesting failure — the frame count
 * the sidecar declares not matching the strip that was actually loaded — is one
 * only the runtime is in a position to see.
 */

const STRIP: AnimationSidecar = {
  frames: 8,
  frameDurationMs: 120,
  loop: true,
  clips: {
    idle: { frames: [0, 1], frameDurationMs: 400, mode: 'pingPong' },
    move: { frames: [0, 1, 2, 3], frameDurationMs: 100, mode: 'loop' },
    hurt: { frames: [4], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
    death: { frames: [5, 6, 7], frameDurationMs: 100, mode: 'once', onEnd: 'hold' },
  },
};

describe('the animation state list', () => {
  it('is the same list the art build validates clip names against', () => {
    expect([...ANIMATION_STATE_IDS]).toEqual([...ANIMATION_STATES]);
  });

  it('indexes idle first, because idle is what everything falls back to', () => {
    expect(animationStateIndex('idle')).toBe(AnimationState.Idle);
    expect(ANIMATION_STATE_IDS[AnimationState.Death]).toBe('death');
    expect(animationStateIndex('sprint')).toBe(-1);
  });
});

describe('compileAnimationSet', () => {
  it('compiles every authored clip into its own state slot', () => {
    const set = compileAnimationSet('crawler', STRIP, 8);
    expect(set.name).toBe('crawler');
    expect(set.frameCount).toBe(8);
    expect([...(set.clips[AnimationState.Move]?.sequence ?? [])]).toEqual([0, 1, 2, 3]);
    expect(set.clips[AnimationState.Move]?.totalMs).toBe(400);
    expect(set.clips[AnimationState.Telegraph]).toBeNull();
  });

  it('unrolls a ping-pong clip into the frames it actually visits', () => {
    const set = compileAnimationSet(
      'crawler',
      {
        frames: 4,
        frameDurationMs: 100,
        loop: true,
        clips: { idle: { frames: [0, 1, 2, 3], frameDurationMs: 100, mode: 'pingPong' } },
      },
      4,
    );
    // Six entries, not eight: both endpoints are played once, so the pose at
    // the turn does not read as a hitch.
    expect([...set.idle.sequence]).toEqual([0, 1, 2, 3, 2, 1]);
    expect(set.idle.totalMs).toBe(600);
    expect(set.idle.repeats).toBe(true);
  });

  it('turns a clipless sidecar into one looping idle clip over the whole strip', () => {
    const set = compileAnimationSet('crawler', { frames: 3, frameDurationMs: 150, loop: true }, 3);
    expect([...set.idle.sequence]).toEqual([0, 1, 2]);
    expect(set.idle.repeats).toBe(true);
    expect(set.clips[AnimationState.Move]).toBeNull();
  });

  it('holds the last frame of a clipless non-looping sidecar', () => {
    const set = compileAnimationSet('crawler', { frames: 2, frameDurationMs: 150, loop: false }, 2);
    expect(set.idle.repeats).toBe(false);
    expect(set.idle.holds).toBe(true);
  });

  it('holds a once clip that does not say what to do when it ends', () => {
    const set = compileAnimationSet(
      'crawler',
      {
        frames: 2,
        frameDurationMs: 100,
        loop: true,
        clips: {
          idle: { frames: [0], frameDurationMs: 100, mode: 'loop' },
          death: { frames: [1], frameDurationMs: 100, mode: 'once' },
        },
      },
      2,
    );
    // A corpse popping back to its idle pose is the failure this default
    // exists to avoid; `onEnd: 'idle'` is the opt-in, not the default.
    expect(set.clips[AnimationState.Death]?.holds).toBe(true);
  });

  it('throws when the sidecar and the loaded strip disagree about the frame count', () => {
    // The one check the art build cannot make: it validates the sidecar and
    // the PNG separately, and 8 frames of 24px and 6 frames of 32px are both
    // a legal 192px-wide character strip.
    expect(() => compileAnimationSet('crawler', STRIP, 6)).toThrow(
      /declares 8 frame\(s\), but crawler\.strip\.png divides into 6/,
    );
  });

  it('throws for a clip pointing past the end of the strip', () => {
    const broken: AnimationSidecar = {
      ...STRIP,
      clips: { ...STRIP.clips, move: { frames: [0, 9], frameDurationMs: 100, mode: 'loop' } },
    };
    expect(() => compileAnimationSet('crawler', broken, 8)).toThrow(/frame index 9/);
  });

  it('throws for a clip set with no idle clip', () => {
    const broken: AnimationSidecar = {
      ...STRIP,
      clips: { move: { frames: [0], frameDurationMs: 100, mode: 'loop' } },
    };
    expect(() => compileAnimationSet('crawler', broken, 8)).toThrow(/idle/);
  });

  it('names the sprite in every error, so a build failure says which file to open', () => {
    expect(() => compileAnimationSet('gockel', { ...STRIP, frames: 0 }, 0)).toThrow(
      /^gockel\.anim\.json/,
    );
  });
});

describe('clipFrameAt', () => {
  const set = compileAnimationSet('crawler', STRIP, 8);
  const move = set.clips[AnimationState.Move] ?? set.idle;
  const death = set.clips[AnimationState.Death] ?? set.idle;

  it('walks its frames in order', () => {
    expect(clipFrameAt(move, 0)).toBe(0);
    expect(clipFrameAt(move, 99)).toBe(0);
    expect(clipFrameAt(move, 100)).toBe(1);
    expect(clipFrameAt(move, 250)).toBe(2);
    expect(clipFrameAt(move, 399)).toBe(3);
  });

  it('wraps a looping clip', () => {
    expect(clipFrameAt(move, 400)).toBe(0);
    // Three whole cycles plus 250 ms is the third frame of the fourth pass.
    expect(clipFrameAt(move, 1450)).toBe(2);
    expect(clipHasEnded(move, 1_000_000)).toBe(false);
  });

  it('holds the last frame of a once clip and reports that it ended', () => {
    expect(clipFrameAt(death, 0)).toBe(5);
    expect(clipFrameAt(death, 250)).toBe(7);
    expect(clipHasEnded(death, 299)).toBe(false);
    expect(clipFrameAt(death, 5000)).toBe(7);
    expect(clipHasEnded(death, 300)).toBe(true);
  });

  it('respects per-frame durations', () => {
    const uneven = compileAnimationSet(
      'crawler',
      {
        frames: 3,
        frameDurationMs: 100,
        loop: true,
        clips: { idle: { frames: [0, 1, 2], frameDurationMs: [50, 200, 50], mode: 'loop' } },
      },
      3,
    ).idle;
    expect(clipFrameAt(uneven, 40)).toBe(0);
    expect(clipFrameAt(uneven, 60)).toBe(1);
    expect(clipFrameAt(uneven, 240)).toBe(1);
    expect(clipFrameAt(uneven, 260)).toBe(2);
  });
});
