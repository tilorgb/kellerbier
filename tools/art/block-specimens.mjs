import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildBlocks } from './authoring/blocks.mjs';
import { decodePng } from './png.mjs';
import { encodePng } from './png.mjs';

/**
 * Renders the block-overhang sign-off sheet:
 *
 *   node tools/art/block-specimens.mjs [lip...]  # default 0 8 12 16
 *
 * `CLAUDE.md` asks for new pixel art to be *shown* as options before it is
 * committed, and since `docs/DECISIONS.md` #45 a sprite's canvas is literally
 * its size on screen — so "how far does a rock overhang its cell" is an art
 * decision that has to be looked at, not derived. This composites each
 * candidate overhang exactly the way the game will draw it: real floor tiles,
 * a real clump laid out on the room grid, Alois standing north of the clump
 * (the read the whole thing exists for) and south of it, at 1:1 internal
 * pixels, then upscaled nearest-neighbour so a 12-pixel decision is legible.
 *
 * Everything here is 1:1 with internal pixels by construction: a 32px tile
 * covers `ROOM_TILE_UNITS` world units at `tileGridScale` 0.5, which is
 * `WORLD_ZOOM`'s two internal pixels per world unit ÷ 2 — the same grid
 * `ACTOR_SPRITE_SCALE` puts Alois on. So the sheet needs no scale factors,
 * only positions.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const OUT = fileURLToPath(new URL('../../', import.meta.url));

/** Authored pixels per room cell — `CELL` in `authoring/blocks.mjs`. */
const CELL = 32;
const UPSCALE = 4;

/** A mutable RGBA raster the compositor draws into. */
function surface(width, height) {
  return { width, height, pixels: Buffer.alloc(width * height * 4) };
}

/** Source-over of one RGBA pixel. */
function blend(dst, x, y, r, g, b, a) {
  if (a === 0 || x < 0 || y < 0 || x >= dst.width || y >= dst.height) return;
  const at = (y * dst.width + x) * 4;
  const sa = a / 255;
  const da = dst.pixels[at + 3] / 255;
  const out = sa + da * (1 - sa);
  if (out === 0) return;
  dst.pixels[at] = Math.round((r * sa + dst.pixels[at] * da * (1 - sa)) / out);
  dst.pixels[at + 1] = Math.round((g * sa + dst.pixels[at + 1] * da * (1 - sa)) / out);
  dst.pixels[at + 2] = Math.round((b * sa + dst.pixels[at + 2] * da * (1 - sa)) / out);
  dst.pixels[at + 3] = Math.round(out * 255);
}

/** Draws a decoded PNG (or a `[sx, sy, w, h]` sub-rect of one) at `(dx, dy)`. */
function draw(dst, src, dx, dy, rect) {
  const [sx, sy, w, h] = rect ?? [0, 0, src.width, src.height];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = ((sy + y) * src.width + (sx + x)) * 4;
      blend(
        dst,
        dx + x,
        dy + y,
        src.pixels[at],
        src.pixels[at + 1],
        src.pixels[at + 2],
        src.pixels[at + 3],
      );
    }
  }
}

/** Draws one `blocks.mjs` frame — `px` opaque, `sh` the translucent cast shadow. */
function drawFrame(dst, frame, dx, dy) {
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const c = frame.px[y][x];
      if (c !== null) {
        blend(dst, dx + x, dy + y, (c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff, 255);
      } else if (frame.sh?.[y][x]) {
        blend(dst, dx + x, dy + y, 0x1c, 0x1a, 0x1f, 104);
      }
    }
  }
}

function fill(dst, x0, y0, w, h, colour) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      blend(dst, x, y, (colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff, 255);
    }
  }
}

/** The last opaque row of a sprite (or sub-rect), so a body can be stood on a line. */
function inkedBottom(src, rect) {
  const [sx, sy, w, h] = rect ?? [0, 0, src.width, src.height];
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      if (src.pixels[((sy + y) * src.width + (sx + x)) * 4 + 3] > 8) return y;
    }
  }
  return h - 1;
}

function upscale(src, factor) {
  const dst = surface(src.width * factor, src.height * factor);
  for (let y = 0; y < dst.height; y++) {
    for (let x = 0; x < dst.width; x++) {
      const from = (Math.floor(y / factor) * src.width + Math.floor(x / factor)) * 4;
      const at = (y * dst.width + x) * 4;
      src.pixels.copy(dst.pixels, at, from, from + 4);
    }
  }
  return dst;
}

const png = async (path) => decodePng(await readFile(`${SPRITES}${path}`));

/**
 * One floor's patch at one overhang.
 *
 * The clump is a plus/L shape rather than a bar, so the sheet shows both the
 * thing being decided (how much of Alois an overhang eats when he stands
 * against a rock's south face) and the thing that could go wrong with it (how
 * two stacked cells overlap each other, since the near cell's own overhang
 * lands on the far cell's base).
 */
const CLUMP = [
  [2, 2],
  [3, 2],
  [4, 2],
  [3, 1],
];
const COLS = 8;
const ROWS = 5;

async function patch(floor, lip) {
  const blocks = buildBlocks(lip);
  const names =
    floor === 1
      ? ['cellar-boulder-1', 'cellar-boulder-2', 'cellar-boulder-3', 'cellar-boulder-4']
      : ['rural-fieldstone-1', 'rural-fieldstone-2', 'rural-fieldstone-3', 'rural-fieldstone-4'];
  const floorTiles =
    floor === 1
      ? [await png('floor-1-cellar/tiles/cellar-floor.png')]
      : await Promise.all(
          [1, 2, 3, 4].map((n) => png(`floor-2-rural/tiles/rural-floor-${String(n)}.png`)),
        );
  const alois = await png('common/characters/alois-south.strip.png');
  // 8 frames on the strip (`alois-south.anim.json`), so 20x32 each — frame 0
  // is the idle pose.
  const aloisW = alois.width / 8;
  const aloisFrame = [0, 0, aloisW, alois.height];
  const feet = inkedBottom(alois, aloisFrame);

  const dst = surface(COLS * CELL, ROWS * CELL);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const tile = floorTiles[(col * 3 + row * 5) % floorTiles.length];
      draw(dst, tile, col * CELL, row * CELL);
    }
  }

  // Everything below is drawn in foot-line order, which is exactly what
  // `render/depth.ts` does at runtime: the thing whose ground contact is
  // further down the screen is drawn later, so it covers what is behind it.
  const standing = [];
  for (const [col, row] of CLUMP) {
    const frame = blocks[names[(col * 3 + row * 7) % names.length]];
    standing.push({
      foot: (row + 1) * CELL,
      paint: () => drawFrame(dst, frame, col * CELL, (row + 1) * CELL - frame.height),
    });
  }
  // North of the clump, against its face — the read this decision is about.
  // South of it, so the sheet also shows him correctly in front.
  for (const [col, row] of [
    [3, 0],
    [5, 2],
  ]) {
    const foot = (row + 1) * CELL;
    standing.push({
      foot,
      paint: () => draw(dst, alois, col * CELL + (CELL - aloisW) / 2, foot - 1 - feet, aloisFrame),
    });
  }
  standing.sort((a, b) => a.foot - b.foot);
  for (const entry of standing) entry.paint();
  return dst;
}

const lips = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [0, 8, 12, 16];

const GUTTER = 6;
const LABEL = 10;
const patches = [];
for (const floor of [1, 2]) {
  for (const lip of lips) patches.push({ floor, lip, image: await patch(floor, lip) });
}

const cellW = patches[0].image.width;
const cellH = patches[0].image.height;
const sheet = surface(
  lips.length * (cellW + GUTTER) + GUTTER,
  2 * (cellH + LABEL + GUTTER) + GUTTER,
);
fill(sheet, 0, 0, sheet.width, sheet.height, 0x14_12_16);
patches.forEach(({ floor, lip, image }) => {
  const col = lips.indexOf(lip);
  const row = floor - 1;
  const x = GUTTER + col * (cellW + GUTTER);
  const y = GUTTER + row * (cellH + LABEL + GUTTER) + LABEL;
  draw(sheet, image, x, y);
  // A tally bar, `lip` pixels long, in place of text: the sheet is upscaled
  // nearest-neighbour and a pixel font would be as much work as the art.
  fill(sheet, x, y - LABEL + 2, Math.max(1, lip) * 2, 4, lip === 0 ? 0x66_5a_50 : 0xe8_e2_d0);
});

const out = upscale(sheet, UPSCALE);
await writeFile(`${OUT}block-specimens.png`, encodePng(out));
console.log(
  `block-specimens.png  ${String(out.width)}x${String(out.height)}  lips ${lips.join(', ')}`,
);
