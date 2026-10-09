// The Hendl hat (Hendlgeruch's `hat`): a roast chicken worn where Alois's felt hat was.
// Block art in the manner of tools/art/authoring/items.mjs — three candidate designs, drawn from
// shapes, outlined automatically in the same black Alois carries.
//   node tools/art/authoring/hat-hendl.mjs <outDir> [a|b|c]
// writes hat-hendl-<option>.png (the candidates) into <outDir>; with `--install <option>` it writes
// the chosen one to assets/sprites/common/characters/hat-hendl.png instead.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { shadeOf } from '../palette.mjs';

// Colours are the common bucket's, the same AMBER ramp the Hendlgeruch's item icon is drawn in.
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const AMBER = 0xd99a3f;
const OUTLINE = rgb(0x000000);
const SKIN = {
  base: rgb(AMBER),
  light: rgb(shadeOf(AMBER, 1)),
  shade: rgb(shadeOf(AMBER, -1)),
  crisp: rgb(shadeOf(AMBER, -2)),
  bone: rgb(0xf5f0e6),
  steam: rgb(0xe8e2d0),
};

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
  rect(x, y, w, h, colour) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, colour);
  }
  /** Black round every opaque shape, the way the rest of Alois is drawn. */
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
  /** Trims empty rows top and bottom, so the bottom of the sprite is where it sits on the head. */
  crop() {
    let top = 0;
    while (top < this.h && this.px.slice(top * this.w, (top + 1) * this.w).every((p) => p === null))
      top++;
    let bottom = this.h;
    while (
      bottom > top &&
      this.px.slice((bottom - 1) * this.w, bottom * this.w).every((p) => p === null)
    )
      bottom--;
    const out = new Canvas(this.w, bottom - top);
    out.px = this.px.slice(top * this.w, bottom * this.w);
    return out;
  }
  /** Pads empty rows on top up to the pipeline's 16px character minimum; the sprite stays bottom-anchored. */
  padTop(minHeight) {
    if (this.h >= minHeight) return this;
    const out = new Canvas(this.w, minHeight);
    out.px = [...new Array((minHeight - this.h) * this.w).fill(null), ...this.px];
    return out;
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

/** Light from the top-left: the body in three bands, with crisped skin dotted over it. */
function roast(c, cx, cy, rx, ry) {
  c.ellipse(cx, cy, rx, ry, SKIN.base);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      if (c.get(x, y) !== SKIN.base) continue;
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx + dy < -0.55) c.set(x, y, SKIN.light);
      else if (dx + dy > 0.7) c.set(x, y, SKIN.shade);
    }
}

function crisp(c, spots) {
  for (const [x, y] of spots) if (c.get(x, y) !== null) c.set(x, y, SKIN.crisp);
}

/**
 * The signed-off direction: about the size of Alois's own felt hat (20 wide, a hat's height of
 * bird), lying on its back with both drumsticks sticking up. `legs` is how tall they stand.
 */
function compact(legs) {
  const w = 22;
  const c = new Canvas(w, 8 + legs + 2);
  const top = legs + 2;
  roast(c, 11, top + 4, 10.5, 4);
  for (const x of [3, 17]) {
    c.rect(x, top - legs + 1, 3, legs + 2, SKIN.base);
    c.rect(x, top - legs + 1, 1, legs + 1, SKIN.light);
    c.rect(x + 2, top - legs + 2, 1, legs + 1, SKIN.shade);
    c.rect(x, top - legs - 1, 3, 2, SKIN.bone);
  }
  c.ellipse(13.5, top + 5, 3.5, 1.8, SKIN.shade);
  crisp(c, [
    [8, top + 3],
    [11, top + 2],
    [15, top + 4],
    [7, top + 6],
    [10, top + 6],
  ]);
  c.outline();
  return c.crop().padTop(16);
}

function optionA() {
  return compact(2);
}
function optionB() {
  return compact(3);
}
function optionC() {
  return compact(4);
}

const OPTIONS = { a: optionA, b: optionB, c: optionC };

const [outDir, ...rest] = process.argv.slice(2);
if (outDir === '--install') {
  const key = rest[0];
  writeFileSync('assets/sprites/common/characters/hat-hendl.png', OPTIONS[key]().png());
} else if (outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const [key, make] of Object.entries(OPTIONS)) {
    if (rest.length === 0 || rest.includes(key))
      writeFileSync(join(outDir, `hat-hendl-${key}.png`), make().png());
  }
}
