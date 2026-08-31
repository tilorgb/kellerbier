import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * Die Große Kellerassel, Der Stier and the Maibaum-Dieb, as blocks and frame
 * lists — the same argument `tools/art/authoring/alois.mjs` and `docs/
 * DECISIONS.md` #55/#43 make, applied to the two sprites that turned out to
 * have the same problem: a boss strip is seven frames holding three or four
 * distinct drawings (two idles, a walk contact, a telegraph, a flinch, three
 * death beats) of one big body re-posed, and hand-editing seven copies of a
 * head is how a walk cycle ends up one pixel off on frame 3.
 *
 * `docs/DECISIONS.md` #55 said "Alois alone is composed"; #56's amendment is
 * that the two chibi bosses join him, for his reasons, and the Kellerassel-in-
 * the-editor line it drew now means the *floor* Kellerassel, not this one.
 *
 * The art direction is full chibi (#193, chosen from an option round): the
 * boss is as cute as the roster and the threat is scale, motion and the
 * telegraph pose. A slightly angled dark brow is the one concession — cute,
 * but it wants to hurt you.
 *
 * Everything is authored **facing left** (`render/animation/state.ts`'s
 * `AUTHORED_FACING`); the engine mirrors it when the body moves right.
 */

// ----------------------------------------------------------------- palettes
const CELLAR = {
  K: 0x000000, // outline ink
  x: 0x1c1a1f, // deep shadow
  d: 0x36291e, // chitin, darkest
  m: 0x54402e, // chitin, mid
  l: 0x72573e, // chitin, lit
  L: 0x8f6d4e, // chitin, highlight
  a: 0xc38327, // amber rim
  A: 0xe1ae65, // amber rim, bright
  g: 0x4a4d50, // underside / legs
  G: 0x71767b, // underside, lit
  W: 0xffffff, // eye white + glint
};
const RURAL = {
  K: 0x000000,
  c: 0x1c1a1f, // coat, darkest
  C: 0x332f38, // coat, mid
  H: 0x494451, // coat, lit
  g: 0x737373, // grey (rope, hoof shadow)
  G: 0x8a8a8a, // grey, lit
  W: 0xffffff, // horn + eye white
  r: 0xe8e2d0, // cream (muzzle, horn core, shirt)
  R: 0xd9cfb1, // cream shadow
  b: 0x2e4f8c, // Bavarian blue
  B: 0x3962af, // blue, lit
  n: 0x3f7a3a, // wreath green
  N: 0x64b25e, // wreath green, lit
};

for (const [where, palette, bucket] of [
  ['CELLAR', CELLAR, 'floor-1-cellar'],
  ['RURAL', RURAL, 'floor-2-rural'],
]) {
  const legal = legalPixelColorsFor(bucket);
  for (const [key, colour] of Object.entries(palette)) {
    if (!legal.has(colour)) {
      throw new Error(
        `boss authoring key ${where}.${key} is #${colour.toString(16).padStart(6, '0')}, ` +
          `not legal for ${bucket} — see tools/art/palette.mjs`,
      );
    }
  }
}

// ------------------------------------------------------------- raster canvas
/** A mutable H×W canvas of hex-or-null. */
function canvas(w, h) {
  return { w, h, px: Array.from({ length: h }, () => Array.from({ length: w }, () => null)) };
}
function set(cv, x, y, colour) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  cv.px[y][x] = colour;
}
function fillEllipse(cv, cx, cy, rx, ry, colour) {
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++)
    for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++)
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) set(cv, cx + x, cy + y, colour);
}
function fillRect(cv, x0, y0, w, h, colour) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(cv, x, y, colour);
}
function stroke(cv, x0, y0, x1, y1, colour, wd = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0),
    dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx - dy,
    x = x0,
    y = y0;
  for (;;) {
    for (let oy = 0; oy < wd; oy++) for (let ox = 0; ox < wd; ox++) set(cv, x + ox, y + oy, colour);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
/** 1px ink around every painted pixel that borders emptiness. */
function inkOutline(cv, ink) {
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

/** Throws if any painted pixel is not legal for `bucket` (`tools/art/palette.mjs`). */
export function assertOnPalette(bucket, frames) {
  const legal = legalPixelColorsFor(bucket);
  for (const frame of frames)
    for (let y = 0; y < frame.height; y++)
      for (let x = 0; x < frame.width; x++) {
        const c = frame.px[y][x];
        if (c !== null && !legal.has(c))
          throw new Error(
            `${frame.name}: pixel ${x},${y} is #${c.toString(16).padStart(6, '0')}, ` +
              `not legal for ${bucket}`,
          );
      }
}

function finish(name, cv) {
  return { name, width: cv.w, height: cv.h, px: cv.px };
}

/** Frames → horizontal strip PNG bytes, in `assets/sprites/README.md`'s layout. */
export function encodeStrip(name, frames) {
  const first = frames[0];
  if (!first) throw new Error(`${name}: no frames`);
  for (const f of frames)
    if (f.width !== first.width || f.height !== first.height)
      throw new Error(
        `${name}: frame ${f.name} is ${f.width}x${f.height}, expected ${first.width}x${first.height}`,
      );
  const width = first.width * frames.length;
  const pixels = Buffer.alloc(width * first.height * 4);
  frames.forEach((frame, i) => {
    for (let y = 0; y < frame.height; y++)
      for (let x = 0; x < frame.width; x++) {
        const c = frame.px[y][x];
        if (c === null) continue;
        const at = (y * width + i * frame.width + x) * 4;
        pixels[at] = (c >> 16) & 0xff;
        pixels[at + 1] = (c >> 8) & 0xff;
        pixels[at + 2] = c & 0xff;
        pixels[at + 3] = 0xff;
      }
  });
  return encodePng({ width, height: first.height, pixels });
}
export function encodeSingle(frame) {
  return encodeStrip(frame.name, [frame]);
}

// ============================================================ KELLERASSEL
// Canvas 140x86, head/front to the left. Every frame plants its ground
// contact on `KGROUND` so the bottom-anchored sprite (#193) sits on its
// shadow rather than floating above it.
const KW = 140,
  KH = 86,
  KGROUND = 84;

function kellerasselFace(
  cv,
  P,
  hx,
  hy,
  { brow = 0, blink = false, shut = false, open = false, strain = false },
) {
  // two big round eyes on the head shield
  for (const s of [0, 1]) {
    const ex = hx + (s ? 18 : 0);
    const ey = hy + 1;
    if (shut) {
      stroke(cv, ex - 6, ey - 2, ex, ey + 3, P.K, 3);
      stroke(cv, ex, ey + 3, ex + 6, ey - 2, P.K, 3);
      continue;
    }
    if (strain) {
      // eyes screwed half-shut and pushed down under the clench
      fillEllipse(cv, ex, ey + 2, 7, 4, P.W);
      fillEllipse(cv, ex + (s ? -1 : 1), ey + 3, 4, 3, P.K);
      // tension ticks fanning off the outer corner
      const o = s ? 1 : -1;
      stroke(cv, ex + o * 8, ey - 3, ex + o * 12, ey - 6, P.d, 1);
      stroke(cv, ex + o * 8, ey + 1, ex + o * 13, ey + 1, P.d, 1);
      stroke(cv, ex + o * 7, ey + 5, ex + o * 11, ey + 8, P.d, 1);
    } else {
      fillEllipse(cv, ex, ey, 7, 8, P.W);
      if (blink) {
        stroke(cv, ex - 7, ey, ex + 7, ey, P.K, 3);
      } else {
        fillEllipse(cv, ex + (s ? -1 : 1), ey + 1, 4, 5, P.K);
        set(cv, ex - 3, ey - 3, P.W);
        set(cv, ex - 2, ey - 3, P.W);
        set(cv, ex - 3, ey - 2, P.W);
      }
    }
    // brow: a chunky dark wedge, angled mean when brow>0; a heavier clench on strain
    const bw = strain ? 4 : 3;
    stroke(cv, ex - 7, ey - 9 + (s ? brow : -brow), ex + 7, ey - 9 + (s ? -brow : brow), P.d, bw);
  }
  // a knot of dark between the brows when it clenches
  if (strain) fillEllipse(cv, hx + 9, hy - 8, 3, 4, P.d);
  // mouth
  const mx = hx + 9;
  if (open) {
    fillEllipse(cv, mx, hy + 13, strain ? 8 : 7, strain ? 7 : 6, P.x);
    fillEllipse(cv, mx, hy + 15, 4, 3, P.d);
    if (strain) {
      // gritted rim
      for (let x = -7; x <= 7; x += 2) set(cv, mx + x, hy + 9, P.L);
    }
  } else {
    stroke(cv, mx - 5, hy + 11, mx, hy + 13, P.d, 2);
    stroke(cv, mx, hy + 13, mx + 5, hy + 11, P.d, 2);
  }
  // stubby antennae off the top of the head
  for (const s of [0, 1]) {
    const ax = hx + (s ? 15 : 3);
    stroke(cv, ax, hy - 12, ax - 5 + s * 10, hy - 21, P.d, 2);
    fillEllipse(cv, ax - 5 + s * 10, hy - 22, 3, 3, P.A);
  }
}

function kellerasselLegs(cv, P, pose) {
  // six legs reaching from under the body down to the ground line; the
  // screen-left three lift a little on one pose, the right three on the other
  const feet = [26, 46, 66, 86, 104, 120];
  feet.forEach((fx, i) => {
    const lift = pose === 1 ? (i % 2 === 0 ? 4 : 0) : pose === 2 ? (i % 2 === 0 ? 0 : 4) : 0;
    stroke(cv, fx, 72, fx - 4, KGROUND - lift, P.x, 4);
  });
}

function kellerasselBody(cv, P, { bob = 0, rear = 0 }) {
  // `rear` lifts the front of the shell without changing its size — the
  // wind-up pose, and it keeps the silhouette inside the canvas.
  const cy = 58 - bob;
  const ry = 22;
  fillEllipse(cv, 74, cy, 54, ry, P.m);
  if (rear > 0) fillEllipse(cv, 74 - 18, cy - rear, 34, ry, P.m); // raised front
  // top-lit rim
  for (let x = -54; x <= 54; x++) {
    const yy = -ry * Math.sqrt(Math.max(0, 1 - (x * x) / (54 * 54)));
    const lift = rear > 0 && x < 0 ? -rear * (1 - Math.abs(x) / 54) : 0;
    set(cv, 74 + x, cy + yy + 1 + lift, P.A);
    set(cv, 74 + x, cy + yy + 2 + lift, P.a);
    set(cv, 74 + x, cy + yy + 3 + lift, P.l);
  }
  // seven tergite seams, bowing toward the back (right)
  for (let sIdx = 1; sIdx < 7; sIdx++) {
    const segx = 74 + (sIdx / 7 - 0.5) * 2 * 50;
    const lift = rear > 0 && segx < 74 ? -rear * (1 - (segx - 24) / 50) : 0;
    for (let y = -ry; y <= ry; y++) {
      const w = Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)));
      if (w <= 0.05) continue;
      set(cv, segx + (1 - w) * 3, cy + y + lift, P.d);
      if (y % 3 === 0) set(cv, segx + (1 - w) * 3 + 1, cy + y + lift, P.L);
    }
  }
  // curled tail plate at the back
  fillEllipse(cv, 126, cy + 2, 9, 12, P.l);
  fillEllipse(cv, 128, cy + 2, 5, 7, P.m);
  return cy;
}

function kellerasselHead(cv, P, { bob = 0, tuck = 0, face }) {
  const hx = 16 + tuck;
  const hy = 58 - bob;
  // dark collar where the head shield meets the first tergite
  fillEllipse(cv, hx + 20, hy + 2, 10, 22, P.d);
  fillEllipse(cv, hx + 9, hy + 1, 24, 21, P.l);
  fillEllipse(cv, hx + 8, hy - 3, 23, 17, P.L);
  fillEllipse(cv, hx + 9, hy + 9, 17, 11, P.m);
  kellerasselFace(cv, P, hx, hy, face);
}

function kellerasselFrame(name, opts) {
  const cv = canvas(KW, KH);
  if (opts.curl) {
    // fully curled pillbug ball, resting on the ground line
    const cyb = KGROUND - 26;
    fillEllipse(cv, 70, cyb, 26, 26, CELLAR.m);
    for (let r = 24; r > 5; r -= 6)
      for (let a = 0; a < 90; a++) {
        const t = (a / 90) * Math.PI * 2;
        set(cv, 70 + Math.cos(t) * r, cyb + Math.sin(t) * r, CELLAR.d);
      }
    // top-lit crest + the plate seams reading as a spiral
    for (let x = -26; x <= 26; x++) {
      const yy = -26 * Math.sqrt(Math.max(0, 1 - (x * x) / (26 * 26)));
      set(cv, 70 + x, cyb + yy + 1, CELLAR.A);
    }
    // tucked legs peeking under the rim
    for (const s of [-1, 1])
      stroke(cv, 70 + s * 20, KGROUND - 4, 70 + s * 26, KGROUND, CELLAR.x, 2);
    inkOutline(cv, CELLAR.K);
    return finish(name, cv);
  }
  if (opts.roll) {
    // death-1: tipped onto its back, legs waving, half curled
    const bcy = KGROUND - 20;
    fillEllipse(cv, 74, bcy, 46, 20, CELLAR.m);
    for (let sIdx = 1; sIdx < 6; sIdx++) {
      const segx = 74 + (sIdx / 6 - 0.5) * 2 * 40;
      stroke(cv, segx, bcy - 18, segx + 3, bcy + 16, CELLAR.d, 1);
    }
    for (const fx of [40, 58, 76, 94, 108])
      stroke(cv, fx, bcy - 16, fx + (fx < 74 ? -6 : 6), bcy - 30, CELLAR.x, 3);
    // dazed eyes
    stroke(cv, 24, bcy - 6, 32, bcy + 2, CELLAR.d, 2);
    stroke(cv, 24, bcy + 2, 32, bcy - 6, CELLAR.d, 2);
    inkOutline(cv, CELLAR.K);
    return finish(name, cv);
  }
  kellerasselLegs(cv, CELLAR, opts.pose ?? 0);
  kellerasselBody(cv, CELLAR, { bob: opts.bob ?? 0, rear: opts.rear ?? 0 });
  kellerasselHead(cv, CELLAR, {
    bob: (opts.bob ?? 0) + (opts.rear ?? 0),
    tuck: opts.tuck ?? 0,
    face: opts.face ?? {},
  });
  inkOutline(cv, CELLAR.K);
  return finish(name, cv);
}

export const KELLERASSEL_FRAMES = [
  kellerasselFrame('kellerassel-idle', { face: { brow: 2 } }),
  kellerasselFrame('kellerassel-idle-b', { bob: 1, pose: 1, face: { brow: 2, blink: true } }),
  kellerasselFrame('kellerassel-walk', { bob: 1, pose: 2, face: { brow: 1 } }),
  kellerasselFrame('kellerassel-telegraph', {
    rear: 9,
    tuck: 12,
    pose: 1,
    face: { brow: 5, open: true, strain: true },
  }),
  kellerasselFrame('kellerassel-hurt', { bob: 1, face: { brow: 4, shut: true } }),
  kellerasselFrame('kellerassel-death-1', { roll: true }),
  kellerasselFrame('kellerassel-death-2', { curl: true }),
];

// ================================================================ STIER
// Feet always plant on `SGROUND` regardless of `bob`, so the bottom-anchored
// sprite (#193) sits on its shadow; `bob` bends the legs and raises the body.
const SW = 132,
  SH = 120,
  SGROUND = 118;

function stierHorns(cv, P, hx, hy, forward = 0) {
  for (const s of [-1, 1]) {
    let x = hx + s * 22,
      y = hy;
    const steps = 26;
    for (let t = 0; t <= steps; t++) {
      const f = t / steps;
      const wd = Math.max(1.5, 7 * (1 - f * 0.85));
      // out, then curve up (and forward on a telegraph)
      x += s * (1.3 - f * 0.6) + s * forward * 0.16;
      y += f < 0.4 ? 0.5 : -(1.1 - forward * 0.12);
      fillEllipse(cv, x, y, wd, wd, f > 0.5 ? P.R : P.r);
      if (f < 0.35) fillEllipse(cv, x + s, y + wd - 1, wd * 0.55, 1.5, P.G);
      if (f > 0.85) fillEllipse(cv, x, y, wd * 0.7, wd * 0.7, P.G); // dark tip
    }
  }
}

function stierHead(cv, P, { hy, lower = 0, expr = 'idle' }) {
  const hx = 58;
  const cy = hy + lower;
  // neck: a short mass tying the head to the body below it
  fillRect(cv, hx - 14, cy + 8, 28, 22, P.C);
  // ears
  fillEllipse(cv, hx - 30, cy - 4, 8, 6, P.C);
  fillEllipse(cv, hx + 30, cy - 4, 8, 6, P.C);
  // head mass
  fillEllipse(cv, hx, cy, 34, 30, P.C);
  fillEllipse(cv, hx - 3, cy - 5, 30, 23, P.H);
  // forelock
  for (const o of [-7, 0, 7]) fillEllipse(cv, hx + o, cy - 22 + lower * 0.3, 3, 4, P.c);
  stierHorns(cv, P, hx, cy - 20, expr === 'telegraph' ? 3 : 0);
  // muzzle — broad and low, wider than tall, with a dark nose band (bovine, not a snout)
  fillRect(cv, hx - 16, cy + 10, 32, 16, P.r);
  fillEllipse(cv, hx - 16, cy + 18, 4, 8, P.r);
  fillEllipse(cv, hx + 16, cy + 18, 4, 8, P.r);
  fillRect(cv, hx - 16, cy + 20, 32, 6, P.R);
  fillRect(cv, hx - 15, cy + 9, 30, 4, P.C); // nose band
  // nostrils: short horizontal slits, low and wide-set
  stroke(cv, hx - 12, cy + 17, hx - 6, cy + 17, P.K, 2);
  stroke(cv, hx + 6, cy + 17, hx + 12, cy + 17, P.K, 2);
  if (expr === 'telegraph') {
    for (const s of [-1, 1]) {
      fillEllipse(cv, hx + s * 20, cy + 14, 3, 2, P.G);
      fillEllipse(cv, hx + s * 26, cy + 9, 3, 2, P.G);
      fillEllipse(cv, hx + s * 30, cy + 3, 2, 2, P.G);
    }
  }
  // eyes
  for (const s of [-1, 1]) {
    const ex = hx + s * 15,
      ey = cy - 2;
    if (expr === 'hurt' || expr === 'dead') {
      stroke(cv, ex - 6, ey - 5, ex + 6, ey + 5, P.K, 2);
      stroke(cv, ex - 6, ey + 5, ex + 6, ey - 5, P.K, 2);
      continue;
    }
    const narrow = expr === 'telegraph';
    fillEllipse(cv, ex, ey, 8, narrow ? 4 : 9, P.W);
    fillEllipse(cv, ex, ey + (narrow ? 0 : 2), 5, narrow ? 3 : 6, P.K);
    set(cv, ex - 3, ey - 3, P.W);
    set(cv, ex - 2, ey - 3, P.W);
    set(cv, ex - 3, ey - 2, P.W);
    // cross little brow, heavier on a telegraph
    const b = narrow ? 4 : 2;
    stroke(
      cv,
      ex - 8,
      ey - 10 + (s < 0 ? b : -b),
      ex + 8,
      ey - 10 + (s < 0 ? -b : b),
      P.c,
      narrow ? 3 : 2,
    );
  }
}

function stierBody(cv, P, { by, legPose = 0, telegraph = false }) {
  // stubby legs, spaced so the gaps between them read. Tops follow the body
  // (which `bob` raises), hooves stay planted on the ground line — so a raised
  // body reads as the bull rising onto its legs, not hovering.
  const front = telegraph ? [26, 46] : [24, 46];
  const back = [78, 100];
  const legs = [
    [front[0], legPose === 1 ? 3 : 0],
    [front[1], 0],
    [back[0], 0],
    [back[1], legPose === 2 ? 3 : 0],
  ];
  for (const [lx, lift] of legs) {
    const top = by + 6 + lift;
    fillRect(cv, lx - 5, top, 10, SGROUND - top, P.C);
    fillRect(cv, lx - 5, top, 3, SGROUND - top, P.c); // inner shade separates the pair
    fillRect(cv, lx - 5, SGROUND - 2, 10, 2, P.r); // hoof
  }
  // barrel body
  fillEllipse(cv, 62, by - 4, 33, 18, P.C);
  fillEllipse(cv, 58, by - 9, 26, 12, P.H);
  // little tail
  stroke(cv, 92, by - 10, 100, by + 6, P.c, 2);
  fillEllipse(cv, 100, by + 7, 3, 4, P.c);
  // flower-wreath collar across the chest
  for (let i = 0; i < 9; i++) {
    const ax = 34 + i * 6,
      ay = by - 16 + Math.sin(i) * 2;
    fillEllipse(cv, ax, ay, 3, 3, i % 2 ? P.N : P.r);
    set(cv, ax, ay, i % 2 ? P.n : P.R);
  }
}

function stierFrame(name, { headY = 44, lower = 0, expr = 'idle', bob = 0, legPose = 0 }) {
  const cv = canvas(SW, SH);
  if (expr === 'dead') {
    // collapsed on its side, lying on the ground line
    fillEllipse(cv, 66, SGROUND - 18, 44, 18, RURAL.C);
    fillEllipse(cv, 60, SGROUND - 24, 34, 11, RURAL.H);
    for (const lx of [40, 54, 82, 96])
      stroke(cv, lx, SGROUND - 26, lx + (lx < 66 ? -14 : 14), SGROUND - 40, RURAL.C, 6);
    // head down left
    fillEllipse(cv, 24, SGROUND - 14, 20, 15, RURAL.C);
    stierHorns(cv, RURAL, 24, SGROUND - 26, 0);
    fillEllipse(cv, 16, SGROUND - 8, 9, 6, RURAL.R);
    stroke(cv, 12, SGROUND - 18, 22, SGROUND - 10, RURAL.K, 2);
    stroke(cv, 12, SGROUND - 10, 22, SGROUND - 18, RURAL.K, 2);
    inkOutline(cv, RURAL.K);
    return finish(name, cv);
  }
  const by = 100 - bob;
  stierBody(cv, RURAL, { by, legPose, telegraph: expr === 'telegraph' });
  stierHead(cv, RURAL, { hy: headY - bob, lower, expr });
  inkOutline(cv, RURAL.K);
  return finish(name, cv);
}

export const STIER_FRAMES = [
  stierFrame('stier-idle', { expr: 'idle' }),
  stierFrame('stier-walk', { expr: 'idle', bob: 2, legPose: 1 }),
  stierFrame('stier-idle-b', { expr: 'idle', bob: 1, legPose: 2, lower: 1 }),
  stierFrame('stier-telegraph', { expr: 'telegraph', lower: 14, legPose: 1 }),
  stierFrame('stier-hurt', { expr: 'hurt', lower: -5, bob: 3 }),
  stierFrame('stier-death-1', { expr: 'hurt', lower: 16, bob: -3, legPose: 1 }),
  stierFrame('stier-death-2', { expr: 'dead' }),
];

// ==================================================== MAIBAUM-DIEB (static)
// Phase two: Der Stier in a low charging crouch — head thrust forward and down
// at the left, back arched up behind — with the Maibaum-Dieb high on the hump
// and the stolen maypole raised the full height of the canvas. A bespoke pose
// rather than the standing parts, so the head does not swallow the body.
const MW = 132,
  MH = 156;

export function maibaumDiebFrame() {
  const P = RURAL;
  const cv = canvas(MW, MH);
  const ground = MH - 2; // hooves on the bottom edge — bottom-anchored (#193)

  // --- stolen Maibaum, first so the rider overlaps it ---
  const poleX = 86;
  for (let y = 10; y < 112; y++) {
    const phase = Math.floor((y / 5) % 2);
    fillRect(cv, poleX - 3, y, 7, 1, phase ? P.b : P.r);
    set(cv, poleX - 4, y, P.K);
    set(cv, poleX + 3, y, P.K);
  }
  fillRect(cv, poleX - 16, 24, 32, 3, P.R);
  fillEllipse(cv, poleX - 14, 32, 3, 5, P.r);
  fillEllipse(cv, poleX + 14, 32, 3, 5, P.r);
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    set(cv, poleX + Math.cos(t) * 18, 44 + Math.sin(t) * 10, a % 3 ? P.n : P.N);
    set(cv, poleX + Math.cos(t) * 15, 44 + Math.sin(t) * 7, a % 4 ? P.n : P.r);
  }
  stroke(cv, poleX, 28, poleX - 22, 72, P.b, 2);
  stroke(cv, poleX, 28, poleX + 18, 62, P.r, 2);
  stroke(cv, poleX, 28, poleX - 10, 90, P.R, 1);
  stroke(cv, poleX, 8, poleX, 18, P.R, 2);
  fillEllipse(cv, poleX, 8, 3, 3, P.n);

  // --- Der Stier, charging crouch ---
  // back legs planted, front legs braced low
  for (const [lx, ly, h] of [
    [38, ground - 24, 24],
    [58, ground - 22, 22],
    [96, ground - 30, 30],
    [112, ground - 28, 28],
  ]) {
    fillRect(cv, lx - 5, ly, 10, h, P.C);
    fillRect(cv, lx - 5, ly, 3, h, P.c);
    fillRect(cv, lx - 5, ly + h - 2, 10, 2, P.r);
  }
  // arched body rising to a hump behind the shoulders
  fillEllipse(cv, 74, ground - 44, 42, 26, P.C);
  fillEllipse(cv, 80, ground - 54, 26, 18, P.c); // hump
  fillEllipse(cv, 68, ground - 50, 30, 16, P.H); // top light
  stroke(cv, 112, ground - 54, 122, ground - 30, P.c, 2); // tail
  // thick neck sweeping down-left to the lowered head
  fillEllipse(cv, 48, ground - 40, 20, 20, P.C);
  // lowered head, horns leading
  const hx = 30,
    hy = ground - 34;
  fillEllipse(cv, hx, hy, 22, 19, P.C);
  fillEllipse(cv, hx - 2, hy - 3, 18, 13, P.H);
  fillRect(cv, hx - 13, hy + 6, 22, 12, P.r); // broad muzzle
  fillRect(cv, hx - 12, hy + 5, 20, 3, P.c);
  stroke(cv, hx - 9, hy + 11, hx - 4, hy + 11, P.K, 2);
  stroke(cv, hx + 3, hy + 11, hx + 8, hy + 11, P.K, 2);
  // forward-swept horns
  for (const dy2 of [0]) void dy2;
  stroke(cv, hx + 6, hy - 12, hx - 20, hy - 8, P.r, 4);
  stroke(cv, hx - 20, hy - 8, hx - 30, hy + 2, P.R, 3);
  stroke(cv, hx + 10, hy - 8, hx - 6, hy - 20, P.r, 4);
  stroke(cv, hx - 6, hy - 20, hx - 12, hy - 28, P.R, 3);
  // small furious eyes
  for (const s of [-1, 1]) {
    stroke(cv, hx + s * 2 - 5, hy - 6, hx + s * 2 + 5, hy - 2, P.K, 2);
    set(cv, hx + s * 2, hy - 5, P.W);
  }
  // steam
  for (const s of [-1, 1]) {
    fillEllipse(cv, hx + s * 16, hy + 6, 3, 2, P.G);
    fillEllipse(cv, hx + s * 22, hy, 2, 2, P.G);
  }

  // --- the Maibaum-Dieb, high on the hump ---
  const dx = 74,
    dyy = ground - 66;
  stroke(cv, dx - 3, dyy + 5, dx - 12, dyy + 16, P.b, 4);
  stroke(cv, dx + 4, dyy + 5, dx + 13, dyy + 16, P.b, 4);
  fillEllipse(cv, dx, dyy - 2, 8, 12, P.b);
  fillEllipse(cv, dx - 1, dyy - 3, 6, 9, P.B);
  fillRect(cv, dx - 5, dyy - 11, 10, 3, P.r);
  fillEllipse(cv, dx, dyy - 17, 6, 6, P.R);
  set(cv, dx - 2, dyy - 17, P.K);
  set(cv, dx + 2, dyy - 17, P.K);
  stroke(cv, dx - 3, dyy - 14, dx + 3, dyy - 14, P.c, 1);
  fillEllipse(cv, dx, dyy - 22, 7, 2, P.n);
  fillEllipse(cv, dx + 1, dyy - 25, 3, 4, P.n);
  set(cv, dx + 4, dyy - 25, P.r);
  stroke(cv, dx - 4, dyy - 4, poleX - 3, 86, P.b, 3);
  stroke(cv, dx + 5, dyy - 7, poleX + 2, 66, P.b, 3);

  inkOutline(cv, P.K);
  return finish('der-stier-maibaum-dieb', cv);
}

// ------------------------------------------------------------------ exports
export const STRIPS = {
  'grosse-kellerassel': KELLERASSEL_FRAMES,
  'der-stier': STIER_FRAMES,
};
export const SINGLES = {
  'der-stier-maibaum-dieb': maibaumDiebFrame(),
};

/** Which floor bucket each strip/single is authored against. */
export const BOSS_BUCKETS = {
  'grosse-kellerassel': 'floor-1-cellar',
  'der-stier': 'floor-2-rural',
  'der-stier-maibaum-dieb': 'floor-2-rural',
};
