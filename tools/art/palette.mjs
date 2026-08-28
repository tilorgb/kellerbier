import { FLOOR_BUCKETS, COMMON_BUCKET_ID, floorTagForBucket } from './spec.mjs';

/**
 * The master palette and per-floor sub-palettes, per
 * `docs/CONTENT_BIBLE.md` §5 ("Palette capped at ~40 colours overall, with a
 * per-floor sub-palette so each chapter has its own mood while staying
 * visually one game").
 *
 * This is the *authored* palette — the moods below are transcribed from
 * `docs/CONTENT_BIBLE.md` §1's floor descriptions, five colours per floor.
 * Nothing here is derived from real art yet, because none exists; this is
 * the fence the seven floors of art (#35-#43 and friends) get built inside.
 *
 * Neutrals are allowed on every floor in addition to that floor's own five —
 * outlines, hit-flash white, and shared shading all need to work everywhere
 * rather than being re-litigated as a sixth colour per floor.
 */
export const NEUTRAL_PALETTE = [
  0x000000, // outline ink
  0x1c1a1f, // near-black shade
  0x8a8a8a, // mid grey
  0xffffff, // hit-flash white (see src/render/placeholder-art.ts's entityFlash)
];

export const FLOOR_PALETTES = {
  // Der Keller — bare-concrete grey dominates (a German Keller is poured
  // concrete or concrete block, not a wooden cellar), one brown for the
  // wooden racks as a detail rather than the base material, one warm amber
  // light source. The three greys sit close together on purpose — a damp
  // basement is a low-contrast room lit by one bulb, not a checkerboard,
  // and a tile texture built from far-apart values turns "busy" the moment
  // it repeats across a whole floor.
  cellar: [0x3c3e40, 0x4a4d50, 0x5b5f63, 0x54402e, 0xd99a3f],
  // Dorf & Acker — "green, sky blue, white-and-blue bunting"
  rural: [0x3f7a3a, 0x7fbf6a, 0x6ab0d9, 0x2e4f8c, 0xe8e2d0],
  // Der Wald — "deep green, black, sickly luminous fungus"
  wald: [0x16261a, 0x234d2b, 0x3d6b3a, 0x9fe066, 0xc060d9],
  // Die Alpen — "white, granite, alpenglow pink"
  alpen: [0xeef2f5, 0xb9c4cc, 0x6e7680, 0xe893a8, 0x274b6b],
  // Schloss Neuschwanstein — "royal blue, gold, candlelight"
  schloss: [0x1f3a70, 0x3a5ba0, 0xd4af37, 0xf4d78a, 0x7a1f2b],
  // Die Brauerei — "steel, hazard yellow, cola brown. Deliberately the ugliest floor."
  brauerei: [0x6d747a, 0x494f54, 0xe0b400, 0x4a2f18, 0x8a5a24],
  // Die Wiesn — "everything at once, gaudy, over-lit"
  wiesn: [0xd92b3c, 0xf2a900, 0x2fb8c4, 0xb23bd9, 0xf5f0e6],
};

export const MASTER_PALETTE = Array.from(
  new Set([...NEUTRAL_PALETTE, ...Object.values(FLOOR_PALETTES).flat()]),
);

/**
 * The set of colours a sprite in `bucketId` is allowed to use.
 *
 * `common` may draw from the whole master palette — it is shared across
 * floors and has no mood of its own to protect. A floor bucket is held to
 * its own five plus the neutrals, which is the actual palette-discipline
 * check: the master palette caps the *game's* colour budget, the per-floor
 * set is what keeps floor 3 from quietly borrowing floor 5's gold.
 */
export function allowedColorsFor(bucketId) {
  if (bucketId === COMMON_BUCKET_ID) {
    return new Set(MASTER_PALETTE);
  }
  const floorTag = floorTagForBucket(bucketId);
  const floorColors = floorTag !== null ? FLOOR_PALETTES[floorTag] : undefined;
  if (floorColors === undefined) {
    throw new Error(`unknown sprite bucket "${bucketId}"`);
  }
  return new Set([...NEUTRAL_PALETTE, ...floorColors]);
}

/**
 * The subset of each floor's palette that actually fills large background
 * areas — walls, floors, foliage — as opposed to a small-area accent or
 * light source. Transcribed from the same `docs/CONTENT_BIBLE.md` §1
 * sentences `FLOOR_PALETTES` was: a floor's "one warm amber light source",
 * its bunting, its gold trim and candlelight, are explicitly called out as
 * details rather than the base material, and a legibility test that weighs
 * a two-pixel highlight the same as the wall behind it is testing against
 * a background nobody will actually see the projectile in front of.
 *
 * Neutrals are excluded for the same reason from the other direction: black
 * outline ink and hit-flash white cover a few pixels each, never a wall.
 */
const FLOOR_BACKGROUND_SWATCHES = {
  // The wood accent is excluded here for the same reason the amber light is
  // — a wooden rack is furniture sitting in a concrete room, not the wall or
  // floor material itself.
  cellar: [0x3c3e40, 0x4a4d50, 0x5b5f63],
  rural: [0x3f7a3a, 0x7fbf6a, 0x6ab0d9],
  wald: [0x16261a, 0x234d2b, 0x3d6b3a],
  alpen: [0xeef2f5, 0xb9c4cc, 0x6e7680],
  schloss: [0x1f3a70, 0x3a5ba0],
  brauerei: [0x6d747a, 0x494f54, 0x4a2f18, 0x8a5a24],
  // Wiesn is "everything at once" by design — every one of its five colours
  // is meant to fill the screen at once, so none of them is an accent.
  wiesn: FLOOR_PALETTES.wiesn,
};

/** Every floor's own background swatches — what `contrast.mjs` checks projectiles against. */
export function floorBackgroundSwatches(floorTag) {
  const backgroundColors = FLOOR_BACKGROUND_SWATCHES[floorTag];
  if (backgroundColors === undefined) {
    throw new Error(`unknown floor tag "${floorTag}"`);
  }
  return backgroundColors;
}

/**
 * The shading brush (#108's follow-up, `docs/DECISIONS.md` #27) needs a
 * "lighter"/"darker" neighbour for a colour a pen already painted, and the
 * palette above has no such relationship recorded — five hand-picked hues
 * per floor, not five ramps. Rather than hand-author ramps too (another
 * thing to keep in sync with `FLOOR_PALETTES`), every allowed colour gets
 * one derived the same deterministic way: shift its HSL lightness by a fixed
 * step and convert back. Fixed and finite — four steps either side of the
 * original — for the same reason `docs/DECISIONS.md` #24 fixed the pen's
 * palette to a finite set: a brush that could nudge lightness by any amount
 * could paint a pixel `validate.mjs` has never seen before. `legalPixelColorsFor`
 * is the full set that actually can produce, checked by the build the same
 * way `allowedColorsFor` already is.
 */
const SHADE_STEPS = [-2, -1, 0, 1, 2];
const SHADE_LIGHTNESS_STEP = 0.09;

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return [h / 6, s, l];
}

function hueToRgb(p, q, t) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToRgb(p, q, h + 1 / 3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1 / 3);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** `color` shifted `step` `SHADE_LIGHTNESS_STEP`s lighter (positive) or darker (negative), clamped to a valid lightness. `step: 0` returns `color` unchanged. */
export function shadeOf(color, step) {
  if (step === 0) {
    return color;
  }
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const [h, s, l] = rgbToHsl(r, g, b);
  const nextL = Math.min(1, Math.max(0, l + step * SHADE_LIGHTNESS_STEP));
  const [nr, ng, nb] = hslToRgb(h, s, nextL);
  return (nr << 16) | (ng << 8) | nb;
}

/** Every derived tone of `color`, darkest to lightest, `color` itself included at the middle index. */
export function shadeRampOf(color) {
  return SHADE_STEPS.map((step) => shadeOf(color, step));
}

/** Every colour a sprite in `bucketId` may legally contain once the shading brush is allowed to touch it: `allowedColorsFor(bucketId)` plus every colour's own derived ramp. What `validate.mjs`'s off-palette check is run against for a saved sprite (`tools/art/build.mjs`) — `allowedColorsFor` itself stays the *pickable* set the palette panel's swatches offer. */
export function legalPixelColorsFor(bucketId) {
  const legal = new Set();
  for (const color of allowedColorsFor(bucketId)) {
    for (const step of SHADE_STEPS) {
      legal.add(shadeOf(color, step));
    }
  }
  return legal;
}

/**
 * `color` moved one `SHADE_LIGHTNESS_STEP` toward lighter (`direction: 1`) or
 * darker (`direction: -1`), staying on `bucketId`'s fixed ramp — clamped at
 * either end rather than drifting past it. `color` that isn't on any of the
 * bucket's ramps (should never happen for a pixel the pen or a previous
 * shading pass actually painted) is returned unchanged rather than guessed
 * at.
 */
export function nudgeShade(bucketId, color, direction) {
  for (const base of allowedColorsFor(bucketId)) {
    for (const step of SHADE_STEPS) {
      if (shadeOf(base, step) === color) {
        const nextStep = Math.min(2, Math.max(-2, step + direction));
        return shadeOf(base, nextStep);
      }
    }
  }
  return color;
}

export { FLOOR_BUCKETS };
