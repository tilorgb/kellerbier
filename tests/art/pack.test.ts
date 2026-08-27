import { describe, expect, it } from 'vitest';
import { packSprites } from '../../tools/art/pack.mjs';

function solid(width: number, height: number, byte: number): Buffer {
  return Buffer.alloc(width * height * 4, byte);
}

describe('packSprites', () => {
  it('returns null for an empty bucket', () => {
    expect(packSprites([])).toBeNull();
  });

  it('places every sprite without overlap, inside a power-of-two atlas', () => {
    const sprites = [
      { key: 'a', width: 16, height: 16, pixels: solid(16, 16, 1) },
      { key: 'b', width: 16, height: 16, pixels: solid(16, 16, 2) },
      { key: 'c', width: 12, height: 16, pixels: solid(12, 16, 3) },
    ];
    const atlas = packSprites(sprites);
    expect(atlas).not.toBeNull();
    if (atlas === null) {
      return;
    }
    expect(Math.log2(atlas.width) % 1).toBe(0);
    expect(Math.log2(atlas.height) % 1).toBe(0);
    expect(Object.keys(atlas.frames).sort()).toEqual(['a', 'b', 'c']);

    // No two placed rectangles overlap.
    const rects = Object.values(atlas.frames);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a === undefined || b === undefined) {
          continue;
        }
        const overlaps =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("copies each sprite's pixels into the atlas at its placement", () => {
    const sprites = [
      {
        key: 'red',
        width: 2,
        height: 2,
        pixels: Buffer.from([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]),
      },
    ];
    const atlas = packSprites(sprites);
    expect(atlas).not.toBeNull();
    if (atlas === null) {
      return;
    }
    const rect = atlas.frames.red;
    expect(rect).toBeDefined();
    if (rect === undefined) {
      return;
    }
    const index = (rect.y * atlas.width + rect.x) * 4;
    expect([
      atlas.pixels[index],
      atlas.pixels[index + 1],
      atlas.pixels[index + 2],
      atlas.pixels[index + 3],
    ]).toEqual([255, 0, 0, 255]);
  });
});
