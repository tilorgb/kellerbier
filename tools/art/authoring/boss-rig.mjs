import { readFileSync } from 'node:fs';
import { decodePng } from '../png.mjs';
import { nudgeShade } from '../palette.mjs';

/**
 * A boss sprite as a *cel-traced rig*: the boss's own signed-off key art
 * (`assets/art/bosses/*.png`), cut into a handful of body parts along
 * hand-placed polygons, each part downscaled straight to the sprite's own
 * canvas, flattened to two or three deliberate tones of one legal palette
 * material, inked on its own edge, and then re-posed per frame — legs swing
 * around a hip, a head drops at the neck, a body squashes on its planted feet.
 *
 * `docs/DECISIONS.md` #100 was right that a hand-composed approximation of
 * the art never resembles the art, and #101 was right that a downsampled
 * photograph never resembles a creature; this is the third position between
 * them, and it is the one every cut-out animation has always taken: the
 * *shapes* come from the drawing, the *rendering* is the game's flat-ink
 * style, and the *motion* comes from articulating parts, not from warping one
 * frozen raster. The pipeline is deterministic (a pure function of the key
 * art, the polygons and the palette), so `tests/art/boss-authoring.test.ts`'s
 * byte-for-byte guard keeps working.
 *
 * `docs/BOSS_SPRITES.md` is the step-by-step for authoring a new boss with this;
 * `boss-rig-preview.mjs` draws the polygons over the art and the frames as a sheet.
 *
 * Coordinates: polygons and pivots are in *source* (key-art) pixels — the
 * numbers a person reads off the illustration — and a `Mapping` converts them
 * to sprite pixels once, so a part's mask and its joint are authored against
 * the same picture.
 */

// ----------------------------------------------------------------- source art
const artCache = new Map();
/** Decodes a key-art PNG once per process. */
export function loadKeyArt(path) {
  let art = artCache.get(path);
  if (!art) {
    art = decodePng(readFileSync(path));
    artCache.set(path, art);
  }
  return art;
}

/** Relative luminance of an sRGB byte triple, 0-1 (the gamma is left in — this is a banding cut, not a photometric measurement). */
function luma(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Even-odd point-in-polygon. `poly` is `[[x, y], ...]`. */
export function insidePolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Source pixels → sprite pixels. `scale` is sprite px per source px; the
 * source point `(originX, originY)` lands on sprite `(dstX, dstY)`.
 */
export function mapping({ scale, originX, originY, dstX, dstY }) {
  return {
    scale,
    toSprite: (x, y) => [(x - originX) * scale + dstX, (y - originY) * scale + dstY],
    toSource: (x, y) => [(x - dstX) / scale + originX, (y - dstY) / scale + originY],
  };
}

// -------------------------------------------------------------------- parts
/**
 * Cuts one part out of `art` and flattens it.
 *
 * - `polygon`: the part's outline in source pixels (loose is fine where a
 *   `key` does the precise work, tight where it does not).
 * - `key`: `'dark'` keeps only source pixels darker than `keyThreshold`
 *   (a near-black bull against a bright field), `'light'` only those lighter
 *   (a grey leg against the shadow under a shell), `'none'` keeps everything
 *   inside the polygon.
 * - `coverage`: the fraction of a sprite pixel's source block that must be
 *   kept for the pixel to be opaque. Lower it for a part only 2-3 sprite
 *   pixels wide, or its edges thin to nothing.
 * - `material`: `{ tones: [dark … light], cuts: [q1, q2 …] }` — `tones` are
 *   legal palette hexes and `cuts` the luminance *quantiles* (0-1, within
 *   this part's own opaque pixels) at which the next tone starts. Two tones
 *   need one cut, three need two. `cutsAbsolute: true` reads `cuts` as
 *   absolute luminance instead, for a material whose distribution shouldn't
 *   decide (a white eye, say).
 * - `blur`: passes of a 3×3 mean over the luminance before banding, so
 *   brushwork merges into its band instead of speckling it.
 */
export function cutPart(art, map, spec) {
  const {
    name,
    polygon,
    key = 'none',
    keyThreshold = 0.45,
    coverage = 0.5,
    material,
    blur = 1,
    erode = 0,
  } = spec;
  const { width, height, pixels } = art;
  const { scale } = map;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const [sx0f, sy0f] = map.toSprite(minX, minY);
  const [sx1f, sy1f] = map.toSprite(maxX, maxY);
  const sx0 = Math.floor(sx0f) - 1;
  const sy0 = Math.floor(sy0f) - 1;
  const w = Math.ceil(sx1f) + 1 - sx0 + 1;
  const h = Math.ceil(sy1f) + 1 - sy0 + 1;
  const lum = new Float32Array(w * h).fill(-1);
  const step = Math.max(1, Math.floor(1 / scale / 4));
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const [ax, ay] = map.toSource(sx0 + tx, sy0 + ty);
      const [bx, by] = map.toSource(sx0 + tx + 1, sy0 + ty + 1);
      let total = 0,
        kept = 0,
        rs = 0,
        gs = 0,
        bs = 0;
      for (let y = Math.floor(ay); y < by; y += step) {
        for (let x = Math.floor(ax); x < bx; x += step) {
          total++;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if (!insidePolygon(polygon, x + 0.5, y + 0.5)) continue;
          const i = (y * width + x) * 4;
          if (pixels[i + 3] < 128) continue;
          const l = luma(pixels[i], pixels[i + 1], pixels[i + 2]);
          if (key === 'dark' && l > keyThreshold) continue;
          if (key === 'light' && l < keyThreshold) continue;
          kept++;
          rs += pixels[i];
          gs += pixels[i + 1];
          bs += pixels[i + 2];
        }
      }
      if (total === 0 || kept / total < coverage) continue;
      lum[ty * w + tx] = luma(rs / kept, gs / kept, bs / kept);
    }
  }
  // Erode thin fringes the coverage test let through (optional).
  for (let e = 0; e < erode; e++) {
    const snap = Float32Array.from(lum);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (snap[y * w + x] < 0) continue;
        const n = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].filter(
          ([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < h && snap[ny * w + nx] >= 0,
        ).length;
        if (n < 3) lum[y * w + x] = -1;
      }
  }
  // Blur the luminance within the part (opaque neighbours only).
  for (let pass = 0; pass < blur; pass++) {
    const snap = Float32Array.from(lum);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (snap[y * w + x] < 0) continue;
        let s = 0,
          n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const v = snap[ny * w + nx];
            if (v < 0) continue;
            s += v;
            n++;
          }
        lum[y * w + x] = s / n;
      }
  }
  // Band into tones.
  const px = Array.from({ length: h }, () => Array.from({ length: w }, () => null));
  const values = [];
  for (let i = 0; i < lum.length; i++) if (lum[i] >= 0) values.push(lum[i]);
  values.sort((a, b) => a - b);
  const { tones, cuts = [], cutsAbsolute = false } = material;
  const thresholds = cutsAbsolute
    ? cuts
    : cuts.map((q) => values[Math.min(values.length - 1, Math.floor(q * values.length))] ?? 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = lum[y * w + x];
      if (v < 0) continue;
      let band = 0;
      while (band < thresholds.length && v >= thresholds[band]) band++;
      px[y][x] = tones[Math.min(band, tones.length - 1)];
    }
  return { name, w, h, px, ox: sx0, oy: sy0 };
}

/** A hand-drawn part: `rows` of single-character keys over `palette`, placed with its top-left at sprite `(ox, oy)`. */
export function drawnPart(name, rows, palette, ox, oy) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const px = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const c = rows[y][x] ?? '.';
      const v = palette[c];
      return v === undefined || v === null ? null : v;
    }),
  );
  return { name, w, h, px, ox, oy };
}

/** A part from a bare `[[x, y, colour], …]` list of sprite pixels — a wreath's beads, an eye. */
export function pixelPart(name, pixelsList) {
  const xs = pixelsList.map((p) => p[0]);
  const ys = pixelsList.map((p) => p[1]);
  const ox = Math.min(...xs),
    oy = Math.min(...ys);
  const w = Math.max(...xs) - ox + 1,
    h = Math.max(...ys) - oy + 1;
  const px = Array.from({ length: h }, () => Array.from({ length: w }, () => null));
  for (const [x, y, c] of pixelsList) px[y - oy][x - ox] = c;
  return { name, w, h, px, ox, oy };
}

/** Paints a `[[x, y, colour], …]` list of sprite pixels over `part` (in sprite coords) — for a hand-fixed pixel or two. */
export function touchUp(part, pixelsList) {
  for (const [x, y, c] of pixelsList) {
    const lx = x - part.ox,
      ly = y - part.oy;
    if (lx >= 0 && ly >= 0 && lx < part.w && ly < part.h) part.px[ly][lx] = c;
  }
  return part;
}

// ------------------------------------------------------------------ frames
/** A mutable canvas of hex-or-null, the same shape `bosses.mjs` finishes into a frame. */
export function canvas(w, h) {
  return { w, h, px: Array.from({ length: h }, () => Array.from({ length: w }, () => null)) };
}

function mul(a, b) {
  // 2x3 affine: [a c e; b d f]
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function translate(x, y) {
  return [1, 0, 0, 1, x, y];
}
function rotateDeg(deg) {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
}
function scaleM(sx, sy) {
  return [sx, 0, 0, sy, 0, 0];
}
function invert(m) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  const ia = d / det,
    ib = -b / det,
    ic = -c / det,
    id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}
function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Transform of one placed part, all in sprite pixels: rotate `rotate`
 * degrees (clockwise, y-down) and scale `sx`/`sy` about `pivot`, then shift by
 * `(dx, dy)`. A part with no pivot rotates about its own centre.
 */
function localMatrix(part, { dx = 0, dy = 0, rotate = 0, sx = 1, sy = 1, pivot } = {}) {
  const [px, py] = pivot ?? [part.ox + part.w / 2, part.oy + part.h / 2];
  let m = translate(px, py);
  m = mul(m, rotateDeg(rotate));
  m = mul(m, scaleM(sx, sy));
  m = mul(m, translate(-px, -py));
  return mul(translate(dx, dy), m);
}

/**
 * Composes `placements` (draw order: first is furthest back) onto a fresh
 * `w`×`h` canvas. Each placement is `{ part, dx, dy, rotate, sx, sy, pivot,
 * tint, ink }`; `global` is a `{ dx, dy, rotate, sx, sy, pivot }` applied to
 * everything after its own transform (a whole body toppling). `tint` walks
 * every pixel that many `nudgeShade` steps lighter (a hit flash) or, negative,
 * darker (a far leg in the body's shadow). Every part is
 * inked on its own transformed silhouette (`ink` colour, default black,
 * `ink: false` to skip), so a limb in front of a body keeps its own edge —
 * the separation that makes a leg read as a leg and not a bulge.
 *
 * Inverse-mapped throughout (walk the destination, sample the part), for the
 * reason `docs/DECISIONS.md` #100 recorded: forward mapping leaves holes
 * under any non-uniform scale or rotation.
 */
export function composeFrame(name, w, h, placements, global = {}, bucket) {
  const cv = canvas(w, h);
  const gm = localMatrix({ ox: 0, oy: 0, w, h }, { ...global, pivot: global.pivot ?? [w / 2, h] });
  for (const placement of placements) {
    const { part, tint = 0, ink = 0x000000 } = placement;
    if (!part) continue;
    const m = mul(gm, localMatrix(part, placement));
    const inv = invert(m);
    // Destination bounds: transform the part's corners.
    const corners = [
      apply(m, part.ox, part.oy),
      apply(m, part.ox + part.w, part.oy),
      apply(m, part.ox, part.oy + part.h),
      apply(m, part.ox + part.w, part.oy + part.h),
    ];
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))) - 1);
    const x1 = Math.min(w - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))) - 1);
    const y1 = Math.min(h - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))) + 1);
    const layer = canvas(w, h);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const [sxf, syf] = apply(inv, tx + 0.5, ty + 0.5);
        const lx = Math.floor(sxf) - part.ox;
        const ly = Math.floor(syf) - part.oy;
        if (lx < 0 || ly < 0 || lx >= part.w || ly >= part.h) continue;
        let c = part.px[ly][lx];
        if (c === null) continue;
        for (let s = 0; s < Math.abs(tint); s++) c = nudgeShade(bucket, c, tint > 0 ? 1 : -1);
        layer.px[ty][tx] = c;
      }
    if (ink !== false) inkOutline(layer, ink);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = layer.px[y][x];
        if (c !== null) cv.px[y][x] = c;
      }
  }
  return { name, width: w, height: h, px: cv.px };
}

/** 1px ink around every painted pixel that borders emptiness — same rule as `bosses.mjs`'s. */
export function inkOutline(cv, ink) {
  const snap = cv.px.map((row) => [...row]);
  const on = (x, y) => x >= 0 && y >= 0 && x < cv.w && y < cv.h && snap[y][x] !== null;
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < cv.w; x++) {
      if (on(x, y)) continue;
      if (
        on(x - 1, y) ||
        on(x + 1, y) ||
        on(x, y - 1) ||
        on(x, y + 1) ||
        on(x - 1, y - 1) ||
        on(x + 1, y - 1) ||
        on(x - 1, y + 1) ||
        on(x + 1, y + 1)
      )
        cv.px[y][x] = ink;
    }
}

/** Bounding box of a frame's painted pixels, or null for an empty frame. */
export function paintedBounds(frame) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++)
      if (frame.px[y][x] !== null) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}
