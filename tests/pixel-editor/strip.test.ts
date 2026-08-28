import { describe, expect, it } from 'vitest';
import { buildStrip } from '../../tools/pixel-editor/strip.mjs';

function solid(
  width: number,
  height: number,
  byte: number,
): { width: number; height: number; pixels: Buffer } {
  return { width, height, pixels: Buffer.alloc(width * height * 4, byte) };
}

describe('buildStrip', () => {
  it('throws for an empty frame list', () => {
    expect(() => buildStrip([])).toThrow(/at least one frame/);
  });

  it('lays frames edge to edge with no padding, width dividing evenly by frame count', () => {
    const frames = [solid(4, 4, 1), solid(4, 4, 2), solid(4, 4, 3)];
    const strip = buildStrip(frames);
    expect(strip.width).toBe(12);
    expect(strip.height).toBe(4);
    expect(strip.width / frames.length).toBe(4);
  });

  it('preserves each frame at its own offset, in authoring order', () => {
    const frames = [
      Buffer.from([255, 0, 0, 255, 255, 0, 0, 255]), // 2x1 red
      Buffer.from([0, 255, 0, 255, 0, 255, 0, 255]), // 2x1 green
    ].map((pixels) => ({ width: 2, height: 1, pixels }));
    const strip = buildStrip(frames);
    expect(strip.width).toBe(4);
    expect(strip.height).toBe(1);

    const pixelAt = (x: number) => {
      const index = x * 4;
      return [strip.pixels[index], strip.pixels[index + 1], strip.pixels[index + 2]];
    };
    expect(pixelAt(0)).toEqual([255, 0, 0]);
    expect(pixelAt(1)).toEqual([255, 0, 0]);
    expect(pixelAt(2)).toEqual([0, 255, 0]);
    expect(pixelAt(3)).toEqual([0, 255, 0]);
  });
});
