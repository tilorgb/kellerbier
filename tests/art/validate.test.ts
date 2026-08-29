import { describe, expect, it } from 'vitest';
import {
  brightestOpaqueColor,
  darkestOpaqueColor,
  findOffPalettePixel,
  validateAnimation,
  validateSpriteSize,
} from '../../tools/art/validate.mjs';
import { relativeLuminance } from '../../tools/art/contrast.mjs';

function pixel(r: number, g: number, b: number, a: number): [number, number, number, number] {
  return [r, g, b, a];
}

function buildPixels(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number, number],
): Buffer {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const [r, g, b, a] = colorAt(x, y);
      pixels[index] = r;
      pixels[index + 1] = g;
      pixels[index + 2] = b;
      pixels[index + 3] = a;
    }
  }
  return pixels;
}

describe('validateSpriteSize', () => {
  it('accepts an exact 16x16 tile', () => {
    expect(validateSpriteSize('tile', 16, 16)).toBeNull();
  });

  it('rejects a tile of any other size', () => {
    expect(validateSpriteSize('tile', 32, 32)).toMatch(/outside the "tile" spec/);
    expect(validateSpriteSize('tile', 17, 16)).not.toBeNull();
  });

  it('accepts a 12x16 character and rejects a short one', () => {
    expect(validateSpriteSize('character', 12, 16)).toBeNull();
    expect(validateSpriteSize('character', 12, 10)).not.toBeNull();
  });

  // docs/DECISIONS.md #26 raised character's height ceiling 16 -> 32, then #45
  // raised it again to 48: a character canvas is now its size on screen, and
  // 48 is a `mid` body's 40px collider plus headroom.
  it('accepts a taller character up to 48 and rejects one past it', () => {
    expect(validateSpriteSize('character', 16, 48)).toBeNull();
    expect(validateSpriteSize('character', 16, 49)).not.toBeNull();
  });

  // docs/DECISIONS.md #27 raised character's width ceiling 16 -> 32 so a
  // wide-bellied character was not capped a third as wide as it was allowed to
  // be tall; #45 raised it to 64, the width the widest bodies in the roster —
  // Kuh, Traktor — actually need now that a canvas is a size.
  it('accepts a wider character up to 64 and rejects one past it', () => {
    expect(validateSpriteSize('character', 64, 20)).toBeNull();
    expect(validateSpriteSize('character', 65, 20)).not.toBeNull();
  });

  // docs/DECISIONS.md #26: boss ceiling raised 48x48 -> 160x160.
  it('accepts a boss up to 160x160 and rejects an oversized one', () => {
    expect(validateSpriteSize('boss', 160, 160)).toBeNull();
    expect(validateSpriteSize('boss', 161, 100)).not.toBeNull();
  });

  it('divides a strip by its frame count before checking each frame', () => {
    // 8 frames of a 12x16 character strip.
    expect(validateSpriteSize('character', 96, 16, 8)).toBeNull();
    // Same total width, wrong frame count: each "frame" would be 96 wide,
    // past the (post-#45) 64 ceiling.
    expect(validateSpriteSize('character', 192, 16, 2)).toMatch(/frame size 96x16/);
  });

  it('rejects a strip whose width does not divide evenly', () => {
    expect(validateSpriteSize('character', 50, 16, 4)).toMatch(/does not divide evenly/);
  });

  it('rejects an unknown category', () => {
    expect(validateSpriteSize('vehicle', 16, 16)).toMatch(/unknown sprite category/);
  });
});

describe('findOffPalettePixel', () => {
  const allowed = new Set([0x102030]);

  it('finds nothing when every opaque pixel is on-palette', () => {
    const pixels = buildPixels(2, 2, () => pixel(0x10, 0x20, 0x30, 255));
    expect(findOffPalettePixel(pixels, 2, 2, allowed)).toBeNull();
  });

  it('reports the coordinates and colour of the first off-palette pixel', () => {
    const pixels = buildPixels(2, 2, (x, y) =>
      x === 1 && y === 1 ? pixel(0xff, 0x00, 0x00, 255) : pixel(0x10, 0x20, 0x30, 255),
    );
    expect(findOffPalettePixel(pixels, 2, 2, allowed)).toEqual({ x: 1, y: 1, color: 0xff0000 });
  });

  it('ignores fully transparent pixels regardless of their stored colour', () => {
    const pixels = buildPixels(2, 2, () => pixel(0xff, 0x00, 0x00, 0));
    expect(findOffPalettePixel(pixels, 2, 2, allowed)).toBeNull();
  });
});

describe('brightestOpaqueColor', () => {
  it('picks the highest-luminance opaque pixel', () => {
    const pixels = buildPixels(2, 1, (x) =>
      x === 0 ? pixel(0x10, 0x10, 0x10, 255) : pixel(0xff, 0xff, 0xff, 255),
    );
    expect(brightestOpaqueColor(pixels, 2, 1, relativeLuminance)).toBe(0xffffff);
  });

  it('skips transparent pixels even if they would otherwise win', () => {
    const pixels = buildPixels(2, 1, (x) =>
      x === 0 ? pixel(0xff, 0xff, 0xff, 0) : pixel(0x40, 0x40, 0x40, 255),
    );
    expect(brightestOpaqueColor(pixels, 2, 1, relativeLuminance)).toBe(0x404040);
  });

  it('returns null for a fully transparent sprite', () => {
    const pixels = buildPixels(2, 1, () => pixel(0xff, 0xff, 0xff, 0));
    expect(brightestOpaqueColor(pixels, 2, 1, relativeLuminance)).toBeNull();
  });
});

describe('validateAnimation', () => {
  it('accepts a well-formed sidecar with a shared frame duration', () => {
    expect(validateAnimation({ frames: 4, frameDurationMs: 120, loop: true })).toBeNull();
  });

  it('accepts one duration per frame', () => {
    expect(
      validateAnimation({ frames: 3, frameDurationMs: [100, 100, 140], loop: false }),
    ).toBeNull();
  });

  it('rejects a duration array with the wrong length', () => {
    expect(validateAnimation({ frames: 4, frameDurationMs: [100, 100], loop: true })).toMatch(
      /frameDurationMs.*2 entries for 4 frames/,
    );
  });

  it('rejects a non-positive frame count', () => {
    expect(validateAnimation({ frames: 0, frameDurationMs: 100, loop: true })).toMatch(/frames/);
  });

  it('rejects a missing loop flag', () => {
    expect(validateAnimation({ frames: 2, frameDurationMs: 100 })).toMatch(/loop/);
  });
});

/**
 * Clip validation (#150). Everything here is decidable from the sidecar alone,
 * which is exactly why it belongs in the build rather than only at runtime:
 * `docs/DECISIONS.md` #7's line is that data whose *shape* is wrong fails CI,
 * and only a gap in what has been authored degrades gracefully in a running
 * game.
 */
describe('validateAnimation, on clips', () => {
  const strip = { frames: 8, frameDurationMs: 120, loop: true };
  const idle = { frames: [0], frameDurationMs: 400, mode: 'loop' };

  it('accepts a full set of clips over the strip', () => {
    expect(
      validateAnimation({
        ...strip,
        clips: {
          idle,
          move: { frames: [0, 1, 2, 3], frameDurationMs: [110, 110, 110, 110], mode: 'loop' },
          telegraph: { frames: [4], frameDurationMs: 120, mode: 'pingPong' },
          hurt: { frames: [5], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
          death: { frames: [5, 6, 7], frameDurationMs: 110, mode: 'once', onEnd: 'hold' },
        },
      }),
    ).toBeNull();
  });

  it('accepts a sidecar with no clips at all — every one written before they existed', () => {
    expect(validateAnimation(strip)).toBeNull();
  });

  it('rejects a frame index the strip does not have', () => {
    expect(
      validateAnimation({ ...strip, clips: { idle, move: { ...idle, frames: [8] } } }),
    ).toMatch(/frame index 8 is outside the strip/);
  });

  it('rejects a negative frame index', () => {
    expect(
      validateAnimation({ ...strip, clips: { idle, move: { ...idle, frames: [-1] } } }),
    ).toMatch(/frame index -1 is outside the strip/);
  });

  it('rejects a clip named after something no state resolves to', () => {
    expect(validateAnimation({ ...strip, clips: { idle, walk: idle } })).toMatch(
      /"clips.walk" is not an animation state/,
    );
  });

  it('rejects a clip set with no idle to fall back to', () => {
    expect(validateAnimation({ ...strip, clips: { move: idle } })).toMatch(
      /must include an "idle"/,
    );
  });

  it('rejects an empty clip', () => {
    expect(validateAnimation({ ...strip, clips: { idle, move: { ...idle, frames: [] } } })).toMatch(
      /non-empty array of frame indices/,
    );
  });

  it('rejects a per-frame duration list that does not match the clip length', () => {
    expect(
      validateAnimation({
        ...strip,
        clips: { idle, move: { frames: [0, 1], frameDurationMs: [100], mode: 'loop' } },
      }),
    ).toMatch(/1 entries for 2 clip frames/);
  });

  it('rejects an unknown playback mode', () => {
    expect(
      validateAnimation({ ...strip, clips: { idle, move: { ...idle, mode: 'boomerang' } } }),
    ).toMatch(/"mode" must be one of/);
  });

  it('rejects onEnd on a clip that never ends', () => {
    expect(validateAnimation({ ...strip, clips: { idle: { ...idle, onEnd: 'hold' } } })).toMatch(
      /only means something on a "once" clip/,
    );
  });

  it('rejects an unknown onEnd', () => {
    expect(
      validateAnimation({
        ...strip,
        clips: { idle, death: { ...idle, mode: 'once', onEnd: 'explode' } },
      }),
    ).toMatch(/"onEnd" must be one of/);
  });

  it('rejects clips authored as an array rather than a map of states', () => {
    expect(validateAnimation({ ...strip, clips: [idle] })).toMatch(
      /"clips" must be an object keyed by animation state/,
    );
  });
});

describe('darkestOpaqueColor', () => {
  it('finds the darkest opaque pixel', () => {
    const pixels = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x10, 0x10, 0x10, 0xff]);
    expect(darkestOpaqueColor(pixels, 2, 1, relativeLuminance)).toBe(0x101010);
  });

  it('ignores transparent pixels, however dark', () => {
    const pixels = Buffer.from([0x40, 0x40, 0x40, 0xff, 0x00, 0x00, 0x00, 0x00]);
    expect(darkestOpaqueColor(pixels, 2, 1, relativeLuminance)).toBe(0x404040);
  });

  it('is null for a fully transparent sprite', () => {
    const pixels = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(darkestOpaqueColor(pixels, 2, 1, relativeLuminance)).toBeNull();
  });
});
