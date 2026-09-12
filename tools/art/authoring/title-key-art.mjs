import {
  canvas,
  ellipse,
  fillRect,
  line,
  outline,
  poly,
  roundRect,
  stamp,
  toRows,
} from './draw.mjs';

/**
 * The title screen's key art, as a composition.
 *
 * Alois with the Maß up, mid-shout, in the mouth of a lit cellar arch —
 * `src/render/title-screen.ts`'s right-hand pane, and the one drawing in the
 * game nobody has to read. `npm run art:title` writes it out to
 * `src/render/ui/title-key-art.ts`, and
 * `tests/art/title-key-art-authoring.test.ts` fails a pull request where the
 * two have drifted apart, the same contract `alois.mjs` has with the strips it
 * generates.
 *
 * The palette is deliberately the character art's, key for key
 * (`compose.mjs`'s `PIXEL_KEYS`), plus five values for the wall and the arch
 * behind him. It does not have to be — this is UI art, and
 * `docs/DECISIONS.md` #43 frees it from the atlas's per-floor palettes — but a
 * poster of the character wants the *same* skin, the same Trachtenhut green
 * and the same brass as the sprite it is a poster of.
 */

/** The colour every character in the drawing stands for. `.` is transparent. */
export const PALETTE = {
  K: 0x120c0a,
  k: 0x1c1a1f,
  S: 0xe8c28c,
  s: 0xe1ae65,
  P: 0xe893a8,
  H: 0x54402e,
  D: 0x36291e,
  R: 0xd92b3c,
  M: 0xb6212f,
  W: 0xffffff,
  E: 0x274b6b,
  B: 0x8a5a24,
  n: 0xae722d,
  G: 0x4a2f18,
  g: 0x27190d,
  A: 0xd4af37,
  T: 0x3f7a3a,
  t: 0x2f5b2b,
  F: 0xf5f0e6,
  f: 0xd7cdb8,
  o: 0xd99a3f,
  O: 0xf0c46a,
  C: 0xe8e2d0,
  1: 0x1e1712,
  2: 0x352a24,
  3: 0x14100c,
  5: 0x5a3a1c,
};

/**
 * Two internal pixels per authored pixel.
 *
 * `docs/DECISIONS.md` #45 makes a *sprite's* canvas its size on screen; this is
 * not a sprite, and a 640×360 frame is not big enough to hold an illustration
 * drawn at the HUD's own pixel. Doubling is what buys a poster-sized drawing,
 * and it is a whole number for `render/resolution.ts`'s reason.
 */
export const SCALE = 2;

const WIDTH = 128;
const HEIGHT = 104;

/** Cellar brick, with a lit arch behind him — the mouth he is standing in. */
function backdrop() {
  const c = canvas(WIDTH, HEIGHT, '1');
  for (let y = 3; y < HEIGHT; y += 7) fillRect(c, 0, y, WIDTH, 1, '3');
  for (let y = 3; y < HEIGHT; y += 7) {
    const offset = ((y / 7) | 0) % 2 === 0 ? 0 : 8;
    for (let x = offset; x < WIDTH; x += 16) fillRect(c, x, y, 1, 7, '3');
  }
  // Wide enough to read as architecture. Drawn tight to the head, the same
  // shape read as long hair instead.
  const arch = canvas(WIDTH, HEIGHT);
  poly(
    arch,
    [
      [12, HEIGHT],
      [12, 40],
      [116, 40],
      [116, HEIGHT],
    ],
    '2',
  );
  ellipse(arch, 64, 40, 52, 34, '2');
  poly(
    arch,
    [
      [18, HEIGHT],
      [18, 44],
      [110, 44],
      [110, HEIGHT],
    ],
    '5',
  );
  ellipse(arch, 64, 44, 46, 29, '5');
  stamp(c, arch, 0, 0);
  return c;
}

/** The Maß: a litre of it, with the head standing proud of the rim. */
function mass() {
  const c = canvas(48, 46);
  // The handle first, so the body covers where the two meet.
  ellipse(c, 30, 26, 9, 9, 'C');
  ellipse(c, 30, 26, 5, 5, '.');
  fillRect(c, 18, 17, 12, 18, '.');
  roundRect(c, 2, 8, 24, 34, 3, 'C');
  fillRect(c, 5, 16, 18, 23, 'o');
  fillRect(c, 5, 16, 18, 3, 'O');
  roundRect(c, 2, 3, 24, 12, 4, 'F');
  ellipse(c, 8, 5, 6, 4, 'F');
  ellipse(c, 20, 4, 7, 4, 'F');
  fillRect(c, 4, 13, 20, 2, 'f');
  poly(
    c,
    [
      [2, 12],
      [6, 12],
      [4, 22],
      [1, 20],
    ],
    'F',
  );
  // Glass: lit down one wall, shaded down the other.
  fillRect(c, 4, 18, 2, 18, 'W');
  fillRect(c, 21, 18, 2, 18, 'f');
  outline(c);
  return c;
}

function figure() {
  const c = canvas(WIDTH, HEIGHT);
  poly(
    c,
    [
      [28, 76],
      [44, 62],
      [74, 62],
      [90, 76],
      [96, HEIGHT],
      [22, HEIGHT],
    ],
    'R',
  );
  poly(
    c,
    [
      [74, 64],
      [90, 76],
      [96, HEIGHT],
      [78, HEIGHT],
    ],
    'M',
  );
  poly(
    c,
    [
      [48, 64],
      [55, 64],
      [51, HEIGHT],
      [42, HEIGHT],
    ],
    'G',
  );
  poly(
    c,
    [
      [65, 64],
      [72, 64],
      [78, HEIGHT],
      [69, HEIGHT],
    ],
    'G',
  );
  ellipse(c, 45, 94, 2, 2, 'A');
  ellipse(c, 74, 94, 2, 2, 'A');

  // The raised arm: sleeve to the elbow, then a bare forearm reaching for the
  // handle. The fist itself is stamped after the Maß, so it closes over it.
  line(c, 42, 70, 32, 54, 'R', 14);
  line(c, 32, 56, 28, 38, 'S', 11);
  // The other arm, thrown out at whatever is coming.
  line(c, 78, 70, 98, 64, 'R', 14);
  line(c, 98, 64, 112, 58, 'S', 11);
  ellipse(c, 115, 57, 8, 7, 'S');
  fillRect(c, 110, 52, 8, 3, 's');

  fillRect(c, 50, 54, 16, 12, 's');
  // A wide, heavy head: a jaw at the bottom of it, not a circle.
  poly(
    c,
    [
      [41, 30],
      [75, 30],
      [73, 50],
      [66, 58],
      [50, 58],
      [43, 50],
    ],
    'S',
  );
  ellipse(c, 58, 36, 17, 11, 'S');
  ellipse(c, 39, 42, 3, 4, 'S');
  ellipse(c, 77, 42, 3, 4, 'S');
  // Sideburns, not hair: the Hut covers everything above them.
  fillRect(c, 42, 33, 2, 7, 'H');
  fillRect(c, 73, 33, 2, 7, 'H');
  ellipse(c, 50, 39, 4, 3, 'W');
  ellipse(c, 66, 39, 4, 3, 'W');
  ellipse(c, 51, 40, 2, 2, 'E');
  ellipse(c, 65, 40, 2, 2, 'E');
  ellipse(c, 51, 40, 1, 1, 'K');
  ellipse(c, 65, 40, 1, 1, 'K');
  line(c, 44, 32, 55, 34, 'D', 3);
  line(c, 61, 34, 72, 32, 'D', 3);
  ellipse(c, 58, 46, 3, 3, 's');
  ellipse(c, 58, 53, 7, 5, 'K');
  fillRect(c, 53, 50, 11, 2, 'W');
  ellipse(c, 58, 56, 4, 2, 'M');
  ellipse(c, 44, 48, 4, 3, 'P');
  ellipse(c, 72, 48, 4, 3, 'P');

  // The Hut, last, so its brim shades the face.
  ellipse(c, 58, 28, 30, 6, 't');
  poly(
    c,
    [
      [43, 8],
      [73, 8],
      [78, 28],
      [38, 28],
    ],
    'T',
  );
  fillRect(c, 39, 22, 38, 5, 'g');
  // The Gamsbart: a tuft off the band, narrow where it is bound and splayed
  // at the tip — a pompom is the one shape it must not be.
  poly(
    c,
    [
      [76, 22],
      [80, 22],
      [86, 6],
      [82, 8],
      [80, 4],
      [78, 10],
    ],
    'F',
  );
  poly(
    c,
    [
      [78, 20],
      [80, 20],
      [83, 9],
      [80, 12],
    ],
    'f',
  );
  outline(c);
  return c;
}

/** The hand that closes round the handle — drawn over the Maß, not under it. */
function fist() {
  const c = canvas(18, 16);
  ellipse(c, 9, 8, 7, 6, 'S');
  fillRect(c, 3, 4, 12, 3, 's');
  fillRect(c, 3, 10, 12, 2, 's');
  outline(c);
  return c;
}

export function build() {
  const c = backdrop();
  stamp(c, figure(), 6, 0);
  stamp(c, mass(), 0, 2);
  stamp(c, fist(), 23, 20);
  return toRows(c);
}
