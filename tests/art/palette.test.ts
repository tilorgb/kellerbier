import { describe, expect, it } from 'vitest';
import {
  allowedColorsFor,
  BACKGROUND_PALETTES,
  BACKGROUND_TIER,
  backgroundColorsFor,
  clampToBackgroundCeiling,
  FLOOR_PALETTES,
  legalPixelColorsFor,
  MASTER_PALETTE,
  NEUTRAL_PALETTE,
  nudgeShade,
  pickableColorsFor,
  shadeOf,
  shadeRampOf,
  toBackgroundHue,
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

// #214 / docs/DECISIONS.md #62: everything the player does not act on is drawn
// from a quieter tier — FLOOR_PALETTES darkened and desaturated by a pure
// function, never a second authored table.
function hslLightness(color: number): number {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

function hslSaturation(color: number): number {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) {
    return 0;
  }
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

describe('the background tier', () => {
  it('derives BACKGROUND_PALETTES from FLOOR_PALETTES by the same pure function', () => {
    for (const [floorTag, colors] of Object.entries(FLOOR_PALETTES)) {
      expect(BACKGROUND_PALETTES[floorTag]).toEqual(colors.map(toBackgroundHue));
    }
  });

  it('every background hue is darker and no more saturated than its foreground source', () => {
    for (const colors of Object.values(FLOOR_PALETTES)) {
      for (const color of colors) {
        const bg = toBackgroundHue(color);
        // Darkening can clamp at pure black for an already-near-black hue, so
        // "not lighter" rather than "strictly darker".
        expect(relativeLuminance(bg)).toBeLessThanOrEqual(relativeLuminance(color));
        expect(hslSaturation(bg)).toBeLessThanOrEqual(hslSaturation(color) + 1e-9);
      }
    }
    // At the default one-step-each tuning, a mid-saturation hue moves on both
    // axes — the tier is not a no-op.
    const rural = FLOOR_PALETTES.rural[0];
    if (rural === undefined) {
      throw new Error('rural palette is empty');
    }
    expect(toBackgroundHue(rural)).not.toBe(rural);
    expect(relativeLuminance(toBackgroundHue(rural))).toBeLessThan(relativeLuminance(rural));
    expect(hslSaturation(toBackgroundHue(rural))).toBeLessThan(hslSaturation(rural));
  });

  it('no background hue breaks the tier ceiling — a prop accent cannot flash against the wall', () => {
    // Small slack: the clamp sets HSL exactly on the ceiling, but a round-trip
    // through byte RGB — worse at low lightness, where saturation's denominator
    // is small — can land a hair above when recomputed. Visually still on it.
    const eps = 0.02;
    for (const color of [
      ...Object.values(BACKGROUND_PALETTES).flat(),
      ...backgroundColorsFor('common'),
      ...backgroundColorsFor('floor-1-cellar'),
    ]) {
      expect(hslLightness(color)).toBeLessThanOrEqual(BACKGROUND_TIER.maxLightness + eps);
      expect(hslSaturation(color)).toBeLessThanOrEqual(BACKGROUND_TIER.maxSaturation + eps);
    }
    // The neutrals in particular: hit-flash white is pulled down, black is not.
    const bg = backgroundColorsFor('floor-2-rural');
    expect(bg.has(0xffffff)).toBe(false);
    expect(bg.has(0x000000)).toBe(true);
    expect(bg.has(clampToBackgroundCeiling(0xffffff))).toBe(true);
  });

  it('leaves the ~40-colour cap untouched — the derived tier adds no authored colours', () => {
    // MASTER_PALETTE is still exactly NEUTRAL_PALETTE plus the FLOOR_PALETTES
    // hues; BACKGROUND_PALETTES is not part of it.
    const authored = new Set([...NEUTRAL_PALETTE, ...Object.values(FLOOR_PALETTES).flat()]);
    expect(new Set(MASTER_PALETTE)).toEqual(authored);
    expect(MASTER_PALETTE.length).toBeLessThanOrEqual(45);
  });

  it('backgroundColorsFor: a floor bucket is its BACKGROUND_PALETTES entry plus neutrals', () => {
    const bg = backgroundColorsFor('floor-2-rural');
    for (const color of BACKGROUND_PALETTES.rural ?? []) {
      expect(bg.has(color)).toBe(true);
    }
    for (const color of NEUTRAL_PALETTE) {
      expect(bg.has(clampToBackgroundCeiling(color))).toBe(true);
    }
    // The confident foreground hue itself is not pickable on the background tier.
    const ruralA = FLOOR_PALETTES.rural[0];
    if (ruralA !== undefined && !NEUTRAL_PALETTE.includes(ruralA)) {
      expect(bg.has(ruralA)).toBe(toBackgroundHue(ruralA) === ruralA);
    }
  });

  it('backgroundColorsFor: common derives from every floor hue in the game', () => {
    const bg = backgroundColorsFor('common');
    for (const color of Object.values(FLOOR_PALETTES).flat()) {
      expect(bg.has(toBackgroundHue(color))).toBe(true);
    }
    for (const color of NEUTRAL_PALETTE) {
      expect(bg.has(clampToBackgroundCeiling(color))).toBe(true);
    }
  });

  it('backgroundColorsFor throws on an unknown bucket', () => {
    expect(() => backgroundColorsFor('floor-9-nonexistent')).toThrow();
  });

  it('pickableColorsFor routes by tier; allowedColorsFor stays the foreground set', () => {
    expect(pickableColorsFor('floor-2-rural', 'foreground')).toEqual(
      allowedColorsFor('floor-2-rural'),
    );
    expect(pickableColorsFor('floor-2-rural', 'background')).toEqual(
      backgroundColorsFor('floor-2-rural'),
    );
    // Default tier is foreground — every pre-#214 caller is unchanged.
    expect(pickableColorsFor('floor-2-rural')).toEqual(allowedColorsFor('floor-2-rural'));
  });

  it('legalPixelColorsFor(bucket, "background") is a superset of backgroundColorsFor', () => {
    const pickable = backgroundColorsFor('floor-1-cellar');
    const legal = legalPixelColorsFor('floor-1-cellar', 'background');
    for (const color of pickable) {
      expect(legal.has(color)).toBe(true);
    }
    expect(legal.size).toBeGreaterThan(pickable.size);
  });

  it('nudgeShade on the background tier stays on the background ramp', () => {
    // A genuine derived hue, not a neutral (black nudges to itself either way).
    const base = BACKGROUND_PALETTES.rural?.[0];
    if (base === undefined) {
      throw new Error('rural background palette is empty');
    }
    expect(nudgeShade('floor-2-rural', base, 1, 'background')).toBe(shadeOf(base, 1));
    // That derived hue is not on the foreground ramp, so the default-tier call
    // leaves it untouched rather than guessing.
    expect(legalPixelColorsFor('floor-2-rural', 'foreground').has(base)).toBe(false);
    expect(nudgeShade('floor-2-rural', base, 1)).toBe(base);
  });

  it('BACKGROUND_TIER stays a conservative nudge, not a wholesale recolour', () => {
    expect(BACKGROUND_TIER.darken).toBeGreaterThanOrEqual(1);
    expect(BACKGROUND_TIER.darken).toBeLessThanOrEqual(3);
    expect(BACKGROUND_TIER.desaturate).toBeGreaterThanOrEqual(1);
    expect(BACKGROUND_TIER.desaturate).toBeLessThanOrEqual(3);
    // The ceiling is quiet but not black — a prop must still read as present.
    expect(BACKGROUND_TIER.maxLightness).toBeGreaterThan(0.25);
    expect(BACKGROUND_TIER.maxLightness).toBeLessThan(0.5);
    expect(BACKGROUND_TIER.maxSaturation).toBeGreaterThan(0.15);
    expect(BACKGROUND_TIER.maxSaturation).toBeLessThan(0.45);
  });
});
