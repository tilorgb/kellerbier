import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedTimestepLoop, runAnimationFrameLoop } from '../../src/app/loop.js';
import { ActiveRunRecorder } from '../../src/app/save/active-run.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

/**
 * #520: one exception used to stop the frame loop for good, and the input of
 * the tick that threw stayed in the saved log for a resume to replay into.
 */

/** A hand-cranked `requestAnimationFrame`: `fire` runs whatever is queued. */
function fakeAnimationFrames(): { fire: (nowMs: number) => void; pending: () => number } {
  let queued: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queued.push(callback);
    return queued.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    queued = [];
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  return {
    fire: (nowMs) => {
      const now = queued;
      queued = [];
      for (const callback of now) {
        callback(nowMs);
      }
    },
    pending: () => queued.length,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the frame loop survives an exception (#520)', () => {
  it('keeps requesting frames after a step throws, and reports the error', () => {
    const frames = fakeAnimationFrames();
    let ticks = 0;
    let throwOnce = true;
    const loop = new FixedTimestepLoop({
      step: () => {
        if (ticks === 3 && throwOnce) {
          throwOnce = false;
          throw new Error('boom');
        }
        ticks += 1;
      },
      render: () => undefined,
    });
    const errors: unknown[] = [];
    const stop = runAnimationFrameLoop(loop, (error) => {
      errors.push(error);
    });
    for (let frame = 0; frame <= 20; frame++) {
      frames.fire((frame * 1000) / 60);
    }
    expect(errors).toHaveLength(1);
    expect(frames.pending()).toBe(1);
    // The loop went on stepping after the throw.
    expect(ticks).toBeGreaterThan(10);
    stop();
  });

  it('keeps going when the render throws every frame', () => {
    const frames = fakeAnimationFrames();
    const loop = new FixedTimestepLoop({
      step: () => undefined,
      render: () => {
        throw new Error('render');
      },
    });
    let errors = 0;
    runAnimationFrameLoop(loop, () => {
      errors += 1;
    });
    for (let frame = 0; frame < 5; frame++) {
      frames.fire(frame * 16);
    }
    expect(errors).toBe(5);
    expect(frames.pending()).toBe(1);
  });
});

describe('a tick that threw leaves the saved log (#520)', () => {
  it('dropLastFrame takes back exactly the last frame', () => {
    const recorder = new ActiveRunRecorder(7);
    const frame = createInputFrame();
    for (let tick = 0; tick < 3; tick++) {
      frame.moveX = tick;
      recorder.record(frame);
    }
    recorder.dropLastFrame();
    expect(recorder.frameCount).toBe(2);
    expect(recorder.toSave().frames.slice(-5)[0]).toBe(1);
    recorder.dropLastFrame();
    recorder.dropLastFrame();
    recorder.dropLastFrame();
    expect(recorder.frameCount).toBe(0);
  });
});
