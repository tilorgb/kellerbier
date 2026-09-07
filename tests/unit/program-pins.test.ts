import { describe, expect, it } from 'vitest';
import type { WebGLProgram, WebGLRenderer } from 'three';
import { ProgramPins } from '../../src/render/world/program-pins.js';

/**
 * `ProgramPins` (`docs/DECISIONS.md` #80): once a shader program has been
 * linked it holds one extra reference for the life of the renderer, so
 * disposing the last material that used it can never take three.js's count
 * to zero and `gl.deleteProgram` it — which is what made every room crossing
 * relink programs the previous room had just released.
 */
function fakeProgram(): WebGLProgram & { settled: number } {
  const program = {
    usedTimes: 1,
    settled: 0,
    getUniforms() {
      program.settled += 1;
    },
  };
  return program as unknown as WebGLProgram & { settled: number };
}

function fakeRenderer(programs: WebGLProgram[] | null): WebGLRenderer {
  return { info: { programs } } as unknown as WebGLRenderer;
}

describe('ProgramPins', () => {
  it("bumps each program's reference count exactly once, however often it is fed", () => {
    const pins = new ProgramPins();
    const a = fakeProgram();
    const b = fakeProgram();
    const renderer = fakeRenderer([a, b]);
    expect(pins.pin(renderer)).toBe(2);
    expect(a.usedTimes).toBe(2);
    expect(b.usedTimes).toBe(2);
    expect(pins.pin(renderer)).toBe(0);
    expect(pins.pin(renderer)).toBe(0);
    expect(a.usedTimes).toBe(2);
  });

  it('picks up programs linked later without touching the ones already pinned', () => {
    const pins = new ProgramPins();
    const a = fakeProgram();
    const list = [a];
    const renderer = fakeRenderer(list);
    pins.pin(renderer);
    // A material's last user is disposed: three decrements. Pinned, it stays
    // above zero, so the program survives.
    a.usedTimes -= 1;
    expect(a.usedTimes).toBe(1);
    const late = fakeProgram();
    list.push(late);
    expect(pins.pin(renderer)).toBe(1);
    expect(a.usedTimes).toBe(1);
    expect(late.usedTimes).toBe(2);
  });

  it('settles newly pinned programs a few per call, each exactly once, in pin order', () => {
    const pins = new ProgramPins();
    const programs = [fakeProgram(), fakeProgram(), fakeProgram()];
    pins.pin(fakeRenderer(programs));
    expect(pins.settle(2)).toBe(2);
    expect(programs.map((p) => p.settled)).toEqual([1, 1, 0]);
    expect(pins.settle(2)).toBe(1);
    expect(programs.map((p) => p.settled)).toEqual([1, 1, 1]);
    expect(pins.settle(2)).toBe(0);
    // Re-pinning the same list queues nothing new.
    pins.pin(fakeRenderer(programs));
    expect(pins.settle()).toBe(0);
  });

  it('is a no-op on a renderer that reports no program list', () => {
    expect(new ProgramPins().pin(fakeRenderer(null))).toBe(0);
  });
});
