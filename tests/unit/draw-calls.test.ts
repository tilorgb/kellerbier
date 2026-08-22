import { describe, expect, it, vi } from 'vitest';
import { DrawCallCounter } from '../../src/debug/draw-calls.js';

/** The two entry points Pixi actually issues geometry through. */
function fakeContext(): { drawElements: () => void; drawArrays: () => void; calls: number } {
  const context = {
    calls: 0,
    drawElements(): void {
      context.calls += 1;
    },
    drawArrays(): void {
      context.calls += 1;
    },
  };
  return context;
}

describe('DrawCallCounter', () => {
  it('counts both kinds of draw call, and still issues them', () => {
    const counter = new DrawCallCounter();
    const gl = fakeContext();
    expect(counter.attach(gl)).toBe(true);

    counter.beginFrame();
    gl.drawElements();
    gl.drawElements();
    gl.drawArrays();
    counter.beginFrame();

    expect(counter.lastFrameCalls).toBe(3);
    // The wrapper is transparent: the real calls still happened.
    expect(gl.calls).toBe(3);
  });

  it('reports per frame rather than cumulatively', () => {
    const counter = new DrawCallCounter();
    const gl = fakeContext();
    counter.attach(gl);

    counter.beginFrame();
    gl.drawElements();
    counter.beginFrame();
    expect(counter.lastFrameCalls).toBe(1);

    gl.drawElements();
    gl.drawElements();
    counter.beginFrame();
    expect(counter.lastFrameCalls).toBe(2);
  });

  it('says it cannot count rather than reporting a plausible wrong number', () => {
    const counter = new DrawCallCounter();
    // WebGPU, or a renderer that exposes no context at all.
    expect(counter.attach(null)).toBe(false);
    expect(counter.attach({})).toBe(false);
    expect(counter.instrumented).toBe(false);
    expect(counter.lastFrameCalls).toBe(-1);
  });

  it('puts the context back the way it found it', () => {
    const counter = new DrawCallCounter();
    const gl = fakeContext();
    const original = gl.drawElements;
    counter.attach(gl);
    expect(gl.drawElements).not.toBe(original);

    counter.detach();
    expect(gl.drawElements).toBe(original);
    expect(counter.instrumented).toBe(false);
  });

  it('is safe to detach twice', () => {
    const counter = new DrawCallCounter();
    counter.attach(fakeContext());
    counter.detach();
    expect(() => {
      counter.detach();
    }).not.toThrow();
  });
});

describe('the counter is only ever wired up by the overlay', () => {
  it('does nothing at all until it is attached', () => {
    const counter = new DrawCallCounter();
    const spy = vi.fn();
    counter.beginFrame();
    expect(spy).not.toHaveBeenCalled();
    expect(counter.lastFrameCalls).toBe(-1);
  });
});
