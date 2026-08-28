/**
 * WCAG-style contrast ratio, and the projectile legibility check built on it.
 *
 * `docs/CONTENT_BIBLE.md` §5: "Projectile legibility is a hard constraint
 * that overrides beauty ... Enemy shots always get a bright rim so they read
 * against any background. Test every floor palette with the projectile set
 * on top before signing it off." This module is that test, run two ways:
 * as a pure function any fixture can call (`tests/art/contrast.test.ts`),
 * and as a build-time gate (`build.mjs`) once real projectile sprites exist
 * under a floor's `projectiles/` folder.
 *
 * This function itself is deliberately dumb: it takes whatever background
 * colours it is handed and checks every one. What those colours *are* is
 * `palette.mjs`'s call — `floorBackgroundSwatches` hands it each floor's
 * actual large-area tones (walls, floors, foliage) rather than that floor's
 * whole legal palette, because weighing a two-pixel accent highlight the
 * same as the wall behind the projectile tests against a background nobody
 * will ever actually see it in front of. See that function's own comment
 * for the reasoning, and `build.mjs` for how a sprite's own floor bucket
 * decides which floor(s) it is even checked against.
 */

const MIN_LUMINANCE_DENOMINATOR = 0.05;

function srgbChannelToLinear(channel) {
  const normalised = channel / 255;
  return normalised <= 0.03928 ? normalised / 12.92 : Math.pow((normalised + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a `0xRRGGBB` colour, per the WCAG definition. */
export function relativeLuminance(color) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/** WCAG contrast ratio between two `0xRRGGBB` colours, always ≥ 1. */
export function contrastRatio(a, b) {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + MIN_LUMINANCE_DENOMINATOR) / (darker + MIN_LUMINANCE_DENOMINATOR);
}

/**
 * The floor of "differs in brightness, not only hue" (§5). 3.0 is the WCAG
 * threshold for a UI component/large text against its background — a
 * projectile is neither, but it is exactly the kind of small, fast-moving
 * shape that needs at least that much separation to read against a busy
 * floor at a glance.
 */
export const MIN_PROJECTILE_CONTRAST = 3.0;

/**
 * Checks every projectile against every floor's set of large-area background
 * colours, scoring each background against whichever of the sprite's two
 * brightness extremes reads better against it.
 *
 * `projectiles`: `{ name, rim, shade }[]` — `rim` is the sprite's brightest
 * opaque colour and `shade` its darkest (`validate.mjs`'s
 * `brightestOpaqueColor`/`darkestOpaqueColor`). `shade` may be omitted, which
 * scores the sprite on its bright end alone, exactly as this function did
 * before #152.
 * `floors`: `{ floorTag, colors }[]` — `colors` is that floor's background
 * swatch set (`floorBackgroundSwatches` from `palette.mjs`).
 *
 * **Why the better of two ends rather than the bright one only.** §5's rule is
 * "differ in brightness, not only hue", and its "enemy shots always get a
 * bright rim" is one half of how a sprite does that; a dark outline is the
 * other. Which half carries a given background is a property of the
 * background, not of the sprite: nothing bright reads on Die Alpen's snow and
 * nothing dark reads on Der Wald's black, so a shot that appears on both — the
 * player's own, which appears on all seven floors — needs both ends and needs
 * to be scored on both. `docs/DECISIONS.md` #39 has the palette search
 * proving no single colour clears all seven, which is what made this a gate
 * no `common` projectile could ever pass rather than a strict one.
 *
 * It stays a real gate. A flat mid-grey blob has both extremes in the middle
 * and still fails against most floors; what now passes is specifically a
 * sprite with genuine internal contrast, which is the thing §5 was asking for.
 *
 * Returns one failure per (projectile, floor) pair that falls under the
 * threshold, each naming the specific background colour it read worst
 * against — not just the floor, so the report is actionable rather than a
 * pass/fail.
 */
export function checkProjectileLegibility(projectiles, floors) {
  const failures = [];
  for (const projectile of projectiles) {
    const shade = projectile.shade ?? projectile.rim;
    for (const floor of floors) {
      let worstRatio = Infinity;
      let worstColor = null;
      for (const background of floor.colors) {
        const ratio = Math.max(
          contrastRatio(projectile.rim, background),
          contrastRatio(shade, background),
        );
        if (ratio < worstRatio) {
          worstRatio = ratio;
          worstColor = background;
        }
      }
      if (worstColor !== null && worstRatio < MIN_PROJECTILE_CONTRAST) {
        failures.push({
          projectile: projectile.name,
          floorTag: floor.floorTag,
          ratio: worstRatio,
          against: worstColor,
        });
      }
    }
  }
  return failures;
}
