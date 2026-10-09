import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';
import { canvas, ellipse, fillRect, outline, poly, px, toRows } from './draw.mjs';
import { frameFromRows, mirrored, shifted } from './views-kit.mjs';

/**
 * Die Alpen's roster (#40): the Murmeltier and its mound, the Gondola, the
 * Tourist and the floor's projectiles (the Steinbock, Bergwacht, Kuhglocke and
 * Sennerin were cut after the first playtest). The same contract as `floor3-roster.mjs`: the committed PNGs
 * are exactly what this file encodes, and `tests/art/floor4-roster-authoring.test.ts`
 * holds them to it byte for byte.
 *
 * Unlike Floor 3's hand-typed grids these are *drawn* — `draw.mjs`'s
 * ellipses, polygons and lines into a character canvas, outlined once at the
 * end — the cloud track `docs/DECISIONS.md` #77 describes for a machine with
 * no diffusion pipeline: a composition that is cheap to vary, so a second
 * option is a parameter change rather than a redraw. Best-guess designs,
 * sizes picked against the collider classes (`sim/enemy/size.ts`) and
 * `tests/content/sprite-scale.test.ts`'s band; both still want Tilo's eye.
 *
 * Palette is Floor 4's five (snow white, light and dark granite, alpenglow
 * pink, deep alpine blue) plus the neutrals and their ramps. The skin ramp is
 * the one warm colour the floor has, so it is wood, leather, a rescuer's
 * jacket and a dairymaid's braids as well as a face.
 */

// ------------------------------------------------------------------ palette
export const ALPEN = {
  '.': null,
  K: 0x000000, // outline ink
  a: 0x1c1a1f, // near-black
  b: 0x332f38,
  c: 0x494451,
  d: 0x5c5c5c,
  e: 0x737373,
  f: 0x8a8a8a,
  g: 0xa1a1a1,
  h: 0xb8b8b8,
  i: 0xd1d1d1,
  j: 0xe8e8e8,
  W: 0xffffff,
  n: 0x44484f, // granite, darkest
  o: 0x595f67,
  p: 0x6e7680, // granite
  q: 0x858d96,
  r: 0x9ea4ac, // granite, lightest
  s: 0xb4c6d3, // snow, shaded
  t: 0xd1dce4,
  u: 0xeef2f5, // snow white
  v: 0x8497a5, // cool light grey ramp
  w: 0x9eaeb9,
  x: 0xb9c4cc,
  y: 0xd4dadf,
  B: 0x0e1c28, // alpine blue, darkest
  C: 0x1b3349,
  D: 0x274b6b,
  E: 0x33638d,
  F: 0x407aae,
  P: 0xd8476b, // alpenglow pink ramp
  Q: 0xe06d8a,
  R: 0xe893a8,
  S: 0xf0b9c6,
  T: 0xf8dfe5,
  1: 0xd99940, // warm ramp: leather, wood, a jacket
  2: 0xe0ae66,
  3: 0xe8c28c, // skin
  4: 0xf0d6b2,
  5: 0xf7ebd9,
};

export const ROSTER_BUCKET = 'floor-4-alpen';

{
  const legal = legalPixelColorsFor(ROSTER_BUCKET);
  for (const [key, colour] of Object.entries(ALPEN)) {
    if (colour !== null && !legal.has(colour)) {
      throw new Error(
        `floor4-roster key "${key}" is #${colour.toString(16).padStart(6, '0')}, ` +
          `not legal for ${ROSTER_BUCKET} — see tools/art/palette.mjs`,
      );
    }
  }
}

/** A frame from a drawn canvas: outline it, then map the keys. */
function finish(name, c) {
  outline(c);
  return frameFromRows(name, ALPEN, toRows(c), { ink: false });
}

// ========================================================= MURMELTIER
/**
 * A marmot sat up on its haunches, facing left (#40): a round brown-grey
 * body, small ears, forepaws held up, a short tail. 20×18 against a normal
 * collider's 28 — it is a small animal, and the mound it travels as is what
 * the player tracks.
 */
function murmeltierSide(name) {
  const c = canvas(20, 18);
  ellipse(c, 10, 12, 7, 5, 'q');
  ellipse(c, 11, 13, 5, 3, 'r');
  ellipse(c, 7, 6, 4, 4, 'q');
  ellipse(c, 8, 7, 2, 1.5, 'r');
  px(c, 5, 5, 'a'); // eye
  px(c, 3, 7, 'a'); // nose
  fillRect(c, 9, 2, 2, 2, 'p'); // ear
  fillRect(c, 4, 10, 2, 2, 'o'); // forepaws
  fillRect(c, 16, 14, 3, 2, 'o'); // tail
  fillRect(c, 6, 16, 3, 1, 'a');
  fillRect(c, 12, 16, 3, 1, 'a');
  return finish(name, c);
}

/** The mound it travels as under the snow (`murmeltier-shadow`): a heap with a dark burrow mouth. 24×16. */
function murmeltierMound(name) {
  const c = canvas(24, 16);
  ellipse(c, 12, 12, 10, 4, 't');
  ellipse(c, 11, 11, 7, 3, 'u');
  ellipse(c, 12, 14, 9, 2, 's');
  ellipse(c, 8, 12, 2.5, 1.5, 'a');
  return finish(name, c);
}

// ========================================================== BERGWACHT
/**
 * A mountain rescuer (#40): a stocky figure in an orange jacket with the
 * white cross on the chest, dark trousers, a white helmet, a flare pistol in
 * the leading hand. 20×30 against a normal collider's 28 — the same canvas
 * as Floor 2's Bauer.
 */
function personSide(
  name,
  { jacket, trousers, hat, hatShade, hair, apron = false, braids = false, pistol = false, bob = 0 },
) {
  const c = canvas(20, 30);
  const y0 = 2 - bob;
  // Legs.
  fillRect(c, 6, 20 + y0, 3, 7, trousers);
  fillRect(c, 10, 20 + y0, 3, 7, trousers);
  fillRect(c, 5, 27 + y0, 4, 1, 'a');
  fillRect(c, 10, 27 + y0, 4, 1, 'a');
  // Torso.
  fillRect(c, 5, 11 + y0, 9, 10, jacket);
  if (apron) {
    fillRect(c, 6, 14 + y0, 7, 8, 'u');
    fillRect(c, 6, 20 + y0, 7, 1, 's');
  }
  // Arm forward (left) holding the pistol, arm back.
  fillRect(c, 3, 12 + y0, 3, 6, jacket);
  if (pistol) {
    fillRect(c, 1, 11 + y0, 3, 2, 'c');
    px(c, 1, 13 + y0, 'c');
  }
  // Head.
  ellipse(c, 9, 6 + y0, 4, 4, '3');
  px(c, 6, 6 + y0, 'a'); // eye
  if (hair !== null) {
    fillRect(c, 7, 2 + y0, 6, 2, hair);
    fillRect(c, 12, 3 + y0, 2, 4, hair);
  }
  if (braids) {
    fillRect(c, 13, 6 + y0, 2, 7, '1');
    px(c, 14, 13 + y0, 'P');
  }
  if (hat !== null) {
    ellipse(c, 9, 3 + y0, 5, 2.5, hat);
    fillRect(c, 4, 4 + y0, 10, 1, hatShade);
  }
  return finish(name, c);
}

/** A snow clod (6×6): white, a grey shadow side. */
function snowClod(name) {
  const c = canvas(6, 6);
  ellipse(c, 2.5, 2.5, 2.5, 2.5, 'u');
  ellipse(c, 3.2, 3.2, 1.5, 1.5, 't');
  return finish(name, c);
}

/**
 * A flint flake (6×6), The First Human's sweep shot (#437): a grey chip with
 * one lit facet and a pink edge, so it reads as *his* against the floor's
 * default snow shot. Symmetric enough to fly any direction unrotated.
 */
function flint(name) {
  const c = canvas(6, 6);
  poly(
    c,
    [
      [2.5, 0],
      [5, 2.5],
      [2.5, 5],
      [0, 2.5],
    ],
    'q',
  );
  px(c, 2, 2, 'r');
  px(c, 3, 3, 'o');
  px(c, 2, 0, 'R');
  px(c, 5, 2, 'R');
  return finish(name, c);
}
/**
 * The arrow (8×8) he throws between phase-two sweeps: a dark shaft seen
 * end-on as a diamond, a pale flint head, a pink fletch — a point coming at
 * you, whichever way it flies.
 */
function arrow(name) {
  const c = canvas(8, 8);
  poly(
    c,
    [
      [3.5, 0],
      [7, 3.5],
      [3.5, 7],
      [0, 3.5],
    ],
    '1',
  );
  ellipse(c, 3.5, 3.5, 1.6, 1.6, 'a');
  px(c, 3, 3, 'y');
  px(c, 4, 3, 'u');
  px(c, 0, 3, 'R');
  px(c, 7, 3, 'R');
  px(c, 3, 0, 'R');
  px(c, 3, 7, 'R');
  return finish(name, c);
}
// =========================================================== THE GONDOLA
/**
 * A cable-car cabin (#40), the mini-boss, hanging from its hanger arm: a
 * boxy cabin in the floor's deep blue with a band of windows, a pink roof
 * rack strapped with luggage, the hanger up to the cable. 36×40 against a
 * mid collider's 40.
 */
function gondola(name) {
  const c = canvas(36, 40);
  // Hanger arm and the grip on the cable.
  fillRect(c, 17, 0, 2, 9, 'c');
  fillRect(c, 15, 0, 6, 2, 'd');
  // Roof and the rack with luggage.
  fillRect(c, 6, 9, 24, 3, 'o');
  fillRect(c, 9, 7, 5, 3, 'P');
  fillRect(c, 16, 6, 4, 4, '1');
  fillRect(c, 22, 7, 6, 3, 'E');
  // Cabin.
  fillRect(c, 5, 12, 26, 22, 'D');
  fillRect(c, 5, 12, 26, 1, 'E');
  // Windows: a band, with the frames between.
  fillRect(c, 7, 15, 22, 8, 'x');
  fillRect(c, 8, 16, 20, 3, 'y');
  for (const x of [13, 19, 25]) fillRect(c, x, 15, 1, 8, 'C');
  // Door seam and a number plate.
  fillRect(c, 17, 24, 1, 10, 'C');
  fillRect(c, 9, 26, 5, 4, 'u');
  // Skirt.
  fillRect(c, 5, 34, 26, 2, 'C');
  fillRect(c, 7, 36, 22, 1, 'B');
  return finish(name, c);
}

// ------------------------------------------------------------------ assembly
const murmeltier = murmeltierSide('murmeltier');
/** The one-frame bodies, and the mound. */
export const ROSTER = {
  murmeltier,
  'murmeltier-shadow': murmeltierMound('murmeltier-shadow'),
  'the-gondola': gondola('the-gondola'),
  tourist: personSide('tourist', {
    jacket: 'E',
    trousers: 'n',
    hat: 'P',
    hatShade: 'Q',
    hair: null,
  }),
};

/** The floor's projectile sprites, written to `projectiles/`. */
export const PROJECTILES = {
  'snow-clod': snowClod('snow-clod'),
  flint: flint('flint'),
  arrow: arrow('arrow'),
};

/**
 * The animated bodies: a strip per creature plus its sidecar. The base
 * `<id>` strip is what a body with no heading strip draws; `-side`, `-south`
 * and `-north` are the heading views `render/entities.ts` picks between.
 */
export const STRIPS = {};

// `mirrored`/`shifted` are re-exported for a specimen script that wants to lay a right-facing copy out.
export { mirrored, shifted };

/** Throws if any painted pixel is not legal for floor-4-alpen. */
export function assertOnPalette(_bucket, framesIn) {
  const legal = legalPixelColorsFor(ROSTER_BUCKET);
  for (const f of framesIn) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const c = f.px[y][x];
        if (c !== null && !legal.has(c)) {
          throw new Error(
            `${f.name}: pixel ${String(x)},${String(y)} is #${c.toString(16).padStart(6, '0')}, not legal for ${ROSTER_BUCKET}`,
          );
        }
      }
    }
  }
}

function putFrame(pixels, stripWidth, f, ox) {
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const c = f.px[y][x];
      if (c === null) continue;
      const at = (y * stripWidth + ox + x) * 4;
      pixels[at] = (c >> 16) & 0xff;
      pixels[at + 1] = (c >> 8) & 0xff;
      pixels[at + 2] = c & 0xff;
      pixels[at + 3] = 0xff;
    }
  }
}

/** One frame as PNG bytes. */
export function encodeSingle(f) {
  const pixels = Buffer.alloc(f.width * f.height * 4);
  putFrame(pixels, f.width, f, 0);
  return encodePng({ width: f.width, height: f.height, pixels });
}

/** A horizontal frame strip as PNG bytes (`assets/sprites/README.md` layout). */
export function encodeStrip(name, frames) {
  const first = frames[0];
  if (first === undefined) throw new Error(`${name}: no frames`);
  for (const f of frames) {
    if (f.width !== first.width || f.height !== first.height) {
      throw new Error(
        `${name}: frame ${f.name} is not ${String(first.width)}x${String(first.height)}`,
      );
    }
  }
  const width = first.width * frames.length;
  const pixels = Buffer.alloc(width * first.height * 4);
  frames.forEach((f, i) => putFrame(pixels, width, f, i * first.width));
  return encodePng({ width, height: first.height, pixels });
}

/** A strip's sidecar, as the bytes committed next to it. */
export function encodeAnim(anim) {
  return `${JSON.stringify(anim, null, 2)}\n`;
}
