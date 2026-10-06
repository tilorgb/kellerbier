/**
 * Der Wald's objects (#402) — "trees", picked from three in-room candidates
 * (fallen timber / mossy deadwood / trees): the four block variants the floor
 * mixes per cell (a broken trunk, a twin trunk, a stump, a root tangle), the
 * destructible barrel, the fern and glowing-mushroom props, and the storm
 * lantern that hangs on the wall of a lantern room (#424).
 *
 *   npm run art:wald-objects
 *
 * Same rules as `blocks.mjs`: a block is 32×40 (one cell plus the 8 px
 * `BLOCK_LIP` overhang, so it stands on its collision cell exactly like
 * floor 1's boulders), rounded rather than square, lit from the top-left with
 * a 1 px rim and a dark contact band, and throws a soft cast shadow. Blocks
 * and the barrel are foreground-tier art; the fern and mushrooms are
 * background-tier props. The floor has no brown, so wood is dark green and
 * violet-grey.
 */
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { legalPixelColorsFor } from '../palette.mjs';

const FG = legalPixelColorsFor('floor-3-wald');
const BG = legalPixelColorsFor('floor-3-wald', 'background');
const W = 32;
const SHADOW = 0x1c1a1f,
  SHADOW_A = 104;
function hash(x, y, s) {
  let h =
    (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function canvas(h) {
  return {
    h,
    px: Array.from({ length: h }, () => Array(W).fill(null)),
    sh: Array.from({ length: h }, () => Array(W).fill(false)),
  };
}
function set(cv, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < W && y < cv.h) cv.px[y][x] = c;
}
const on = (cv, x, y) => x >= 0 && y >= 0 && x < W && y < cv.h && cv.px[y][x] !== null;
function shadow(cv, cx, cy, rx, ry) {
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < W; x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) cv.sh[y][x] = true;
}
/** Filled shape from a predicate, shaded from a top-left light by its own normal-ish. */
function fill(cv, band, inside, cx, cy, rx, ry, seed, tone = 0) {
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const nx = (x - cx) / rx,
        ny = (y - cy) / ry;
      const lit = -(nx * 0.72 + ny * 0.72) + tone;
      let i = lit > 0.62 ? 4 : lit > 0.24 ? 3 : lit > -0.16 ? 2 : lit > -0.52 ? 1 : 0;
      const n = hash(x, y, seed);
      if (n > 0.9 && i < 4) i++;
      else if (n < 0.1 && i > 0) i--;
      set(cv, x, y, band[i]);
    }
}
function ellipse(cx, cy, rx, ry, seed = 0, wobble = 0.08) {
  return (x, y) => {
    const dx = (x - cx) / rx,
      dy = (y - cy) / ry;
    const a = Math.atan2(dy, dx);
    return (
      Math.hypot(dx, dy) <=
      1 + wobble * Math.sin(3 * a + seed) + wobble * 0.6 * Math.sin(5 * a - seed)
    );
  };
}
function roundRect(x0, y0, x1, y1, r) {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r),
      cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return Math.hypot(x - cx, y - cy) <= r + 0.3;
  };
}
function rim(cv, dark, light) {
  const snap = cv.px.map((r) => [...r]);
  const has = (x, y) => (snap[y]?.[x] ?? null) !== null;
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < W; x++) {
      if (snap[y][x] === null) continue;
      if (has(x - 1, y) && has(x + 1, y) && has(x, y - 1) && has(x, y + 1)) continue;
      cv.px[y][x] = (!has(x - 1, y) || !has(x, y - 1)) && light ? light : dark;
    }
}
function contact(cv, deep, d2) {
  for (let x = 0; x < W; x++) {
    let b = -1;
    for (let y = cv.h - 1; y >= 0; y--)
      if (on(cv, x, y)) {
        b = y;
        break;
      }
    if (b < 0) continue;
    for (let y = b; y > b - 3; y--) if (on(cv, x, y)) set(cv, x, y, y === b ? deep : d2);
  }
}
function speck(cv, inside, seed, chance, colours) {
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < W; x++)
      if (on(cv, x, y) && inside(x, y) && hash(x, y, seed) < chance)
        set(cv, x, y, colours[Math.floor(hash(x, y, seed + 1) * colours.length)]);
}
function rings(cv, cx, cy, rx, ry, outer, ringCols) {
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d > 1) continue;
      set(
        cv,
        x,
        y,
        d > 0.82 ? outer : ringCols[Math.floor(d * 5 + hash(x, y, 7) * 0.4) % ringCols.length],
      );
    }
}
function save(dir, name, cv, legal) {
  const png = new PNG({ width: W, height: cv.h });
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < W; x++) {
      const c = cv.px[y][x],
        i = (y * W + x) * 4;
      if (c !== null) {
        if (!legal.has(c)) throw new Error(`${dir}/${name} ${x},${y} #${c.toString(16)}`);
        png.data[i] = c >> 16;
        png.data[i + 1] = (c >> 8) & 255;
        png.data[i + 2] = c & 255;
        png.data[i + 3] = 255;
      } else if (cv.sh[y][x]) {
        png.data[i] = SHADOW >> 16;
        png.data[i + 1] = (SHADOW >> 8) & 255;
        png.data[i + 2] = SHADOW & 255;
        png.data[i + 3] = SHADOW_A;
      }
    }
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${name}.png`, PNG.sync.write(png));
}

/** A coherent moss cap over the top of the silhouette: `min..max` rows deep per column, lit along its top edge. */
function mossCap(cv, seed, min, max, { yLimit = 99 } = {}) {
  for (let x = 0; x < W; x++) {
    let top = -1;
    for (let y = 0; y < cv.h; y++)
      if (on(cv, x, y)) {
        top = y;
        break;
      }
    if (top < 0 || top > yLimit) continue;
    const depth = min + Math.floor((Math.sin(x * 0.7 + seed) * 0.5 + 0.5) * (max - min + 1));
    for (let k = 0; k < depth; k++) {
      const y = top + k;
      if (!on(cv, x, y)) break;
      const c =
        k === 0
          ? 0x5fa65b
          : k === depth - 1
            ? 0x27432e
            : hash(x, y, seed) < 0.18
              ? 0x4e894a
              : 0x3d6b3a;
      set(cv, x, y, c);
    }
    if (hash(x, 3, seed) < 0.12) set(cv, x, top, 0x87d840);
  }
}

// Bark ramps (dark -> light), all foreground-legal.
const GREYWOOD = [0x1c1a1f, 0x332f38, 0x494451, 0x5c5c5c, 0x737373];
const GREENWOOD = [0x060e08, 0x152d19, 0x27432e, 0x386042, 0x4e894a];
const GRAIN = [0x8a8a8a, 0x737373, 0xa1a1a1, 0x737373];

/** A stump: ring top, bark sides, roots splaying at the base. */
function stump(dir, name, band, seed) {
  const cv = canvas(40);
  shadow(cv, 18, 37, 15, 3);
  fill(cv, band, roundRect(6, 12, 25, 36, 4), 15, 22, 10, 12, seed);
  for (const [x0, dir2] of [
    [6, -1],
    [25, 1],
    [12, -1],
    [20, 1],
  ])
    for (let k = 0; k < 6; k++) {
      set(cv, x0 + dir2 * k * 0.8, 33 + k * 0.5, band[1]);
      set(cv, x0 + dir2 * k * 0.8, 32 + k * 0.5, band[2]);
    }
  for (let y = 16; y < 34; y++)
    for (const x of [10, 15, 20]) if (hash(x, y, seed) < 0.65) set(cv, x, y, band[1]);
  rings(cv, 15.5, 12, 10, 5, band[2], GRAIN);
  rim(cv, band[0], band[4]);
  contact(cv, 0x050506, band[0]);
  save(dir, name, cv, FG);
}
/** A standing tree trunk: tapering, cylinder-lit, a splintered broken top, roots flaring wide at the base. */
function trunk(dir, name, band, seed, { twin = false } = {}) {
  const cv = canvas(40);
  shadow(cv, 18, 37, 15, 3);
  const stems = twin
    ? [
        [11, 4.5, 6],
        [22, 4, 9],
      ]
    : [[16, 7.5, 2]];
  for (const [cx, half, top] of stems) {
    const inside = (x, y) => {
      if (y > 36) return false;
      const flare = y > 28 ? (y - 28) * 0.9 : 0;
      const w = half + Math.sin(y * 0.5 + cx) * 0.4 + flare;
      const cut = top + Math.floor(hash(Math.round(x), 0, seed + cx) * 4);
      return Math.abs(x - cx) <= w && y >= cut;
    };
    fill(cv, band, inside, cx - half * 0.3, 20, half + 2, 30, seed + cx);
    for (let y = top + 3; y < 33; y++)
      for (let x = Math.round(cx - half) + 2; x < cx + half - 1; x += 3)
        if (hash(x, y, seed) < 0.7) set(cv, x + (y % 5 === 0 ? 1 : 0), y, band[1]);
    // splintered top: pale wood showing where it broke
    for (let x = Math.round(cx - half); x <= cx + half; x++) {
      for (let y = 0; y < cv.h; y++)
        if (on(cv, x, y)) {
          set(cv, x, y, hash(x, 1, seed) < 0.5 ? 0xa1a1a1 : 0x8a8a8a);
          set(cv, x, y + 1, 0x737373);
          break;
        }
    }
  }
  for (const [x0, d, len] of [
    [5, -1, 4],
    [27, 1, 4],
    [12, -1, 3],
    [20, 1, 3],
  ])
    for (let k = 0; k < len; k++) {
      set(cv, x0 + d * k, 35 + k * 0.3, band[0]);
      set(cv, x0 + d * k, 34 + k * 0.3, band[2]);
    }
  speck(cv, (x, y) => y > 8 && y < 30, seed + 4, 0.04, [0x8a8a8a, 0xa1a1a1]);
  rim(cv, band[0], band[4]);
  contact(cv, 0x050506, band[0]);
  mossCap(cv, seed + 3, 1, 2);
  save(dir, name, cv, FG);
}
/** A root tangle: a low mound of twisted roots — the barricade for the trees set. */
function rootTangle(dir, name, band, seed) {
  const cv = canvas(40);
  shadow(cv, 17, 36, 15, 4);
  fill(cv, band, ellipse(16, 27, 14, 10, seed, 0.12), 16, 25, 14, 10, seed);
  for (let i = 0; i < 7; i++) {
    let x = 3 + hash(i, 1, seed) * 26,
      y = 18 + hash(i, 2, seed) * 16;
    const dx = hash(i, 3, seed) < 0.5 ? 1 : -1;
    for (let k = 0; k < 9; k++) {
      set(cv, x, y, band[0]);
      set(cv, x, y - 1, band[3]);
      x += dx;
      y += Math.sin(k + i) * 0.8;
    }
  }
  rim(cv, band[0], band[4]);
  contact(cv, 0x050506, band[0]);
  save(dir, name, cv, FG);
}
/** A barrel, 32x32, upright: bulging staves, three hoops, a lid ellipse. */
function barrel(dir, name, band, hoop, seed, { moss = false } = {}) {
  const cv = canvas(32);
  shadow(cv, 18, 29, 12, 3);
  const halfAt = (y) => 9 + Math.sin(Math.max(0, Math.min(1, (y - 4) / 26)) * Math.PI) * 2;
  fill(
    cv,
    band,
    (x, y) => y >= 4 && y <= 30 && Math.abs(x - 16) <= halfAt(y),
    13,
    16,
    11,
    14,
    seed,
  );
  for (let y = 6; y <= 30; y++)
    for (const off of [-6, -2, 2, 6]) set(cv, 16 + off * (halfAt(y) / 11), y, band[1]);
  for (const y of [8, 17, 26])
    for (let x = 0; x < W; x++)
      if (on(cv, x, y)) {
        set(cv, x, y, hoop);
        set(cv, x, y - 1, band[3]);
      }
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < W; x++) {
      const d = ((x - 16) / 9) ** 2 + ((y - 5) / 2.5) ** 2;
      if (d <= 1) set(cv, x, y, d > 0.6 ? band[1] : d > 0.25 ? band[2] : band[3]);
    }
  rim(cv, band[0], band[4]);
  contact(cv, 0x050506, band[0]);
  if (moss) mossCap(cv, seed, 1, 3);
  save(dir, name, cv, FG);
}
/** Shared props (background tier): a fern clump and a cluster of glowing mushrooms. */
function props(dir) {
  const f = canvas(32);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.33;
    const len = 15 - Math.abs(i - 4) * 1.2;
    let x = 16,
      y = 30;
    for (let k = 0; k < len; k++) {
      const bend = (i - 4) * 0.012 * k * k;
      x = 16 + Math.cos(a) * k * 1.05 + bend;
      y = 30 + Math.sin(a) * k * 1.05 + k * k * 0.035;
      set(f, x, y, k < 3 ? 0x1e2c1d : 0x314730);
      if (k > 2 && k % 2 === 0) {
        const leaf = k > len - 4 ? 0x577e55 : 0x446243;
        set(f, x - 1, y, leaf);
        set(f, x + 1, y, leaf);
        set(f, x - 2, y + 1, 0x396441);
        set(f, x + 2, y + 1, 0x396441);
      }
    }
  }
  save(dir, 'wald-fern', f, BG);
  const m = canvas(32);
  for (const [cx, base, h, r] of [
    [11, 28, 8, 4],
    [19, 29, 11, 5],
    [24, 27, 6, 3],
  ]) {
    for (let y = base - h; y <= base; y++) {
      set(m, cx, y, 0x949494);
      set(m, cx + 1, y, 0x7d7d7d);
    }
    for (let y = -r; y <= 1; y++)
      for (let x = -r - 1; x <= r + 1; x++)
        if ((x / (r + 1)) ** 2 + (y / r) ** 2 <= 1)
          set(m, cx + x, base - h + y, y < -r / 2 ? 0xa773b4 : y < 0 ? 0x9357a3 : 0x5d3767);
    set(m, cx - 1, base - h - r + 1, 0x92b473);
  }
  save(dir, 'wald-glow-mushrooms', m, BG);
}

/**
 * The wall lantern of a lantern room (#424): a storm lantern, a ring handle
 * over a round glass — picked from four in-room candidates (box / storm /
 * sconce / box on an arm). Drawn in the floor's own greys and whites, since
 * Der Wald has no warm colour: `render/world/lantern-sprite.ts` tints it by
 * the flame, which turns the iron bronze and the glass the colour of the
 * light behind it. 9x12 in the middle of a 16x16 canvas, standing on its
 * bottom edge. Foreground tier although it is art-only — its glass has to be
 * the brightest thing in a dark room, and the background tier stops at grey.
 */
const LANTERN = [
  '...KKK...',
  '..K...K..',
  '..K...K..',
  '...KMK...',
  '..KMMMK..',
  '.KLEWELK.',
  '.KEWWWEK.',
  '.KEWWWEK.',
  '.KLEWELK.',
  '..KMMMK..',
  '.KDDDDDK.',
  '.KKKKKKK.',
];
const LANTERN_COLOURS = {
  K: 0x171717,
  D: 0x332f38,
  M: 0x494451,
  L: 0xa1a1a1,
  E: 0xe8e8e8,
  W: 0xffffff,
};
function lantern(dir) {
  // Its own 16x16 PNG rather than the 32-wide `canvas` the blocks share: the
  // tile spec wants 16 or 32 wide and at least square, and a lantern is small.
  const size = 16;
  const png = new PNG({ width: size, height: size });
  const left = Math.floor((size - LANTERN[0].length) / 2);
  const top = size - LANTERN.length;
  LANTERN.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const colour = LANTERN_COLOURS[ch];
      if (colour === undefined) return;
      if (!FG.has(colour)) throw new Error(`${dir}/wald-lantern ${x},${y} #${colour.toString(16)}`);
      const i = ((top + y) * size + left + x) * 4;
      png.data[i] = colour >> 16;
      png.data[i + 1] = (colour >> 8) & 255;
      png.data[i + 2] = colour & 255;
      png.data[i + 3] = 255;
    });
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/wald-lantern.png`, PNG.sync.write(png));
}

const OUT = fileURLToPath(new URL('../../../assets/sprites/floor-3-wald/tiles', import.meta.url));
trunk(OUT, 'wald-log-1', GREENWOOD, 11);
trunk(OUT, 'wald-log-2', GREENWOOD, 23, { twin: true });
stump(OUT, 'wald-stump', GREENWOOD, 37);
rootTangle(OUT, 'wald-barricade', GREENWOOD, 41);
barrel(OUT, 'wald-barrel', GREYWOOD, 0x1c1a1f, 51, { moss: true });
props(OUT);
lantern(OUT);
console.log(`wald objects written to ${OUT}`);
