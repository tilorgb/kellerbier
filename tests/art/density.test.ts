import { describe, expect, it } from 'vitest';
import { parseDensity } from '../../tools/art/scan.mjs';
import { validateSpriteSize } from '../../tools/art/validate.mjs';
import { textureFromPixels } from '../../src/render/gfx/index.js';

describe('hi-res sprites (@2x)', () => {
  it('splits the density suffix off the name', () => {
    expect(parseDensity('kuh@2x')).toEqual({ name: 'kuh', density: 2 });
    expect(parseDensity('kuh')).toEqual({ name: 'kuh', density: 1 });
    expect(parseDensity('alois-walk-side@3x')).toEqual({ name: 'alois-walk-side', density: 3 });
  });

  it('checks the size spec on the base grid, not on the texel count', () => {
    // 64x96 at @2x stands 32x48 — inside the character spec.
    expect(validateSpriteSize('character', 64, 96, 1, 2)).toBeNull();
    // 128x128 at @2x stands 64x64 — too tall, exactly as a 64x64 1x sprite would be.
    expect(validateSpriteSize('character', 128, 128, 1, 2)).toMatch(/outside the "character" spec/);
    expect(validateSpriteSize('character', 64, 64)).toMatch(/outside the "character" spec/);
  });

  it('checks every frame of a hi-res strip on the base grid', () => {
    expect(validateSpriteSize('character', 4 * 32, 64, 4, 2)).toBeNull();
  });

  it('rejects a hi-res frame that does not divide by its density', () => {
    expect(validateSpriteSize('character', 33, 64, 1, 2)).toMatch(/does not divide evenly/);
  });

  it('a texture reports its base-grid size separately from its texel size', () => {
    const texture = textureFromPixels(32, 64, new Int32Array(32 * 64).fill(-1)).withDensity(2);
    expect(texture.width).toBe(32);
    expect(texture.displayWidth).toBe(16);
    expect(texture.displayHeight).toBe(32);
    // A frame cut out of a hi-res strip keeps the strip's density.
    expect(texture.sub(0, 0, 16, 64).displayWidth).toBe(8);
  });
});
