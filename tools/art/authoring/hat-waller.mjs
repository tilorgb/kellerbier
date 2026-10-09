// The Waller-Kopf hat (`ItemDefinition.hat` of the Waller-Kopf item): a catfish head worn over
// Alois's whole head — felt hat and face both. Fitted from the pixel-bench pick Tilo chose (picks/waller-kopf.png),
// outlined in the same black Alois carries.
//   node tools/art/authoring/hat-waller.mjs <outDir>      writes hat-waller.png there
//   node tools/art/authoring/hat-waller.mjs --install     writes assets/sprites/common/characters/hat-waller.png
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const OUTLINE = rgb(0x000000);

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }
  set(x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  get(x, y) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y * this.w + x];
  }
  ellipse(cx, cy, rx, ry, colour) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (Math.abs(dx) ** 2.7 + Math.abs(dy) ** 2.7 <= 1) this.set(x, y, colour);
      }
  }
  line(x0, y0, x1, y1, colour) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      this.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), colour);
    }
  }
  outline() {
    const edge = [];
    for (let y = -1; y <= this.h; y++)
      for (let x = -1; x <= this.w; x++) {
        if (this.get(x, y) !== null) continue;
        if (
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => this.get(x + dx, y + dy) !== null)
        )
          edge.push([x, y]);
      }
    for (const [x, y] of edge) this.set(x, y, OUTLINE);
  }
  png() {
    const png = new PNG({ width: this.w, height: this.h });
    this.px.forEach((c, i) => {
      png.data[i * 4] = c?.[0] ?? 0;
      png.data[i * 4 + 1] = c?.[1] ?? 0;
      png.data[i * 4 + 2] = c?.[2] ?? 0;
      png.data[i * 4 + 3] = c ? 255 : 0;
    });
    return PNG.sync.write(png);
  }
}

/**
 * Tilo's pick from the pixel-bench board (picks/waller-kopf.png): the dark toothy catfish. It is
 * cropped, fitted into 22×18 so the outline has room, and set on the 24×20 canvas the hat anchors
 * and HAT_DROP (render/player-view.ts) were measured against.
 */
function catfishHead() {
  const src = PNG.sync.read(readFileSync(new URL('./picks/waller-kopf.png', import.meta.url)));
  let x0 = src.width,
    y0 = src.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++)
      if (src.data[(y * src.width + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const scale = Math.min(22 / bw, 18 / bh);
  const tw = Math.round(bw * scale);
  const th = Math.round(bh * scale);
  const c = new Canvas(24, 20);
  const ox = Math.floor((24 - tw) / 2);
  const oy = 20 - 1 - th;
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      const sx = x0 + Math.min(bw - 1, Math.floor(x / scale));
      const sy = y0 + Math.min(bh - 1, Math.floor(y / scale));
      const at = (sy * src.width + sx) * 4;
      if (src.data[at + 3] > 0)
        c.set(ox + x, oy + y, [src.data[at], src.data[at + 1], src.data[at + 2]]);
    }
  c.outline();
  return c;
}

const [first] = process.argv.slice(2);
if (first === '--install') {
  writeFileSync('assets/sprites/common/characters/hat-waller.png', catfishHead().png());
} else if (first) {
  mkdirSync(first, { recursive: true });
  writeFileSync(join(first, 'hat-waller.png'), catfishHead().png());
}
