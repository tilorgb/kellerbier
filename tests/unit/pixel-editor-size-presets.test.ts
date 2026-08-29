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

  // docs/DECISIONS.md #48: a tile is one of exactly two sizes, not a range.
  it('tile has exactly two presets, matching its two legal sizes', () => {
    const presets = sizePresetsFor('tile');
    expect(presets).toHaveLength(2);
    expect(presets).toContainEqual(expect.objectContaining({ width: 16, height: 16 }));
    expect(presets).toContainEqual(expect.objectContaining({ width: 32, height: 32 }));
  });

  it('rejects a tile size that is not one of the two legal ones', () => {
    expect(isWithinCategorySpec('tile', 16, 16)).toBe(true);
    expect(isWithinCategorySpec('tile', 32, 32)).toBe(true);
    expect(isWithinCategorySpec('tile', 24, 24)).toBe(false);
    expect(isWithinCategorySpec('tile', 32, 16)).toBe(false);
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
    // 24x16 is not one of "character"'s five tiers (mini/normal/mid/wide/tall) —
    // it is the Kellerassel, sized to its own silhouette the way
    // `docs/DECISIONS.md` #36 asks every creature to be.
    expect(presetIdForSize('character', 24, 16)).toBeNull();
  });
});
