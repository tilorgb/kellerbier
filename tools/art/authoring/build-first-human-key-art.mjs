import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../png.mjs';
import { FIRST_HUMAN_FRAMES } from './bosses-alpen.mjs';

/**
 * The First Human's intro postcard (`assets/art/bosses/the-first-human.png`,
 * what `BossIntroPlate` shows on entering `alpen-boss`), rendered
 * programmatically: an alpenglow sky over a glacier field, and the boss's own
 * idle frame stood in it at ×6.
 *
 *   node tools/art/authoring/build-first-human-key-art.mjs
 *
 * This is the cloud track of `docs/DECISIONS.md` #77 — no diffusion step is
 * available here, so the postcard is composed rather than generated — and it
 * is a stand-in until key art is signed off the way the other bosses' was
 * (`docs/BOSS_SPRITES.md` §1). Same 1344×768 as `keyart-bench`'s `bossPlate`
 * preset, so the plate's layout needs no special case for it.
 */

const W = 1344,
  H = 768;
const OUT = fileURLToPath(
  new URL('../../../assets/art/bosses/the-first-human.png', import.meta.url),
);

const px = Buffer.alloc(W * H * 4);
function put(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const at = (y * W + x) * 4;
  px[at] = r;
  px[at + 1] = g;
  px[at + 2] = b;
  px[at + 3] = 255;
}
function hex(c) {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

// A deterministic hash for the grain — no Math.random, so a rebuild is byte-identical.
function noise(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Sky: deep alpine blue at the top into alpenglow pink at the ridge line.
const HORIZON = 430;
const SKY_TOP = hex(0x0e1c28);
const SKY_MID = hex(0x274b6b);
const GLOW = hex(0xe893a8);
for (let y = 0; y < HORIZON; y++) {
  const t = y / HORIZON;
  const c = t < 0.55 ? mix(SKY_TOP, SKY_MID, t / 0.55) : mix(SKY_MID, GLOW, (t - 0.55) / 0.45);
  for (let x = 0; x < W; x++) {
    const grain = (noise(x, y) - 0.5) * 6;
    put(x, y, c[0] + grain, c[1] + grain, c[2] + grain);
  }
}
// Stars, sparse, only in the dark half.
for (let i = 0; i < 160; i++) {
  const x = Math.floor(noise(i, 7) * W);
  const y = Math.floor(noise(i, 11) * HORIZON * 0.5);
  put(x, y, 238, 242, 245);
}

// Two mountain ranges: a far one in blue-grey, a near one in granite, both snow-capped.
function ridge(seed, base, amp, colour, snow, snowDepth) {
  for (let x = 0; x < W; x++) {
    let h = 0;
    for (let k = 1; k <= 4; k++) {
      h += (Math.sin((x / W) * Math.PI * 2 * k * 1.7 + seed * k) * amp) / k;
    }
    const top = Math.round(base - Math.abs(h) - amp * 0.3);
    for (let y = top; y < H; y++) {
      const depth = y - top;
      const c = depth < snowDepth ? snow : colour;
      const shade = Math.max(0.78, 1 - depth / 900) * (0.95 + noise(x, y) * 0.1);
      put(x, y, c[0] * shade, c[1] * shade, c[2] * shade);
    }
  }
}
ridge(1.3, HORIZON + 40, 120, hex(0x33638d), hex(0xd1dce4), 22);
ridge(4.1, HORIZON + 130, 90, hex(0x595f67), hex(0xeef2f5), 30);

// The glacier field in front, lit pink from the sky.
const SNOW = hex(0xeef2f5);
const SNOW_SHADE = hex(0xb4c6d3);
const FIELD = HORIZON + 170;
for (let y = FIELD; y < H; y++) {
  const t = (y - FIELD) / (H - FIELD);
  for (let x = 0; x < W; x++) {
    const n = noise(x >> 3, y >> 2);
    const c = mix(mix(SNOW_SHADE, SNOW, t), GLOW, 0.1 * (1 - t));
    const g = (n - 0.5) * 10;
    put(x, y, c[0] + g, c[1] + g, c[2] + g);
  }
}
// Crevasse lines across the glacier.
for (const [y0, len] of [
  [600, 500],
  [660, 420],
  [720, 640],
]) {
  for (let i = 0; i < len; i++) {
    const x = 100 + i + Math.round(Math.sin(i / 40) * 8);
    const y = y0 + Math.round(Math.sin(i / 70) * 6);
    put(x, y, 132, 151, 165);
    put(x, y + 1, 180, 198, 211);
  }
}

// The boss, ×6, stood on the field with a soft shadow under his feet.
const frame = FIRST_HUMAN_FRAMES[0];
const S = 6;
const bx = Math.round(W / 2 - (frame.width * S) / 2) + 60;
const by = H - 60 - frame.height * S;
const footY = by + 78 * S;
for (let x = bx - 40; x < bx + frame.width * S + 20; x++) {
  for (let y = footY - 14; y < footY + 26; y++) {
    const dx = (x - (bx + 40 * S)) / (frame.width * S * 0.6);
    const dy = (y - footY - 6) / 22;
    if (dx * dx + dy * dy < 1) {
      const at = (y * W + x) * 4;
      px[at] = Math.round(px[at] * 0.72);
      px[at + 1] = Math.round(px[at + 1] * 0.74);
      px[at + 2] = Math.round(px[at + 2] * 0.8);
    }
  }
}
for (let y = 0; y < frame.height; y++) {
  for (let x = 0; x < frame.width; x++) {
    const c = frame.px[y][x];
    if (c === null) continue;
    const [r, g, b] = hex(c);
    for (let sy = 0; sy < S; sy++)
      for (let sx = 0; sx < S; sx++) put(bx + x * S + sx, by + y * S + sy, r, g, b);
  }
}

writeFileSync(OUT, encodePng({ width: W, height: H, pixels: px }));
console.log(`the-first-human.png  ${W}x${H}`);
