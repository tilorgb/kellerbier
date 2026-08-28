import { describe, expect, it } from 'vitest';
import {
  allowedColorsFor,
  FLOOR_PALETTES,
  legalPixelColorsFor,
  MASTER_PALETTE,
  NEUTRAL_PALETTE,
  nudgeShade,
  shadeOf,
  shadeRampOf,
} from '../../tools/art/palette.mjs';
import { relativeLuminance } from '../../tools/art/contrast.mjs';
import { FLOOR_BUCKETS } from '../../tools/art/spec.mjs';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';

describe('the master palette', () => {
  it('caps out around 40 colours, per docs/CONTENT_BIBLE.md §5', () => {
    expect(MASTER_PALETTE.length).toBeGreaterThan(30);
    expect(MASTER_PALETTE.length).toBeLessThanOrEqual(45);
  });

  it('has no duplicate colours across floors and neutrals', () => {
    const all = [...NEUTRAL_PALETTE, ...Object.values(FLOOR_PALETTES).flat()];
    expect(new Set(all).size).toBe(all.length);
  });

  it('stays in sync with the floor list in src/content/floors/definition.ts', () => {
    const contentTags = FLOOR_CONFIGS.map((config) => config.floorTag).sort();
    const artTags = FLOOR_BUCKETS.map((bucket) => bucket.floorTag).sort();
    expect(artTags).toEqual(contentTags);
  });
});

describe('allowedColorsFor', () => {
  it('gives the common bucket the whole master palette', () => {
    const allowed = allowedColorsFor('common');
    for (const color of MASTER_PALETTE) {
      expect(allowed.has(color)).toBe(true);
    }
  });

  it('restricts a floor bucket to its own sub-palette plus neutrals', () => {
    const allowed = allowedColorsFor('floor-3-wald');
    for (const color of FLOOR_PALETTES.wald) {
      expect(allowed.has(color)).toBe(true);
    }
    for (const color of NEUTRAL_PALETTE) {
      expect(allowed.has(color)).toBe(true);
    }
    // A colour that only exists in another floor's palette must not leak in.
    const foreignOnly = FLOOR_PALETTES.schloss.find(
      (color) => !FLOOR_PALETTES.wald.includes(color) && !NEUTRAL_PALETTE.includes(color),
    );
    expect(foreignOnly).toBeDefined();
    if (foreignOnly === undefined) {
      return;
    }
    expect(allowed.has(foreignOnly)).toBe(false);
  });

  it('throws on an unknown bucket', () => {
    expect(() => allowedColorsFor('floor-9-nonexistent')).toThrow();
  });
});

// docs/DECISIONS.md #28: the pixel editor's shading brush needs a
// deterministic, fixed lighter/darker ramp per colour rather than a free
// lightness slider, for the same "no off-palette pixel" reason #25 fixed the
// pen's palette to a finite set.
describe('shading', () => {
  it('shadeOf with step 0 returns the colour unchanged', () => {
    for (const color of FLOOR_PALETTES.cellar) {
      expect(shadeOf(color, 0)).toBe(color);
    }
  });

  it('shadeRampOf is 5 tones, darkest to lightest, with the original colour in the middle', () => {
    for (const color of FLOOR_PALETTES.rural) {
      const ramp = shadeRampOf(color);
      expect(ramp).toHaveLength(5);
      expect(ramp[2]).toBe(color);
      const luminances = ramp.map((tone) => relativeLuminance(tone));
      for (let i = 1; i < luminances.length; i++) {
        expect(luminances[i]).toBeGreaterThanOrEqual(luminances[i - 1] ?? 0);
      }
    }
  });

  it('legalPixelColorsFor is a superset of allowedColorsFor, for the same bucket', () => {
    const allowed = allowedColorsFor('floor-1-cellar');
    const legal = legalPixelColorsFor('floor-1-cellar');
    for (const color of allowed) {
      expect(legal.has(color)).toBe(true);
    }
    expect(legal.size).toBeGreaterThan(allowed.size);
  });

  it('nudgeShade moves a colour one step along its own ramp, clamped at either end', () => {
    const [base] = FLOOR_PALETTES.cellar;
    if (base === undefined) {
      throw new Error('cellar palette is empty');
    }
    const oneLighter = nudgeShade('floor-1-cellar', base, 1);
    expect(oneLighter).toBe(shadeOf(base, 1));
    const twoLighter = nudgeShade('floor-1-cellar', oneLighter, 1);
    expect(twoLighter).toBe(shadeOf(base, 2));
    // Already at the ramp's lightest end: nudging further stays put rather than drifting past it.
    const stillTwoLighter = nudgeShade('floor-1-cellar', twoLighter, 1);
    expect(stillTwoLighter).toBe(twoLighter);
  });

  it('nudgeShade leaves a colour outside the bucket entirely unchanged', () => {
    expect(nudgeShade('floor-1-cellar', 0x123456, 1)).toBe(0x123456);
  });
});
