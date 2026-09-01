import { encodePng } from '../png.mjs';
import { legalPixelColorsFor, shadeOf } from '../palette.mjs';

/**
 * The in-room blocking tiles, as procedural 32×32 rasters.
 *
 * Same argument `tools/art/authoring/bosses.mjs` makes: a thing that is "one
 * shape re-rolled a few times" is authored as code, not as N hand-edited
 * copies. A floor's obstacle is now a *set* of 2–4 variants
 * (`render/room.ts` picks one per cell off `pickTileVariant`, the way the
 * living floor already mixes its floor tiles), and hand-drawing four
 * near-identical boulders is exactly the drift trap that pattern exists for.
 *
 * Two rules the shapes follow, both from the sign-off round (`CLAUDE.md`):
 *
 * 1. **No square tile edge.** The old `cellar-plank` / `rural-hedge-block`
 *    read as furniture because `render/room.ts` stroked a 1px `blockEdge`
 *    rectangle around every block rect — that stroke is gone when a tileset
 *    is present now, and these silhouettes are rounded/irregular so nothing
 *    redraws it.
 * 2. **Fill the cell.** A boulder that floats in the middle of its 32px cell
 *    leaves a channel between two adjacent blocked cells that reads as
 *    walkable. Every silhouette here reaches within ~2px of all four edges,
 *    so a clump of them reads as one solid mass.
 *
 * Floor 1 (Der Keller): faceted grey boulders — angular chunks, rounded
 * overall, lit top-left, dark contact band at the base.
 * Floor 2 (Dorf & Acker): cleared field stones ("Lesesteinhaufen") — a
 * packed mound of neutral-grey stones with moss in the crevices, the one
 * rural blocker the floor's green/blue/cream palette can carry without a
 * grey or brown of its own (neutrals are legal on every floor).
 */

const W = 32;
const H = 32;

// ----------------------------------------------------------------- palettes
// Every value below is `legalPixelColorsFor(bucket)` — base swatch or a
// point on its derived shade ramp — so `assertOnPalette` passes by
// construction.
const CELLAR = {
  bucket: 'floor-1-cellar',
  deep: 0x1c1a1f, // crevice / deepest contact
  d2: shadeOf(0x3c3e40, -1), // darkest stone
  d: 0x3c3e40, // dark stone
  m: 0x4a4d50, // mid stone
  l: 0x5b5f63, // lit stone
  h: shadeOf(0x5b5f63, 1), // top highlight
};
const RURAL = {
  bucket: 'floor-2-rural',
  deep: 0x1c1a1f,
  d2: shadeOf(0x8a8a8a, -2),
  d: shadeOf(0x8a8a8a, -1),
  m: 0x8a8a8a,
  l: shadeOf(0x8a8a8a, 1),
  h: shadeOf(0x8a8a8a, 2),
  moss: 0x3f7a3a,
  mossLit: 0x7fbf6a,
};

// ------------------------------------------------------------- raster canvas
// `px` is opaque hex-or-null. `sh` is the cast shadow: a translucent pass
// that only shows where `px` is empty, so a boulder throws a soft shape onto
// the floor tile beside it. `SHADOW_COLOUR` is a legal neutral shade on
// every floor and `SHADOW_ALPHA` keeps the floor grain readable through it.
const SHADOW_COLOUR = 0x1c1a1f;
const SHADOW_ALPHA = 104;
function canvas() {
  return {
    px: Array.from({ length: H }, () => Array.from({ length: W }, () => null)),
    sh: Array.from({ length: H }, () => Array.from({ length: W }, () => false)),
  };
}
/** Marks a soft ellipse of cast shadow, offset down-right from the rock's footprint. */
function castShadow(cv, cx, cy, rx, ry) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1) cv.sh[y][x] = true;
    }
  }
}
function set(cv, x, y, colour) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  cv.px[y][x] = colour;
}
function get(cv, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  return cv.px[y][x];
}
const on = (cv, x, y) => get(cv, x, y) !== null;

/** Deterministic hash noise in [0,1) — no `Math.random`, so a rebuild is byte-identical. */
function hash2(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * A lumpy ellipse mask: `true` inside a `(cx,cy)` ellipse of radius `(rx,ry)`
 * whose edge is pushed in and out by a few low-frequency sine terms, so the
 * silhouette is a rounded rock rather than a clean oval.
 */
function lumpyInside(x, y, cx, cy, rx, ry, seed) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const ang = Math.atan2(dy, dx);
  let wob = 1;
  for (let k = 0; k < 4; k++) {
    const ph = hash2(k, seed, 7) * Math.PI * 2;
    wob += (0.05 + hash2(k, seed, 11) * 0.11) * Math.sin((k + 2) * ang + ph);
  }
  return Math.hypot(dx, dy) <= wob;
}

// -------------------------------------------------------------------- shared
/**
 * Paints one rounded rock chunk into `cv`: flat-ish tone bands from a
 * top-left light, a 1px darker rim, and its lowest rows dropped toward the
 * contact shade. `chunks` earlier in the list are overpainted by later ones.
 */
function rock(cv, P, cx, cy, rx, ry, seed, { tone = 0, moss = false } = {}) {
  const band = [P.d2, P.d, P.m, P.l, P.h];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!lumpyInside(x, y, cx, cy, rx, ry, seed)) continue;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const lit = -(nx * 0.72 + ny * 0.72) + tone;
      let idx = lit > 0.62 ? 4 : lit > 0.24 ? 3 : lit > -0.16 ? 2 : lit > -0.52 ? 1 : 0;
      // speckle so a big flat face is not dead flat
      const n = hash2(x, y, seed + 3);
      if (n > 0.9 && idx < 4) idx++;
      else if (n < 0.1 && idx > 0) idx--;
      set(cv, x, y, band[idx]);
      if (moss && ny > 0.15 && hash2(x, y, seed + 91) > 0.93) {
        set(cv, x, y, ny > 0.55 ? P.moss : P.mossLit);
      }
    }
  }
}

/** 1px rim: darker on most of the edge, a highlight on the top-left arc. */
function rim(cv, P) {
  const snap = cv.px.map((r) => [...r]);
  const lit = (x, y) => snap[y]?.[x] !== null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (snap[y][x] === null) continue;
      const edge = !lit(x - 1, y) || !lit(x + 1, y) || !lit(x, y - 1) || !lit(x, y + 1);
      if (!edge) continue;
      const topLeft = !lit(x - 1, y) || !lit(x, y - 1);
      cv.px[y][x] = topLeft && snap[y][x] !== P.d2 ? P.h : P.d2;
    }
  }
}

/** The lowest few rows of the silhouette, per column, dropped to the contact shades. */
function contact(cv, P) {
  for (let x = 0; x < W; x++) {
    let bottom = -1;
    for (let y = H - 1; y >= 0; y--) {
      if (on(cv, x, y)) {
        bottom = y;
        break;
      }
    }
    if (bottom < 0) continue;
    for (let y = bottom; y > bottom - 3 && y >= 0; y--) {
      if (on(cv, x, y)) set(cv, x, y, y === bottom ? P.deep : P.d2);
    }
  }
}

function crack(cv, P, pts) {
  for (const [x, y] of pts) if (on(cv, x, y)) set(cv, x, y, P.deep);
}

function finish(name, cv) {
  return { name, width: W, height: H, px: cv.px, sh: cv.sh };
}

// =============================================================== FLOOR 1 — Der Keller
// Faceted boulders. Each is a body chunk plus a lit shoulder and a dark
// flank, so the silhouette reads as an angular rock with a rounded top. The
// specs reach x≈[2,30] y≈[3,31] — a clump of them leaves no walkable gap.
const CELLAR_BOULDERS = [
  // big, two-humped
  (s) => {
    const cv = canvas();
    castShadow(cv, 21, 27, 14, 5);
    rock(cv, CELLAR, 17, 19, 14, 13, s, { tone: -0.15 });
    rock(cv, CELLAR, 12, 13, 9, 8, s + 1, { tone: 0.35 });
    rock(cv, CELLAR, 23, 21, 9, 9, s + 2, { tone: -0.4 });
    rim(cv, CELLAR);
    contact(cv, CELLAR);
    crack(cv, CELLAR, [[16, 10], [16, 13], [17, 16], [17, 19], [18, 22]]);
    return finish('cellar-boulder-1', cv);
  },
  // tall wedge
  (s) => {
    const cv = canvas();
    castShadow(cv, 20, 27, 12, 5);
    rock(cv, CELLAR, 16, 18, 12, 14, s, { tone: -0.1 });
    rock(cv, CELLAR, 13, 11, 8, 8, s + 1, { tone: 0.4 });
    rock(cv, CELLAR, 21, 24, 9, 8, s + 2, { tone: -0.45 });
    rim(cv, CELLAR);
    contact(cv, CELLAR);
    crack(cv, CELLAR, [[19, 9], [18, 12], [18, 15], [17, 18]]);
    return finish('cellar-boulder-2', cv);
  },
  // wide low slab
  (s) => {
    const cv = canvas();
    castShadow(cv, 20, 28, 15, 4);
    rock(cv, CELLAR, 16, 21, 15, 11, s, { tone: -0.15 });
    rock(cv, CELLAR, 10, 17, 8, 7, s + 1, { tone: 0.35 });
    rock(cv, CELLAR, 23, 18, 9, 8, s + 2, { tone: -0.35 });
    rim(cv, CELLAR);
    contact(cv, CELLAR);
    crack(cv, CELLAR, [[9, 20], [13, 21], [17, 22], [21, 21], [25, 22]]);
    return finish('cellar-boulder-3', cv);
  },
  // blunt, near-round
  (s) => {
    const cv = canvas();
    castShadow(cv, 20, 27, 13, 5);
    rock(cv, CELLAR, 16, 19, 13, 12, s, { tone: -0.05 });
    rock(cv, CELLAR, 12, 14, 8, 7, s + 1, { tone: 0.45 });
    rock(cv, CELLAR, 22, 22, 8, 8, s + 2, { tone: -0.5 });
    rim(cv, CELLAR);
    contact(cv, CELLAR);
    crack(cv, CELLAR, [[20, 12], [19, 15], [15, 16], [12, 18]]);
    return finish('cellar-boulder-4', cv);
  },
];

// =============================================================== FLOOR 2 — Dorf & Acker
// Cleared field stones: a packed mound. Several stones, each shaded like a
// small boulder, overlapping enough that the pile has no interior hole and
// its silhouette fills the cell. Moss greens the crevices.
function fieldStones(name, seed, stones) {
  const cv = canvas();
  castShadow(cv, 20, 28, 15, 4);
  stones.forEach((st, i) => rock(cv, RURAL, st[0], st[1], st[2], st[3], seed + i, { tone: st[4] ?? 0, moss: true }));
  // seams where two stones butt together read darker
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!on(cv, x, y)) continue;
      let near = 0;
      for (const st of stones) {
        const d = Math.hypot((x - st[0]) / st[2], (y - st[1]) / st[3]);
        if (d > 0.82 && d < 1.06) near++;
      }
      if (near >= 2) set(cv, x, y, RURAL.d2);
    }
  }
  rim(cv, RURAL);
  contact(cv, RURAL);
  return finish(name, cv);
}
const RURAL_STONES = [
  (s) =>
    fieldStones('rural-fieldstone-1', s, [
      [11, 20, 9, 8, 0.1],
      [22, 19, 9, 8, -0.35],
      [16, 12, 9, 8, 0.3],
      [17, 25, 10, 6, -0.5],
    ]),
  (s) =>
    fieldStones('rural-fieldstone-2', s, [
      [13, 21, 10, 9, 0.1],
      [23, 14, 8, 7, 0.35],
      [9, 13, 7, 6, 0.2],
      [21, 25, 9, 6, -0.5],
    ]),
  (s) =>
    fieldStones('rural-fieldstone-3', s, [
      [16, 20, 12, 10, 0],
      [10, 14, 8, 7, 0.35],
      [24, 17, 8, 8, -0.3],
      [16, 27, 12, 5, -0.55],
    ]),
  (s) =>
    fieldStones('rural-fieldstone-4', s, [
      [12, 19, 9, 8, 0.15],
      [21, 21, 9, 8, -0.3],
      [17, 13, 8, 8, 0.3],
      [15, 26, 10, 6, -0.5],
    ]),
];

// ---------------------------------------------------------------------------
/** `name -> frame` for every block tile, both floors. */
export const BLOCKS = Object.fromEntries(
  [
    ...CELLAR_BOULDERS.map((make, i) => make(101 + i * 7)),
    ...RURAL_STONES.map((make, i) => make(401 + i * 9)),
  ].map((frame) => [frame.name, frame]),
);

export const BLOCK_BUCKETS = Object.fromEntries(
  Object.keys(BLOCKS).map((name) => [name, name.startsWith('cellar-') ? 'floor-1-cellar' : 'floor-2-rural']),
);

/** Throws if any painted pixel is not legal for `bucket`. */
export function assertOnPalette(bucket, frame) {
  const legal = legalPixelColorsFor(bucket);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const c = frame.px[y][x];
      if (c !== null && !legal.has(c)) {
        throw new Error(
          `${frame.name}: pixel ${x},${y} is #${c.toString(16).padStart(6, '0')}, not legal for ${bucket}`,
        );
      }
    }
  }
}

/** One frame → 32×32 PNG bytes. Opaque `px`, else translucent cast shadow, else clear. */
export function encodeSingle(frame) {
  const pixels = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const at = (y * W + x) * 4;
      const c = frame.px[y][x];
      if (c !== null) {
        pixels[at] = (c >> 16) & 0xff;
        pixels[at + 1] = (c >> 8) & 0xff;
        pixels[at + 2] = c & 0xff;
        pixels[at + 3] = 0xff;
      } else if (frame.sh?.[y][x]) {
        pixels[at] = (SHADOW_COLOUR >> 16) & 0xff;
        pixels[at + 1] = (SHADOW_COLOUR >> 8) & 0xff;
        pixels[at + 2] = SHADOW_COLOUR & 0xff;
        pixels[at + 3] = SHADOW_ALPHA;
      }
    }
  }
  return encodePng({ width: W, height: H, pixels });
}
