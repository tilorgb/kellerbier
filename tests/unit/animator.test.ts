import { describe, expect, it, vi } from 'vitest';
import {
  CORPSE_CAPACITY,
  CORPSE_LINGER_MS,
  EntityAnimator,
  MAX_FRAME_DELTA_MS,
} from '../../src/render/animation/animator.js';
import {
  AnimationState,
  clipFrameAt,
  compileAnimationSet,
  type AnimationSidecar,
  type AnimationStateIndex,
  type CompiledAnimationSet,
} from '../../src/render/animation/definition.js';
import { bytesPerPass } from '../helpers/allocation.js';

/**
 * The animator, driven by hand.
 *
 * `beginFrame` takes the clock reading rather than reading one, which is what
 * makes the framerate tests below possible at all: an exact 60 Hz and an exact
 * 144 Hz are two loops with different deltas, and the whole point of advancing
 * clips on the render clock is that the same wall time produces the same frame
 * on both.
 */

const SIDECAR: AnimationSidecar = {
  frames: 8,
  frameDurationMs: 120,
  loop: true,
  clips: {
    idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
    move: { frames: [0, 1, 2, 3], frameDurationMs: 110, mode: 'loop' },
    hurt: { frames: [4], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
    death: { frames: [5, 6, 7], frameDurationMs: 100, mode: 'once', onEnd: 'hold' },
  },
};

const SET = compileAnimationSet('crawler', SIDECAR, 8);

/** A set with only an idle clip — a creature whose walk has not been drawn yet. */
const IDLE_ONLY = compileAnimationSet(
  'halbdrawn',
  { frames: 2, frameDurationMs: 200, loop: true },
  2,
);

const HANDLE = 0x100001;

/** Runs `frames` frames at `hz`, returning the frame index drawn on each. */
function play(
  animator: EntityAnimator,
  hz: number,
  frames: number,
  state: AnimationStateIndex = AnimationState.Move,
  set: CompiledAnimationSet = SET,
  startMs = 0,
): number[] {
  const step = 1000 / hz;
  const drawn: number[] = [];
  for (let frame = 0; frame < frames; frame++) {
    animator.beginFrame(startMs + frame * step);
    drawn.push(animator.track(3, HANDLE, set, state, -1, 40, 60, 6));
    animator.endFrame();
  }
  return drawn;
}

describe('EntityAnimator frame timing', () => {
  it('runs its first frame at frame zero rather than jumping', () => {
    const animator = new EntityAnimator();
    animator.beginFrame(123_456);
    expect(animator.track(3, HANDLE, SET, AnimationState.Move, -1, 0, 0, 6)).toBe(0);
    expect(animator.lastDeltaMs).toBe(0);
  });

  /**
   * The measurement #150 asks for rather than an assumption: at any refresh
   * rate, the pose drawn on a frame is the pose the clip is at that many
   * *milliseconds* in. 144 Hz draws each pose more times than 60 Hz does; it
   * does not reach the next one sooner.
   *
   * Asserted against `clipFrameAt` at the frame's own wall time rather than by
   * comparing the two rates to each other, which also pins down the thing a
   * rate-to-rate comparison would let through: an animator that drifted by the
   * same amount at both rates.
   */
  it.each([60, 144, 30, 240])('advances on wall time, not on frames, at %iHz', (hz) => {
    const move = SET.clips[AnimationState.Move] ?? SET.idle;
    const step = 1000 / hz;
    // Two and a bit cycles of the 440 ms walk clip, at every rate.
    const drawn = play(new EntityAnimator(), hz, Math.round(hz) + 1);
    for (let frame = 0; frame < drawn.length; frame++) {
      expect(drawn[frame]).toBe(clipFrameAt(move, frame * step));
    }
  });

  it('completes exactly as many walk cycles per second at 144Hz as at 60Hz', () => {
    // A cycle boundary is a return to frame 0 from frame 3. Counting them is
    // the coarse version of the check above, and the one that would have caught
    // an animator advancing one frame per rendered frame: at 144 Hz that reads
    // 2.4x fast, which is the exact failure mode the issue names.
    const cyclesAt = (hz: number): number => {
      const frames = play(new EntityAnimator(), hz, Math.round(hz) + 1);
      let cycles = 0;
      for (let frame = 1; frame < frames.length; frame++) {
        if (frames[frame] === 0 && frames[frame - 1] === 3) {
          cycles += 1;
        }
      }
      return cycles;
    };
    // 1000 ms / 440 ms is 2.27 cycles, so two boundaries either way.
    expect(cyclesAt(144)).toBe(2);
    expect(cyclesAt(60)).toBe(2);
  });

  it('drops a stall rather than fast-forwarding a clip through it', () => {
    const animator = new EntityAnimator();
    animator.beginFrame(0);
    animator.track(3, HANDLE, SET, AnimationState.Move, -1, 0, 0, 6);
    animator.endFrame();
    // A tab backgrounded for four seconds.
    animator.beginFrame(4000);
    expect(animator.lastDeltaMs).toBe(MAX_FRAME_DELTA_MS);
  });

  it('ignores a clock that jumps backwards', () => {
    const animator = new EntityAnimator();
    animator.beginFrame(1000);
    animator.beginFrame(900);
    expect(animator.lastDeltaMs).toBe(0);
  });
});

describe('EntityAnimator clip transitions', () => {
  it('restarts the clip when the simulation changes state', () => {
    const animator = new EntityAnimator();
    play(animator, 60, 20);
    animator.beginFrame(20 * (1000 / 60));
    // Mid-stride, then hit: the flinch starts from its own first frame rather
    // than from wherever the walk cycle had got to.
    expect(animator.track(3, HANDLE, SET, AnimationState.Hurt, -1, 0, 0, 6)).toBe(4);
  });

  it('hands a finished onEnd:idle clip back to idle', () => {
    const animator = new EntityAnimator();
    // The hurt clip is 90 ms; hold `hurt` for longer than that, which is what a
    // multi-tick hit-stun does.
    const frames = play(animator, 60, 12, AnimationState.Hurt);
    expect(frames[0]).toBe(4);
    expect(frames.at(-1)).toBe(0);
    expect(animator.requestedStateOf(3)).toBe(AnimationState.Hurt);
    expect(animator.playingStateOf(3)).toBe(AnimationState.Idle);
  });

  it('holds a state whose clip is not authored on idle, and says so once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const animator = new EntityAnimator();
      play(animator, 60, 5, AnimationState.Move, IDLE_ONLY);
      play(animator, 60, 5, AnimationState.Telegraph, IDLE_ONLY, 200);
      // Once per (sprite, state), not per frame and not per body: it is one gap
      // in the authored data however many frames walk into it.
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[0]?.[0]).toMatch(/halbdrawn has no "move" clip/);
      expect(animator.playingStateOf(3)).toBe(AnimationState.Idle);
      expect(animator.requestedStateOf(3)).toBe(AnimationState.Telegraph);
    } finally {
      warn.mockRestore();
    }
  });

  it('starts a recycled slot from frame zero rather than inheriting a stride', () => {
    const animator = new EntityAnimator();
    play(animator, 60, 20);
    const midStride = animator.frameOf(3);
    expect(midStride).toBeGreaterThan(0);

    // Same slot, next generation: a different creature took the storage over.
    animator.beginFrame(21 * (1000 / 60));
    expect(animator.track(3, HANDLE + 0x100000, SET, AnimationState.Move, -1, 0, 0, 6)).toBe(0);
  });

  it('keeps the last facing when the body stops having an opinion', () => {
    const animator = new EntityAnimator();
    animator.beginFrame(0);
    animator.track(3, HANDLE, SET, AnimationState.Move, 1, 0, 0, 6);
    animator.endFrame();
    animator.beginFrame(16);
    animator.track(3, HANDLE, SET, AnimationState.Idle, 0, 0, 0, 6);
    expect(animator.facingOf(3)).toBe(1);
  });
});

describe('EntityAnimator corpses', () => {
  function killAfter(animator: EntityAnimator, set = SET): void {
    animator.beginFrame(0);
    animator.track(3, HANDLE, set, AnimationState.Move, -1, 40, 60, 6);
    animator.endFrame();
    // A frame in which the body is not reported: the simulation freed it.
    animator.beginFrame(16);
    animator.endFrame();
  }

  it('plays a death clip on a body that has left the world', () => {
    const animator = new EntityAnimator();
    killAfter(animator);
    // The corpse table is compacted at the start of a frame, so the corpse
    // becomes drawable on the frame after the one that noticed the death.
    animator.beginFrame(32);
    expect(animator.corpseCount).toBe(1);
    const corpse = animator.corpseSlotAt(0);
    expect(animator.corpseSetAt(corpse)?.name).toBe('crawler');
    expect(animator.corpseXAt(corpse)).toBe(40);
    expect(animator.corpseYAt(corpse)).toBe(60);
    expect(animator.corpseRadiusAt(corpse)).toBe(6);
    expect(animator.corpseFrameAt(corpse)).toBe(5);
  });

  it('walks the death clip and then retires the corpse', () => {
    const animator = new EntityAnimator();
    killAfter(animator);
    let nowMs = 32;
    const seen: number[] = [];
    // The death clip is 300 ms and the linger is on top of it.
    while (nowMs < 300 + CORPSE_LINGER_MS + 100) {
      animator.beginFrame(nowMs);
      if (animator.corpseCount > 0) {
        seen.push(animator.corpseFrameAt(animator.corpseSlotAt(0)));
      }
      nowMs += 16;
    }
    expect(seen[0]).toBe(5);
    expect(seen).toContain(6);
    expect(seen.at(-1)).toBe(7);
    expect(animator.corpseCount).toBe(0);
  });

  it('fades a corpse out rather than popping it', () => {
    const animator = new EntityAnimator();
    killAfter(animator);
    animator.beginFrame(32);
    expect(animator.corpseAlphaAt(animator.corpseSlotAt(0))).toBe(1);
    // Stepped rather than jumped: `beginFrame` clamps a large delta
    // (`MAX_FRAME_DELTA_MS`), so a corpse cannot be fast-forwarded by moving
    // the clock, only by frames actually happening.
    let nowMs = 32;
    while (nowMs < 300 + CORPSE_LINGER_MS - 40) {
      nowMs += 16;
      animator.beginFrame(nowMs);
    }
    const alpha = animator.corpseAlphaAt(animator.corpseSlotAt(0));
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeGreaterThan(0);
  });

  it('leaves no corpse for a creature with no death clip authored', () => {
    const animator = new EntityAnimator();
    killAfter(animator, IDLE_ONLY);
    animator.beginFrame(32);
    // Silently, and deliberately: vanishing is what every enemy in the game
    // did before death clips existed.
    expect(animator.corpseCount).toBe(0);
  });

  it('overwrites the oldest corpse rather than growing past its capacity', () => {
    const animator = new EntityAnimator();
    animator.beginFrame(0);
    for (let slot = 0; slot < CORPSE_CAPACITY + 4; slot++) {
      animator.track(slot, HANDLE + slot, SET, AnimationState.Move, -1, slot, 0, 6);
    }
    animator.endFrame();
    animator.beginFrame(16);
    animator.endFrame();
    animator.beginFrame(32);
    expect(animator.corpseCount).toBe(CORPSE_CAPACITY);
    expect(animator.corpseOverflows).toBe(4);
  });

  it('forgets every corpse and every clip phase on a room change', () => {
    const animator = new EntityAnimator();
    killAfter(animator);
    animator.beginFrame(32);
    expect(animator.corpseCount).toBe(1);
    animator.reset();
    expect(animator.corpseCount).toBe(0);
    expect(animator.trackedCount).toBe(0);
    expect(animator.setOf(3)).toBeNull();
  });

  it('does not mistake a room unloading for a room of deaths', () => {
    const animator = new EntityAnimator();
    animator.beginFrame(0);
    for (let slot = 0; slot < 6; slot++) {
      animator.track(slot, HANDLE + slot, SET, AnimationState.Move, -1, slot, 0, 6);
    }
    animator.endFrame();
    // What `GameView` does when `sim.room` changes, before drawing anything.
    animator.reset();
    animator.beginFrame(16);
    animator.endFrame();
    animator.beginFrame(32);
    expect(animator.corpseCount).toBe(0);
  });
});

/**
 * The `@hot` half of the animator's contract.
 *
 * A budget well above the instrument's own floor (`tests/helpers/allocation.ts`
 * reads about 0.3 KB for a loop that allocates nothing) and far below what the
 * obvious wrong implementation costs: an object per body per frame, or a
 * template-literal warn key on the fallback path, would be tens of kilobytes at
 * this population.
 */
describe('EntityAnimator allocation behaviour', () => {
  const BUDGET_BYTES = 8 * 1024;
  const BODIES = 64;

  it('animates 64 bodies for a second without allocating', () => {
    const animator = new EntityAnimator();
    let nowMs = 0;
    // Warm the tables up first: growing them is the one thing this class
    // allocates for, and it happens once per capacity doubling, not per frame.
    for (let frame = 0; frame < 4; frame++) {
      animator.beginFrame(nowMs);
      for (let slot = 0; slot < BODIES; slot++) {
        animator.track(slot, HANDLE + slot, SET, AnimationState.Move, -1, slot, slot, 6);
      }
      animator.endFrame();
      nowMs += 16;
    }

    const bytes = bytesPerPass(() => {
      for (let frame = 0; frame < 60; frame++) {
        animator.beginFrame(nowMs);
        for (let slot = 0; slot < BODIES; slot++) {
          animator.track(
            slot,
            HANDLE + slot,
            SET,
            // Cycling the state exercises the transition path too, which is
            // where a naive implementation would allocate a clip object.
            frame % 30 === 0 ? AnimationState.Hurt : AnimationState.Move,
            -1,
            slot,
            slot,
            6,
          );
        }
        animator.endFrame();
        nowMs += 16;
      }
    });

    expect(bytes).toBeLessThan(BUDGET_BYTES);
  });
});
