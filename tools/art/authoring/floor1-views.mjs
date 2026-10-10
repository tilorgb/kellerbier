import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  VIEW_ANIM,
  assertViewsOnPalette,
  encodeSidecar,
  encodeViewStrip,
  blankFrame,
  bobSteps,
  frameFromRows,
  inkOutline,
  readFrames,
  renamed,
  shifted,
  shiftedRows,
} from './views-kit.mjs';
import { ZAPFHAHN_ANIM, ZAPFHAHN_STRIPS } from './zapfhahn-views.mjs';

/**
 * The per-heading views of the Floor 1 creatures (#439 #440 #441 #442 #456,
 * epic #457): `<id>-side` (authored facing left, mirrored for right),
 * `<id>-south` (toward the camera) and `<id>-north` (away), the filing Alois
 * and Der Ordner have (`assets/sprites/README.md`, "Directions").
 *
 * Every view keeps the canvas of the creature's existing art and the colours of
 * its own palette. Nothing existing is regenerated: the base art is read back
 * from the committed PNGs and the views are derived from it or drawn beside it.
 * Best-guess designs, no sign-off round (the user waived it for this epic).
 *
 *  - Bierratte, Rollfass: the existing single PNG is the side; south/north new.
 *  - Kellerassel: the base strip is *already* head-on (eyes, antennae, front
 *    legs), so its walk frames 0, 1, 2 are the south view; side and north new.
 *  - Der Rattenkoenig: faces the camera already, so the PNG is the south view;
 *    side and north are drawn. Three-frame strips with the common view sidecar.
 *  - Die Grosse Kellerassel (boss): twelve frames each, the existing sidecar
 *    byte for byte — a telegraph pose has to keep reading. South and north are
 *    derived frame by frame from the side frames (carapace squeezed to the
 *    head-on breadth, then a head drawn on / uropods drawn on).
 */

const SPRITES = fileURLToPath(new URL('../../../assets/sprites/floor-1-cellar/', import.meta.url));
export const CHARACTER_DIR = `${SPRITES}characters/`;
export const BOSS_DIR = `${SPRITES}bosses/`;

/** The palette bucket all of these sit in (the boss strips too, `bosses.mjs` BOSS_BUCKETS). */
export const FLOOR1_BUCKET = 'floor-1-cellar';

/* ---------------------------------------------------------------- helpers */

const make = (name, w, h) => blankFrame(name, w, h);
const set = (f, x, y, c) => {
  if (x >= 0 && y >= 0 && x < f.width && y < f.height) f.px[y][x] = c;
};
const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
function ell(f, cx, cy, rx, ry, c) {
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) if (inEll(x, y, cx, cy, rx, ry)) f.px[y][x] = c;
  }
}
function line(f, [x0, y0], [x1, y1], c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    set(f, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  }
}
const copy = (f, name = f.name) => renamed(f, name);
const opaque = (f, x, y) => x >= 0 && y >= 0 && x < f.width && y < f.height && f.px[y][x] !== null;

/** Paints `rim` on every pixel of colour `of` that has a transparent 4-neighbour. */
function rimmed(f, of, rim) {
  const out = copy(f);
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      if (f.px[y][x] !== of) continue;
      if (
        !opaque(f, x - 1, y) ||
        !opaque(f, x + 1, y) ||
        !opaque(f, x, y - 1) ||
        !opaque(f, x, y + 1)
      ) {
        out.px[y][x] = rim;
      }
    }
  }
  return out;
}

/** Stand, then the same body wobbling a pixel up with the top rows leaning each way. */
function wobble(stand, name, topRows) {
  const up = shifted(stand, 0, -1);
  return [
    copy(stand, `${name}-stand`),
    shiftedRows(up, 0, topRows, -1, 0, `${name}-step-a`),
    shiftedRows(up, 0, topRows, 1, 0, `${name}-step-b`),
  ];
}

/* --------------------------------------------------------------- Bierratte */

const RAT = { '.': null, a: 0x36291e, b: 0x54402e, c: 0xffffff, d: 0x72573e, e: 0x1c1a1f };
const RAT_W = 15;
const RAT_H = 16;

/** Rows of an 11-wide core placed on the 15x16 canvas at x 2, y 2. */
function ratCanvas(name, core) {
  const rows = Array.from({ length: RAT_H }, () => '.'.repeat(RAT_W));
  core.forEach((r, i) => {
    rows[2 + i] = `..${r}..`;
  });
  return frameFromRows(name, RAT, rows);
}

const ratSouthStand = ratCanvas('bierratte-south', [
  'aa.......aa',
  'abaaaaaaaba',
  'abbbbbbbbba',
  'abcbbbbbcba',
  'abebbbbbeba',
  'abbbddddbba',
  '.abbdeedbba',
  '.abbbddbbba',
  '..abbbbbba.',
  '..abbbbbba.',
  '..aa...aa..',
]);
const ratNorthStand = ratCanvas('bierratte-north', [
  'aa.......aa',
  'abaaaaaaaba',
  'abbbbbbbbba',
  'abbbbbbbbba',
  'abbbbbbbbba',
  '.abbbbbbbba',
  '.abbbdbbbba',
  '..abbdbbba.',
  '..abbbbbba.',
  '..aa.d.aa..',
  '.....d.....',
]);

/** The existing rat, stepping by sliding its feet apart and bobbing. */
function ratSide(base) {
  const lift = shifted(base, 0, -1);
  return [
    copy(base, 'bierratte-side-stand'),
    shiftedRows(lift, 11, 14, -1, 0, 'bierratte-side-step-a'),
    shiftedRows(lift, 11, 14, 1, 0, 'bierratte-side-step-b'),
  ];
}

/* ------------------------------------------------------------- Kellerassel */

const ASSEL_W = 26;
const ASSEL_H = 18;
const A_DARK = 0x36291e;
const A_LIGHT = 0x72573e;
const A_MID = 0x54402e;

/** The head-on frames of the base strip, stripped of the black stray in the left margin. */
function asselBase() {
  return readFrames(`${CHARACTER_DIR}kellerassel.strip.png`, 7, 'kellerassel');
}

/** A side-on isopod facing left on the 26x18 canvas; `lift` raises that set of legs. */
function asselSide(name, lift) {
  const f = make(name, ASSEL_W, ASSEL_H);
  // dome, centred low so the head hangs out of the front
  for (let y = 3; y <= 13; y++) {
    for (let x = 4; x <= 23; x++) {
      if (!inEll(x, y, 14, 13.5, 10, 10.5)) continue;
      const band = (x + (y >> 1)) % 4 === 0;
      f.px[y][x] = band ? A_DARK : y < 6 ? A_LIGHT : A_MID;
    }
  }
  for (let x = 9; x <= 20; x++) if (f.px[4][x] !== null) f.px[4][x] = A_LIGHT;
  // head: a lighter bulb at the front with an eye and two feelers
  ell(f, 6, 11, 3.2, 3.2, A_LIGHT);
  set(f, 4, 10, 0xffffff);
  set(f, 4, 11, 0x1c1a1f);
  line(f, [4, 8], [1, 5], A_DARK);
  line(f, [5, 8], [3, 4], A_DARK);
  // legs
  [7, 10, 13, 16, 19].forEach((x, i) => {
    const up = lift === (i % 2 === 0 ? 'a' : 'b') ? 1 : 0;
    for (let y = 14; y <= 15 - up; y++) set(f, x, y, A_DARK);
    set(f, x - 1, 16 - up, A_LIGHT);
    set(f, x, 16 - up, A_LIGHT);
  });
  return inkOutline(f);
}

/** The head-on frame turned round: no face, a ridged back, two tail stubs. */
function asselNorth(front, name) {
  const f = copy(front, name);
  const K = 0x000000;
  // antennae, feelers and the stray in the margin go; the face becomes carapace
  for (let y = 0; y < 3; y++) for (let x = 0; x < ASSEL_W; x++) f.px[y][x] = null;
  for (let y = 10; y < 14; y++) {
    for (let x = 7; x <= 19; x++) {
      const c = f.px[y][x];
      if (c === K || c === 0xffffff || c === 0x1c1a1f) f.px[y][x] = A_MID;
    }
  }
  for (let y = 0; y < f.height; y++)
    for (let x = 0; x < f.width; x++) if (f.px[y][x] === K) f.px[y][x] = null;
  for (let y = 3; y < 13; y++) {
    if (f.px[y][13] === A_MID || f.px[y][13] === A_LIGHT) f.px[y][13] = A_DARK;
  }
  for (let x = 8; x <= 18; x++) {
    if (f.px[11][x] === A_MID) f.px[11][x] = A_DARK;
  }
  return inkOutline(f);
}

/* --------------------------------------------------------------- Rollfass */

const R_W = 32;
const R_H = 17;
const R_WOOD = 0x72573e;
const R_DARK = 0x36291e;
const R_MID = 0x54402e;
const R_HOOP = 0x8a8a8a;

/**
 * The barrel rolling along its own axis, seen end-on from the game's tilted
 * camera: the round end face in front of the curve of the body behind it.
 * `phase` rolls the staves a pixel; `back` is the other end (a bung, a cross).
 */
function rollfassEnd(name, phase, back) {
  const f = make(name, R_W, R_H);
  ell(f, 15.5, 7.5, 14.5, 7.3, R_MID); // the body behind the face
  for (let x = 2; x < 30; x += 4) {
    for (let y = 1; y < 16; y++)
      if (f.px[y][x + (phase % 4)] === R_MID) f.px[y][x + (phase % 4)] = R_DARK;
  }
  ell(f, 15.5, 8.5, 11.2, 7.2, R_HOOP); // the iron ring
  ell(f, 15.5, 8.5, 9.6, 6.1, R_WOOD); // the end face
  const planks = back ? [-6, 0, 6] : [-6, -3, 0, 3, 6];
  for (const dx of planks) {
    for (let y = 3; y <= 14; y++) {
      const x = 15 + dx + phase;
      if (inEll(x + 0.5, y, 15.5, 8.5, 9.4, 5.9)) f.px[y][x] = R_DARK;
    }
  }
  if (back) {
    for (let x = 8; x <= 23; x++) if (inEll(x + 0.5, 8.5, 15.5, 8.5, 9.4, 5.9)) f.px[8][x] = R_MID;
    ell(f, 15.5, 8.5, 1.4, 1.4, R_DARK);
  } else {
    set(f, 15, 8, R_MID);
    set(f, 16, 8, R_MID);
  }
  return inkOutline(f);
}

/** The existing side-on barrel rolling: the hoops slide a pixel along the staves. */
function rollfassSide(base) {
  const frames = [copy(base, 'rollfass-side-stand')];
  for (const [dx, tag] of [
    [1, 'step-a'],
    [-1, 'step-b'],
  ]) {
    const f = copy(base, `rollfass-side-${tag}`);
    for (let y = 0; y < f.height; y++) {
      const hoops = [];
      for (let x = 0; x < f.width; x++) if (base.px[y][x] === R_HOOP) hoops.push(x);
      for (const x of hoops) f.px[y][x] = base.px[y][x - 3] ?? R_MID;
      for (const x of hoops) f.px[y][x + dx] = R_HOOP;
    }
    frames.push(f);
  }
  return frames;
}

/* ------------------------------------------------------------ Rattenkoenig */

const K_FUR = 0x54402e;
const K_RIM = 0x36291e;
const K_LIGHT = 0x72573e;
const K_BLACK = 0x1c1a1f;
const K_IRON = 0x8a8a8a;
const K_AMBER = 0xd99a3f;
const K_W = 51;
const K_H = 39;

function crownSide(f, cx, top, base) {
  for (let y = base; y < base + 3; y++) for (let x = cx - 7; x <= cx + 7; x++) set(f, x, y, K_IRON);
  for (const sx of [cx - 6, cx, cx + 6]) {
    for (let i = 0; i < base - top; i++) {
      for (
        let x = sx - Math.floor((base - top - i) / 2);
        x <= sx + Math.floor((base - top - i) / 2);
        x++
      ) {
        set(f, x, top + i, K_IRON);
      }
    }
    set(f, sx, base + 1, K_AMBER);
  }
}

function rkSide() {
  const f = make('der-rattenkoenig-side', K_W, K_H);
  const tails = [
    [
      [45, 26],
      [47, 25],
      [49, 23],
      [49, 20],
    ],
    [
      [45, 29],
      [48, 29],
      [49, 31],
      [48, 33],
    ],
    [
      [45, 32],
      [47, 34],
      [49, 35],
      [49, 37],
    ],
  ];
  ell(f, 29, 25, 19, 12, K_FUR); // hunched body
  ell(f, 14, 23, 11, 9, K_FUR); // head
  ell(f, 25, 17, 3, 3.5, K_FUR); // ear
  ell(f, 25, 17, 1.4, 2, K_LIGHT);
  ell(f, 5.5, 25, 4.5, 3.2, K_LIGHT); // snout
  // haunch
  for (let y = 0; y < K_H; y++) {
    for (let x = 0; x < K_W; x++) {
      const r = ((x - 38) / 8) ** 2 + ((y - 28) / 7) ** 2;
      if (r > 0.7 && r < 1 && x < 41 && y < 31 && f.px[y][x] === K_FUR) f.px[y][x] = K_RIM;
    }
  }
  for (const t of tails) {
    for (let i = 0; i < t.length - 1; i++) {
      line(f, t[i], t[i + 1], K_LIGHT);
      line(f, [t[i][0], t[i][1] + 1], [t[i + 1][0], t[i + 1][1] + 1], K_RIM);
    }
  }
  for (let x = 12; x < 47; x++) if (f.px[36][x] === K_FUR) f.px[36][x] = K_RIM;
  let g = rimmed(rimmed(f, K_FUR, K_RIM), K_LIGHT, K_RIM);
  // face
  for (let x = 8; x <= 12; x++) set(g, x, 17, K_RIM);
  for (let x = 9; x <= 11; x++) for (let y = 19; y <= 20; y++) set(g, x, y, K_BLACK);
  set(g, 9, 19, 0xffffff);
  set(g, 2, 24, K_BLACK);
  set(g, 2, 25, K_BLACK);
  for (let x = 3; x <= 8; x++) set(g, x, 28, K_BLACK);
  set(g, 5, 29, 0xffffff);
  set(g, 6, 29, 0xffffff);
  set(g, 5, 30, 0xffffff);
  set(g, 6, 30, 0xffffff);
  crownSide(g, 14, 6, 11);
  return inkOutline(g);
}

function rkNorth() {
  const f = make('der-rattenkoenig-north', K_W, K_H);
  ell(f, 25, 23, 21, 14, K_FUR);
  ell(f, 9, 11, 4.5, 4, K_FUR);
  ell(f, 41, 11, 4.5, 4, K_FUR);
  ell(f, 9, 11, 2, 2, K_LIGHT);
  ell(f, 41, 11, 2, 2, K_LIGHT);
  // haunches and spine
  for (let y = 0; y < K_H; y++) {
    for (let x = 0; x < K_W; x++) {
      for (const cx of [14, 36]) {
        const r = ((x - cx) / 8) ** 2 + ((y - 29) / 7) ** 2;
        if (r > 0.7 && r < 1 && y < 32 && f.px[y][x] === K_FUR) f.px[y][x] = K_RIM;
      }
    }
  }
  for (let y = 14; y <= 28; y += 2) set(f, 25, y, K_LIGHT);
  // three tails hanging down the back
  [
    [
      [21, 30],
      [20, 32],
      [22, 34],
      [21, 36],
    ],
    [
      [25, 31],
      [26, 33],
      [24, 35],
      [25, 37],
    ],
    [
      [29, 30],
      [30, 32],
      [28, 34],
      [29, 36],
    ],
  ].forEach((t) => {
    for (let i = 0; i < t.length - 1; i++) {
      line(f, t[i], t[i + 1], K_LIGHT);
      line(f, [t[i][0] + 1, t[i][1]], [t[i + 1][0] + 1, t[i + 1][1]], K_RIM);
    }
  });
  for (const [x0, x1] of [
    [10, 15],
    [35, 40],
  ]) {
    for (let x = x0; x <= x1; x++) {
      set(f, x, 36, K_RIM);
      set(f, x, 37, K_RIM);
    }
  }
  const g = rimmed(rimmed(f, K_FUR, K_RIM), K_LIGHT, K_RIM);
  // the back of the crown
  for (let y = 7; y <= 10; y++) for (let x = 16; x <= 34; x++) set(g, x, y, K_IRON);
  for (const sx of [17, 25, 33]) {
    for (let i = 0; i < 5; i++) {
      for (let x = sx - Math.floor((5 - i) / 2); x <= sx + Math.floor((5 - i) / 2); x++)
        set(g, x, 2 + i, K_IRON);
    }
  }
  for (let x = 16; x <= 34; x += 2) set(g, x, 10, 0x71767b);
  return inkOutline(g);
}

/* ---------------------------------------------------- Grosse Kellerassel */

const BOSS_W = 140;
const BOSS_H = 86;
const BROWNS = [0x8f6d4e, 0x72573e, 0x54402e, 0x36291e];
const GREYS = { hi: 0x767b80, lit: 0x71767b, mid: 0x606468, dark: 0x4a4d50, deep: 0x343638 };
const isBrown = (c) => BROWNS.includes(c);

/** The head's centre in a side frame: the grey mass around where it hangs. */
function bossHead(f) {
  let cx = 40;
  let cy = 59;
  for (let i = 0; i < 6; i++) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    f.px.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === null || c === 0 || isBrown(c)) return;
        if ((x - cx) ** 2 + (y - cy) ** 2 <= 13 ** 2) {
          sx += x;
          sy += y;
          n++;
        }
      }),
    );
    if (n > 0) {
      cx = sx / n;
      cy = sy / n;
    }
  }
  return { cx, cy };
}

/**
 * One side frame seen end-on: the carapace squeezed to the head-on breadth and
 * re-banded across its back (the side stripes would read as vertical seams),
 * with `head` (a face drawn in front) or without (the uropods behind).
 */
function bossView(f, name, head, shade) {
  const { cy } = bossHead(f);
  const SRC1 = 138;
  const DST0 = 37;
  const DST1 = 103;
  const out = make(name, BOSS_W, BOSS_H);
  // 1. the back half of the side view (apex to rump), squeezed to the head-on
  //    breadth and mirrored, so the dome is symmetrical; ink is dropped (re-inked below)
  const mid = (DST0 + DST1) / 2;
  const SRC_MID = 84;
  for (let x = mid; x <= DST1; x++) {
    const sx = Math.round(SRC_MID + ((x - mid) * (SRC1 - SRC_MID)) / (DST1 - mid));
    for (let y = 0; y < BOSS_H; y++) {
      const c = f.px[y][sx];
      if (c === null || c === 0) continue;
      out.px[y][x] = c;
      out.px[y][2 * mid - x] = c;
    }
  }
  // 2. the carapace re-banded in arcs following its top
  const top = Array.from({ length: BOSS_W }, () => null);
  const bottom = Array.from({ length: BOSS_W }, () => null);
  for (let x = 0; x < BOSS_W; x++) {
    for (let y = 0; y < BOSS_H; y++) {
      if (isBrown(out.px[y][x])) {
        top[x] ??= y;
        bottom[x] = y;
      }
    }
  }
  for (let x = 0; x < BOSS_W; x++) {
    if (top[x] === null) continue;
    for (let y = top[x]; y <= bottom[x]; y++) {
      if (!isBrown(out.px[y][x])) continue;
      let l = x;
      while (isBrown(out.px[y][l - 1])) l--;
      let r = x;
      while (isBrown(out.px[y][r + 1])) r++;
      const inset = Math.min(x - l, r - x);
      const depth = y - top[x];
      let tone = inset < 3 ? 3 : inset < 7 ? 2 : 1;
      if (depth % 7 === 0 && depth > 0) tone += 1;
      if (inEll(x, y, mid - 13, top[mid] + 16, 6, 8) && depth % 7 !== 0) tone = 0;
      tone = Math.max(0, Math.min(3, tone + shade));
      out.px[y][x] = BROWNS[tone];
    }
  }
  // 3. the head, or the tail end
  const baseY = Math.max(...bottom.filter((b) => b !== null));
  if (head) {
    const hy = Math.round(cy);
    for (let y = hy - 12; y <= hy + 12; y++) {
      for (let x = 58; x <= 82; x++) {
        if (!inEll(x, y, 70, hy, 12, 12)) continue;
        const lit = (x - 64) ** 2 + (y - (hy - 5)) ** 2;
        out.px[y][x] =
          lit < 28
            ? GREYS.hi
            : lit < 80
              ? GREYS.lit
              : lit < 190
                ? GREYS.mid
                : y > hy + 5
                  ? GREYS.deep
                  : GREYS.dark;
      }
    }
    for (const ex of [63, 74]) {
      for (let dy = 0; dy < 3; dy++)
        for (let dx = 0; dx < 3; dx++) set(out, ex + dx, hy + dy, 0x1c1a1f);
      set(out, ex, hy, 0xffffff);
    }
    for (let x = 66; x <= 73; x++) set(out, x, hy + 7, GREYS.deep);
    for (let i = 0; i < 18; i++) {
      set(out, 60 - i, hy - 9 - Math.floor(i * 0.9), GREYS.lit);
      set(out, 60 - i, hy - 8 - Math.floor(i * 0.9), GREYS.mid);
      set(out, 80 + i, hy - 9 - Math.floor(i * 0.9), GREYS.lit);
      set(out, 80 + i, hy - 8 - Math.floor(i * 0.9), GREYS.mid);
    }
  } else {
    for (const ux of [64, 74]) {
      for (let y = baseY - 1; y <= baseY + 4; y++) {
        for (let x = ux; x <= ux + 2; x++) set(out, x, y, y > baseY + 2 ? GREYS.dark : GREYS.mid);
      }
      set(out, ux, baseY, GREYS.hi);
    }
  }
  return inkOutline(out);
}

function bossViews(side, name, head) {
  const idx = (f) => {
    const all = f.px.flat().filter(isBrown);
    return all.reduce((s, c) => s + BROWNS.indexOf(c), 0) / Math.max(1, all.length);
  };
  const means = side.map(idx);
  const avg = means.reduce((s, m) => s + m, 0) / means.length;
  return side.map((f, i) =>
    bossView(
      f,
      `${name}-${String(i)}`,
      head,
      means[i] < avg - 0.2 ? -1 : means[i] > avg + 0.2 ? 1 : 0,
    ),
  );
}

/* ----------------------------------------------------------------- strips */

const stripNames = (frames, name) => frames.map((f, i) => ({ ...f, name: `${name}-${String(i)}` }));

const ratSide0 = readFrames(`${CHARACTER_DIR}bierratte.png`, 1, 'bierratte')[0];
const rollfass0 = readFrames(`${CHARACTER_DIR}rollfass.png`, 1, 'rollfass')[0];
const zapfhahn0 = readFrames(`${CHARACTER_DIR}zapfhahn.png`, 1, 'zapfhahn')[0];
const rattenkoenig0 = readFrames(`${CHARACTER_DIR}der-rattenkoenig.png`, 1, 'der-rattenkoenig')[0];
const asselFrames = asselBase();
const bossSide = readFrames(`${BOSS_DIR}grosse-kellerassel.strip.png`, 12, 'grosse-kellerassel');
const bossAnim = JSON.parse(readFileSync(`${BOSS_DIR}grosse-kellerassel.anim.json`, 'utf8'));

/** A creature's walking set: standing, step a, step b. */
const walk = (name, stand, a, b) => [
  { ...stand, name: `${name}-stand` },
  { ...a, name: `${name}-step-a` },
  { ...b, name: `${name}-step-b` },
];

export const CHARACTER_STRIPS = {
  'bierratte-side': ratSide(ratSide0),
  'bierratte-south': wobble(ratSouthStand, 'bierratte-south', 6),
  'bierratte-north': wobble(ratNorthStand, 'bierratte-north', 6),

  // the base strip's walk frames 0, 1, 2 *are* the head-on view
  'kellerassel-south': stripNames(asselFrames.slice(0, 3), 'kellerassel-south'),
  'kellerassel-side': walk(
    'kellerassel-side',
    asselSide('s', 'none'),
    asselSide('a', 'a'),
    asselSide('b', 'b'),
  ),
  'kellerassel-north': asselFrames
    .slice(0, 3)
    .map((f, i) => asselNorth(f, `kellerassel-north-${String(i)}`)),

  'rollfass-side': rollfassSide(rollfass0),
  'rollfass-south': [0, 1, 2].map((p) =>
    rollfassEnd(`rollfass-south-${String(p)}`, p === 2 ? 0 : p, false),
  ),
  'rollfass-north': [0, 1, 2].map((p) =>
    rollfassEnd(`rollfass-north-${String(p)}`, p === 2 ? 0 : p, true),
  ),

  'der-rattenkoenig-south': wobble(rattenkoenig0, 'der-rattenkoenig-south', 6),
  'der-rattenkoenig-side': bobSteps(rkSide(), 'der-rattenkoenig-side'),
  'der-rattenkoenig-north': bobSteps(rkNorth(), 'der-rattenkoenig-north'),

  ...ZAPFHAHN_STRIPS,
};

export const BOSS_STRIPS = {
  'grosse-kellerassel-side': bossSide.map((f, i) => ({
    ...f,
    name: `grosse-kellerassel-side-${String(i)}`,
  })),
  'grosse-kellerassel-south': bossViews(bossSide, 'grosse-kellerassel-south', true),
  'grosse-kellerassel-north': bossViews(bossSide, 'grosse-kellerassel-north', false),
};

/** Sidecars by strip name; strips not listed use `VIEW_ANIM`. */
export const CHARACTER_SIDECARS = Object.fromEntries(
  Object.keys(ZAPFHAHN_STRIPS).map((n) => [n, ZAPFHAHN_ANIM]),
);
export const BOSS_SIDECARS = Object.fromEntries(Object.keys(BOSS_STRIPS).map((n) => [n, bossAnim]));

export { VIEW_ANIM, encodeSidecar, encodeViewStrip };

/** The canvas each creature's three strips must share: its existing art's. */
export const BASE_CANVAS = {
  bierratte: [ratSide0.width, ratSide0.height],
  kellerassel: [asselFrames[0].width, asselFrames[0].height],
  rollfass: [rollfass0.width, rollfass0.height],
  'der-rattenkoenig': [rattenkoenig0.width, rattenkoenig0.height],
  zapfhahn: [zapfhahn0.width, zapfhahn0.height],
  'grosse-kellerassel': [bossSide[0].width, bossSide[0].height],
};

export function assertOnPalette() {
  assertViewsOnPalette(FLOOR1_BUCKET, CHARACTER_STRIPS);
  assertViewsOnPalette(FLOOR1_BUCKET, BOSS_STRIPS);
}
