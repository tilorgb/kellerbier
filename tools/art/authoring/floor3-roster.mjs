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
 * fungus violet) plus the neutrals and their ramps — the Zecke's engorged
 * abdomen is that fungus violet — there is no red on this
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
  a: 0x1c1a1f, // tick: darkest violet-grey — the shield's shadow
  b: 0x332f38, // tick: head and shield
  c: 0x494451, // tick: shield, lit
  v: 0x962bb3, // tick: engorged abdomen
  V: 0xb13bd0, // tick: abdomen, lit
  p: 0xcf85e2, // tick: abdomen highlight
  m: 0x737373, // rabbit: grey fur
  l: 0x8a8a8a, // rabbit: fur, lit (the backs of the ears)
  q: 0xddaaeb, // rabbit: inner ear and nose
  1: 0x2c4d2a, // trout: dark olive back
  2: 0x3d6b3a, // trout: olive
  3: 0x4e894a, // trout: flank
  4: 0x5fa65b, // trout: flank, lit
  5: 0xcfefb2, // trout: belly
  6: 0x1b2f1a, // trout: dark spots
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

// ============================================================== ZECKE
// An engorged tick (#406): a swollen violet abdomen behind a small dark head,
// legs splayed. The design is option B of three; the size is the medium of
// three micro sizes, both signed off by Tilo. Shown standing in a wald room
// and latched on Alois's hat, where it takes the place of part of the crown.
// 10 wide against a micro collider's 8; the eight empty rows on top are only
// there because a character canvas is at least 16 tall. It stands on its
// bottom row like the rest.
export const zecke = single('zecke', [
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '....KK....',
  '...KbbK...',
  'K.KKccKK.K',
  '.KKcpVvKK.',
  'K.KVVvvK.K',
  '..KVvvvbK.',
  '...KvvbK..',
  '....KKK...',
]);

// ========================================================== KANINCHEN
// A grey wild rabbit (#407), sitting side-on and facing left: tall pink-lined
// ears, a pale belly and chin, a white scut at the back. Option A of three,
// signed off by Tilo, shown standing in a wald room next to Alois. 15x16
// against a mini collider's 16.
export const kaninchen = single('kaninchen', [
  '....KK.KK......',
  '...KlmKlmK.....',
  '...KlqKlqK.....',
  '...KlqKlqK.....',
  '...KlmKlmK.....',
  '..KKmmmmmK.....',
  '.KmmmmmmmmK....',
  'KmKmmmmmmmmK...',
  'KqmmmmmmmmmmK..',
  'KSmmmmmmmmmmmK.',
  '.KSmmmmmmmmmmKK',
  '..KSSmmmmmmmmwK',
  '..KSSSmmmmmmmwK',
  '...KSSSmmmmmmK.',
  '...KmKKKKKKmK..',
  '...KK.....KK...',
]);

// ======================================================== BACHFORELLE
// A brown trout (#408), drawn twice. Under the water it swims as its whole
// side-on figure, facing left (`bachforelle-shadow`: the renderer darkens and
// flattens it, and mirrors it to the way it swims). When it surfaces to fire,
// only its head half is out: the front of that same figure turned head-up,
// with a foam collar at the waterline (`bachforelle`). Option A of three,
// reworked to Tilo's direction and signed off by him in a wald stream next to
// Alois. Violet spots stand in for a brown trout's red ones: no red on this
// floor.
export const bachforelle = single('bachforelle', [
  '......K.......',
  '.....K3K......',
  '....K53KK.....',
  '...K553KwK....',
  '...K5443KK....',
  '..K5543322K...',
  '..K554V322K...',
  '..K55433321K..',
  '.Kl55433621K..',
  '..K55443311K..',
  '..K554362161K.',
  '..K554332111K.',
  '..K55V332111K.',
  '.KwwSwwSwwwSK.',
  'KwSwwKKKKwwSwK',
  '.KKKK....KKKK.',
]);

export const bachforelleShadow = single('bachforelle-shadow', [
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........KKKKK...........',
  '.......KKK11111KK.......KK',
  '.....KK1116116111KK....K1K',
  '...KK22221111161111K..K11K',
  '..KwK22363222222V221KK111K',
  '.KKK33333363336333333211K.',
  'K33343V33433334336333321K.',
  '.K5544444444V44444444311K.',
  '..K555555555555555543K.K1K',
  '...KK555555555555KKKK...KK',
  '.....KKKlKKKKKlKK.........',
  '........K.....K...........',
]);

export const ROSTER = {
  fliegenpilz,
  zecke,
  kaninchen,
  bachforelle,
  'bachforelle-shadow': bachforelleShadow,
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
