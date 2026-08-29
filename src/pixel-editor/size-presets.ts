import { CATEGORY_SPECS, type SpriteCategory } from '../../tools/art/spec.mjs';

/**
 * Named size tiers per sprite category — a one-click starting point for
 * "New", not the canvas's only legal sizes. Each category's `CATEGORY_SPECS`
 * in `tools/art/spec.mjs` is a *range* (`docs/CONTENT_BIBLE.md` §5's
 * "roughly 12x16 up to 16x32" for a character, "up to 160x160" for a boss —
 * `docs/DECISIONS.md` #26's ceilings), not one fixed number, so a bigger
 * boss and a smaller one are both legal — there was just no way to author
 * the smaller (or, before #26, the larger) one, since the canvas always
 * maxed out at a single fixed size. `docs/DECISIONS.md` #27 went a step
 * further: width and height are independently editable in the tool, so a
 * wide-and-short canvas nobody named here (a stout body, a wide-bellied
 * enemy) is still reachable — these tiers just seed the width/height fields
 * with a sensible pair to start from or tweak.
 *
 * Every preset here is hand-picked to land inside its category's own legal
 * `[minWidth, maxWidth] x [minHeight, maxHeight]` range, checked by
 * `tests/unit/pixel-editor-size-presets.test.ts` against `CATEGORY_SPECS`
 * directly rather than by eye — the same "never let the picker offer
 * something illegal" guarantee `docs/DECISIONS.md` #25 already holds for
 * colour, extended to size. `tile`'s spec pins one exact size (16x16, per
 * the content bible), so it gets exactly one preset rather than five —
 * offering more would just be five names for the same number.
 */
export interface SizePreset {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_SIZE_PRESET_ID = 'normal';

const SIZE_PRESETS: Readonly<Record<SpriteCategory, readonly SizePreset[]>> = {
  tile: [{ id: 'normal', label: 'Normal (16×16)', width: 16, height: 16 }],
  // A straight ramp from the floor (8x16, the old ceiling) to the new
  // ceiling (16x32, docs/DECISIONS.md #26) — "normal" lands at 12x24,
  // deliberately past the old 12x16 default: #26 was raised specifically so
  // an ordinary enemy could reach for more detail than 16px tall allowed.
  character: [
    { id: 'tiny', label: 'Tiny (8×16)', width: 8, height: 16 },
    { id: 'small', label: 'Small (10×20)', width: 10, height: 20 },
    { id: 'normal', label: 'Normal (12×24)', width: 12, height: 24 },
    { id: 'big', label: 'Big (14×28)', width: 14, height: 28 },
    { id: 'xtra-big', label: 'Xtra-big (16×32)', width: 16, height: 32 },
  ],
  // Tiers run all the way to the new 160x160 ceiling (docs/DECISIONS.md
  // #26) — a boss is the one category meant to dominate the screen, so
  // "xtra-big" here means it, not a cautious step short of it.
  boss: [
    { id: 'tiny', label: 'Tiny (24×24)', width: 24, height: 24 },
    { id: 'small', label: 'Small (64×64)', width: 64, height: 64 },
    { id: 'normal', label: 'Normal (96×96)', width: 96, height: 96 },
    { id: 'big', label: 'Big (128×128)', width: 128, height: 128 },
    { id: 'xtra-big', label: 'Xtra-big (160×160)', width: 160, height: 160 },
  ],
  projectile: [
    { id: 'tiny', label: 'Tiny (4×4)', width: 4, height: 4 },
    { id: 'small', label: 'Small (6×6)', width: 6, height: 6 },
    { id: 'normal', label: 'Normal (8×8)', width: 8, height: 8 },
    { id: 'big', label: 'Big (12×12)', width: 12, height: 12 },
    { id: 'xtra-big', label: 'Xtra-big (16×16)', width: 16, height: 16 },
  ],
  // Effect art (#153) shares `projectile`'s size range, but not its ramp: a
  // particle is small and a telegraph ring is tile-scale, with very little in
  // between, so "normal" sits at the particle end rather than in the middle.
  vfx: [
    { id: 'tiny', label: 'Tiny (3×3)', width: 3, height: 3 },
    { id: 'small', label: 'Small (4×4)', width: 4, height: 4 },
    { id: 'normal', label: 'Normal (6×6)', width: 6, height: 6 },
    { id: 'big', label: 'Big (8×8)', width: 8, height: 8 },
    { id: 'xtra-big', label: 'Xtra-big (48×48)', width: 48, height: 48 },
  ],
};

export function sizePresetsFor(category: SpriteCategory): readonly SizePreset[] {
  return SIZE_PRESETS[category];
}

/** `sizePresetsFor(category)`'s entry matching `presetId`, falling back to that category's `DEFAULT_SIZE_PRESET_ID` (and failing that, its first preset) if `presetId` isn't one of its own — e.g. switching category away from one that had a tier the new category doesn't. */
export function sizePresetFor(category: SpriteCategory, presetId: string): SizePreset {
  const presets = sizePresetsFor(category);
  const match =
    presets.find((preset) => preset.id === presetId) ??
    presets.find((preset) => preset.id === DEFAULT_SIZE_PRESET_ID) ??
    presets[0];
  if (match === undefined) {
    throw new Error(`sprite category "${category}" has no size presets configured`);
  }
  return match;
}

/**
 * The preset (if any) whose width/height exactly match — for reflecting a
 * sprite's actual current size back into the preset dropdown honestly,
 * rather than defaulting it to `DEFAULT_SIZE_PRESET_ID` regardless of
 * whether that preset is what the sprite currently is. A lot of authored art
 * predates these named tiers entirely (kellerassel is a legacy 16×16, which
 * matches none of `character`'s five) — `null` here is the caller's signal
 * to show a "Custom" state instead of a preset name that just isn't true.
 */
export function presetIdForSize(
  category: SpriteCategory,
  width: number,
  height: number,
): string | null {
  return (
    sizePresetsFor(category).find((preset) => preset.width === width && preset.height === height)
      ?.id ?? null
  );
}

/** Every preset's width/height, checked against `CATEGORY_SPECS` — the invariant `tests/unit/pixel-editor-size-presets.test.ts` pins. */
export function isWithinCategorySpec(
  category: SpriteCategory,
  width: number,
  height: number,
): boolean {
  const spec = CATEGORY_SPECS[category];
  return (
    width >= spec.minWidth &&
    width <= spec.maxWidth &&
    height >= spec.minHeight &&
    height <= spec.maxHeight
  );
}
