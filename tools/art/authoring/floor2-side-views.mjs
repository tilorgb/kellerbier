import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RURAL } from './floor2-roster.mjs';
import {
  assertViewsOnPalette,
  blankFrame,
  bobSteps,
  encodeSidecar,
  encodeViewStrip,
  frameFromRows,
  inkOutline,
  mirrored,
  readFrames,
  renamed,
  shifted,
  viewAnim,
} from './views-kit.mjs';

/**
 * Floor 2's side-on creatures, given the other two headings (#443-#447, epic
 * #457): `<id>-side` (the existing art, authored facing left and mirrored for
 * right), `<id>-south` (toward the camera) and `<id>-north` (away), the filing
 * Alois and Der Ordner have (`assets/sprites/README.md`, "Directions").
 *
 *   Gockel, Kuh, Traktor, Der Ladewagen — hand-authored as text grids on the
 *   same canvas as the base art, in the roster's `RURAL` colour key.
 *   Der Stier — the boss. His strips keep all twelve frames and the committed
 *   `der-stier.anim.json` clips verbatim (the telegraph pose is gameplay), so
 *   each view is derived frame by frame from the side frames: the barrel is
 *   squeezed to a head-on / tail-on width, which keeps every leg beat, dip and
 *   death slump, and a hand-drawn head (or rump and tail) is placed on the
 *   eye position of that frame's side head.
 *
 * Best-guess designs, no sign-off round (the user waived it for this epic).
 */

const ART = fileURLToPath(new URL('../../../assets/sprites/floor-2-rural/', import.meta.url));
const CHAR = `${ART}characters/`;
const BOSS = `${ART}bosses/`;

const BUCKET = 'floor-2-rural';

// ---------------------------------------------------------------- grid tools
function grid(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
}
function rect(g, x, y, w, h, ch) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (yy >= 0 && yy < g.length && xx >= 0 && xx < g[0].length) g[yy][xx] = ch;
    }
  }
}
/** Paint `rows` at (x, y); '.' leaves what is there. */
function blit(g, rows, x, y) {
  rows.forEach((row, ry) => {
    [...row].forEach((ch, rx) => {
      if (ch !== '.') rect(g, x + rx, y + ry, 1, 1, ch);
    });
  });
}
/** A symmetric picture from its left half. */
function symmetric(half) {
  return half.map((row) => row + [...row].reverse().join(''));
}
/** A rect with its four corner pixels knocked out. */
function rounded(g, x, y, w, h, ch) {
  rect(g, x, y, w, h, ch);
  for (const [cx, cy] of [
    [x, y],
    [x + w - 1, y],
    [x, y + h - 1],
    [x + w - 1, y + h - 1],
  ]) {
    g[cy][cx] = '.';
  }
}
function toFrame(name, g) {
  return frameFromRows(
    name,
    RURAL,
    g.map((r) => r.join('')),
  );
}
/** Stand + a step on each foot, from a leg-lift pair builder. */
function legged(name, build) {
  return [
    build(`${name}-stand`, 0, 0),
    build(`${name}-step-a`, 1, 0),
    build(`${name}-step-b`, 0, 1),
  ];
}

// ------------------------------------------------------------------- Gockel
const GOCKEL_W = 22;
const GOCKEL_H = 26;

function gockelBody(g, back) {
  // comb
  rect(g, 10, 1, 2, 1, 'b');
  rect(g, 9, 2, 4, 1, 'b');
  rect(g, 8, 3, 6, 1, 'b');
  rounded(g, 6, 4, 10, 8, 'C');
  if (back) {
    rect(g, 9, 9, 4, 3, 'o');
  } else {
    // eyes on the front of the face, beak between them
    blit(g, ['We', 'ee'], 7, 6);
    blit(g, ['eW', 'ee'], 13, 6);
    rect(g, 10, 8, 2, 2, 'S');
    g[9][10] = 'S';
  }
  // round body, wings darker at the sides
  rect(g, 4, 11, 14, 1, 'C');
  rect(g, 3, 12, 16, 6, 'C');
  rect(g, 4, 18, 14, 1, 'C');
  rect(g, 6, 19, 10, 1, 'C');
  rect(g, 3, 12, 1, 6, 'o');
  rect(g, 18, 12, 1, 6, 'o');
  rect(g, 4, 18, 1, 1, 'o');
  rect(g, 17, 18, 1, 1, 'o');
  if (back) {
    // the tail fan, seen end-on, over the middle of the back
    rect(g, 9, 11, 4, 1, 'b');
    rect(g, 8, 12, 6, 6, 'b');
    rect(g, 10, 12, 1, 6, 'd');
    rect(g, 11, 13, 1, 5, 'd');
    rect(g, 9, 18, 4, 1, 'd');
  }
}
function gockelView(name, lifts, back) {
  const g = grid(GOCKEL_W, GOCKEL_H);
  gockelBody(g, back);
  const [la, lb] = lifts;
  rect(g, 8, 20, 2, 3 - la, 'S');
  rect(g, 12, 20, 2, 3 - lb, 'S');
  rect(g, 6, 23 - la, 5, 1, 'k');
  rect(g, 11, 23 - lb, 5, 1, 'k');
  return toFrame(name, g);
}

// ---------------------------------------------------------------------- Kuh
const KUH_W = 44;
const KUH_H = 32;

const KUH_HEAD = [
  '..SS..............SS..',
  '..SS..............SS..',
  '...SSCCCCCCCCCCCCSS...',
  'bbbbCCCCCCCCCCCCCCbbbb',
  'bbbbCCCCCCCCCCCCCCbbbb',
  '.bbbCCCCCCCCCCCCCCbbb.',
  '....CCCCCCCCCCCCCC....',
  '....CCWeCCCCCCeWCC....',
  '....CCeeCCCCCCeeCC....',
  '....CCCCCCCCCCCCCC....',
  '.....CCCCCCCCCCCC.....',
  '.....oooooooooooo.....',
  '.....ooKKooooKKoo.....',
  '.....oooooooooooo.....',
  '......oooooooooo......',
];

function kuhLegs(g, x1, x2, lifts, hind) {
  const [la, lb] = lifts;
  for (const [x, lift] of [
    [x1, la],
    [x2, lb],
  ]) {
    rect(g, x, 25, 5, 4 - lift, 'C');
    rect(g, hind ? x + 4 : x, 25, 1, 4 - lift, 'o');
    rect(g, x, 29 - lift, 5, 2, 'k');
  }
}
function kuhView(name, lifts, back) {
  const g = grid(KUH_W, KUH_H);
  if (!back) {
    rounded(g, 9, 11, 26, 14, 'C');
    rect(g, 9, 13, 2, 11, 'o');
    rect(g, 33, 13, 2, 11, 'o');
    rect(g, 11, 24, 22, 1, 'o');
    rounded(g, 10, 14, 6, 7, 'b');
    kuhLegs(g, 13, 27, lifts, false);
    blit(g, KUH_HEAD, 11, 1);
  } else {
    // horns and ears poking out beside the poll, then the broad rump over it
    blit(g, ['SS..........SS', 'SS..........SS'], 15, 1);
    rect(g, 15, 3, 14, 6, 'C');
    rect(g, 10, 5, 5, 3, 'b');
    rect(g, 29, 5, 5, 3, 'b');
    rounded(g, 8, 8, 28, 17, 'C');
    rect(g, 8, 11, 2, 13, 'o');
    rect(g, 34, 11, 2, 13, 'o');
    rect(g, 9, 24, 26, 1, 'o');
    rect(g, 21, 9, 2, 5, 'o');
    rounded(g, 9, 11, 11, 10, 'b');
    rect(g, 12, 12, 3, 1, 'B');
    kuhLegs(g, 11, 28, lifts, true);
    // the tail, down the middle, with its blue tuft
    rect(g, 21, 13, 2, 10, 'o');
    rect(g, 20, 22, 4, 5, 'b');
  }
  return toFrame(name, g);
}

// ------------------------------------------------------------------ Traktor
const TRAKTOR_W = 31;
const TRAKTOR_H = 22;

function tyre(g, x, y, w, h) {
  rect(g, x, y, w, h, 'k');
  for (let yy = y + 1; yy < y + h; yy += 2) rect(g, x, yy, 1, 1, 'g');
  const hw = Math.max(2, Math.floor(w / 3));
  rect(g, x + Math.floor((w - hw) / 2), y + Math.floor(h / 2) - 1, hw, 3, 'C');
}
function traktorFront(name) {
  const g = grid(TRAKTOR_W, TRAKTOR_H);
  tyre(g, 1, 7, 5, 14); // the big rear wheels peeking out behind
  tyre(g, 25, 7, 5, 14);
  rect(g, 9, 1, 13, 2, 'L');
  rect(g, 9, 3, 13, 9, 'n');
  rect(g, 10, 3, 11, 6, 'y');
  rect(g, 15, 3, 1, 6, 'n');
  rect(g, 11, 10, 9, 10, 'n');
  rect(g, 11, 10, 9, 1, 'N');
  rect(g, 12, 12, 7, 6, 'k');
  for (const y of [13, 15, 17]) rect(g, 12, y, 7, 1, 'g');
  rect(g, 10, 11, 2, 2, 'W');
  rect(g, 19, 11, 2, 2, 'W');
  rect(g, 10, 19, 11, 2, 'g');
  tyre(g, 3, 12, 6, 9); // the small front wheels
  tyre(g, 22, 12, 6, 9);
  return toFrame(name, g);
}
function traktorBack(name) {
  const g = grid(TRAKTOR_W, TRAKTOR_H);
  rect(g, 23, 1, 2, 9, 'g'); // exhaust stack, up behind the right wheel
  rect(g, 22, 1, 4, 1, 'h');
  rect(g, 23, 1, 2, 1, 'k');
  rect(g, 10, 1, 11, 2, 'L');
  rect(g, 10, 3, 11, 13, 'n');
  rect(g, 11, 3, 9, 6, 'y');
  rect(g, 15, 3, 1, 6, 'n');
  rect(g, 10, 9, 11, 1, 'N');
  rect(g, 11, 12, 9, 2, 'm');
  rect(g, 13, 17, 5, 3, 'g'); // hitch
  rect(g, 15, 18, 1, 1, 'k');
  tyre(g, 1, 6, 9, 15);
  tyre(g, 21, 6, 9, 15);
  return toFrame(name, g);
}

// ------------------------------------------------------------- Der Ladewagen
const LADE_W = 40;
const LADE_H = 31;

function wagonWheel(g, x, y) {
  rounded(g, x, y, 10, 9, 'h');
  rect(g, x + 1, y + 1, 8, 7, 'g');
  rect(g, x + 3, y + 2, 4, 5, 'h');
}
function hay(g, top) {
  const rows = [
    [12, 16],
    [9, 22],
    [7, 26],
    [6, 28],
    [6, 28],
    [5, 30],
    [5, 30],
    [5, 30],
  ];
  rows.forEach(([x, w], i) => {
    rect(g, x, top + i, w, 1, 'C');
  });
  for (let y = top; y < top + rows.length; y++) {
    for (let x = 5; x < 35; x++) {
      if (g[y][x] === 'C' && (x * 7 + y * 3) % 9 === 0) g[y][x] = 'o';
    }
  }
}
function ladeFront(name) {
  const g = grid(LADE_W, LADE_H);
  hay(g, 1);
  rect(g, 5, 9, 30, 12, 'h');
  rect(g, 6, 10, 28, 10, 'g');
  for (const x of [8, 14, 25, 31]) rect(g, x, 11, 2, 8, 'n');
  rect(g, 13, 6, 14, 2, 'L');
  rect(g, 13, 8, 14, 13, 'n');
  rect(g, 14, 8, 12, 5, 'y');
  rect(g, 19, 8, 2, 5, 'n');
  rect(g, 13, 13, 14, 1, 'N');
  rect(g, 15, 15, 10, 5, 'k');
  for (const y of [16, 18]) rect(g, 15, y, 10, 1, 'g');
  rect(g, 11, 14, 2, 2, 'W');
  rect(g, 27, 14, 2, 2, 'W');
  wagonWheel(g, 2, 21);
  wagonWheel(g, 28, 21);
  return toFrame(name, g);
}
function ladeBack(name) {
  const g = grid(LADE_W, LADE_H);
  rect(g, 19, 1, 2, 5, 'g'); // the exhaust stack behind the hay
  rect(g, 18, 1, 4, 1, 'G');
  hay(g, 3);
  rect(g, 4, 11, 32, 11, 'h');
  rect(g, 5, 12, 30, 9, 'n');
  for (const y of [14, 17]) rect(g, 5, y, 30, 1, 'm');
  rect(g, 19, 12, 2, 9, 'm');
  rect(g, 6, 19, 3, 1, 'S'); // tail lamps
  rect(g, 31, 19, 3, 1, 'S');
  rect(g, 18, 22, 4, 6, 'g');
  rect(g, 19, 25, 2, 2, 'k');
  wagonWheel(g, 2, 21);
  wagonWheel(g, 28, 21);
  return toFrame(name, g);
}

// ----------------------------------------------------------------- Der Stier
const STIER_W = 116;
const STIER_H = 100;
const STIER_SIDE = readFrames(`${BOSS}der-stier.strip.png`, 12, 'der-stier-side');
const STIER_ANIM = JSON.parse(readFileSync(`${BOSS}der-stier.anim.json`, 'utf8'));

const BULL = {
  '.': null,
  K: 0x000000,
  d: 0x332f38,
  e: 0x494451,
  f: 0x1c1a1f,
  b: 0xe8e2d0,
  j: 0xd9cfb1,
  c: 0xcabc92,
  W: 0xffffff,
  g: 0x3f7a3a,
  h: 0x64b25e,
};
const SIDE_EYE = [25, 29];
const SQUEEZE = 0.7;
const CENTRE_SRC = 81;
const CENTRE_OUT = 58;

const BULL_HORN = [
  '.jb...............',
  '.bbb..............',
  '.cbb..............',
  '..cbb.............',
  '..cbbb............',
  '...cbb............',
  '...cbbb...........',
];
const BULL_FACE = [
  '....cbbdddddddddd'.padEnd(18, 'd'),
  '.....cbddddddddeee',
  '....ddddddddddeeee',
  '...dddddddddddeeee',
  '..ddddddddddddeeee',
  'fffddddddddddddeee',
  'ffffdddddddddddeee',
  'ffeedddddddddddeee',
  'ffffddddddddddeeee',
  '.fffddddddddddeeee',
  '..ffddddddddddeeee',
  '...dddddddddddeeee',
  '...ddddddddddeeeee',
  '...ddffffddddeeeee',
  '...ddWWKddddddeeee',
  '...ddKWWdddddddeee',
  '....dddddddddeeeee',
  '....ddddddddddeeee',
  '.....dddddddddeeee',
  '.....ddddddddddeee',
  '......dddddddddeee',
  '......dddddddeeeee',
  '.......ddddddeeeee',
  '.......ddbbbbbbbbb',
  '......dbbbbbbbbbbb',
  '......bbbbbbbbbbbb',
  '......bbbKKbbbbbbb',
  '......bbbKKbbbbbbb',
  '......jbbbbbbbbbbb',
  '.......jbbbbbbbbbb',
  '........jjbbbbbbbb',
  '.........jjjjjjjjj',
];
const FACE_EYE_ROW = BULL_HORN.length + 14; // the left eye's top row inside the head grid
const BULL_HEAD_FRONT = symmetric([...BULL_HORN, ...BULL_FACE]);

const BULL_HEAD_BACK = symmetric(
  [
    ...BULL_HORN,
    '....cbbdddddddddd',
    '.....cbddddddddee',
    '....dddddddddeeee',
    '...ddddddddddeeee',
    '..dddddddddddeeee',
    'fffdddddddddddeee',
    'ffffddddddddddeee',
    'ffeedddddddddeeee',
    'ffffddddddddddeee',
    '.fffdddddddddddee',
    '..ffddddddddddeee',
    '...dddddddddddeee',
    '...ddddddddddeeee',
  ].map((r) => r.padEnd(18, 'e').slice(0, 18)),
);

function sidePx(frame, x, y) {
  return x >= 0 && y >= 0 && x < STIER_W && y < STIER_H ? frame.px[y][x] : null;
}

/** The side frame's barrel, with its head and wreath cut off and the outer ink lifted. */
function stierBody(frame) {
  const src = frame.px.map((row) => [...row]);
  const on = (x, y) => sidePx(frame, x, y) !== null;
  for (let y = 0; y < STIER_H; y++) {
    for (let x = 0; x < STIER_W; x++) {
      const c = src[y][x];
      if (c === null) continue;
      if ((x < 50 && y < 60) || (x < 56 && y < 24) || (x > 104 && y >= 48 && y < 68)) {
        src[y][x] = null;
        continue;
      }
      if (c === 0x3f7a3a || c === 0x64b25e) src[y][x] = 0x332f38;
      if (c === 0x000000) {
        let edge = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) if (!on(x + dx, y + dy)) edge = true;
        }
        if (edge) src[y][x] = null;
      }
    }
  }
  return src;
}
function squeeze(src) {
  const out = blankFrame('x', STIER_W, STIER_H);
  for (let y = 0; y < STIER_H; y++) {
    for (let ox = 0; ox < STIER_W; ox++) {
      const sx = Math.round(CENTRE_SRC + (ox - CENTRE_OUT) / SQUEEZE);
      if (sx >= 0 && sx < STIER_W) out.px[y][ox] = src[y][sx];
    }
  }
  return out;
}
function bodyTop(f) {
  for (let y = 0; y < STIER_H; y++) if (f.px[y].some((c, x) => c !== null && x > 40)) return y;
  return 0;
}
function paintRows(f, rows, x0, y0) {
  rows.forEach((row, ry) => {
    [...row].forEach((ch, rx) => {
      if (ch === '.') return;
      const x = x0 + rx;
      const y = y0 + ry;
      if (x >= 0 && y >= 0 && x < STIER_W && y < STIER_H) f.px[y][x] = BULL[ch];
    });
  });
}
const BODY_TOP_0 = bodyTop(squeeze(stierBody(STIER_SIDE[0])));

function stierSouthFrame(frame, i) {
  const f = squeeze(stierBody(frame));
  const [ex, ey] = firstWhite(frame);
  const hx = CENTRE_OUT - BULL_HEAD_FRONT[0].length / 2 + Math.round((ex - SIDE_EYE[0]) * 0.5);
  const hy = ey - FACE_EYE_ROW;
  paintRows(f, BULL_HEAD_FRONT, hx, hy);
  // the wreath of the side view, as a garland across the chest
  const cy = hy + BULL_HORN.length + BULL_FACE.length - 4;
  for (let k = -16; k <= 16; k++) {
    const x = CENTRE_OUT + k;
    const y = cy + Math.round(((k * k) / 256) * -5) + 5;
    if (f.px[y]?.[x] === undefined) continue;
    f.px[y][x] = (k + 16) % 2 === 0 ? BULL.g : BULL.h;
    if (f.px[y + 1]) f.px[y + 1][x] = (k + 16) % 4 === 0 ? BULL.h : f.px[y + 1][x];
  }
  return { ...inkOutline(f), name: `der-stier-south-${String(i)}` };
}
function stierNorthFrame(frame, i) {
  const body = squeeze(stierBody(frame));
  const f = blankFrame('x', STIER_W, STIER_H);
  const [ex, ey] = firstWhite(frame);
  const hx = CENTRE_OUT - BULL_HEAD_BACK[0].length / 2 + Math.round((ex - SIDE_EYE[0]) * 0.5);
  const hy = ey - FACE_EYE_ROW + 4;
  paintRows(f, BULL_HEAD_BACK, hx, hy);
  // the barrel over the back of the head
  body.px.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c !== null) f.px[y][x] = c;
    }),
  );
  // the tail, hanging down the middle from the rump, ending in a cream tuft
  const dy = bodyTop(body) - BODY_TOP_0;
  for (let y = 34 + dy; y < 66 + dy; y++) {
    if (y < 0 || y >= STIER_H) continue;
    f.px[y][57] = BULL.d;
    f.px[y][58] = BULL.e;
  }
  for (let y = 66 + dy; y < 74 + dy; y++) {
    if (y < 0 || y >= STIER_H) continue;
    for (let x = y > 70 + dy ? 55 : 56; x <= (y > 70 + dy ? 60 : 59); x++)
      f.px[y][x] = y > 70 + dy ? BULL.j : BULL.b;
  }
  return { ...inkOutline(f), name: `der-stier-north-${String(i)}` };
}
function firstWhite(frame) {
  for (let y = 0; y < STIER_H; y++) {
    for (let x = 0; x < 50; x++) if (frame.px[y][x] === 0xffffff) return [x, y];
  }
  throw new Error(`${frame.name}: no eye`);
}

// ------------------------------------------------------------------ exports
function creatureStrips(id, base, south, north, sideMirror = false) {
  const side = sideMirror ? mirrored(base, `${id}-side`) : base;
  return {
    [`${id}-side`]: bobSteps(side, `${id}-side`),
    [`${id}-south`]: south,
    [`${id}-north`]: north,
  };
}

const gockelBase = readFrames(`${CHAR}gockel.png`, 1, 'gockel')[0];
const kuhBase = readFrames(`${CHAR}kuh.png`, 1, 'kuh')[0];
const traktorBase = readFrames(`${CHAR}traktor.png`, 1, 'traktor')[0];
const ladeBase = readFrames(`${CHAR}der-ladewagen.png`, 1, 'der-ladewagen')[0];

/**
 * The Traktor's committed art has its cab at the left and its hood at the
 * right: it faces RIGHT. `-side` is authored facing left, so its `-side`
 * strip is the committed art mirrored. (Der Ladewagen's cab is at the left,
 * hauling the wagon behind it to the right: that one already faces left.)
 */
/**
 * The squeeze leaves a ghost of the side view's far horn beside the real
 * one in the dive frame (10): a sliver of horn and outline at the left of
 * the head. Cleared, with the head's own outline left alone.
 */
function dropGhostHorn(frame, i) {
  if (i !== 10) return frame;
  const out = renamed(frame, frame.name);
  for (let y = 23; y <= 34; y++) {
    for (let x = 35; x <= 39; x++) out.px[y][x] = null;
  }
  for (let y = 24; y <= 30; y++) {
    for (let x = 39; x <= 41; x++) out.px[y][x] = null;
  }
  out.px[23][39] = null;
  out.px[23][40] = null;
  // Re-ink only around real (non-ink) pixels, so the existing outline is not thickened.
  const lit = (x, y) =>
    out.px[y]?.[x] !== null && out.px[y]?.[x] !== undefined && out.px[y][x] !== 0;
  for (let y = 22; y <= 36; y++) {
    for (let x = 34; x <= 44; x++) {
      if (out.px[y][x] !== null) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (lit(x + dx, y + dy)) near = true;
      if (near) out.px[y][x] = 0;
    }
  }
  return out;
}

export const strips = {
  ...creatureStrips(
    'gockel',
    gockelBase,
    legged('gockel-south', (n, a, b) => gockelView(n, [a, b], false)),
    legged('gockel-north', (n, a, b) => gockelView(n, [a, b], true)),
  ),
  ...creatureStrips(
    'kuh',
    kuhBase,
    legged('kuh-south', (n, a, b) => kuhView(n, [a, b], false)),
    legged('kuh-north', (n, a, b) => kuhView(n, [a, b], true)),
  ),
  ...creatureStrips(
    'traktor',
    traktorBase,
    bobSteps(traktorFront('traktor-south'), 'traktor-south'),
    bobSteps(traktorBack('traktor-north'), 'traktor-north'),
    true,
  ),
  ...creatureStrips(
    'der-ladewagen',
    ladeBase,
    bobSteps(ladeFront('der-ladewagen-south'), 'der-ladewagen-south'),
    bobSteps(ladeBack('der-ladewagen-north'), 'der-ladewagen-north'),
  ),
  'der-stier-side': STIER_SIDE.map((f, i) => renamed(f, `der-stier-side-${String(i)}`)),
  'der-stier-south': STIER_SIDE.map(stierSouthFrame).map(dropGhostHorn),
  'der-stier-north': STIER_SIDE.map(stierNorthFrame).map(dropGhostHorn),
};

/** Every strip's sidecar: the three-frame walk, except the boss's own twelve-frame clips. */
export const sidecars = Object.fromEntries(
  Object.keys(strips).map((name) => [
    name,
    name.startsWith('der-stier-') ? STIER_ANIM : viewAnim(strips[name].length),
  ]),
);

/** The palette bucket each strip is checked against and the folder (under `assets/sprites/`) it lives in. */
export const buckets = Object.fromEntries(Object.keys(strips).map((name) => [name, BUCKET]));
export const folders = Object.fromEntries(
  Object.keys(strips).map((name) => [
    name,
    name.startsWith('der-stier-') ? 'floor-2-rural/bosses/' : 'floor-2-rural/characters/',
  ]),
);

/** The canvas of each creature's existing art, which all three of its views share. */
export const canvases = {
  gockel: [GOCKEL_W, GOCKEL_H],
  kuh: [KUH_W, KUH_H],
  traktor: [TRAKTOR_W, TRAKTOR_H],
  'der-ladewagen': [LADE_W, LADE_H],
  'der-stier': [STIER_W, STIER_H],
};

export function assertOnPalette() {
  assertViewsOnPalette(BUCKET, strips);
}

export { encodeSidecar, encodeViewStrip, shifted };
