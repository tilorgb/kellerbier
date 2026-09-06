import { describe, expect, it } from 'vitest';
import { DrawCallCounter } from '../../src/debug/draw-calls.js';

/**
 * A stand-in for the one thing the counter reads: three.js's
 * `renderer.info`, which counts draw calls itself and resets once per
 * `render()` unless told not to.
 */
function fakeRenderer(): {
  info: { autoReset: boolean; render: { calls: number }; reset(): void };
  draw(times: number): void;
} {
  const info = {
    autoReset: true,
    render: { calls: 0 },
    reset(): void {
      info.render.calls = 0;
    },
  };
  return {
    info,
    draw(times: number): void {
      info.render.calls += times;
    },
  };
}

describe('DrawCallCounter', () => {
  it('reports the previous frame at the start of the next', () => {
    const counter = new DrawCallCounter();
    const renderer = fakeRenderer();
    expect(counter.attach(renderer)).toBe(true);

    counter.beginFrame();
    renderer.draw(3);
    counter.beginFrame();
    expect(counter.lastFrameCalls).toBe(3);
  });

  it('reports per frame rather than cumulatively', () => {
    const counter = new DrawCallCounter();
    const renderer = fakeRenderer();
    counter.attach(renderer);

    counter.beginFrame();
    renderer.draw(1);
    counter.beginFrame();
    expect(counter.lastFrameCalls).toBe(1);

    renderer.draw(2);
    counter.beginFrame();
    expect(counter.lastFrameCalls).toBe(2);
  });

  it('turns off the per-render reset so both passes of a frame are counted', () => {
    const counter = new DrawCallCounter();
    const renderer = fakeRenderer();
    counter.attach(renderer);
    // Two `render()` calls a frame (world, then UI): with `autoReset` on, the
    // second would wipe the first's count before anyone read it.
    expect(renderer.info.autoReset).toBe(false);
  });

  it('says it cannot count rather than reporting a plausible wrong number', () => {
    const counter = new DrawCallCounter();
    expect(counter.attach(null)).toBe(false);
    expect(counter.attach({})).toBe(false);
    expect(counter.instrumented).toBe(false);
    expect(counter.lastFrameCalls).toBe(-1);
  });

  it('puts the renderer back the way it found it', () => {
    const counter = new DrawCallCounter();
    const renderer = fakeRenderer();
    counter.attach(renderer);
    counter.detach();
    expect(renderer.info.autoReset).toBe(true);
    expect(counter.instrumented).toBe(false);
    // Detaching twice is harmless.
    counter.detach();
  });
});
