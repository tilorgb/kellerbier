import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * Der Wald's roster, as text grids — one creature at a time, as each of
 * #405-#411 lands its sign-off. The same contract as `floor2-roster.mjs`:
 * the committed PNGs are exactly what this file encodes, and
 * `tests/art/floor3-roster-authoring.test.ts` holds them to it byte for byte.
 *
 * Unlike Floor 2's grids these are written with their outline ink in place
 * (`K`) rather than auto-inked: the Fliegenpilz was signed off as a rendered
 * candidate (option B of three, shown standing in a wald room next to Alois),
 * and the grid below is that candidate pixel for pixel — re-inking it with a
 * different rule would quietly change the art that was picked.
 *
 * Palette is Floor 3's five (deep greens, the sickly luminous green, the
 * fungus violet) plus the neutrals and their ramps — there is no red on this
 * floor, which is why a fly agaric here glows green rather than wearing the
 * red cap it would anywhere else.
 */

// ------------------------------------------------------------------ palette
export const WALD = {
  '.': null,
  K: 0x000000, // outline ink
  G: 0x9fe066, // luminous fungus green — the cap
  H: 0xb7e88c, // cap, lit (top-left)
  h: 0x70c327, // cap, shade (bottom-right)
  D: 0x234d2b, // deep green — the cap's spots
  t: 0xa1a1a1, // gills, the underside band
  S: 0xd1d1d1, // stalk
  s: 0xb8b8b8, // stalk, shade side
  w: 0xe8e8e8, // stalk, lit side
};

{
  const legal = legalPixelColorsFor('floor-3-wald');
  for (const [key, colour] of Object.entries(WALD)) {
    if (colour !== null && !legal.has(colour)) {
      throw new Error(
        `floor3-roster key "${key}" is #${colour.toString(16).padStart(6, '0')}, ` +
          `not legal for floor-3-wald — see tools/art/palette.mjs`,
      );
    }
  }
}

/** A whole sprite from one full-canvas text grid, outline included. */
function single(name, rows) {
  const width = Math.max(...rows.map((row) => row.length));
  const px = rows.map((row, y) =>
    Array.from(row.padEnd(width, '.'), (ch) => {
      if (!(ch in WALD)) throw new Error(`${name}: row ${String(y)} has unknown key "${ch}"`);
      return WALD[ch];
    }),
  );
  return { name, width, height: rows.length, px };
}

// ======================================================== FLIEGENPILZ
// A squat fly agaric (#405): a wide luminous-green cap with deep-green spots
// over a short pale stalk, no face — it reads as part of the forest floor
// until it bloats. 28 wide against a normal-size collider's 28.
export const fliegenpilz = single('fliegenpilz', [
  '............................',
  '..........KKKKKKKK..........',
  '.......KKKHHGGDGGGKKK.......',
  '.....KKHDHHGGDDDGGGGGKK.....',
  '....KHHDDDGGGGDGGGGGDGGK....',
  '...KHHHHDGGGGGGGGGGDDDGGK...',
  '..KHHHGGGGGGGGGGGGGGDGGGGK..',
  '.KHHHGGGGGGDGGGGGDGGGGGGhhK.',
  '.KHGGDGGGGGGGGGGGGGGGGGhhhK.',
  '.KGGGGGGGGGGGGGGGGGGGhhDhhK.',
  '.KGGGGGGGGGGGGGGGGGhhhhhhhK.',
  '..KtttttttttttttttttttttttK.',
  '...KKKKKKKwSSSSSSsKKKKKKKK..',
  '.........KwSSSSSSsK.........',
  '.........KwSSSSSSsK.........',
  '.........KwSSSSSSsK.........',
  '.........KwSSSSSSsK.........',
  '........KwwSSSSSSssK........',
  '........KwwSSSSSSssK........',
  '.........KKKKKKKKKK.........',
]);

export const ROSTER = {
  fliegenpilz,
};

/** Every sprite is authored against Floor 3's palette. */
export const ROSTER_BUCKET = 'floor-3-wald';

/** Throws if any painted pixel is not legal for floor-3-wald. */
export function assertOnPalette(_bucket, framesIn) {
  const legal = legalPixelColorsFor('floor-3-wald');
  for (const f of framesIn) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const c = f.px[y][x];
        if (c !== null && !legal.has(c)) {
          throw new Error(
            `${f.name}: pixel ${x},${y} is #${c.toString(16).padStart(6, '0')}, not legal for floor-3-wald`,
          );
        }
      }
    }
  }
}

/** One frame as PNG bytes. */
export function encodeSingle(f) {
  const pixels = Buffer.alloc(f.width * f.height * 4);
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const c = f.px[y][x];
      if (c === null) continue;
      const at = (y * f.width + x) * 4;
      pixels[at] = (c >> 16) & 0xff;
      pixels[at + 1] = (c >> 8) & 0xff;
      pixels[at + 2] = c & 0xff;
      pixels[at + 3] = 0xff;
    }
  }
  return encodePng({ width: f.width, height: f.height, pixels });
}
