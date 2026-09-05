import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * Der Wirt, as a text grid — the last redraw behind `docs/DECISIONS.md` #55
 * and the one that empties `PENDING_REDRAW` (issue #194).
 *
 * `common/`, not one floor's roster: a shopkeeper is drawn on every floor's
 * palette, so he is authored from the master palette rather than one floor's
 * five, the same allowance `tools/art/authoring/compose.mjs` (Alois) uses.
 * The option round (`CLAUDE.md`) went to three readings, rendered at true
 * scale over Der Keller and Dorf & Acker tiles — a bald innkeeper with a
 * raised stein, a capped one with a bar rag, and an older, grey-bearded one
 * with a serving tray — and the grey-bearded reading won.
 *
 * #55's three rules:
 *
 * - **Proportion.** The head (with hair) is 13 of 32 rows, ~41% — inside
 *   #55's third-to-half band, and close to Alois's own ratio without the Hut.
 * - **Face.** Alois's exact eye-and-mouth block (`FACE` below, copied
 *   verbatim the way `floor2-roster.mjs`'s `HUMAN_FACE` copies it), so the
 *   Wirt reads as the same game rather than a fourth face style.
 * - **Prop.** The serving tray, held in front at chest height — the thing a
 *   shopkeeper is recognisable by at a glance, and the reason his silhouette
 *   is wider than a bare torso would be (the tray's rim sits a pixel past the
 *   shoulder line on each side, so it reads as held rather than worn).
 *
 * Canvas 22×32 — Alois's own height (`docs/DECISIONS.md` #45/#55), a touch
 * wider for the tray to clear the body. Longest inked axis lands at ~1.1× his
 * 28px `normal` collider, comfortably inside `tests/content/sprite-scale.
 * test.ts`'s 0.6-1.8 band and well past the 16px the old art drew at.
 *
 * Two frames, an `idle` breathing loop — the minimum #194 asked for: the head
 * and torso rise a pixel on an in-breath, feet planted, the same `bob` idea
 * `tools/art/authoring/alois.mjs` uses for its own walk/idle.
 */

// ------------------------------------------------------------------ palette
export const WIRT = {
  '.': null,
  K: 0x000000, // outline ink
  k: 0x1c1a1f, // soft dark shadow
  S: 0xe8c28c, // skin (Alois's own — common may share it)
  s: 0xe1ae65, // skin, shadow
  H: 0x54402e, // hair / beard, dark brown
  W: 0xffffff, // eye highlight
  E: 0x274b6b, // iris
  R: 0xd92b3c, // Trachtenhemd red (shirt)
  r: 0xb6212f, // red, shadow
  G: 0x4a2f18, // strap / boot leather, dark
  g: 0x8a5a24, // strap / boot leather, lit
  A: 0xd4af37, // brass (tray rim)
  a: 0xb69427, // brass, shadow
  O: 0xd99a3f, // beer (the stein on the tray)
  P: 0xe893a8, // cheek flush
  z: 0x8a8a8a, // grey hair (temples)
  Z: 0xa1a1a1, // grey hair, lit
};

{
  const legal = legalPixelColorsFor('common');
  for (const [key, colour] of Object.entries(WIRT)) {
    if (colour !== null && !legal.has(colour)) {
      throw new Error(
        `shopkeeper authoring key "${key}" is #${colour.toString(16).padStart(6, '0')}, ` +
          `not legal for common — see tools/art/palette.mjs`,
      );
    }
  }
}

// --------------------------------------------------------------- raster core
function canvas(w, h) {
  return { w, h, px: Array.from({ length: h }, () => Array.from({ length: w }, () => null)) };
}

/** Stamp several row-blocks onto one `w`×`h` character grid, later layers on top. */
function composeRows(w, h, layers) {
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  for (const { rows, x = 0, y = 0 } of layers) {
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === '.') continue;
        const ty = y + ry;
        const tx = x + rx;
        if (ty < 0 || ty >= h || tx < 0 || tx >= w) continue;
        grid[ty][tx] = ch;
      }
    });
  }
  return grid.map((row) => row.join(''));
}

function paint(name, rows) {
  const w = Math.max(...rows.map((row) => row.length));
  if (w === 0) throw new Error(`${name}: no rows`);
  const cv = canvas(w, rows.length);
  rows.forEach((row, y) => {
    const padded = row.padEnd(w, '.');
    for (let x = 0; x < w; x++) {
      const ch = padded[x];
      if (!(ch in WIRT))
        throw new Error(`${name}: row ${String(y)} col ${String(x)} has unknown key "${ch}"`);
      cv.px[y][x] = WIRT[ch];
    }
  });
  return cv;
}

/** 1px `#000000` around every painted pixel that borders emptiness (8-way). */
function inkOutline(cv) {
  const snap = cv.px.map((row) => [...row]);
  const on = (x, y) => x >= 0 && y >= 0 && x < cv.w && y < cv.h && snap[y][x] !== null;
  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      if (on(x, y)) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (on(x + dx, y + dy)) {
            cv.px[y][x] = 0x000000;
            dx = dy = 2;
          }
        }
      }
    }
  }
  return cv;
}

function frameOf(name, cv) {
  return { name, width: cv.w, height: cv.h, px: cv.px };
}

/** A whole frame from one full-canvas text grid, auto-inked. */
function single(name, rows) {
  return frameOf(name, inkOutline(paint(name, rows)));
}

/** Throws if any painted pixel is not legal for `common`. */
export function assertOnPalette(_bucket, framesIn) {
  const legal = legalPixelColorsFor('common');
  for (const f of framesIn) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const c = f.px[y][x];
        if (c !== null && !legal.has(c)) {
          throw new Error(
            `${f.name}: pixel ${x},${y} is #${c.toString(16).padStart(6, '0')}, not legal for common`,
          );
        }
      }
    }
  }
}

function putFrame(pixels, stripWidth, frame, ox) {
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const c = frame.px[y][x];
      if (c === null) continue;
      const at = (y * stripWidth + ox + x) * 4;
      pixels[at] = (c >> 16) & 0xff;
      pixels[at + 1] = (c >> 8) & 0xff;
      pixels[at + 2] = c & 0xff;
      pixels[at + 3] = 0xff;
    }
  }
}

/** A horizontal frame strip as PNG bytes (`assets/sprites/README.md` layout). */
export function encodeStrip(name, frames) {
  const first = frames[0];
  if (first === undefined) throw new Error(`${name}: no frames`);
  for (const f of frames) {
    if (f.width !== first.width || f.height !== first.height) {
      throw new Error(
        `${name}: frame ${f.name} is ${String(f.width)}x${String(f.height)}, ` +
          `expected ${String(first.width)}x${String(first.height)}`,
      );
    }
  }
  const width = first.width * frames.length;
  const pixels = Buffer.alloc(width * first.height * 4);
  frames.forEach((f, i) => putFrame(pixels, width, f, i * first.width));
  return encodePng({ width, height: first.height, pixels });
}

// ============================================================ DER WIRT
export const WIDTH = 22;
export const HEIGHT = 32;

/** Alois's own face block (`tools/art/authoring/compose.mjs`'s head), copied
 * verbatim so the Wirt shares his eye and mouth. */
const FACE = [
  '.KHHHHHHHHHHHHK.',
  '.KHSSHSSSSHSSHK.',
  '.KSSKKKSSKKKSSK.',
  '.KSSWEESSWEESSK.',
  '.KSSEEESSEEESSK.',
  '.KSPSSSSSSSSPSK.',
  '..KSSSSKKSSSSK..',
  '...KSSSSSSSSK...',
  '.....KSSSSK.....',
];
const FACE_X = 3;
const FACE_Y = 3;

// Balding on top, grey at the temples.
const HAIR = ['.......SSSS........', '......SSSSSSSS.....', '.....zZSSSSSSZz....'];

// A full grey beard: a gap at the mouth (`FACE`'s own KK notch shows through
// it), solid over the jaw and chin, no gap there — a beard covers the jaw,
// it does not have a hole in it.
const BEARD = [
  '.zZZZ..ZZzz.z.',
  'zZZZZZZZZZZZzz',
  '.zZZZZZZZZZZz.',
  '..zZZZZZZZZz..',
  '...zZZZZZZ...',
];
const BEARD_X = 4;
const BEARD_Y = 9;

// Torso, apron-less work shirt, and the tray held in front — its brass rim
// sits a pixel past the shoulder on each side so it reads as held, not worn.
const UPPER_BODY = [
  '.......SSSSSS.......',
  '.....RRRRRRRRRR.....',
  '....RRRRRRRRRRRR....',
  '...RRRRRRRRRRRRRR...',
  '..GRRRRRRRRRRRRRRG..',
  '.AGgAAAAAAAAAAAAgGA.',
  '.AGgAOOOOOOOOOOAgGA.',
  '.AGgAOOOOOOOOOOAgGA.',
  '.AGgAAAAAAAAAAAAgGA.',
  '...GgRRRRRRRRRRgG...',
  '....GgRRRRRRRRgG....',
  '.....GgggggggG......',
  '......GGGGGGGG......',
];
const UPPER_BODY_Y = 13;

const LEGS = ['..gg....gg..', '..gg....gg..', '..gg....gg..', '..Gg....gG..', '.GGG....GGG.'];
const LEGS_X = 5;
const LEGS_Y = 26;

export const idle0 = single(
  'shopkeeper-idle-0',
  composeRows(WIDTH, HEIGHT, [
    { rows: HAIR, x: 1, y: 0 },
    { rows: FACE, x: FACE_X, y: FACE_Y },
    { rows: BEARD, x: BEARD_X, y: BEARD_Y },
    { rows: UPPER_BODY, x: 0, y: UPPER_BODY_Y },
    { rows: LEGS, x: LEGS_X, y: LEGS_Y },
  ]),
);

export const idle1 = single(
  'shopkeeper-idle-1',
  composeRows(WIDTH, HEIGHT, [
    { rows: HAIR, x: 1, y: -1 },
    { rows: FACE, x: FACE_X, y: FACE_Y - 1 },
    { rows: BEARD, x: BEARD_X, y: BEARD_Y - 1 },
    { rows: UPPER_BODY, x: 0, y: UPPER_BODY_Y - 1 },
    { rows: LEGS, x: LEGS_X, y: LEGS_Y },
  ]),
);

/** The two-frame `idle` breathing strip `build-shopkeeper.mjs` writes. */
export const SHOPKEEPER_FRAMES = [idle0, idle1];
