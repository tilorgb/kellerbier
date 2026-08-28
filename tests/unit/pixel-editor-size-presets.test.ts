import { describe, expect, it } from 'vitest';
import { CATEGORY_SPECS, type SpriteCategory } from '../../tools/art/spec.mjs';
import {
  DEFAULT_SIZE_PRESET_ID,
  isWithinCategorySpec,
  presetIdForSize,
  sizePresetFor,
  sizePresetsFor,
} from '../../src/pixel-editor/size-presets.js';

const CATEGORIES = Object.keys(CATEGORY_SPECS) as SpriteCategory[];

describe('sizePresetsFor', () => {
  it.each(CATEGORIES)('every preset for %s is within its CATEGORY_SPECS range', (category) => {
    const presets = sizePresetsFor(category);
    expect(presets.length).toBeGreaterThan(0);
    for (const preset of presets) {
      expect(isWithinCategorySpec(category, preset.width, preset.height)).toBe(true);
    }
  });

  it.each(CATEGORIES)('%s has a preset with the default id, or falls back cleanly', (category) => {
    const preset = sizePresetFor(category, DEFAULT_SIZE_PRESET_ID);
    expect(isWithinCategorySpec(category, preset.width, preset.height)).toBe(true);
  });

  it('tile has exactly one preset, matching its fixed 16x16 spec', () => {
    const presets = sizePresetsFor('tile');
    expect(presets).toHaveLength(1);
    expect(presets[0]).toMatchObject({ width: 16, height: 16 });
  });

  it('falls back to the default preset for an unknown id', () => {
    const preset = sizePresetFor('boss', 'does-not-exist');
    expect(preset.id).toBe(DEFAULT_SIZE_PRESET_ID);
  });

  it('preset ids are unique within a category', () => {
    for (const category of CATEGORIES) {
      const ids = sizePresetsFor(category).map((preset) => preset.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('presetIdForSize', () => {
  it('resolves every preset back to its own id from its own width/height', () => {
    for (const category of CATEGORIES) {
      for (const preset of sizePresetsFor(category)) {
        expect(presetIdForSize(category, preset.width, preset.height)).toBe(preset.id);
      }
    }
  });

  it('returns null for a size matching no preset — legacy art predating the named tiers', () => {
    // 16x16 is not one of "character"'s five tiers (tiny/small/normal/big/xtra-big) —
    // exactly the shape of an already-authored floor-1/2 sprite.
    expect(presetIdForSize('character', 16, 16)).toBeNull();
  });
});
