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
 * Checks every projectile's rim colour against every floor's full set of
 * legal background colours.
 *
 * `projectiles`: `{ name, rim }[]` — `rim` is a `0xRRGGBB` colour.
 * `floors`: `{ floorTag, colors }[]` — `colors` is that floor's full legal
 * background set (`floorBackgroundSwatches` from `palette.mjs`).
 *
 * Returns one failure per (projectile, floor) pair that falls under the
 * threshold, each naming the specific background colour it read worst
 * against — not just the floor, so the report is actionable rather than a
 * pass/fail.
 */
export function checkProjectileLegibility(projectiles, floors) {
  const failures = [];
  for (const projectile of projectiles) {
    for (const floor of floors) {
      let worstRatio = Infinity;
      let worstColor = null;
      for (const background of floor.colors) {
        const ratio = contrastRatio(projectile.rim, background);
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
