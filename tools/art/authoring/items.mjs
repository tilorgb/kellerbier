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

function belly(cv, ox, oy, s, chunky) {
  const cx = ox + s / 2;
  // torso: white shirt with red checks, big round belly
  ellipse(cv, cx, oy + s * 0.55, s * 0.42, s * 0.4, CREAM2);
  // red check pattern
  for (let y = Math.round(oy + s * 0.2); y <= oy + s * 0.9; y += 3)
    for (let x = Math.round(ox); x <= ox + s; x += 3)
      if (cv.px[y]?.[x] === CREAM2) put(cv, x, y, RED);
  // lederhosen band at the bottom
  const by = Math.round(oy + s * 0.84);
  for (let y = by; y <= oy + s * 0.98; y++)
    for (let x = ox; x <= ox + s; x++)
      if (cv.px[y]?.[x] !== null && cv.px[y]?.[x] !== undefined) put(cv, x, y, BROWN2);
  // suspenders
  vline(cv, Math.round(cx - s * 0.22), Math.round(oy + s * 0.18), by, sh(BROWN2, 1));
  vline(cv, Math.round(cx + s * 0.22), Math.round(oy + s * 0.18), by, sh(BROWN2, 1));
  // straining button, popped off in the chunky version
  const bx = Math.round(cx),
    byy = Math.round(oy + s * 0.6);
  if (chunky) {
    rect(cv, bx - 1, byy - 1, 3, 3, G);
    put(cv, bx + 4, byy - 3, W);
    put(cv, bx + 5, byy - 4, W);
    put(cv, bx - 5, byy - 3, W);
  } else put(cv, bx, byy, G);
  // the head peeking over the top: a small chin + moustache
  rect(
    cv,
    Math.round(cx - s * 0.12),
    Math.round(oy + s * 0.08),
    Math.round(s * 0.26),
    Math.round(s * 0.12),
    PINK,
  );
  hline(cv, Math.round(cx - s * 0.1), Math.round(cx + s * 0.1), Math.round(oy + s * 0.11), BROWN2);
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

function tuba(cv, chunky) {
  // bell (big flare) top-left, tubing coil, mouthpiece
  const bell = chunky ? 8 : 6;
  disc(cv, 9, 8, bell, GOLD);
  disc(cv, 9, 8, bell - 2, sh(GOLD, -1));
  disc(cv, 9, 8, Math.max(1, bell - 4), sh(GOLD, -2));
  // coil
  for (let a = 0; a < 360; a += 3) {
    put(
      cv,
      Math.round(15 + Math.cos((a * Math.PI) / 180) * 5),
      Math.round(15 + Math.sin((a * Math.PI) / 180) * 5),
      GOLD,
    );
    put(
      cv,
      Math.round(15 + Math.cos((a * Math.PI) / 180) * 4),
      Math.round(15 + Math.sin((a * Math.PI) / 180) * 4),
      GOLD,
    );
  }
  for (let a = 0; a < 360; a += 3)
    put(
      cv,
      Math.round(15 + Math.cos((a * Math.PI) / 180) * 5),
      Math.round(15 + Math.sin((a * Math.PI) / 180) * 5),
      a > 180 && a < 300 ? GOLD2 : GOLD,
    );
  // valves
  for (const x of [13, 15, 17]) {
    vline(cv, x, 9, 11, sh(GOLD, -1));
    put(cv, x, 8, W);
  }
  // mouthpiece
  line(cv, 19, 19, 21, 21, sh(GOLD, -1));
  put(cv, 21, 21, G);
  put(cv, 22, 22, G);
  // glint on bell
  put(cv, 6, 5, W);
  put(cv, 7, 5, W);
  if (chunky) put(cv, 6, 6, W);
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

// ----------------------------------------------------------------- the roster
/** id → drawing function, in the signed-off direction. */
export const ITEM_ART = {
  almabtrieb: (cv) => cow(cv, 1.5, 2, 21, false),
  apfelkuchen: (cv) => cake(cv, 1, 4, 22, false, false),
  'apfelkuchen-mit-rosinen': (cv) => cake(cv, 1, 4, 22, false, true),
  'bauern-mistgabel': (cv) => fork(cv, false),
  bierbank: (cv) => bench(cv, 1, 5, 21, false),
  bierbauch: (cv) => belly(cv, 2, 3, 20, false),
  bierdeckel: (cv) => coaster(cv, 12, 12, 10, false),
  bierkrug: (cv) => mug(cv, 3, 2, 17, 20, false),
  blaskapelle: (cv) => tuba(cv, false),
  blutwurz: (cv) => blutwurz(cv, false),
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
