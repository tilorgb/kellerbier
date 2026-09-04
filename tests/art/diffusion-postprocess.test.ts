import { describe, expect, it } from 'vitest';
import {
  downscaleBoxFilter,
  paletteForFloor,
  postprocessDiffusionOutput,
  quantizeToPalette,
} from '../../tools/art/diffusion-postprocess.mjs';
import { FLOOR_PALETTES, MASTER_PALETTE, NEUTRAL_PALETTE } from '../../tools/art/palette.mjs';

function solidImage(width: number, height: number, [r, g, b, a]: [number, number, number, number]) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }
  return { width, height, pixels };
}

describe('downscaleBoxFilter', () => {
  it('averages a block down to one pixel', () => {
    // Four source pixels — two black, two white — must average to mid grey,
    // not snap to whichever pixel happened to be scanned first.
    const pixels = Buffer.from([
      0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    ]);
    const image = downscaleBoxFilter({ width: 2, height: 2, pixels }, 1, 1);
    expect(image.width).toBe(1);
    expect(image.height).toBe(1);
    expect(image.pixels[0]).toBe(128);
    expect(image.pixels[1]).toBe(128);
    expect(image.pixels[2]).toBe(128);
    expect(image.pixels[3]).toBe(255);
  });

  it('rejects a target size that does not evenly divide the source', () => {
    const image = solidImage(10, 10, [1, 2, 3, 255]);
    expect(() => downscaleBoxFilter(image, 3, 3)).toThrow(/does not divide evenly/);
  });

  it('ignores fully-transparent pixels when averaging colour', () => {
    // One opaque red pixel and one fully-transparent (garbage-colour) pixel
    // in the same block: the result should read as red, not a colour the
    // transparent pixel dragged it toward.
    const pixels = Buffer.from([255, 0, 0, 255, 10, 200, 30, 0]);
    const image = downscaleBoxFilter({ width: 2, height: 1, pixels }, 1, 1);
    expect(image.pixels[0]).toBe(255);
    expect(image.pixels[1]).toBe(0);
    expect(image.pixels[2]).toBe(0);
  });
});

describe('quantizeToPalette', () => {
  it('snaps every opaque pixel to its nearest palette colour', () => {
    const image = solidImage(1, 1, [10, 10, 10, 255]);
    const result = quantizeToPalette(image, [0x000000, 0xffffff]);
    expect(result.pixels[0]).toBe(0);
    expect(result.pixels[1]).toBe(0);
    expect(result.pixels[2]).toBe(0);
  });

  it('leaves alpha untouched', () => {
    const image = solidImage(1, 1, [10, 10, 10, 137]);
    const result = quantizeToPalette(image, [0x000000, 0xffffff]);
    expect(result.pixels[3]).toBe(137);
  });
});

describe('paletteForFloor', () => {
  it('returns the master palette when no floor is given', () => {
    expect(paletteForFloor(null)).toBe(MASTER_PALETTE);
  });

  it("returns a floor's own hues plus the shared neutrals", () => {
    const palette = paletteForFloor('wald');
    for (const color of FLOOR_PALETTES.wald) {
      expect(palette).toContain(color);
    }
    for (const color of NEUTRAL_PALETTE) {
      expect(palette).toContain(color);
    }
  });

  it('rejects an unknown floor tag', () => {
    expect(() => paletteForFloor('not-a-floor')).toThrow(/unknown floor tag/);
  });
});

describe('postprocessDiffusionOutput', () => {
  it('chains downscale then quantize into a grid-aligned, on-palette candidate', () => {
    const image = solidImage(4, 4, [200, 10, 10, 255]);
    const palette = [0x3f7a3a, 0xffffff];
    const result = postprocessDiffusionOutput(image, { targetWidth: 2, targetHeight: 2, palette });
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    for (let i = 0; i < result.pixels.length; i += 4) {
      const hex =
        ((result.pixels[i] ?? 0) << 16) |
        ((result.pixels[i + 1] ?? 0) << 8) |
        (result.pixels[i + 2] ?? 0);
      expect(palette).toContain(hex);
    }
  });
});
