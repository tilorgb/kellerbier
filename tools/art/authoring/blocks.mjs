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

/**
 * The collision cell, in authored pixels: a block rect is a whole number of
 * `ROOM_TILE_UNITS` cells and a block tile is drawn at `tileGridScale`, so
 * these 32 rows are exactly the 16 world units the simulation blocks.
 */
export const BLOCK_CELL = 32;
const CELL = BLOCK_CELL;

/**
 * How far a block's silhouette overhangs the **top** of that cell.
 *
 * The perceived-height rule (`docs/DECISIONS.md` #73): a thing is drawn
 * standing on its collision footprint, and whatever it has above that
 * footprint is height the player reads but never collides with. For a rock
 * that means the canvas grows upward — `CELL + BLOCK_LIP` tall, base on the
 * cell floor — and a player walking up against its south face has their legs
 * covered by the overhang while their head clears it, which is the whole
 * Isaac read this exists to buy. Collision is untouched: the sim still blocks
 * exactly the cell.
 *
 * 8 was picked in the sign-off round (`tools/art/block-specimens.mjs`) against
 * 12 and 16, on a clump with Alois — 32 authored pixels tall, and a block tile
 * is on the same 1:1 grid he is — standing against its north face. 8 covers
 * him to the knee, which is enough to read as depth and little enough that a
 * two-cell clump still reads as rock on a floor rather than as a wall; 12 took
 * him to the waist and 16 to the chest, and at that point a room's cover
 * starts hiding the thing the player is dodging.
 */
export const BLOCK_LIP = 8;

// Set by `buildBlocks` before any frame is generated, so the whole module can
// be re-run at a different overhang (the sign-off specimen sheet did exactly
// that) without threading a size through every shape function.
let LIP = BLOCK_LIP;
let H = CELL + LIP;

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
/**
 * Marks a soft ellipse of cast shadow, offset down-right from the rock's
 * footprint. Every shape below is authored in cell coordinates (a 32-row
 * canvas), so the lip is added here rather than at each call site: a cast
 * shadow lies on the *floor*, which the lip pushes down by its whole height.
 */
function castShadow(cv, cx, cy, rx, ry) {
  cy += LIP;
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
  let h =
    (Math.imul(x | 0, 374761393) +
      Math.imul(y | 0, 668265263) +
      Math.imul(seed | 0, 2246822519)) >>>
    0;
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
function rock(cv, P, cx, cy, rx, ry, seed, { tone = 0, moss = false, lift = 'stretch' } = {}) {
  // Cell coordinates in, canvas coordinates out — see `castShadow`. How a
  // chunk uses the lip is the one thing that differs between the two floors'
  // blockers, so it is a mode rather than a constant:
  //
  // - `stretch` keeps the chunk's top where it was and pushes its base down
  //   onto the cell floor, i.e. the boulder is simply taller. Right for a
  //   single rounded rock, which is what floor 1's blockers are.
  // - `stack` moves the whole chunk down by the lip without resizing it, for
  //   a chunk that is one stone in a pile: floor 2's Lesesteinhaufen grows by
  //   being piled higher (see `fieldStones`' cap stones), not by having its
  //   individual stones stretched into ovals.
  // - `none` is already in canvas coordinates — the cap stones themselves,
  //   which are positioned against the top of the canvas.
  if (lift === 'stretch') {
    cy += LIP / 2;
    ry += LIP / 2;
  } else if (lift === 'stack') {
    cy += LIP;
  }
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

/** Cracks are on the rock face, so they ride the same stretch its chunks do. */
function crack(cv, P, pts) {
  for (const [x, y] of pts) {
    const cy = y + LIP / 2;
    if (on(cv, x, cy)) set(cv, x, cy, P.deep);
  }
}

function finish(name, cv) {
  return { name, width: W, height: H, lip: LIP, px: cv.px, sh: cv.sh };
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
    crack(cv, CELLAR, [
      [16, 10],
      [16, 13],
      [17, 16],
      [17, 19],
      [18, 22],
    ]);
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
    crack(cv, CELLAR, [
      [19, 9],
      [18, 12],
      [18, 15],
      [17, 18],
    ]);
    return finish('cellar-boulder-2', cv);
  },
  // wide, blocky slab — the flattest of the four, but still tall enough that
  // its crown reaches into the overhang. A variant that stopped at the cell
  // boundary would be the one rock on the floor a player cannot stand behind
  // (`tests/art/blocks-authoring.test.ts` fails it), and "cover sometimes
  // works" reads as a bug rather than as variety.
  (s) => {
    const cv = canvas();
    castShadow(cv, 20, 28, 15, 4);
    rock(cv, CELLAR, 16, 19, 15, 13, s, { tone: -0.15 });
    rock(cv, CELLAR, 10, 17, 8, 7, s + 1, { tone: 0.35 });
    rock(cv, CELLAR, 23, 18, 9, 8, s + 2, { tone: -0.35 });
    rim(cv, CELLAR);
    contact(cv, CELLAR);
    crack(cv, CELLAR, [
      [9, 20],
      [13, 21],
      [17, 22],
      [21, 21],
      [25, 22],
    ]);
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
    crack(cv, CELLAR, [
      [20, 12],
      [19, 15],
      [15, 16],
      [12, 18],
    ]);
    return finish('cellar-boulder-4', cv);
  },
];

// =============================================================== FLOOR 2 — Dorf & Acker
// Cleared field stones: a packed mound. Several stones, each shaded like a
// small boulder, overlapping enough that the pile has no interior hole and
// its silhouette fills the cell. Moss greens the crevices.
function fieldStones(name, seed, stones, caps) {
  const cv = canvas();
  castShadow(cv, 20, 28, 15, 4);
  // Cap stones first, so the authored front row overpaints them where the two
  // meet: the pile's near stones read as being in front of the ones behind.
  // They are placed against the top of the canvas and sized off the lip, which
  // is what makes the pile grow *taller* as the overhang does — a pile is not
  // a single rock, so stretching its stones (what `lift: 'stretch'` does for
  // floor 1's boulders) would give it four ovals instead of more stones.
  const placedCaps = caps.map((st) => [st[0], LIP * 0.5 + st[1], st[2], LIP * 0.5 + st[3], st[4]]);
  if (LIP > 0) {
    placedCaps.forEach((st, i) =>
      rock(cv, RURAL, st[0], st[1], st[2], st[3], seed + 40 + i, {
        tone: st[4] ?? 0,
        moss: true,
        lift: 'none',
      }),
    );
  }
  stones.forEach((st, i) =>
    rock(cv, RURAL, st[0], st[1], st[2], st[3], seed + i, {
      tone: st[4] ?? 0,
      moss: true,
      lift: 'stack',
    }),
  );
  // seams where two stones butt together read darker
  const seams = [
    ...(LIP > 0 ? placedCaps : []),
    ...stones.map((st) => [st[0], st[1] + LIP, st[2], st[3]]),
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!on(cv, x, y)) continue;
      let near = 0;
      for (const st of seams) {
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
// `[cx, cy, rx, ry, tone]` per stone, in cell coordinates. The second list is
// the pile's cap: `[cx, cyFromTop, rx, ryFromLip, tone]`, placed and sized off
// the lip by `fieldStones` so a taller overhang is more stone rather than
// stretched stone.
const RURAL_STONES = [
  (s) =>
    fieldStones(
      'rural-fieldstone-1',
      s,
      [
        [11, 20, 9, 8, 0.1],
        [22, 19, 9, 8, -0.35],
        [16, 12, 9, 8, 0.3],
        [17, 25, 10, 6, -0.5],
      ],
      [
        [12, 7, 8, 5, 0.4],
        [23, 9, 7, 4, 0.05],
      ],
    ),
  (s) =>
    fieldStones(
      'rural-fieldstone-2',
      s,
      [
        [13, 21, 10, 9, 0.1],
        [23, 14, 8, 7, 0.35],
        [9, 13, 7, 6, 0.2],
        [21, 25, 9, 6, -0.5],
      ],
      [
        [17, 6, 9, 5, 0.45],
        [8, 10, 7, 4, 0.1],
      ],
    ),
  (s) =>
    fieldStones(
      'rural-fieldstone-3',
      s,
      [
        [16, 20, 12, 10, 0],
        [10, 14, 8, 7, 0.35],
        [24, 17, 8, 8, -0.3],
        [16, 27, 12, 5, -0.55],
      ],
      [
        [14, 8, 9, 5, 0.4],
        [24, 7, 7, 4, 0.15],
      ],
    ),
  (s) =>
    fieldStones(
      'rural-fieldstone-4',
      s,
      [
        [12, 19, 9, 8, 0.15],
        [21, 21, 9, 8, -0.3],
        [17, 13, 8, 8, 0.3],
        [15, 26, 10, 6, -0.5],
      ],
      [
        [19, 7, 8, 5, 0.45],
        [9, 9, 7, 4, 0.05],
      ],
    ),
];

// ---------------------------------------------------------------------------
/**
 * `name -> frame` for every block tile, both floors, at an overhang of `lip`
 * authored pixels above the collision cell.
 *
 * A function rather than a constant because the overhang is an art-direction
 * number that had to be *looked at* before it was picked (`CLAUDE.md`'s
 * sign-off ritual): `tools/art/block-specimens.mjs` calls this three times at
 * three lips and composites the results onto real floor tiles with Alois
 * standing behind them. The committed art is `BLOCKS`, one call at
 * `BLOCK_LIP`.
 */
export function buildBlocks(lip = BLOCK_LIP) {
  LIP = Math.max(0, Math.round(lip));
  H = CELL + LIP;
  return Object.fromEntries(
    [
      ...CELLAR_BOULDERS.map((make, i) => make(101 + i * 7)),
      ...RURAL_STONES.map((make, i) => make(401 + i * 9)),
    ].map((frame) => [frame.name, frame]),
  );
}

/** `name -> frame` for every block tile, both floors, at the committed `BLOCK_LIP`. */
export const BLOCKS = buildBlocks(BLOCK_LIP);

export const BLOCK_BUCKETS = Object.fromEntries(
  Object.keys(BLOCKS).map((name) => [
    name,
    name.startsWith('cellar-') ? 'floor-1-cellar' : 'floor-2-rural',
  ]),
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

/**
 * One frame → PNG bytes, at the frame's own size (32 wide, `CELL + lip` tall).
 * Opaque `px`, else translucent cast shadow, else clear.
 */
export function encodeSingle(frame) {
  const { width, height } = frame;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
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
  return encodePng({ width, height, pixels });
}
