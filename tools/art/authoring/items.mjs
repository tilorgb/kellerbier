import { legalPixelColorsFor, shadeOf } from '../palette.mjs';
import { encodePng } from '../png.mjs';

/**
 * Item pedestal art (#34's "until real icons exist"), authored as programmatic
 * block art and written to `assets/sprites/common/characters/item-<id>.png` by
 * `npm run art:items` — the same source-composed contract Alois, the bosses and
 * Der Wirt ship under (`docs/DECISIONS.md` #55), for the same reason: fifty-one
 * small drawings in one consistent language are exactly the repetition problem
 * composing from source solves, and `tests/art/items-authoring.test.ts` holds
 * the committed PNGs byte-identical to this file.
 *
 * **The direction** was picked in the 2026-09 option round (`CLAUDE.md`'s
 * sign-off ritual), out of three shown at true scale beside Alois and the
 * pickups: *A, the plain object* — the item itself filling a 24×24 canvas, one
 * step of palette shading, 1px `#000000` ink, no frame or badge around it. That
 * is the pickups' own language (`pickup-mass-full.png` and friends are 24×24 on
 * the same rules), so an item on a pedestal and a Maß on the floor read as one
 * family of object. The alternatives — the item on a beer-mat badge, and a
 * chunky 2px-ink variant with one feature oversized — were rejected for the
 * roster. 24×24 is the canvas because it is the pickups' canvas: `docs/
 * DECISIONS.md` #45 makes that the item's size on screen, three-quarters of
 * Alois's height, which on a pedestal in its beam is what was signed off.
 *
 * Colours are the common bucket's — the whole master palette plus its shade
 * ramps (`legalPixelColorsFor('common')`), checked by `assertOnPalette` and by
 * the atlas build. Shapes are drawn with the small raster kit below (discs,
 * lines, rects, a text-grid stamp) rather than full-canvas text grids, because
 * an item is a handful of primitives and a grid per item would be fifty-one
 * pages of dots; `ink` puts the hard edge on afterwards exactly as
 * `floor1-roster.mjs`'s `inkOutline` does.
 *
 * Items are added here batch by batch as each batch is signed off; an item
 * with no entry yet keeps the generated placeholder disc on its pedestal
 * (`render/pedestal-view.ts`), which is the content-gap shape `CLAUDE.md`
 * asks for rather than a broken pedestal.
 */

export const SIZE = 24;
export const K = 0x000000,
  X = 0x1c1a1f,
  W = 0xffffff,
  G = 0x8a8a8a;
export const CREAM = 0xe8e2d0,
  CREAM2 = 0xf5f0e6,
  STEEL = 0xb9c4cc,
  STEEL2 = 0x6e7680,
  ALP = 0xeef2f5;
export const WOOD = 0x54402e,
  AMBER = 0xd99a3f,
  GOLD = 0xd4af37,
  GOLD2 = 0xf4d78a;
export const RED = 0xd92b3c,
  WINE = 0x7a1f2b,
  GREEN = 0x3f7a3a,
  GREEN2 = 0x7fbf6a;
export const YEL = 0xe0b400,
  YEL2 = 0xf2a900,
  BROWN = 0x8a5a24,
  BROWN2 = 0x4a2f18;
export const BLUE = 0x6ab0d9,
  NAVY = 0x2e4f8c,
  PINK = 0xe893a8,
  PURPLE = 0xb23bd9,
  CYAN = 0x2fb8c4;
export const GREY1 = 0x3c3e40,
  GREY2 = 0x4a4d50,
  GREY3 = 0x5b5f63;
export const sh = shadeOf;

export function canvas(w = SIZE, h = SIZE) {
  return { w, h, px: Array.from({ length: h }, () => Array.from({ length: w }, () => null)) };
}
export function put(cv, x, y, c) {
  if (x >= 0 && y >= 0 && x < cv.w && y < cv.h && c !== undefined) cv.px[y][x] = c;
}
export function rect(cv, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(cv, x + i, y + j, c);
}
export function hline(cv, x0, x1, y, c) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(cv, x, y, c);
}
export function vline(cv, x, y0, y1, c) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) put(cv, x, y, c);
}
export function line(cv, x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0),
    dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy,
    x = x0,
    y = y0;
  for (;;) {
    put(cv, x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
/** Filled ellipse centred at (cx, cy) with radii rx, ry (pixel centres). */
export function ellipse(cv, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / (rx + 0.5),
        ny = (y - cy) / (ry + 0.5);
      if (nx * nx + ny * ny <= 1) put(cv, x, y, c);
    }
}
export function disc(cv, cx, cy, r, c) {
  ellipse(cv, cx, cy, r, r, c);
}
/** Stamp a text grid with a key map at (ox, oy). '.' is transparent. */
export function stamp(cv, ox, oy, rows, key) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const c = key[ch];
      if (c === undefined) throw new Error(`unknown key ${ch}`);
      put(cv, ox + i, oy + j, c);
    }
  });
}
/** 1px #000000 around every painted pixel bordering emptiness (8-way). `thick` = 2px. */
export function ink(cv, thick = false) {
  const pass = () => {
    const snap = cv.px.map((r) => [...r]);
    const on = (x, y) => x >= 0 && y >= 0 && x < cv.w && y < cv.h && snap[y][x] !== null;
    for (let y = 0; y < cv.h; y++)
      for (let x = 0; x < cv.w; x++) {
        if (on(x, y)) continue;
        outer: for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (on(x + dx, y + dy)) {
              cv.px[y][x] = K;
              break outer;
            }
      }
  };
  pass();
  if (thick) pass();
  return cv;
}

// ------------------------------------------------------------- the drawings
// Almabtrieb: a cow's head with the festival flower crown and a bell.
function cow(cv, ox, oy, s, chunky) {
  const u = s / 22;
  const cx = ox + s / 2;
  // head
  ellipse(cv, cx, oy + s * 0.5, s * 0.34, s * 0.3, CREAM);
  // brown patch
  ellipse(cv, cx + s * 0.15, oy + s * 0.42, s * 0.14, s * 0.13, BROWN);
  // muzzle
  ellipse(cv, cx, oy + s * 0.68, s * 0.22, s * 0.13, PINK);
  put(cv, Math.round(cx - 2 * u), Math.round(oy + s * 0.68), sh(PINK, -2));
  put(cv, Math.round(cx + 2 * u), Math.round(oy + s * 0.68), sh(PINK, -2));
  // eyes
  const ey = Math.round(oy + s * 0.46);
  rect(
    cv,
    Math.round(cx - 5 * u),
    ey,
    Math.max(1, Math.round(2 * u)),
    Math.max(1, Math.round(2 * u)),
    X,
  );
  rect(
    cv,
    Math.round(cx + 3 * u),
    ey,
    Math.max(1, Math.round(2 * u)),
    Math.max(1, Math.round(2 * u)),
    X,
  );
  // horns
  line(
    cv,
    Math.round(cx - s * 0.3),
    Math.round(oy + s * 0.32),
    Math.round(cx - s * 0.42),
    Math.round(oy + s * 0.2),
    STEEL,
  );
  line(
    cv,
    Math.round(cx + s * 0.3),
    Math.round(oy + s * 0.32),
    Math.round(cx + s * 0.42),
    Math.round(oy + s * 0.2),
    STEEL,
  );
  // flower crown
  const fy = Math.round(oy + s * 0.22);
  const fr = chunky ? Math.max(2, Math.round(3 * u)) : Math.max(1, Math.round(2 * u));
  for (const [dx, c] of [
    [-s * 0.26, RED],
    [-s * 0.1, YEL2],
    [s * 0.08, PINK],
    [s * 0.24, BLUE],
  ]) {
    disc(cv, cx + dx, fy - (chunky ? 1 : 0), fr, c);
    put(cv, Math.round(cx + dx), Math.round(fy - (chunky ? 1 : 0)), GOLD2);
  }
  hline(cv, Math.round(cx - s * 0.3), Math.round(cx + s * 0.3), fy + fr, GREEN);
  // bell
  const by = Math.round(oy + s * 0.86);
  rect(
    cv,
    Math.round(cx - 2 * u),
    by - 1,
    Math.max(2, Math.round(4 * u)),
    Math.max(2, Math.round(3 * u)),
    GOLD,
  );
  put(cv, Math.round(cx), by + Math.round(2 * u), sh(GOLD, -2));
  hline(cv, Math.round(cx - 1), Math.round(cx + 1), by - 2, RED);
  ink(cv, chunky);
}

// A wedge of Apfelkuchen: golden crust, pale apple slices, optional raisins.
function cake(cv, ox, oy, s, chunky, rosinen) {
  const top = oy + Math.round(s * 0.25);
  const bottom = oy + Math.round(s * 0.8);
  // wedge body: triangle pointing left
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / (bottom - top);
    const x0 = ox + Math.round(s * 0.05) + Math.round((1 - Math.min(1, t * 1.6)) * s * 0.35);
    hline(cv, x0, ox + s - 1, y, y === bottom || y === bottom - 1 ? sh(AMBER, -2) : AMBER);
  }
  // top surface, lighter, with apple slices
  for (let y = top - Math.round(s * 0.12); y <= top + 1; y++)
    hline(cv, ox + Math.round(s * 0.4), ox + s - 1, y, sh(AMBER, 2));
  const slices = chunky ? 3 : 4;
  for (let i = 0; i < slices; i++) {
    const sx = ox + Math.round(s * 0.45) + Math.round((i * s * 0.5) / slices);
    const sy = top - Math.round(s * 0.1);
    ellipse(cv, sx + 1, sy, chunky ? 2 : 1.5, 1, CREAM2);
    if (chunky) put(cv, sx + 1, sy - 1, sh(GREEN2, -1));
  }
  // crust rim on the right edge
  vline(cv, ox + s - 1, top - Math.round(s * 0.12), bottom, sh(BROWN, 1));
  vline(cv, ox + s - 2, top, bottom, sh(BROWN, 1));
  if (rosinen) {
    const dots = chunky
      ? [
          [0.55, 0.45],
          [0.75, 0.6],
          [0.6, 0.7],
          [0.85, 0.4],
        ]
      : [
          [0.5, 0.5],
          [0.65, 0.6],
          [0.8, 0.45],
          [0.7, 0.72],
          [0.55, 0.68],
        ];
    for (const [fx, fy] of dots) {
      const r = chunky ? 1.6 : 1;
      disc(cv, ox + s * fx, oy + s * fy, r, 0x1c1a1f);
      if (chunky) put(cv, Math.round(ox + s * fx) - 1, Math.round(oy + s * fy) - 1, sh(PURPLE, -2));
    }
  }
  // a little cream dollop
  if (!chunky) disc(cv, ox + s * 0.62, top - Math.round(s * 0.16), 1.5, W);
  else disc(cv, ox + s * 0.62, top - Math.round(s * 0.2), 2.5, W);
  ink(cv, chunky);
}

function fork(cv, chunky) {
  // wooden handle diagonal from bottom-left to the head at top-right; three steel prongs
  const hx0 = 3,
    hy0 = 22,
    hx1 = 13,
    hy1 = 9;
  for (let t = 0; t <= 1; t += 0.02) {
    const x = Math.round(hx0 + (hx1 - hx0) * t),
      y = Math.round(hy0 + (hy1 - hy0) * t);
    put(cv, x, y, WOOD);
    put(cv, x + 1, y, sh(WOOD, 1));
    if (chunky) put(cv, x - 1, y, sh(WOOD, -1));
  }
  // ferrule
  rect(cv, 12, 8, 3, 3, chunky ? STEEL2 : G);
  // crossbar and prongs
  const px = chunky
    ? [
        [9, 6, 17, 1],
        [13, 6, 21, 1],
        [17, 6, 23, 3],
      ]
    : [
        [11, 7, 17, 2],
        [14, 7, 21, 1],
        [17, 7, 23, 3],
      ];
  hline(cv, px[0][0], px[2][0], 7, STEEL);
  for (const [x0, y0, x1, y1] of px) {
    line(cv, x0, y0, x1 - 1, y1, STEEL);
    if (chunky) line(cv, x0 + 1, y0, x1, y1, ALP);
    else put(cv, x1 - 1, y1, ALP);
  }
  ink(cv, chunky);
}

function bench(cv, ox, oy, s, chunky) {
  const th = chunky ? 4 : 3;
  const top = oy + Math.round(s * 0.35);
  rect(cv, ox, top, s, th, WOOD);
  hline(cv, ox, ox + s - 1, top, sh(WOOD, 2));
  if (chunky) hline(cv, ox + 2, ox + s - 3, top + 1, sh(WOOD, 1));
  // wood grain
  for (let x = ox + 2; x < ox + s - 2; x += 5) put(cv, x, top + th - 1, sh(WOOD, -1));
  // X legs
  const ly0 = top + th,
    ly1 = oy + Math.round(s * 0.82);
  for (const lx of [ox + Math.round(s * 0.2), ox + s - 1 - Math.round(s * 0.2)]) {
    line(cv, lx - Math.round(s * 0.08), ly0, lx + Math.round(s * 0.08), ly1, sh(WOOD, -1));
    line(cv, lx + Math.round(s * 0.08), ly0, lx - Math.round(s * 0.08), ly1, sh(WOOD, -1));
  }
  // a Maß standing on it, chunky gets a bigger one
  const mw = chunky ? 6 : 4,
    mh = chunky ? 8 : 6;
  const mx = ox + Math.round(s / 2) - Math.round(mw / 2);
  rect(cv, mx, top - mh, mw, mh, AMBER);
  rect(cv, mx, top - mh, mw, 2, W);
  put(cv, mx + mw, top - mh + 2, G);
  put(cv, mx + mw, top - mh + 3, G);
  ink(cv, chunky);
}

function coaster(cv, cx, cy, r, chunky) {
  disc(cv, cx, cy, r, CREAM);
  for (let a = 0; a < 360; a += 10)
    put(
      cv,
      Math.round(cx + Math.cos((a * Math.PI) / 180) * (r - 0.2)),
      Math.round(cy + Math.sin((a * Math.PI) / 180) * (r - 0.2)),
      sh(CREAM, -1),
    );
  // printed ring + a hop-cone / pretzel mark in the middle
  for (let a = 0; a < 360; a += 4)
    put(
      cv,
      Math.round(cx + Math.cos((a * Math.PI) / 180) * (r - 2.2)),
      Math.round(cy + Math.sin((a * Math.PI) / 180) * (r - 2.2)),
      NAVY,
    );
  if (chunky) {
    disc(cv, cx, cy, Math.max(2, r * 0.42), AMBER);
    rect(cv, Math.round(cx) - 1, Math.round(cy) - 3, 2, 2, W);
  } else {
    disc(cv, cx, cy, Math.max(1.5, r * 0.3), GREEN);
    put(cv, Math.round(cx), Math.round(cy) - 2, GREEN2);
  }
  // a beer ring stain
  if (!chunky)
    for (let a = 200; a < 330; a += 8)
      put(
        cv,
        Math.round(cx + Math.cos((a * Math.PI) / 180) * (r - 4)),
        Math.round(cy + Math.sin((a * Math.PI) / 180) * (r - 4)),
        sh(AMBER, 1),
      );
  ink(cv, chunky);
}

function mug(cv, ox, oy, w, h, chunky) {
  // glass body
  rect(cv, ox, oy + 3, w - (chunky ? 6 : 4), h - 3, AMBER);
  // vertical glass facets
  for (let x = ox + 1; x < ox + w - (chunky ? 6 : 4); x += 3)
    vline(cv, x, oy + 5, oy + h - 2, sh(AMBER, 1));
  vline(cv, ox + 1, oy + 4, oy + h - 2, sh(AMBER, 2));
  // foam
  rect(cv, ox - (chunky ? 1 : 0), oy + 1, w - (chunky ? 4 : 4), 3, W);
  disc(cv, ox + 2, oy + 1, 1.5, W);
  disc(cv, ox + w - (chunky ? 8 : 6), oy + 0.5, 1.5, W);
  disc(cv, ox + Math.round(w / 3), oy, 1.2, W);
  // handle — the oversized feature in C
  const hx = ox + w - (chunky ? 6 : 4);
  const hw = chunky ? 6 : 4;
  for (let y = oy + 5; y <= oy + h - 4; y++) {
    put(cv, hx + hw - 1, y, sh(AMBER, -1));
    if (chunky) put(cv, hx + hw - 2, y, sh(AMBER, -1));
  }
  hline(cv, hx, hx + hw - 1, oy + 5, sh(AMBER, -1));
  hline(cv, hx, hx + hw - 1, oy + h - 4, sh(AMBER, -1));
  if (chunky) {
    hline(cv, hx, hx + hw - 1, oy + 6, sh(AMBER, -1));
    hline(cv, hx, hx + hw - 1, oy + h - 5, sh(AMBER, -1));
  }
  // glint
  put(cv, ox + 2, oy + 6, W);
  if (chunky) put(cv, ox + 2, oy + 7, W);
  // base
  hline(cv, ox, hx - 1, oy + h - 1, sh(AMBER, -2));
  ink(cv, chunky);
}

function blutwurz(cv, chunky) {
  // a stubby dark schnapps bottle with a red-brown root and a yellow tormentil flower on the label
  const bx = 7,
    by = 3,
    bw = 10,
    bh = 20;
  rect(cv, bx, by + 5, bw, bh - 5, BROWN2);
  rect(cv, bx + 3, by, 4, 6, BROWN2);
  rect(cv, bx + 3, by, 4, 2, WINE);
  vline(cv, bx + 1, by + 6, by + bh - 2, sh(BROWN2, 2));
  // label
  rect(cv, bx + 1, by + 9, bw - 2, 8, CREAM);
  // root drawing on label
  line(cv, bx + 3, by + 15, bx + 5, by + 11, WINE);
  line(cv, bx + 5, by + 11, bx + 7, by + 15, WINE);
  put(cv, bx + 4, by + 12, WINE);
  // the flower
  const fx = bx + 5,
    fy = by + 10;
  if (chunky) {
    disc(cv, fx, fy - 4, 3, YEL2);
    put(cv, fx, fy - 4, sh(YEL2, -2));
    rect(cv, bx + 1, by + 9, bw - 2, 8, CREAM);
    disc(cv, fx, fy + 1, 3, YEL2);
    put(cv, fx, fy + 1, WINE);
  } else {
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ])
      put(cv, fx + dx, fy + dy, YEL2);
    put(cv, fx, fy, sh(YEL2, -2));
  }
  // red blood-drop glint (the "Blut" half)
  put(cv, bx + bw - 2, by + 7, RED);
  put(cv, bx + 2, by + 7, sh(BROWN2, 2));
  ink(cv, chunky);
}

// ---- batch 2 (the drum and the barrel replace batch 1's tuba and belly, both flagged in the round)
// Blaskapelle B: a marching bass drum, blue-white lozenge skin, two sticks.
function drum(cv) {
  disc(cv, 12, 12, 9.5, CREAM2);
  // lozenge pattern
  for (let y = 4; y <= 20; y++)
    for (let x = 3; x <= 21; x++)
      if (cv.px[y][x] === CREAM2 && ((x + y) % 4 === 0 || (x - y) % 4 === 0)) put(cv, x, y, BLUE);
  // rim
  for (let a = 0; a < 360; a += 2)
    put(
      cv,
      Math.round(12 + Math.cos((a * Math.PI) / 180) * 9.2),
      Math.round(12 + Math.sin((a * Math.PI) / 180) * 9.2),
      WOOD,
    );
  for (let a = 0; a < 360; a += 30)
    put(
      cv,
      Math.round(12 + Math.cos((a * Math.PI) / 180) * 9.2),
      Math.round(12 + Math.sin((a * Math.PI) / 180) * 9.2),
      GOLD,
    );
  // sticks crossed at the top
  line(cv, 4, 4, 12, 13, WOOD);
  line(cv, 20, 4, 12, 13, WOOD);
  disc(cv, 4, 3, 1.5, CREAM);
  disc(cv, 20, 3, 1.5, CREAM);
  ink(cv);
}

// Bierbauch B: a beer barrel with a face and arms — the belly *is* the keg.
function bellyBarrel(cv) {
  for (let y = 3; y <= 20; y++) {
    const bulge = Math.round(Math.sin(((y - 3) / 17) * Math.PI) * 2.5);
    hline(cv, 6 - bulge, 17 + bulge, y, WOOD);
  }
  for (const y of [5, 12, 18]) {
    const bulge = Math.round(Math.sin(((y - 3) / 17) * Math.PI) * 2.5);
    hline(cv, 6 - bulge, 17 + bulge, y, G);
  }
  vline(cv, 8, 6, 17, sh(WOOD, 1));
  vline(cv, 15, 6, 17, sh(WOOD, -1));
  // face: two eyes and a happy mouth
  rect(cv, 9, 8, 2, 2, W);
  rect(cv, 13, 8, 2, 2, W);
  put(cv, 10, 9, X);
  put(cv, 14, 9, X);
  hline(cv, 10, 14, 15, X);
  put(cv, 9, 14, X);
  put(cv, 15, 14, X);
  // stubby arms
  rect(cv, 2, 10, 2, 5, PINK);
  rect(cv, 20, 10, 2, 5, PINK);
  ink(cv);
}

// Böllerschmeißer: a red paper Böller with a lit fuse and spark.
function boeller(cv) {
  rect(cv, 6, 8, 10, 14, RED);
  rect(cv, 6, 8, 3, 14, sh(RED, 1));
  vline(cv, 15, 8, 21, sh(RED, -2));
  // paper bands
  hline(cv, 6, 15, 12, GOLD2);
  hline(cv, 6, 15, 17, GOLD2);
  // a black "BÖLLER"-ish label block
  rect(cv, 8, 13, 6, 3, X);
  put(cv, 9, 14, W);
  put(cv, 11, 14, W);
  put(cv, 13, 14, W);
  // fuse curling up-right, spark at the tip
  line(cv, 11, 7, 13, 5, WOOD);
  line(cv, 13, 5, 16, 4, WOOD);
  line(cv, 16, 4, 18, 5, WOOD);
  disc(cv, 19.5, 4, 2, YEL2);
  put(cv, 19, 4, W);
  put(cv, 20, 4, W);
  put(cv, 22, 2, YEL2);
  put(cv, 17, 1, YEL2);
  put(cv, 22, 6, YEL2);
  ink(cv);
}

// Braumeister-Hammer: the cask hammer, wooden mallet head, handle down-left.
function hammer(cv) {
  // handle
  for (let t = 0; t <= 1; t += 0.02) {
    const x = Math.round(3 + 11 * t),
      y = Math.round(21 - 12 * t);
    put(cv, x, y, WOOD);
    put(cv, x + 1, y, sh(WOOD, 1));
  }
  // head: a chunky wooden mallet block, angled up-right
  rect(cv, 11, 3, 11, 7, sh(WOOD, 1));
  rect(cv, 11, 3, 11, 2, sh(WOOD, 2));
  rect(cv, 11, 8, 11, 2, sh(WOOD, -1));
  // iron bands on the head
  vline(cv, 13, 3, 9, G);
  vline(cv, 19, 3, 9, G);
  // impact stars
  put(cv, 22, 1, W);
  put(cv, 22, 3, W);
  put(cv, 9, 1, W);
  ink(cv);
}

// Braumeister-Schürze: a brown leather apron on a hanger loop, foam splash on the front.
function apron(cv) {
  // neck loop
  for (let a = 200; a <= 340; a += 4)
    put(
      cv,
      Math.round(12 + Math.cos((a * Math.PI) / 180) * 4),
      Math.round(5 + Math.sin((a * Math.PI) / 180) * 3),
      G,
    );
  // bib
  rect(cv, 8, 5, 8, 6, BROWN);
  // skirt widening
  for (let y = 11; y <= 22; y++) {
    const half = 4 + Math.round((y - 11) * 0.45);
    hline(cv, 12 - half, 11 + half, y, BROWN);
  }
  // shading
  for (let y = 6; y <= 22; y++)
    put(
      cv,
      12 + Math.min(4 + Math.round((y - 11) * 0.45), 9) - 1 + (y < 11 ? -4 + 4 : 0),
      y,
      sh(BROWN, -1),
    );
  vline(cv, 9, 6, 21, sh(BROWN, 1));
  // straps
  line(cv, 8, 5, 6, 12, sh(BROWN2, 1));
  line(cv, 15, 5, 17, 12, sh(BROWN2, 1));
  // pocket
  rect(cv, 10, 14, 4, 3, sh(BROWN, -1));
  // a splash of foam on the bib
  disc(cv, 12, 8, 1.5, W);
  put(cv, 14, 7, W);
  put(cv, 10, 10, W);
  ink(cv);
}

// Braumeister-Visier B: brass shooting goggles, one lens tinted, on a strap.
function visorGoggle(cv) {
  // strap
  rect(cv, 1, 11, 22, 2, BROWN2);
  // two lenses
  for (const cx of [8, 16]) {
    disc(cv, cx, 12, 5, GOLD);
    disc(cv, cx, 12, 3.5, cx === 8 ? CYAN : sh(CYAN, -2));
  }
  // bridge
  rect(cv, 11, 11, 2, 2, GOLD);
  // crosshair on the right lens
  hline(cv, 14, 18, 12, sh(CYAN, -2));
  vline(cv, 16, 10, 14, sh(CYAN, -2));
  put(cv, 16, 12, RED);
  // glints
  put(cv, 6, 10, W);
  put(cv, 7, 9, W);
  ink(cv);
}

// Brezn: the pretzel, golden with salt.
function brezn(cv) {
  const arm = (cx, cy) => {
    for (let a = 0; a < 360; a += 2)
      for (const r of [3.5, 4.5])
        put(
          cv,
          Math.round(cx + Math.cos((a * Math.PI) / 180) * r),
          Math.round(cy + Math.sin((a * Math.PI) / 180) * r),
          AMBER,
        );
  };
  arm(8, 13);
  arm(16, 13);
  // the top loop
  for (let a = 180; a <= 360; a += 2)
    for (const r of [6.5, 7.5, 8.5])
      put(
        cv,
        Math.round(12 + Math.cos((a * Math.PI) / 180) * r),
        Math.round(12 + Math.sin((a * Math.PI) / 180) * r),
        AMBER,
      );
  // the crossing knot in the middle
  rect(cv, 10, 11, 4, 3, AMBER);
  // shading: darker on the lower edges
  for (let y = 15; y <= 18; y++)
    for (let x = 3; x <= 21; x++)
      if (cv.px[y][x] === AMBER && (cv.px[y + 1]?.[x] ?? null) === null)
        put(cv, x, y, sh(AMBER, -2));
  for (let x = 4; x <= 20; x++) if (cv.px[4][x] === AMBER) put(cv, x, 4, sh(AMBER, 2));
  // salt
  for (const [x, y] of [
    [7, 9],
    [17, 9],
    [12, 6],
    [5, 14],
    [19, 14],
    [12, 11],
  ])
    put(cv, x, y, W);
  ink(cv);
}

// Brotzeitbrett: a wooden board with radish slices, a cheese wedge and a pretzel knot.
function brett(cv) {
  // board with handle to the right
  ellipse(cv, 10, 12, 9, 6.5, sh(WOOD, 1));
  rect(cv, 18, 11, 5, 3, sh(WOOD, 1));
  put(cv, 21, 12, X);
  for (let x = 3; x <= 17; x += 4) put(cv, x, 12, sh(WOOD, -1));
  // radish slices: white with a red rim
  for (const [x, y] of [
    [6, 10],
    [8, 15],
  ]) {
    disc(cv, x, y, 2, W);
    for (let a = 0; a < 360; a += 30)
      put(
        cv,
        Math.round(x + Math.cos((a * Math.PI) / 180) * 2),
        Math.round(y + Math.sin((a * Math.PI) / 180) * 2),
        RED,
      );
  }
  // cheese wedge
  for (let y = 8; y <= 13; y++) hline(cv, 11, 11 + Math.round((y - 8) * 1.1), y, YEL);
  put(cv, 13, 11, sh(YEL, -1));
  put(cv, 15, 12, sh(YEL, -1));
  // a small pretzel knot
  disc(cv, 13, 16, 2, AMBER);
  put(cv, 13, 16, sh(WOOD, 1));
  put(cv, 12, 15, W);
  ink(cv);
}

// Colaweizen: a tall Weißbier glass, cola-dark, foam on top.
function colaweizen(cv) {
  // glass: narrow waist, wide top and base
  for (let y = 4; y <= 20; y++) {
    const half = y < 8 ? 5 : y < 16 ? 3 + Math.round((y - 8) * 0.15) : 4;
    hline(cv, 12 - half, 12 + half, y, BROWN2);
  }
  // cola gradient: darker bottom, a hint of red-brown in the light
  for (let y = 4; y <= 20; y++) {
    const half = y < 8 ? 5 : y < 16 ? 3 + Math.round((y - 8) * 0.15) : 4;
    put(cv, 12 - half + 1, y, sh(BROWN2, 2));
  }
  // foam
  rect(cv, 7, 2, 11, 3, CREAM2);
  disc(cv, 8, 2.5, 1.5, CREAM2);
  disc(cv, 16, 2.5, 1.5, CREAM2);
  hline(cv, 7, 17, 4, sh(CREAM2, -1));
  // base
  rect(cv, 8, 21, 9, 2, sh(BROWN2, -1));
  hline(cv, 7, 17, 22, X);
  put(cv, 8, 6, W);
  put(cv, 8, 7, W);
  ink(cv);
}

// Der Ordner A: the bouncer — chibi head with a flat cap, black jacket, arms crossed.
function ordner(cv) {
  // body: black jacket, shoulders wide
  rect(cv, 5, 14, 14, 8, X);
  rect(cv, 5, 14, 14, 1, sh(X, 2));
  // crossed arms as one band, fists at the ends
  rect(cv, 5, 17, 14, 3, sh(X, 2));
  rect(cv, 5, 18, 2, 2, PINK);
  rect(cv, 17, 18, 2, 2, PINK);
  // security armband
  rect(cv, 16, 15, 3, 2, RED);
  // head, fully above the collar
  ellipse(cv, 12, 8, 5, 5, PINK);
  // eyes: white 2x2 with a pupil, brow line above
  rect(cv, 9, 7, 2, 2, W);
  rect(cv, 13, 7, 2, 2, W);
  put(cv, 10, 8, X);
  put(cv, 14, 8, X);
  hline(cv, 9, 10, 6, sh(PINK, -2));
  hline(cv, 13, 14, 6, sh(PINK, -2));
  // flat mouth
  hline(cv, 11, 13, 11, sh(PINK, -2));
  // flat cap
  ellipse(cv, 12, 3.5, 6, 2, GREY1);
  hline(cv, 5, 13, 5, GREY1);
  hline(cv, 6, 18, 4, sh(GREY1, 1));
  ink(cv);
}

// Der Rosinenklauber: a hand picking a raisin out of a slice of cake.
function klauber(cv) {
  // the cake slab at the bottom
  rect(cv, 2, 15, 20, 7, AMBER);
  rect(cv, 2, 15, 20, 2, sh(AMBER, 2));
  hline(cv, 2, 21, 21, sh(AMBER, -2));
  // raisins in the cake
  for (const [x, y] of [
    [5, 18],
    [10, 19],
    [17, 18],
  ])
    disc(cv, x, y, 1, X);
  // a hole where one was picked out
  disc(cv, 13, 17, 1.2, sh(AMBER, -2));
  // the hand: thumb and finger pinching a raisin above the hole
  rect(cv, 11, 4, 7, 7, PINK);
  rect(cv, 16, 9, 3, 3, PINK);
  rect(cv, 10, 9, 3, 3, PINK);
  put(cv, 12, 12, PINK);
  put(cv, 17, 12, PINK);
  // the raisin held between finger and thumb
  disc(cv, 14.5, 12.5, 1.4, X);
  put(cv, 14, 12, sh(PURPLE, -2));
  // cuff
  rect(cv, 11, 1, 7, 3, GREEN);
  hline(cv, 11, 17, 3, sh(GREEN, -1));
  ink(cv);
}

// Feierabendbier: a bottle with the cap flicked off, sun going down behind it.
function feierabend(cv) {
  // setting sun (half disc) low behind
  ellipse(cv, 12, 16, 8, 4, YEL2);
  for (let y = 12; y <= 20; y++) hline(cv, 4, 20, y, y % 2 === 0 ? YEL2 : sh(YEL2, 1));
  // horizon line
  hline(cv, 2, 22, 17, sh(YEL2, -2));
  // bottle
  rect(cv, 9, 8, 6, 14, BROWN);
  rect(cv, 10, 3, 4, 6, BROWN);
  vline(cv, 10, 9, 20, sh(BROWN, 2));
  // label
  rect(cv, 9, 13, 6, 4, CREAM);
  rect(cv, 10, 14, 4, 2, RED);
  // cap flying off, top-right
  rect(cv, 17, 2, 3, 2, GOLD);
  put(cv, 16, 4, X);
  put(cv, 15, 5, X);
  // beer foam spurting
  put(cv, 11, 2, W);
  put(cv, 13, 1, W);
  put(cv, 12, 2, W);
  ink(cv);
}

// ---- batch 3
// Feuerwehrhelm: the red-and-black fire helmet with a brass comb, side on.
function helm(cv) {
  // dome
  ellipse(cv, 12, 10, 9, 7, RED);
  for (let y = 4; y <= 9; y++)
    hline(
      cv,
      12 - Math.round(Math.sqrt(1 - ((y - 10) / 7.5) ** 2) * 9) + 1,
      12 - Math.round(Math.sqrt(1 - ((y - 10) / 7.5) ** 2) * 9) + 2,
      y,
      sh(RED, 2),
    );
  // brass comb along the top
  for (let x = 6; x <= 18; x++) put(cv, x, 3 + Math.round(Math.abs(x - 12) * 0.35), GOLD);
  hline(cv, 9, 15, 3, GOLD);
  hline(cv, 10, 14, 2, GOLD2);
  // brim, wider at the back (right)
  rect(cv, 2, 16, 21, 3, sh(RED, -2));
  hline(cv, 2, 22, 16, X);
  rect(cv, 17, 17, 6, 3, sh(RED, -2));
  // badge
  disc(cv, 8, 11, 2, GOLD);
  put(cv, 8, 11, sh(GOLD, -2));
  // reflective band
  hline(cv, 4, 20, 14, ALP);
  ink(cv);
}

// Fingerhakeln A: two hooked index fingers pulling against each other across a leather strap.
function hakeln(cv) {
  // left hand: fist from the left, index finger hooked to the right
  rect(cv, 1, 9, 7, 7, PINK);
  rect(cv, 8, 10, 4, 2, PINK);
  rect(cv, 11, 12, 2, 3, PINK);
  // right hand: mirrored
  rect(cv, 16, 9, 7, 7, PINK);
  rect(cv, 12, 13, 4, 2, PINK);
  rect(cv, 11, 10, 2, 3, PINK);
  // the leather strap looped over both fingers
  for (let a = 0; a < 360; a += 4)
    put(
      cv,
      Math.round(12 + Math.cos((a * Math.PI) / 180) * 3.5),
      Math.round(12.5 + Math.sin((a * Math.PI) / 180) * 2.5),
      BROWN2,
    );
  // knuckle lines and cuffs
  put(cv, 3, 11, sh(PINK, -2));
  put(cv, 5, 11, sh(PINK, -2));
  put(cv, 18, 11, sh(PINK, -2));
  put(cv, 20, 11, sh(PINK, -2));
  rect(cv, 1, 16, 7, 3, RED);
  rect(cv, 16, 16, 7, 3, GREEN);
  // strain marks
  put(cv, 12, 6, X);
  put(cv, 10, 7, X);
  put(cv, 14, 7, X);
  ink(cv);
}

// Gartenzwerg-Hut A: just the red pointed hat, tipped over, a tuft of white beard under the brim.
function zwergHut(cv) {
  for (let y = 1; y <= 16; y++) {
    const half = Math.round((y - 1) * 0.55);
    hline(cv, 12 - half, 12 + half, y, RED);
  }
  for (let y = 3; y <= 15; y++) put(cv, 12 - Math.round((y - 1) * 0.55) + 1, y, sh(RED, 2));
  // brim
  rect(cv, 2, 16, 20, 3, sh(RED, -1));
  hline(cv, 2, 21, 16, sh(RED, 1));
  // white beard tuft peeking below
  ellipse(cv, 12, 20, 5, 1.5, W);
  put(cv, 12, 21, sh(CREAM, -1));
  // a tiny mushroom on the brim for the garden
  put(cv, 19, 15, RED);
  put(cv, 18, 15, RED);
  put(cv, 20, 15, RED);
  put(cv, 19, 14, W);
  ink(cv);
}

// Haferlschuh: the ankle-high Bavarian shoe, side on, with the side lacing and hobnails.
function schuh(cv) {
  // sole
  rect(cv, 2, 18, 20, 3, X);
  for (let x = 3; x <= 21; x += 3) put(cv, x, 20, G);
  // upper
  rect(cv, 3, 12, 18, 6, BROWN);
  rect(cv, 3, 8, 8, 5, BROWN);
  // toe cap rounding
  put(cv, 21, 12, null);
  put(cv, 21, 13, BROWN);
  put(cv, 20, 12, sh(BROWN, 1));
  hline(cv, 4, 20, 12, sh(BROWN, 1));
  hline(cv, 4, 10, 8, sh(BROWN, 1));
  // the side lacing (three eyelets) and the tongue
  for (const y of [9, 11, 13]) {
    put(cv, 5, y, G);
    put(cv, 9, y, G);
    line(cv, 5, y, 9, y + 1, CREAM);
  }
  // welt stitching
  for (let x = 4; x <= 20; x += 2) put(cv, x, 17, sh(BROWN, 2));
  // green sock peeking out the top
  rect(cv, 4, 6, 6, 2, GREEN);
  ink(cv);
}

// Hendlgeruch: a roast chicken on a plate, wavy smell lines rising.
function hendl(cv) {
  // plate
  ellipse(cv, 12, 18, 10, 3, CREAM2);
  ellipse(cv, 12, 18, 8, 2, CREAM);
  // bird body
  ellipse(cv, 12, 13, 7, 5, AMBER);
  ellipse(cv, 12, 12, 5, 3, sh(AMBER, 1));
  // drumsticks sticking out either side
  ellipse(cv, 5, 15, 2.5, 2, AMBER);
  ellipse(cv, 19, 15, 2.5, 2, AMBER);
  put(cv, 3, 16, W);
  put(cv, 21, 16, W);
  // crisp spots
  put(cv, 10, 13, sh(AMBER, -2));
  put(cv, 14, 14, sh(AMBER, -2));
  put(cv, 12, 11, W);
  // smell lines
  for (const x of [8, 12, 16]) {
    put(cv, x, 6, G);
    put(cv, x + 1, 5, G);
    put(cv, x, 4, G);
    put(cv, x + 1, 3, G);
    put(cv, x, 2, G);
  }
  ink(cv);
}

// Kartoffelsalat: a bowl heaped with yellow potato chunks, chives, a fork.
function salat(cv) {
  // bowl
  for (let y = 13; y <= 21; y++) {
    const half = 10 - Math.round((y - 13) * 0.6);
    hline(cv, 12 - half, 12 + half, y, BLUE);
  }
  hline(cv, 2, 22, 13, sh(BLUE, 2));
  hline(cv, 3, 21, 14, sh(BLUE, 1));
  // salad heap
  ellipse(cv, 12, 12, 9, 3.5, YEL);
  for (const [x, y] of [
    [6, 11],
    [10, 9],
    [14, 10],
    [18, 11],
    [12, 12],
    [8, 13],
  ]) {
    disc(cv, x, y, 1.6, YEL2);
    put(cv, x, y - 1, sh(YEL2, 2));
  }
  // chives
  for (const [x, y] of [
    [9, 12],
    [15, 9],
    [12, 14],
    [17, 13],
  ])
    put(cv, x, y, GREEN2);
  // fork standing in it
  vline(cv, 19, 2, 10, G);
  rect(cv, 18, 2, 3, 1, G);
  put(cv, 18, 3, G);
  put(cv, 20, 3, G);
  ink(cv);
}

// Karussell: a fairground carousel top — striped canopy, poles, two horses.
function karussell(cv) {
  // canopy
  for (let y = 2; y <= 8; y++) {
    const half = Math.round((y - 2) * 1.4) + 1;
    hline(cv, 12 - half, 12 + half, y, y % 2 === 0 ? RED : CREAM2);
  }
  for (let x = 2; x <= 22; x++)
    if (cv.px[8][x] !== null) put(cv, x, 8, (x >> 1) % 2 === 0 ? RED : CREAM2);
  put(cv, 12, 1, GOLD);
  // platform
  rect(cv, 2, 19, 20, 2, sh(WOOD, 1));
  hline(cv, 2, 21, 21, sh(WOOD, -1));
  // poles
  for (const x of [5, 12, 19]) vline(cv, x, 9, 18, GOLD);
  // two little horses
  for (const [x, c] of [
    [7, W],
    [15, sh(BROWN, 1)],
  ]) {
    rect(cv, x, 13, 5, 3, c);
    rect(cv, x + 4, 11, 2, 3, c);
    rect(cv, x, 16, 1, 3, c);
    rect(cv, x + 4, 16, 1, 3, c);
    put(cv, x + 5, 12, X);
  }
  ink(cv);
}

// Konterbier: a bottle with a cold compress on its head — the morning after, in a glass.
function konter(cv) {
  // glass
  rect(cv, 7, 8, 10, 13, AMBER);
  vline(cv, 8, 9, 20, sh(AMBER, 2));
  rect(cv, 7, 21, 10, 1, sh(AMBER, -2));
  // flat, tired foam
  rect(cv, 7, 6, 10, 3, CREAM);
  // ice pack / compress on top: pale blue bag with a knot
  ellipse(cv, 12, 4, 5, 2.5, BLUE);
  rect(cv, 11, 1, 2, 2, sh(BLUE, -2));
  put(cv, 9, 4, ALP);
  // a couple of sweat drops
  put(cv, 4, 10, BLUE);
  put(cv, 4, 11, BLUE);
  put(cv, 20, 13, BLUE);
  put(cv, 20, 14, BLUE);
  // slumped eyes on the glass
  hline(cv, 9, 10, 13, X);
  hline(cv, 13, 14, 13, X);
  ink(cv);
}

/**
 * Sixpack: the wooden carrier, seen slightly from above — six capped bottles
 * looking up out of its mouth, slat joints down the lit front. Picked in the
 * 2026-09 option round out of three shown at true scale on a cellar floor
 * beside Alois: a cardboard six-pack with a handle, this crate, and the six
 * bottles strapped together with no box. The crate won for sitting with the
 * barrels and the Fassl already in the cellar rather than beside them, and
 * because the caps looking up out of it are the one reading that says
 * *six* at 24 pixels.
 */
function sixpack(cv) {
  // Front and side, lit from the top, with a rim board along the bottom.
  // One step off the base each way, and no further: `SHADE_STEPS` is
  // -2..2 and `assertOnPalette` rejects anything off that ramp.
  rect(cv, 2, 8, 20, 13, sh(WOOD, 1));
  rect(cv, 2, 8, 20, 2, sh(WOOD, 2));
  rect(cv, 2, 19, 20, 2, sh(WOOD, -1));
  // Slat joints: left unpainted so `ink` draws them, the same trick that
  // separates the bottles below rather than a hand-placed dark line.
  vline(cv, 8, 11, 18, null);
  vline(cv, 15, 11, 18, null);
  // The open mouth, and six caps in it — three across, two deep.
  rect(cv, 2, 2, 20, 6, BROWN2);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const x = 4 + col * 6;
      const y = 3 + row * 3;
      rect(cv, x, y, 3, 2, GOLD);
      hline(cv, x, x + 2, y, sh(GOLD, 2));
    }
  }
  ink(cv);
}

// Kraftbier: a stout dark bottle with a "9%" badge and a flexing-arm silhouette.
function kraft(cv) {
  rect(cv, 8, 7, 9, 15, BROWN2);
  rect(cv, 10, 2, 5, 6, BROWN2);
  rect(cv, 10, 2, 5, 2, GOLD);
  vline(cv, 9, 8, 20, sh(BROWN2, 2));
  // label
  rect(cv, 8, 11, 9, 7, X);
  rect(cv, 9, 12, 7, 5, RED);
  // "9%"-ish mark: a bold 9 in white
  rect(cv, 10, 13, 3, 3, W);
  put(cv, 11, 14, RED);
  put(cv, 12, 15, W);
  put(cv, 12, 16, W);
  // flexing arm on the right of the label
  put(cv, 14, 13, W);
  put(cv, 15, 12, W);
  put(cv, 15, 13, W);
  put(cv, 14, 15, W);
  put(cv, 15, 15, W);
  // lightning crack for strength
  put(cv, 19, 6, YEL2);
  put(cv, 20, 7, YEL2);
  put(cv, 19, 8, YEL2);
  put(cv, 20, 9, YEL2);
  ink(cv);
}

// Lebkuchenherz: the gingerbread heart with white icing and a ribbon.
function herz(cv) {
  // heart shape from two discs and a triangle
  disc(cv, 8.5, 9, 5.5, BROWN);
  disc(cv, 15.5, 9, 5.5, BROWN);
  for (let y = 10; y <= 21; y++) {
    const half = Math.round((21 - y) * 0.85);
    if (half >= 0) hline(cv, 12 - half, 12 + half, y, BROWN);
  }
  // icing border: one pixel inside the edge
  const snap = cv.px.map((r) => [...r]);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++)
      if (snap[y][x] === BROWN) {
        const edge = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => (snap[y + dy]?.[x + dx] ?? null) === null);
        if (edge) put(cv, x, y, W);
      }
  // icing dots and a small heart in the middle
  for (const [x, y] of [
    [8, 8],
    [16, 8],
    [12, 12],
    [10, 15],
    [14, 15],
  ])
    put(cv, x, y, PINK);
  hline(cv, 9, 15, 10, W);
  hline(cv, 10, 14, 13, W);
  // ribbon at the top
  rect(cv, 10, 1, 4, 2, RED);
  put(cv, 9, 2, RED);
  put(cv, 14, 2, RED);
  put(cv, 12, 3, RED);
  ink(cv);
}

// ---- batch 4
// Lederhosn: the short leather trousers with the bib and embroidered flap, standing up on their own.
function lederhosn(cv) {
  // legs
  rect(cv, 4, 12, 7, 10, BROWN2);
  rect(cv, 13, 12, 7, 10, BROWN2);
  // seat / waist
  rect(cv, 4, 8, 16, 5, BROWN2);
  hline(cv, 4, 19, 8, sh(BROWN2, 2));
  // the bib with its embroidered flap
  rect(cv, 8, 3, 8, 6, BROWN2);
  rect(cv, 9, 4, 6, 4, sh(BROWN2, 1));
  put(cv, 11, 5, GREEN2);
  put(cv, 12, 5, GREEN2);
  put(cv, 11, 6, GREEN2);
  put(cv, 12, 6, GREEN2);
  put(cv, 10, 6, GREEN2);
  put(cv, 13, 6, GREEN2);
  // suspenders up to the top corners
  line(cv, 8, 3, 6, 1, sh(BROWN2, 1));
  line(cv, 15, 3, 17, 1, sh(BROWN2, 1));
  // leather sheen and the leg-hem stitching
  vline(cv, 5, 13, 20, sh(BROWN2, 2));
  vline(cv, 14, 13, 20, sh(BROWN2, 2));
  for (let x = 5; x <= 9; x += 2) put(cv, x, 21, GREEN2);
  for (let x = 14; x <= 18; x += 2) put(cv, x, 21, GREEN2);
  // horn buttons on the waist
  put(cv, 7, 10, CREAM);
  put(cv, 16, 10, CREAM);
  ink(cv);
}

// Ludwigs Schwan: a white swan with a gold crown, on blue water.
function schwan(cv) {
  // water
  for (let y = 18; y <= 21; y++) hline(cv, 2, 21, y, y % 2 === 0 ? BLUE : sh(BLUE, 1));
  // body
  ellipse(cv, 12, 15, 7, 3.5, W);
  ellipse(cv, 11, 14, 5, 2.5, CREAM2);
  // tail feathers up at the back-left
  put(cv, 4, 12, W);
  put(cv, 5, 13, W);
  put(cv, 3, 13, W);
  // neck curving up on the right
  for (let t = 0; t <= 1; t += 0.05) {
    const x = Math.round(16 + Math.sin(t * Math.PI * 0.9) * 2.5),
      y = Math.round(14 - t * 9);
    rect(cv, x, y, 2, 1, W);
  }
  // head and beak
  ellipse(cv, 17.5, 4.5, 2.5, 2, W);
  rect(cv, 20, 4, 3, 2, YEL2);
  put(cv, 18, 4, X);
  // crown
  rect(cv, 16, 1, 4, 2, GOLD);
  put(cv, 16, 0, null);
  put(cv, 15, 1, GOLD);
  put(cv, 20, 1, GOLD);
  put(cv, 17, 0, null);
  put(cv, 17, 1, RED);
  ink(cv);
}

// Luftballon: a red balloon on a string with a knot.
function ballon(cv) {
  ellipse(cv, 12, 8.5, 6.5, 7, RED);
  // highlight
  ellipse(cv, 9.5, 5, 1.5, 2.5, sh(RED, 2));
  put(cv, 9, 4, W);
  // knot
  rect(cv, 11, 16, 3, 2, sh(RED, -2));
  put(cv, 10, 17, sh(RED, -2));
  put(cv, 14, 17, sh(RED, -2));
  // string, wavy
  for (let y = 18; y <= 22; y++) put(cv, 12 + Math.round(Math.sin((y - 18) * 1.4) * 1.2), y, CREAM);
  ink(cv);
}

// Maß: the one-litre glass mug, full, the dimpled sides and a big handle.
function mass(cv) {
  rect(cv, 3, 5, 13, 17, AMBER);
  // dimples: a grid of lighter squares
  for (let y = 7; y <= 19; y += 3)
    for (let x = 4; x <= 13; x += 3) rect(cv, x, y, 2, 2, sh(AMBER, 1));
  vline(cv, 4, 6, 20, sh(AMBER, 2));
  // foam, generous
  rect(cv, 2, 2, 15, 4, W);
  disc(cv, 4, 2.5, 1.5, W);
  disc(cv, 10, 2.5, 1.5, W);
  disc(cv, 15, 2.5, 1.5, W);
  // handle
  rect(cv, 16, 8, 5, 10, AMBER);
  rect(cv, 17, 10, 3, 6, null);
  vline(cv, 20, 9, 16, sh(AMBER, -1));
  // base
  hline(cv, 3, 15, 21, sh(AMBER, -2));
  hline(cv, 3, 15, 22, sh(AMBER, -2));
  put(cv, 5, 8, W);
  put(cv, 5, 9, W);
  ink(cv);
}

// Neuschwanstein-Bauplan: a rolled blueprint, half unrolled, showing a tower with turrets.
function bauplan(cv) {
  // the unrolled sheet, blue
  rect(cv, 3, 4, 15, 16, NAVY);
  rect(cv, 4, 5, 13, 14, sh(NAVY, 1));
  // the roll at the right edge
  rect(cv, 17, 3, 4, 18, CREAM);
  vline(cv, 18, 4, 19, sh(CREAM, -1));
  vline(cv, 20, 4, 19, sh(CREAM, -2));
  // white drawing: a castle tower with a pointed roof and two turrets
  rect(cv, 9, 10, 4, 8, W);
  for (let y = 6; y <= 9; y++) hline(cv, 11 - (y - 6), 11 + (y - 6), y, W);
  rect(cv, 6, 13, 2, 5, W);
  put(cv, 6, 12, W);
  rect(cv, 14, 13, 2, 5, W);
  put(cv, 15, 12, W);
  // window and a scribbled dimension line
  put(cv, 10, 12, sh(NAVY, 1));
  put(cv, 11, 15, sh(NAVY, 1));
  hline(cv, 5, 15, 18, CYAN);
  put(cv, 5, 17, CYAN);
  put(cv, 15, 17, CYAN);
  ink(cv);
}

// Obazda: a bowl of orange cheese dip with paprika dust and a pretzel stick in it.
function obazda(cv) {
  // bowl (pale)
  for (let y = 12; y <= 20; y++) {
    const half = 10 - Math.round((y - 12) * 0.7);
    hline(cv, 12 - half, 12 + half, y, CREAM);
  }
  hline(cv, 3, 21, 12, sh(CREAM, -1));
  hline(cv, 2, 22, 11, CREAM2);
  // the dip heaped up
  ellipse(cv, 12, 10, 8, 3.5, YEL2);
  ellipse(cv, 11, 9, 5, 2, sh(YEL2, 1));
  // paprika dust
  for (const [x, y] of [
    [7, 10],
    [10, 8],
    [14, 9],
    [17, 11],
    [12, 11],
  ])
    put(cv, x, y, RED);
  // pretzel stick / breadstick and a chive
  line(cv, 15, 8, 20, 3, AMBER);
  line(cv, 16, 8, 21, 3, sh(AMBER, -1));
  put(cv, 21, 2, W);
  put(cv, 6, 8, GREEN2);
  put(cv, 5, 7, GREEN2);
  ink(cv);
}

// Platzangst B: a tent packed to the seams — a striped tent with arms and legs sticking out.
function platzangstTent(cv) {
  for (let y = 3; y <= 12; y++) {
    const half = Math.round((y - 3) * 1.1);
    hline(cv, 12 - half, 12 + half, y, half % 2 === 0 ? CREAM2 : BLUE);
  }
  rect(cv, 2, 12, 21, 8, CREAM2);
  for (let x = 2; x <= 22; x += 3) rect(cv, x, 12, 1, 8, BLUE);
  // heads bulging out of the windows
  for (const [x, y] of [
    [5, 15],
    [12, 16],
    [19, 15],
  ]) {
    disc(cv, x, y, 1.6, PINK);
    put(cv, x, y, X);
  }
  // limbs sticking out
  rect(cv, 1, 14, 1, 1, PINK);
  rect(cv, 22, 17, 1, 1, PINK);
  rect(cv, 8, 20, 1, 3, PINK);
  rect(cv, 15, 20, 1, 3, PINK);
  put(cv, 12, 2, RED);
  ink(cv);
}

// Radler: a glass of pale beer with a lemon slice on the rim and a bicycle bell? — keep it a glass with a lemon wheel.
function radler(cv) {
  rect(cv, 6, 6, 11, 15, sh(YEL2, 2));
  vline(cv, 7, 7, 19, W);
  // pale foam
  rect(cv, 6, 4, 11, 3, W);
  // lemon wheel on the rim, top-right
  disc(cv, 17, 6, 4, YEL2);
  disc(cv, 17, 6, 3, sh(YEL2, 2));
  for (let a = 0; a < 360; a += 45)
    put(
      cv,
      Math.round(17 + Math.cos((a * Math.PI) / 180) * 2),
      Math.round(6 + Math.sin((a * Math.PI) / 180) * 2),
      YEL2,
    );
  put(cv, 17, 6, YEL2);
  // straw? no — a tiny bicycle icon on the glass: two wheels and a bar
  disc(cv, 9, 15, 1.6, X);
  disc(cv, 13, 15, 1.6, X);
  line(cv, 9, 15, 11, 12, X);
  line(cv, 11, 12, 13, 15, X);
  put(cv, 11, 11, X);
  hline(cv, 6, 16, 21, sh(YEL2, -1));
  ink(cv);
}

// Reinheitsgebot 1516: a parchment scroll with a wax seal — the three ingredients drawn on it.
function gebot(cv) {
  rect(cv, 4, 3, 16, 18, CREAM);
  rect(cv, 5, 4, 14, 16, CREAM2);
  // rolled top and bottom edges
  rect(cv, 3, 2, 18, 3, sh(CREAM, -1));
  rect(cv, 3, 19, 18, 3, sh(CREAM, -1));
  // "1516" as a bold scrawl: four dark marks
  for (const x of [7, 10, 13, 16]) rect(cv, x, 7, 1, 3, X);
  put(cv, 11, 7, X);
  put(cv, 14, 9, X);
  put(cv, 16, 8, X);
  // water drop, barley ear, hop cone
  put(cv, 8, 13, BLUE);
  put(cv, 8, 14, BLUE);
  put(cv, 7, 14, BLUE);
  put(cv, 9, 14, BLUE);
  for (let y = 12; y <= 16; y++) put(cv, 12, y, GOLD);
  put(cv, 11, 13, GOLD);
  put(cv, 13, 13, GOLD);
  put(cv, 11, 15, GOLD);
  put(cv, 13, 15, GOLD);
  disc(cv, 16, 14, 1.5, GREEN2);
  put(cv, 16, 12, GREEN);
  // wax seal
  disc(cv, 17, 19, 2, RED);
  put(cv, 17, 19, sh(RED, -2));
  ink(cv);
}

// Riesenrad: a ferris wheel with six gondolas.
function riesenrad(cv) {
  const cx = 12,
    cy = 11,
    r = 8;
  for (let a = 0; a < 360; a += 2)
    put(
      cv,
      Math.round(cx + Math.cos((a * Math.PI) / 180) * r),
      Math.round(cy + Math.sin((a * Math.PI) / 180) * r),
      STEEL2,
    );
  // spokes
  for (let a = 0; a < 360; a += 60)
    line(
      cv,
      cx,
      cy,
      Math.round(cx + Math.cos((a * Math.PI) / 180) * r),
      Math.round(cy + Math.sin((a * Math.PI) / 180) * r),
      STEEL2,
    );
  disc(cv, cx, cy, 1.5, GOLD);
  // gondolas hanging at each spoke end
  const colours = [RED, BLUE, YEL2, GREEN2, PURPLE, CYAN];
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 * Math.PI) / 180;
    const gx = Math.round(cx + Math.cos(a) * r),
      gy = Math.round(cy + Math.sin(a) * r);
    rect(cv, gx - 1, gy + 1, 3, 2, colours[i]);
  }
  // legs
  line(cv, cx, cy + 1, 6, 22, STEEL2);
  line(cv, cx, cy + 1, 18, 22, STEEL2);
  ink(cv);
}

// ---- batch 5
// Ruhige Hand: an open, steady hand, palm up, a glass of water balanced flat on it.
function ruhigeHand(cv) {
  // palm and fingers pointing right
  rect(cv, 3, 12, 11, 7, PINK);
  for (const [y, len] of [
    [11, 8],
    [13, 9],
    [15, 9],
    [17, 8],
  ])
    rect(cv, 13, y, len, 1, PINK);
  rect(cv, 6, 9, 3, 4, PINK); // thumb
  put(cv, 5, 15, sh(PINK, -2));
  put(cv, 9, 16, sh(PINK, -2));
  // cuff
  rect(cv, 1, 12, 3, 7, GREEN);
  // glass of clear water standing on the fingers, perfectly level
  rect(cv, 13, 3, 6, 8, ALP);
  rect(cv, 14, 5, 4, 6, BLUE);
  hline(cv, 14, 17, 5, sh(BLUE, 2));
  vline(cv, 14, 6, 10, sh(BLUE, 1));
  hline(cv, 13, 18, 3, W);
  ink(cv);
}

// Sauwetter: a cloud doing sun, rain and snow at once.
function sauwetter(cv) {
  // sun peeking top-right
  disc(cv, 17, 6, 3.5, YEL2);
  for (const [dx, dy] of [
    [0, -5],
    [4, -3],
    [5, 1],
    [-4, -4],
  ])
    put(cv, 17 + dx, 6 + dy, YEL2);
  // cloud
  ellipse(cv, 10, 9, 7, 3.5, CREAM2);
  disc(cv, 7, 7, 3.5, CREAM2);
  disc(cv, 12, 6, 4, CREAM2);
  disc(cv, 15, 9, 3, G);
  for (let x = 4; x <= 17; x++) if (cv.px[12][x] === CREAM2) put(cv, x, 12, G);
  // rain on the left, snow on the right, a lightning bolt in the middle
  for (const [x, y] of [
    [5, 15],
    [6, 18],
    [4, 20],
    [7, 21],
  ]) {
    put(cv, x, y, BLUE);
    put(cv, x, y + 1, BLUE);
  }
  for (const [x, y] of [
    [15, 15],
    [17, 18],
    [14, 20],
    [19, 21],
  ]) {
    put(cv, x, y, W);
    put(cv, x - 1, y, ALP);
    put(cv, x + 1, y, ALP);
    put(cv, x, y - 1, ALP);
    put(cv, x, y + 1, ALP);
  }
  line(cv, 11, 13, 9, 16, YEL2);
  line(cv, 9, 16, 12, 16, YEL2);
  line(cv, 12, 16, 10, 20, YEL2);
  ink(cv);
}

// Schlüsselbund: a big ring with three keys hanging off it.
function schluesselbund(cv) {
  for (let a = 0; a < 360; a += 2)
    for (const r of [4.5, 5.5])
      put(
        cv,
        Math.round(12 + Math.cos((a * Math.PI) / 180) * r),
        Math.round(6 + Math.sin((a * Math.PI) / 180) * r),
        G,
      );
  const key = (x, c) => {
    disc(cv, x, 13, 2.5, c);
    put(cv, x, 13, X);
    vline(cv, x, 15, 21, c);
    put(cv, x + 1, 19, c);
    put(cv, x + 1, 21, c);
    put(cv, x + 2, 21, c);
  };
  key(6, GOLD);
  key(12, G);
  key(18, sh(GOLD, -1));
  ink(cv);
}

// Schuhplattler: a slapped thigh — a lederhosen leg with a fresh red handprint and impact stars.
function schuhplattler(cv) {
  // the thigh, in leather, seen straight on
  rect(cv, 5, 2, 14, 19, BROWN2);
  rect(cv, 5, 2, 14, 2, sh(BROWN2, 2));
  vline(cv, 6, 4, 19, sh(BROWN2, 1));
  // stocking below
  rect(cv, 6, 20, 12, 3, CREAM2);
  // the handprint: palm and five fingers, in slap-red
  rect(cv, 8, 11, 8, 6, RED);
  rect(cv, 9, 17, 6, 2, RED);
  for (const [x, h] of [
    [8, 4],
    [10, 5],
    [12, 5],
    [14, 4],
  ])
    rect(cv, x, 11 - h, 1, h, RED);
  rect(cv, 16, 12, 3, 1, RED);
  rect(cv, 17, 13, 2, 1, RED);
  // impact stars around it
  put(cv, 3, 8, W);
  put(cv, 21, 9, W);
  put(cv, 4, 18, W);
  put(cv, 21, 17, W);
  put(cv, 12, 7, YEL2);
  put(cv, 6, 14, YEL2);
  put(cv, 18, 8, YEL2);
  ink(cv);
}

// Spezi: a tall glass, half cola-brown, half orange, a straw.
function spezi(cv) {
  rect(cv, 7, 5, 10, 16, BROWN);
  rect(cv, 7, 5, 10, 8, sh(YEL2, -1));
  rect(cv, 7, 12, 10, 2, sh(BROWN, 1));
  vline(cv, 8, 6, 19, sh(YEL2, 1));
  vline(cv, 8, 14, 19, sh(BROWN, 2));
  // ice cubes
  rect(cv, 10, 7, 2, 2, ALP);
  rect(cv, 13, 9, 2, 2, ALP);
  // orange slice on the rim and a straw
  disc(cv, 17, 6, 3, YEL2);
  disc(cv, 17, 6, 2, sh(YEL2, 1));
  put(cv, 17, 6, YEL2);
  line(cv, 9, 3, 12, 1, RED);
  line(cv, 9, 4, 12, 2, RED);
  rect(cv, 8, 4, 2, 2, RED);
  hline(cv, 7, 16, 21, sh(BROWN, -2));
  ink(cv);
}

// Steckerlfisch: a fish on a stick over embers.
function fisch(cv) {
  // stick, diagonal
  line(cv, 4, 22, 20, 2, WOOD);
  line(cv, 5, 22, 21, 2, sh(WOOD, 1));
  // fish body along the stick
  ellipse(cv, 12, 12, 6, 3.5, STEEL);
  ellipse(cv, 11, 11, 4, 2, ALP);
  // tail and head details
  put(cv, 5, 10, STEEL);
  put(cv, 4, 9, STEEL);
  put(cv, 5, 14, STEEL);
  put(cv, 4, 15, STEEL);
  put(cv, 16, 11, X);
  put(cv, 18, 12, sh(STEEL, -2));
  // grill marks
  for (const x of [9, 12, 15]) put(cv, x, 13, sh(STEEL, -2));
  // embers below
  for (const [x, y] of [
    [3, 20],
    [7, 21],
    [11, 20],
    [15, 21],
    [19, 20],
  ]) {
    put(cv, x, y, RED);
    put(cv, x, y + 1, sh(RED, -2));
    put(cv, x + 1, y, YEL2);
  }
  ink(cv);
}

// Steinkrug: a grey stoneware mug with a pewter lid, blue painted band.
function steinkrug(cv) {
  rect(cv, 4, 6, 12, 15, GREY3);
  vline(cv, 5, 7, 19, sh(GREY3, 2));
  vline(cv, 14, 7, 19, sh(GREY3, -1));
  // blue band and motif
  rect(cv, 4, 11, 12, 4, NAVY);
  put(cv, 8, 12, ALP);
  put(cv, 10, 13, ALP);
  put(cv, 12, 12, ALP);
  put(cv, 10, 12, ALP);
  // pewter lid with a thumb-rest
  rect(cv, 3, 4, 14, 2, STEEL);
  rect(cv, 8, 2, 4, 2, STEEL);
  rect(cv, 16, 3, 3, 2, STEEL);
  // handle
  rect(cv, 16, 8, 4, 9, GREY3);
  rect(cv, 17, 10, 2, 5, null);
  vline(cv, 19, 9, 15, sh(GREY3, -1));
  hline(cv, 4, 15, 21, sh(GREY3, -2));
  ink(cv);
}

// Sudordnung 1493: an older, darker, stricter scroll — a chained book with a clasp.
function sudordnung(cv) {
  // book cover, dark wine leather
  rect(cv, 4, 3, 16, 18, WINE);
  rect(cv, 5, 4, 14, 16, sh(WINE, 1));
  // spine and page edges
  rect(cv, 4, 3, 2, 18, sh(WINE, -2));
  rect(cv, 19, 5, 2, 15, CREAM);
  // brass corners and clasp
  for (const [x, y] of [
    [6, 4],
    [17, 4],
    [6, 18],
    [17, 18],
  ])
    put(cv, x, y, GOLD);
  rect(cv, 18, 10, 4, 3, GOLD);
  put(cv, 19, 11, sh(GOLD, -2));
  // "1493" as four scratches
  for (const x of [8, 10, 12, 14]) rect(cv, x, 8, 1, 3, GOLD2);
  put(cv, 11, 8, GOLD2);
  put(cv, 13, 10, GOLD2);
  // a chain dangling off the clasp
  for (let y = 13; y <= 20; y += 2) put(cv, 21, y, G);
  ink(cv);
}

// Traktor-Auspuff: an upright exhaust pipe with a rain cap, puffing grey smoke.
function auspuff(cv) {
  // pipe
  rect(cv, 10, 9, 4, 13, GREY3);
  vline(cv, 10, 9, 21, sh(GREY3, 2));
  vline(cv, 13, 9, 21, sh(GREY3, -1));
  // rain-flap cap, tilted open
  rect(cv, 9, 7, 6, 2, STEEL2);
  line(cv, 9, 7, 13, 4, STEEL2);
  line(cv, 10, 7, 14, 4, STEEL2);
  // bolt flange at the base
  rect(cv, 8, 20, 8, 3, STEEL2);
  put(cv, 9, 21, G);
  put(cv, 14, 21, G);
  // smoke puffs rising to the right
  disc(cv, 15, 4, 2, G);
  disc(cv, 18, 3, 1.5, sh(G, 1));
  disc(cv, 20, 6, 1.5, sh(G, -1));
  // a green tractor sliver at the bottom-left to anchor it
  rect(cv, 2, 17, 6, 5, GREEN);
  disc(cv, 4, 20, 1.5, X);
  ink(cv);
}

// Watschn: an open hand mid-slap with a star burst and motion lines.
function watschn(cv) {
  // palm and fingers, hand coming from the left
  rect(cv, 5, 9, 9, 8, PINK);
  for (const [y, len] of [
    [8, 6],
    [10, 8],
    [12, 8],
    [14, 7],
  ])
    rect(cv, 13, y, len, 1, PINK);
  rect(cv, 7, 6, 3, 4, PINK);
  rect(cv, 2, 10, 3, 6, RED); // sleeve
  // the star burst at the fingertips
  const sx = 19,
    sy = 6;
  for (const [dx, dy] of [
    [0, -3],
    [3, 0],
    [0, 3],
    [-3, 0],
    [2, -2],
    [-2, -2],
    [2, 2],
    [-2, 2],
  ]) {
    put(cv, sx + dx, sy + dy, YEL2);
  }
  disc(cv, sx, sy, 1.5, W);
  // motion lines behind
  for (const y of [8, 11, 14]) hline(cv, 1, 3, y + 8, G);
  ink(cv);
}

// Weißwurst: a pair of white sausages on a plate, a dollop of sweet mustard, a pretzel bit.
function weisswurst(cv) {
  ellipse(cv, 12, 15, 10, 4.5, CREAM2);
  ellipse(cv, 12, 15, 8.5, 3.5, W);
  // two curved sausages
  for (let t = 0; t <= 1; t += 0.03) {
    const x = Math.round(5 + t * 13),
      y = Math.round(9 + Math.sin(t * Math.PI) * -3);
    rect(cv, x, y, 2, 3, CREAM);
  }
  for (let t = 0; t <= 1; t += 0.03) {
    const x = Math.round(6 + t * 13),
      y = Math.round(13 + Math.sin(t * Math.PI) * -2);
    rect(cv, x, y, 2, 3, sh(CREAM, 1));
  }
  for (let x = 6; x <= 18; x += 4) put(cv, x, 9, sh(CREAM, -1));
  // sweet mustard dollop
  disc(cv, 19, 16, 2, YEL2);
  put(cv, 19, 16, sh(YEL2, -1));
  // a pretzel corner
  disc(cv, 5, 17, 2, AMBER);
  put(cv, 5, 17, W);
  ink(cv);
}

// ----------------------------------------------------------------- the roster
/** id → drawing function, in the signed-off direction. */
// ------------------------------------------------- #237's rosinen batch
/**
 * The raisin itself, and the one thing every `rosinen` item has in common on
 * screen: a near-black dot with a single plum highlight. Shared rather than
 * redrawn per item on purpose — the tag is a fact about the item
 * (`docs/GAME_DESIGN.md` §8), so it should be the same fact every time, the
 * way `cake`'s own raisin variant already draws it.
 */
function raisins(cv, spots, r = 1) {
  for (const [x, y] of spots) {
    disc(cv, x, y, r, X);
    put(cv, Math.round(x), Math.round(y) - 1, sh(PURPLE, -2));
  }
}

/** Rosinenbrot: a domed loaf, three slashes across the crust, raisins showing through. */
function rosinenbrot(cv) {
  ellipse(cv, 12, 14, 9.5, 6, BROWN);
  ellipse(cv, 12, 12.5, 9, 4.5, sh(BROWN, 2));
  hline(cv, 4, 20, 19, sh(BROWN2, 1));
  for (const x of [7, 12, 17]) line(cv, x - 2, 11, x + 1, 8, sh(CREAM, -1));
  raisins(cv, [
    [8, 14],
    [13, 15],
    [17, 13],
    [11, 11],
  ]);
  ink(cv);
}

/** Zwetschgendatschi: the tray cake, plum halves in rows, raisins between them. */
function zwetschgendatschi(cv) {
  rect(cv, 2, 7, 20, 11, AMBER);
  rect(cv, 2, 7, 20, 2, sh(AMBER, 2));
  hline(cv, 2, 21, 17, sh(BROWN, 1));
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 4; col++) {
      const cx = 5 + col * 5;
      const cy = 10 + row * 4;
      ellipse(cv, cx, cy, 2, 1.6, WINE);
      put(cv, cx - 1, cy - 1, sh(WINE, 2));
    }
  raisins(cv, [
    [7.5, 12],
    [17.5, 12],
    [12.5, 15.5],
  ]);
  ink(cv);
}

/** Rosinenschnaps: a stubby bottle, cork in, raisins settled at the bottom. */
function rosinenschnaps(cv) {
  rect(cv, 8, 3, 8, 3, sh(BROWN2, 1));
  rect(cv, 9, 6, 6, 3, sh(GREEN, -2));
  rect(cv, 6, 9, 12, 12, sh(GREEN, -1));
  rect(cv, 7, 10, 3, 10, sh(GREEN, 1));
  rect(cv, 8, 13, 8, 6, sh(WINE, -1));
  rect(cv, 8, 13, 8, 1, sh(WINE, 1));
  raisins(cv, [
    [10, 18],
    [13.5, 18.5],
    [12, 16.5],
  ]);
  put(cv, 16, 11, W);
  ink(cv);
}

/**
 * Gugelhupf: the fluted ring cake, turned out of its mould — narrow at the
 * top, flaring to the base, with the mould's hole reading as a crater in the
 * top surface rather than as a see-through gap (from this camera a hole
 * punched clean through would just read as a bite taken out of it).
 */
function gugelhupf(cv) {
  for (let y = 7; y <= 19; y++) {
    const t = (y - 7) / 12;
    const half = Math.round(5 + t * 4);
    hline(cv, 12 - half, 11 + half, y, y > 17 ? sh(BROWN, -1) : BROWN);
  }
  // Flutes: alternating light/dark columns down the flank.
  for (const x of [5, 9, 13, 17]) vline(cv, x, 9, 19, sh(BROWN, 1));
  for (const x of [7, 11, 15, 19]) vline(cv, x, 10, 19, sh(BROWN, -1));
  // Top surface, and the mould's hole sunk into the middle of it.
  ellipse(cv, 11.5, 7.5, 5.5, 2.5, sh(BROWN, 2));
  ellipse(cv, 11.5, 7.5, 2, 1, sh(BROWN2, 1));
  // Icing sugar, following the rim rather than sitting on it as a bar.
  for (const [x, y] of [
    [7, 9],
    [10, 10],
    [14, 9],
    [17, 10],
    [12, 11],
  ])
    put(cv, x, y, CREAM2);
  raisins(cv, [
    [8, 14],
    [15, 13],
    [12, 17],
  ]);
  ink(cv);
}

/** Semmelknödel: two pale dumplings, the near one showing its raisins. */
function semmelknoedel(cv) {
  disc(cv, 15.5, 9, 5, sh(CREAM, -1));
  disc(cv, 14.5, 8, 3, CREAM);
  disc(cv, 9.5, 14.5, 7, CREAM);
  disc(cv, 8, 12.5, 4, CREAM2);
  raisins(cv, [
    [7, 16],
    [12, 16],
    [10, 12],
    [16, 9],
  ]);
  ink(cv);
}

/** Studentenfutter: the paper cone, nuts and raisins over the lip. */
function studentenfutter(cv) {
  for (let y = 9; y <= 21; y++) {
    const half = Math.max(0, Math.round(7 - (y - 9) * 0.55));
    hline(cv, 12 - half, 11 + half, y, y % 2 === 0 ? CREAM : CREAM2);
  }
  hline(cv, 5, 18, 9, sh(CREAM, -2));
  hline(cv, 5, 18, 8, sh(CREAM, -1));
  for (const [x, y] of [
    [7, 6],
    [11, 4],
    [16, 6],
  ]) {
    ellipse(cv, x, y, 2, 1.6, BROWN);
    put(cv, x - 1, y - 1, sh(BROWN, 2));
  }
  raisins(cv, [
    [9, 7],
    [14, 4.5],
    [18, 8],
    [12, 12],
  ]);
  ink(cv);
}

/** Kletzenbrot: a cut slice of the dark winter loaf, fruit packed edge to edge. */
function kletzenbrot(cv) {
  ellipse(cv, 12, 12.5, 9.5, 7.5, sh(BROWN2, 2));
  ellipse(cv, 12, 12.5, 8, 6, BROWN2);
  for (const [x, y] of [
    [8, 9],
    [15, 10],
    [11, 14],
    [17, 14],
    [7, 15],
  ]) {
    ellipse(cv, x, y, 1.6, 1.2, WINE);
    put(cv, x, y - 1, sh(WINE, 2));
  }
  raisins(cv, [
    [12, 10],
    [9, 12],
    [15.5, 16],
    [13.5, 13],
  ]);
  ink(cv);
}

/** Rosinenschnecke: the swirl bun from above, wound in on itself. */
function rosinenschnecke(cv) {
  disc(cv, 12, 12, 10, AMBER);
  disc(cv, 12, 12, 9, sh(AMBER, 1));
  for (let a = 0; a < 900; a += 3) {
    const rad = (a * Math.PI) / 180;
    const r = 1.5 + a / 130;
    if (r > 9) break;
    put(cv, Math.round(12 + Math.cos(rad) * r), Math.round(12 + Math.sin(rad) * r), sh(BROWN, 1));
  }
  raisins(cv, [
    [12, 8],
    [16, 13],
    [9, 15],
    [14, 17],
  ]);
  ink(cv);
}

/**
 * Apfelstrudel: the pastry log, cut at the near end so the spiral of apple
 * and raisin shows. Golden pastry rather than pale dough — at 24×24 the cut
 * end is the whole identity of the thing, so it gets the contrast.
 */
function apfelstrudel(cv) {
  // The log, lying across the canvas, rounded at the far end.
  for (let y = 8; y <= 17; y++) {
    const shade = y < 10 ? sh(AMBER, 2) : y > 15 ? sh(AMBER, -1) : AMBER;
    hline(cv, 4, 17, y, shade);
  }
  ellipse(cv, 4, 12.5, 2, 5, sh(AMBER, 1));
  // Score marks across the pastry, the way a strudel is slashed before baking.
  for (const x of [7, 10, 13]) line(cv, x, 8, x - 1, 17, sh(BROWN, 1));
  // The cut end: pastry rim, filling, and the spiral wound inside it.
  ellipse(cv, 18, 12.5, 3.5, 5.5, sh(CREAM, -1));
  ellipse(cv, 18, 12.5, 2.5, 4, sh(WINE, -1));
  ellipse(cv, 18, 12.5, 1.5, 2.5, sh(AMBER, 1));
  put(cv, 18, 12, sh(WINE, 1));
  // Icing sugar, dusted along the top.
  for (const [x, y] of [
    [6, 6],
    [9, 7],
    [12, 6],
    [15, 7],
  ])
    put(cv, x, y, CREAM2);
  raisins(cv, [
    [8, 12],
    [13, 14],
  ]);
  ink(cv);
}

/** Rumtopf: the stoneware crock, cloth tied over the lid, fruit dark inside. */
function rumtopf(cv) {
  for (let y = 8; y <= 20; y++) {
    const t = (y - 8) / 12;
    const half = Math.round(6 + Math.sin(t * Math.PI) * 2.5);
    hline(cv, 12 - half, 11 + half, y, y > 17 ? sh(STEEL2, -1) : STEEL2);
  }
  for (let y = 9; y <= 19; y++)
    put(cv, 12 - Math.round(6 + Math.sin(((y - 8) / 12) * Math.PI) * 2.5) + 1, y, sh(STEEL2, 2));
  rect(cv, 5, 5, 14, 4, CREAM);
  rect(cv, 5, 5, 14, 1, CREAM2);
  hline(cv, 4, 19, 9, sh(BROWN, -1));
  hline(cv, 4, 19, 10, sh(BROWN, -1));
  rect(cv, 8, 12, 8, 6, sh(WINE, -1));
  raisins(cv, [
    [10, 14],
    [14, 15],
    [12, 17],
  ]);
  ink(cv);
}

export const ITEM_ART = {
  almabtrieb: (cv) => cow(cv, 1.5, 2, 21, false),
  apfelkuchen: (cv) => cake(cv, 1, 4, 22, false, false),
  'apfelkuchen-mit-rosinen': (cv) => cake(cv, 1, 4, 22, false, true),
  apfelstrudel: (cv) => apfelstrudel(cv),
  'bauern-mistgabel': (cv) => fork(cv, false),
  bierbank: (cv) => bench(cv, 1, 5, 21, false),
  bierbauch: (cv) => bellyBarrel(cv),
  bierdeckel: (cv) => coaster(cv, 12, 12, 10, false),
  bierkrug: (cv) => mug(cv, 3, 2, 17, 20, false),
  blaskapelle: (cv) => drum(cv),
  blutwurz: (cv) => blutwurz(cv, false),
  boellerschmeisser: (cv) => boeller(cv),
  'braumeister-hammer': (cv) => hammer(cv),
  'braumeister-schuerze': (cv) => apron(cv),
  'braumeister-visier': (cv) => visorGoggle(cv),
  brezn: (cv) => brezn(cv),
  brotzeitbrett: (cv) => brett(cv),
  colaweizen: (cv) => colaweizen(cv),
  'der-ordner': (cv) => ordner(cv),
  'der-rosinenklauber': (cv) => klauber(cv),
  feierabendbier: (cv) => feierabend(cv),
  feuerwehrhelm: (cv) => helm(cv),
  fingerhakeln: (cv) => hakeln(cv),
  'gartenzwerg-hut': (cv) => zwergHut(cv),
  gugelhupf: (cv) => gugelhupf(cv),
  haferlschuh: (cv) => schuh(cv),
  hendlgeruch: (cv) => hendl(cv),
  kartoffelsalat: (cv) => salat(cv),
  karussell: (cv) => karussell(cv),
  kletzenbrot: (cv) => kletzenbrot(cv),
  konterbier: (cv) => konter(cv),
  kraftbier: (cv) => kraft(cv),
  lebkuchenherz: (cv) => herz(cv),
  lederhosn: (cv) => lederhosn(cv),
  'ludwigs-schwan': (cv) => schwan(cv),
  luftballon: (cv) => ballon(cv),
  mass: (cv) => mass(cv),
  'neuschwanstein-bauplan': (cv) => bauplan(cv),
  obazda: (cv) => obazda(cv),
  platzangst: (cv) => platzangstTent(cv),
  radler: (cv) => radler(cv),
  'reinheitsgebot-1516': (cv) => gebot(cv),
  riesenrad: (cv) => riesenrad(cv),
  rosinenbrot: (cv) => rosinenbrot(cv),
  rosinenschnaps: (cv) => rosinenschnaps(cv),
  rosinenschnecke: (cv) => rosinenschnecke(cv),
  'ruhige-hand': (cv) => ruhigeHand(cv),
  rumtopf: (cv) => rumtopf(cv),
  sauwetter: (cv) => sauwetter(cv),
  schluesselbund: (cv) => schluesselbund(cv),
  schuhplattler: (cv) => schuhplattler(cv),
  semmelknoedel: (cv) => semmelknoedel(cv),
  spezi: (cv) => spezi(cv),
  steckerlfisch: (cv) => fisch(cv),
  steinkrug: (cv) => steinkrug(cv),
  studentenfutter: (cv) => studentenfutter(cv),
  sixpack: (cv) => sixpack(cv),
  'sudordnung-1493': (cv) => sudordnung(cv),
  'traktor-auspuff': (cv) => auspuff(cv),
  watschn: (cv) => watschn(cv),
  weisswurst: (cv) => weisswurst(cv),
  zwetschgendatschi: (cv) => zwetschgendatschi(cv),
};

/** One finished 24×24 frame for `id`, in the `{ name, width, height, px }` shape the other authoring modules use. */
export function itemFrame(id) {
  const draw = ITEM_ART[id];
  if (draw === undefined) throw new Error(`no item art authored for "${id}"`);
  const cv = canvas();
  draw(cv);
  return { name: `item-${id}`, width: cv.w, height: cv.h, px: cv.px };
}

/** Every authored item frame, by id. */
export function itemFrames() {
  return Object.fromEntries(Object.keys(ITEM_ART).map((id) => [id, itemFrame(id)]));
}

/** Throws if any painted pixel is not legal for the common bucket. */
export function assertOnPalette(_bucket, framesIn) {
  const legal = legalPixelColorsFor('common');
  for (const f of framesIn) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const c = f.px[y][x];
        if (c !== null && !legal.has(c)) {
          throw new Error(
            `${f.name}: pixel ${String(x)},${String(y)} is #${c.toString(16).padStart(6, '0')}, not legal for common`,
          );
        }
      }
    }
  }
}

/** A single frame as PNG bytes. */
export function encodeSingle(frame) {
  const pixels = Buffer.alloc(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const c = frame.px[y][x];
      if (c === null) continue;
      const at = (y * frame.width + x) * 4;
      pixels[at] = (c >> 16) & 0xff;
      pixels[at + 1] = (c >> 8) & 0xff;
      pixels[at + 2] = c & 0xff;
      pixels[at + 3] = 0xff;
    }
  }
  return encodePng({ width: frame.width, height: frame.height, pixels });
}
