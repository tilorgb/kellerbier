import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodePng, encodePng } from '../png.mjs';
import { STRIPS, BOSS_RIGS } from './bosses.mjs';

/**
 * The eyes of the boss-rig workflow (`docs/BOSS_SPRITES.md`):
 *
 *   node tools/art/authoring/boss-rig-preview.mjs grid <boss> x0 y0 x1 y1 [step] [scale]
 *   node tools/art/authoring/boss-rig-preview.mjs overlay <boss> [x0 y0 x1 y1 scale]
 *   node tools/art/authoring/boss-rig-preview.mjs frames <boss> [scale]
 *
 * `grid` crops the boss's key art with a labelled 50-px grid so polygon
 * coordinates can be read straight off the illustration; `overlay` draws the
 * current `*_SPECS` polygons and pivots over the art so a misplaced edge is
 * visible before a single frame is built; `frames` lays the built strip out
 * as a sheet, nearest-neighbour upscaled, which is what a sign-off round is
 * shown. Everything lands in `tools/art/authoring/preview/` (gitignored).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'preview');
const [, , mode, boss, ...rest] = process.argv;

const rig = BOSS_RIGS[boss];
if (!rig) {
  console.error(`unknown boss "${boss}" — one of: ${Object.keys(BOSS_RIGS).join(', ')}`);
  process.exit(1);
}
const art = decodePng(readFileSync(rig.art));
const { mkdirSync } = await import('node:fs');
mkdirSync(OUT, { recursive: true });

/** Crop `[x0, y0, x1, y1]` of `art` at `scale`, dimmed by `dim`, as an RGBA canvas. */
function crop([x0, y0, x1, y1], scale, dim = 1) {
  const width = Math.round((x1 - x0) * scale);
  const height = Math.round((y1 - y0) * scale);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.min(art.width - 1, Math.max(0, x0 + Math.floor(x / scale)));
      const sy = Math.min(art.height - 1, Math.max(0, y0 + Math.floor(y / scale)));
      const si = (sy * art.width + sx) * 4;
      const di = (y * width + x) * 4;
      pixels[di] = art.pixels[si] * dim + (1 - dim) * 40;
      pixels[di + 1] = art.pixels[si + 1] * dim + (1 - dim) * 40;
      pixels[di + 2] = art.pixels[si + 2] * dim + (1 - dim) * 40;
      pixels[di + 3] = 255;
    }
  return { width, height, pixels, x0, y0, scale };
}
function dot(cv, x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return;
  const i = (y * cv.width + x) * 4;
  cv.pixels[i] = r;
  cv.pixels[i + 1] = g;
  cv.pixels[i + 2] = b;
}
function line(cv, ax, ay, bx, by, colour) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / n);
    const y = Math.round(ay + ((by - ay) * i) / n);
    dot(cv, x, y, colour);
    dot(cv, x + 1, y, colour);
    dot(cv, x, y + 1, colour);
  }
}
const COLOURS = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 128, 255],
  [255, 255, 0],
  [255, 0, 255],
  [0, 255, 255],
  [255, 128, 0],
  [128, 255, 128],
  [255, 128, 255],
  [128, 128, 255],
  [200, 200, 200],
  [255, 255, 255],
];

if (mode === 'grid') {
  const [x0, y0, x1, y1, step = 50, scale = 1] = rest.map(Number);
  const cv = crop([x0, y0, x1, y1], scale);
  for (let gx = Math.ceil(x0 / step) * step; gx < x1; gx += step) {
    const major = gx % (step * 2) === 0;
    for (let y = 0; y < cv.height; y++)
      dot(cv, Math.round((gx - x0) * scale), y, major ? [255, 255, 0] : [255, 0, 0]);
  }
  for (let gy = Math.ceil(y0 / step) * step; gy < y1; gy += step) {
    const major = gy % (step * 2) === 0;
    for (let x = 0; x < cv.width; x++)
      dot(cv, x, Math.round((gy - y0) * scale), major ? [255, 255, 0] : [255, 0, 0]);
  }
  const file = path.join(OUT, `${boss}-grid.png`);
  writeFileSync(file, encodePng(cv));
  console.log(`${file}  origin ${x0},${y0}  red every ${step} px, yellow every ${step * 2}`);
} else if (mode === 'overlay') {
  const box = rest.length >= 5 ? rest.map(Number) : rig.previewCrop;
  const cv = crop(box.slice(0, 4), box[4], 0.6);
  let k = 0;
  for (const [name, spec] of Object.entries(rig.specs)) {
    const colour = COLOURS[k++ % COLOURS.length];
    const pts = spec.polygon.map(([x, y]) => [(x - cv.x0) * cv.scale, (y - cv.y0) * cv.scale]);
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      line(cv, a[0], a[1], b[0], b[1], colour);
    });
    if (spec.pivot) {
      const [px, py] = [(spec.pivot[0] - cv.x0) * cv.scale, (spec.pivot[1] - cv.y0) * cv.scale];
      line(cv, px - 4, py, px + 4, py, [255, 255, 255]);
      line(cv, px, py - 4, px, py + 4, [255, 255, 255]);
    }
    console.log(`${name.padEnd(12)} rgb(${colour.join(',')})`);
  }
  const file = path.join(OUT, `${boss}-overlay.png`);
  writeFileSync(file, encodePng(cv));
  console.log(file);
} else if (mode === 'frames') {
  const scale = Number(rest[0] ?? 4);
  const frames = STRIPS[boss];
  const gap = 2;
  const fw = frames[0].width;
  const fh = frames[0].height;
  const cols = Math.min(frames.length, 6);
  const rows = Math.ceil(frames.length / cols);
  const width = cols * (fw * scale + gap);
  const height = rows * (fh * scale + gap);
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 0x6a;
    pixels[i + 1] = 0x8f;
    pixels[i + 2] = 0x5a;
    pixels[i + 3] = 255;
  }
  frames.forEach((frame, index) => {
    const ox = (index % cols) * (fw * scale + gap);
    const oy = Math.floor(index / cols) * (fh * scale + gap);
    for (let y = 0; y < fh; y++)
      for (let x = 0; x < fw; x++) {
        const c = frame.px[y][x];
        if (c === null) continue;
        for (let yy = 0; yy < scale; yy++)
          for (let xx = 0; xx < scale; xx++) {
            const di = ((oy + y * scale + yy) * width + ox + x * scale + xx) * 4;
            pixels[di] = (c >> 16) & 0xff;
            pixels[di + 1] = (c >> 8) & 0xff;
            pixels[di + 2] = c & 0xff;
            pixels[di + 3] = 255;
          }
      }
  });
  const file = path.join(OUT, `${boss}-frames.png`);
  writeFileSync(file, encodePng({ width, height, pixels }));
  console.log(`${file}  ${frames.map((f) => f.name).join(' ')}`);
} else {
  console.error('mode must be grid, overlay or frames');
  process.exit(1);
}
