/**
 * Der Wald's tileset (#402): the floor, the wall face and the wall top —
 * "needle earth & dry-stone dyke", picked from three in-room candidates.
 * Authored as code, the way `blocks.mjs` is (`docs/DECISIONS.md` #43/#55),
 * from the floor's background-tier palette only.
 *
 *   npm run art:wald-tiles
 *
 * The PNGs stay committed (the game loads files, not this). The wall top
 * (`wald-wall-lip`) follows the layout `render/world/scenery.ts` expects of
 * every lip: its top 8 rows are the edge band the room sees, the 24 below it
 * tile seamlessly on their own — what the top of a wide void is filled with.
 * It is drawn edge-at-the-bottom below and flipped on save.
 */
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { legalPixelColorsFor } from '../palette.mjs';

const LEGAL = legalPixelColorsFor('floor-3-wald', 'background');
const S = 32;
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function grid(fill) {
  return Array.from({ length: S }, () => Array(S).fill(fill));
}
const W = (x) => ((x % S) + S) % S;
function blob(g, cx, cy, r, c, seed, rough = 0.35) {
  for (let y = -r - 1; y <= r + 1; y++)
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y) + (hash(x + cx, y + cy, seed) - 0.5) * rough * r;
      if (d <= r) g[W(cy + y)][W(cx + x)] = c;
    }
}
const BODY = 24; // lip rows 0..23 tile seamlessly; rows 24..31 are the room-side edge
function blobBody(g, cx, cy, r, c, seed, rough = 0.35) {
  for (let y = -r - 1; y <= r + 1; y++)
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y) + (hash(x + cx, y + cy, seed) - 0.5) * rough * r;
      if (d <= r) g[(((cy + y) % BODY) + BODY) % BODY][W(cx + x)] = c;
    }
}
function scatterBody(g, seed, chance, colors) {
  for (let y = 0; y < BODY; y++)
    for (let x = 0; x < S; x++) {
      const r = hash(x, y, seed);
      if (r < chance) g[y][x] = colors[Math.floor((r / chance) * colors.length)];
    }
}
// "Overall darker than floor 2": every tone one shade step down its own hue,
// accents (the glowing fungus) left alone so they still glow.
const DARKER = new Map([
  [0x29472e, 0x182a1b],
  [0x314730, 0x1e2c1d],
  [0x396441, 0x29472e],
  [0x446243, 0x314730],
  [0x4e6737, 0x374927],
  [0x374927, 0x1e2c1d],
  [0x577e55, 0x446243],
  [0x648547, 0x4e6737],
  [0x7aa357, 0x648547],
  [0x1e2c1d, 0x0b100b],
  [0x1a221a, 0x0b100b],
  [0x182a1b, 0x070d08],
  [0x0b100b, 0x060806],
  [0x332f38, 0x1c1a1f],
  [0x494451, 0x332f38],
  [0x666666, 0x4f4f4f],
  [0x4f4f4f, 0x383838],
  [0x383838, 0x2e2e2e],
  [0x7d7d7d, 0x666666],
  [0x1c1a1f, 0x050506],
]);
function save(dir, name, g) {
  g = g.map((row) => row.map((c) => DARKER.get(c) ?? c));
  // A lip is authored edge-at-the-bottom above; the renderer puts the image's
  // top rows on the room side, so flip it.
  if (name.startsWith('wald-wall-lip')) g = g.slice().reverse();
  const png = new PNG({ width: S, height: S });
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const c = g[y][x];
      if (!LEGAL.has(c)) throw new Error(`${name}: off-palette ${c.toString(16)}`);
      const i = (y * S + x) * 4;
      png.data[i] = (c >> 16) & 255;
      png.data[i + 1] = (c >> 8) & 255;
      png.data[i + 2] = c & 255;
      png.data[i + 3] = 255;
    }
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${name}.png`, PNG.sync.write(png));
}
function scatter(g, seed, chance, colors) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const r = hash(x, y, seed);
      if (r < chance) g[y][x] = colors[Math.floor((r / chance) * colors.length)];
    }
}

// ---------- B: violet-grey earth with needles, dry-stone wall, mossy cap
function setB(dir) {
  for (let v = 1; v <= 4; v++) {
    const g = grid(0x332f38);
    scatter(g, v * 3, 0.12, [0x494451, 0x1c1a1f]);
    for (let i = 0; i < 18; i++) {
      // needles
      const x = Math.floor(hash(i, v, 21) * S),
        y = Math.floor(hash(i, v, 22) * S),
        dx = hash(i, v, 23) < 0.5 ? 1 : -1;
      for (let k = 0; k < 3; k++) g[W(y + k)][W(x + dx * k)] = k === 1 ? 0x4e6737 : 0x374927;
    }
    if (v >= 3) blob(g, 8 + v * 3, 14, 4, 0x396441, v * 31);
    if (v === 4) {
      g[22][9] = 0x9357a3;
      g[22][10] = 0x784785;
    }
    save(dir, `wald-floor-${v}`, g);
  }
  const w = grid(0x0b100b);
  const rows = [
    [0, 9],
    [10, 20],
    [21, 31],
  ];
  rows.forEach(([y0, y1], r) => {
    let x = r * 5;
    while (x < S + 16) {
      const len = 7 + Math.floor(hash(x, r, 30) * 6);
      const c = [0x666666, 0x4f4f4f, 0x383838][Math.floor(hash(x, r, 31) * 3)];
      for (let yy = y0 + 1; yy < y1; yy++)
        for (let xx = x + 1; xx < x + len; xx++) {
          const shade = yy === y0 + 1 ? 0x7d7d7d : yy === y1 - 1 ? 0x383838 : c;
          w[yy][W(xx)] = shade;
        }
      x += len;
    }
  });
  for (let x = 0; x < S; x++)
    if (hash(x, 0, 33) < 0.6) {
      w[0][x] = 0x4e6737;
      w[1][x] = hash(x, 1, 34) < 0.5 ? 0x374927 : w[1][x];
    }
  save(dir, 'wald-wall', w);
  const t = grid(0x374927);
  scatterBody(t, 41, 0.25, [0x4e6737, 0x648547, 0x29472e]);
  for (let i = 0; i < 4; i++)
    blobBody(
      t,
      Math.floor(hash(i, 2, 42) * S),
      Math.floor(hash(i, 3, 42) * BODY),
      3,
      0x4f4f4f,
      60 + i,
      0.5,
    );
  for (let x = 0; x < S; x++) {
    for (let y = BODY; y < 28; y++) t[y][x] = hash(x, y, 43) < 0.4 ? 0x4e6737 : 0x374927;
    t[28][x] = 0x383838;
    t[29][x] = 0x4f4f4f;
    t[30][x] = 0x666666;
    t[31][x] = 0x7aa357;
  }
  save(dir, 'wald-wall-lip', t);
  save(dir, 'wald-wall-lip-corner', t);
}

const OUT = fileURLToPath(new URL('../../../assets/sprites/floor-3-wald/tiles', import.meta.url));
setB(OUT);
console.log(`wald tiles written to ${OUT}`);
