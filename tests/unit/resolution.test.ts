import { describe, expect, it } from 'vitest';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, computeViewport } from '../../src/render/resolution.js';

describe('computeViewport', () => {
  it('uses 1x when the window is exactly the internal resolution', () => {
    const viewport = computeViewport(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    expect(viewport.scale).toBe(1);
    expect(viewport.letterboxX).toBe(0);
    expect(viewport.letterboxY).toBe(0);
  });

  it('never picks a fractional scale', () => {
    for (let width = 640; width <= 3840; width += 7) {
      const viewport = computeViewport(width, 2160);
      expect(Number.isInteger(viewport.scale)).toBe(true);
    }
  });

  it('floors to the largest scale that still fits both axes', () => {
    // 2.99x horizontally, 2.5x vertically -> 2x.
    expect(computeViewport(1914, 900).scale).toBe(2);
  });

  it('letterboxes the remainder', () => {
    const viewport = computeViewport(1920, 1080);
    expect(viewport.scale).toBe(3);
    expect(viewport.width).toBe(1920);
    expect(viewport.height).toBe(1080);
    expect(viewport.letterboxX).toBe(0);
    expect(viewport.letterboxY).toBe(0);

    const wide = computeViewport(2000, 1080);
    expect(wide.scale).toBe(3);
    expect(wide.letterboxX).toBe(80);
    expect(wide.letterboxY).toBe(0);
  });

  it('clamps to 1x rather than blurring on an undersized window', () => {
    const viewport = computeViewport(320, 200);
    expect(viewport.scale).toBe(1);
    expect(viewport.width).toBe(INTERNAL_WIDTH);
    expect(viewport.height).toBe(INTERNAL_HEIGHT);
    // Nothing to letterbox — the window crops instead.
    expect(viewport.letterboxX).toBe(0);
    expect(viewport.letterboxY).toBe(0);
  });

  it('honours a caller-supplied internal resolution', () => {
    expect(computeViewport(800, 800, 100, 100).scale).toBe(8);
  });
});
