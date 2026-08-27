import { describe, expect, it } from 'vitest';
import {
  allowedColorsFor,
  FLOOR_PALETTES,
  MASTER_PALETTE,
  NEUTRAL_PALETTE,
} from '../../tools/art/palette.mjs';
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
