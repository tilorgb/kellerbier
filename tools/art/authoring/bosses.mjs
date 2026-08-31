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
  s: 0xcabc92, // Maibaum-Dieb skin (#199) — the warmest tone floor 2 allows
  e: 0x233c69, // dark blue, for the Dieb's iris
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
// Redrawn #199 toward a stocky 3/4-view bull (the front-on "head on a tower"
// read was the bug the head-seam fix could only paper over). Head sits up on
// the shoulders and forward, connected by a real neck; the body carries the
// mass. Facing LEFT, feet on `SGROUND`, bottom-anchored (#193). ~80% of the
// old height, and the head + horns sit forward of / above the collider so the
// dangerous part a player reads is the body.
const SW = 116,
  SH = 100,
  SGROUND = 96;

/** One curved horn sweeping out and up from `(bx, by)`; `far` tints it back. */
function stierHorn(cv, P, bx, by, dir, far) {
  let px = bx,
    py = by;
  for (let t = 1; t <= 28; t++) {
    const f = t / 28;
    // out quickly, then hook upward
    px = bx + dir * (13 * Math.sqrt(f) + 3 * f);
    py = by - (18 * f * f + 4 * f);
    const wd = Math.max(1, 4 * (1 - f * 0.82));
    fillEllipse(cv, px, py, wd, wd, far ? P.R : P.r);
  }
  fillEllipse(cv, px, py, 2, 2, P.G); // dark tip
}

function stierBody(cv, P, { by, legPose = 0, tilt = 0 }) {
  const legY = SGROUND;
  // far pair — behind the body, cooler tone
  for (const lx of [70, 40]) {
    fillRect(cv, lx - 5, legY - 24, 10, 24, P.H);
    fillRect(cv, lx - 5, legY - 3, 10, 3, P.G);
  }
  // near pair — front leg can brace back on a telegraph / stagger
  for (const [lx0, lift] of [
    [82, legPose === 2 ? 3 : 0],
    [30, legPose === 1 ? -3 : 0],
  ]) {
    const lx = lx0 + (lx0 < 56 ? lift : 0);
    const top = legY - 28 + (lx0 > 56 ? lift : 0);
    fillRect(cv, lx - 6, top, 12, legY - top, P.C);
    fillRect(cv, lx - 6, top, 4, legY - top, P.c);
    fillRect(cv, lx - 6, legY - 3, 12, 3, P.r);
  }
  // barrel: overlapping masses, haunch high to the back-right
  fillEllipse(cv, 76, by + 4 + tilt, 25, 21, P.C);
  fillEllipse(cv, 54, by, 33, 23, P.C);
  fillEllipse(cv, 36, by - 2, 21, 19, P.C);
  fillEllipse(cv, 44, by - 12, 28, 11, P.c); // spine dip
  fillEllipse(cv, 40, by - 12, 21, 7, P.H); // topline light
  fillEllipse(cv, 66, by - 8, 19, 7, P.H);
  fillEllipse(cv, 34, by - 14, 12, 9, P.C); // shoulder hump
  fillEllipse(cv, 32, by - 16, 8, 5, P.H);
  fillEllipse(cv, 56, by + 15, 29, 7, P.c); // belly shadow
  stroke(cv, 98, by + 2, 105, by + 20, P.c, 3); // tail
  fillEllipse(cv, 105, by + 22, 3, 5, P.c);
}

function stierHead(cv, P, { by, headDown = 0, headBack = 0, expr = 'idle' }) {
  const hx = 24 + headBack;
  const hy = by - 20 + headDown;
  // neck — a short thick mass from the shoulder to a head that sits UP on it
  for (let t = 0; t <= 16; t++) {
    const f = t / 16;
    const x = 34 + (hx - 34) * f;
    const y = by - 8 + (hy + 6 - (by - 8)) * f;
    const wd = 15 - f * 2;
    fillEllipse(cv, x, y, wd, wd * 0.9, P.C);
  }
  fillEllipse(cv, 28, by - 18, 9, 6, P.H); // neck crest light
  // head mass
  fillEllipse(cv, hx, hy, 17, 15, P.C);
  fillEllipse(cv, hx - 3, hy - 4, 13, 10, P.H);
  fillEllipse(cv, hx + 13, hy - 3, 5, 4, P.C); // ear
  fillEllipse(cv, hx + 14, hy - 4, 3, 2, P.H);
  fillEllipse(cv, hx - 3, hy + 1, 5, 12, P.R); // white blaze
  fillEllipse(cv, hx - 4, hy - 6, 3, 5, P.r);
  // muzzle — overlaps the head, broad and low
  fillEllipse(cv, hx - 9, hy + 12, 12, 9, P.r);
  fillRect(cv, hx - 18, hy + 8, 16, 10, P.r);
  fillRect(cv, hx - 18, hy + 15, 16, 3, P.R);
  fillRect(cv, hx - 14, hy + 6, 16, 3, P.C); // noseband
  set(cv, hx - 12, hy + 12, P.K);
  set(cv, hx - 11, hy + 12, P.K);
  set(cv, hx - 5, hy + 13, P.K);
  set(cv, hx - 4, hy + 13, P.K);
  // forelock between the horns
  for (const o of [-3, 1, 5]) fillEllipse(cv, hx + o, hy - 13, 2, 3, P.c);
  // horns
  stierHorn(cv, P, hx - 8, hy - 11, -1, true);
  stierHorn(cv, P, hx + 8, hy - 11, 1, false);
  // one clear near eye + a small hint of the far one (3/4 view) + heavy brow
  const narrow = expr === 'telegraph';
  const ex = hx + 5;
  if (expr === 'hurt' || expr === 'dead') {
    stroke(cv, ex - 4, hy - 4, ex + 4, hy + 4, P.K, 2);
    stroke(cv, ex - 4, hy + 4, ex + 4, hy - 4, P.K, 2);
  } else {
    fillEllipse(cv, ex, hy, 4, narrow ? 2 : 4, P.W);
    fillEllipse(cv, ex - 1, hy + 1, 2, narrow ? 1.5 : 2.5, P.K);
    set(cv, ex - 2, hy - 2, P.W);
    fillEllipse(cv, hx - 9, hy, 2, narrow ? 1 : 2, P.W); // far eye, small
    set(cv, hx - 10, hy + 1, P.K);
  }
  // one thick angled brow ridge over the near eye
  stroke(cv, hx - 2, hy - 6 + (narrow ? 3 : 0), hx + 12, hy - 8, P.c, narrow ? 4 : 3);
  stroke(cv, hx - 11, hy - 4, hx - 5, hy - 5, P.c, 2); // far brow hint
  // telegraph — steam off the nose
  if (expr === 'telegraph') {
    for (const s of [0, 1]) fillEllipse(cv, hx - 12 - s * 5, hy + 8 - s * 4, 3, 2, P.G);
  }
}

function stierWreath(cv, P, by) {
  for (let i = 0; i < 9; i++) {
    const ax = 20 + i * 4,
      ay = by - 4 + Math.sin(i * 0.9) * 3;
    fillEllipse(cv, ax, ay, 2.5, 2.5, i % 2 ? P.N : P.r);
    set(cv, ax, ay, i % 2 ? P.n : P.R);
  }
}

function stierFrame(name, { expr = 'idle', bob = 0, legPose = 0, headDown = 0, headBack = 0 }) {
  const cv = canvas(SW, SH);
  if (expr === 'dead') {
    // collapsed onto its side along the ground line
    fillEllipse(cv, 62, SGROUND - 16, 42, 16, RURAL.C);
    fillEllipse(cv, 56, SGROUND - 22, 32, 10, RURAL.H);
    for (const lx of [40, 54, 78, 92])
      stroke(cv, lx, SGROUND - 24, lx + (lx < 62 ? -12 : 12), SGROUND - 36, RURAL.C, 6);
    fillEllipse(cv, 22, SGROUND - 12, 16, 13, RURAL.C); // head down left
    fillEllipse(cv, 14, SGROUND - 6, 8, 5, RURAL.R); // muzzle
    stierHorn(cv, RURAL, 24, SGROUND - 20, -1, true);
    stierHorn(cv, RURAL, 26, SGROUND - 20, 1, false);
    stroke(cv, 18, SGROUND - 16, 26, SGROUND - 8, RURAL.K, 2);
    stroke(cv, 18, SGROUND - 8, 26, SGROUND - 16, RURAL.K, 2);
    inkOutline(cv, RURAL.K);
    return finish(name, cv);
  }
  const by = SGROUND - 40 - bob;
  stierBody(cv, RURAL, { by, legPose, tilt: expr === 'hurt' ? 3 : 0 });
  stierWreath(cv, RURAL, by);
  stierHead(cv, RURAL, { by, headDown, headBack, expr });
  inkOutline(cv, RURAL.K);
  return finish(name, cv);
}

export const STIER_FRAMES = [
  stierFrame('stier-idle', { expr: 'idle' }),
  stierFrame('stier-walk', { expr: 'idle', bob: 2, legPose: 1 }),
  stierFrame('stier-idle-b', { expr: 'idle', bob: 1, legPose: 2, headDown: 1 }),
  stierFrame('stier-telegraph', { expr: 'telegraph', bob: 2, legPose: 1, headDown: 7 }),
  stierFrame('stier-hurt', { expr: 'hurt', bob: 3, headDown: -5, headBack: 4 }),
  stierFrame('stier-death-1', { expr: 'hurt', bob: -2, legPose: 1, headDown: 8 }),
  stierFrame('stier-death-2', { expr: 'dead' }),
];

// ==================================================== MAIBAUM-DIEB (strip)
// Phase two (#199): the thief on foot, no bull. Player-sized and a little
// chubby — a stocky Bua in lederhosen, flat cap pulled low, domino mask (clean
// Alois-style eyes: white + dark-blue iris), one green feather, warm skin. This
// is the design signed off in the option round, authored as pixel grids the
// same way `alois.mjs` does its heads — the right tool for a small cute face.
//
// Facing left, feet on the bottom row, bottom-anchored (#193). The stolen pole
// is never in these frames — `render/maibaum-view.ts` swings a cut-down weapon
// pole in his hands (#199) — so the strip stays a small, uniform 24×34 canvas.
const DIEB_PAL = {
  '.': null,
  K: RURAL.K,
  c: RURAL.c,
  C: RURAL.C,
  H: RURAL.H,
  S: RURAL.s, // skin (the warmest floor-2 tone; Alois's own e8c28c is not legal here)
  s: RURAL.R, // skin, lit
  W: RURAL.W, // eye white / highlight
  E: RURAL.e, // iris (dark blue)
  b: RURAL.b,
  B: RURAL.B,
  n: RURAL.n, // suspenders / feather green
  N: RURAL.N,
  g: RURAL.g, // Haferlschuh grey
};
const DIEB_W = 24,
  DIEB_H = 34;

/** Paints an ASCII grid onto a fixed-size canvas (its own ink is already in it). */
function diebGrid(name, rows) {
  const cv = canvas(DIEB_W, DIEB_H);
  for (let y = 0; y < Math.min(rows.length, DIEB_H); y++) {
    const row = rows[y];
    for (let x = 0; x < Math.min(row.length, DIEB_W); x++) {
      const col = DIEB_PAL[row[x]] ?? null;
      if (col !== null) set(cv, x, y, col);
    }
  }
  return finish(name, cv);
}

// prettier-ignore
const DIEB_IDLE = [
  '.........KKKKKKK.........',
  '.......KKCCCCCCCKK.......',
  '.....KKCCHHHHHHHCCKKKKK..',
  '...KKCCCCCCCCCCCCCK.KnK..',
  '..KKHHHHHHHHHHHHHHKKKNK..',
  '.KKCCCCCCCCCCCCCCCCKKNK..',
  '.KKKKKKKKKKKKKKKKKKK.NK..',
  '...KSSSSssssssSSSSK.K....',
  '...KSSKKKSSSSKKKSSK......',
  '...KCCCCCCCCCCCCCCK......',
  '...KCWEsCCCCCCWEsCK......',
  '...KCWEECCCCCCWEECK......',
  '...KKCCCCCCCCCCCCKK......',
  '....KSSSSSKKSSSSSK.......',
  '....KSSSSSSSSSSSSK.......',
  '....KsSSSSSSSSSSsK.......',
  '.....KSScKKKKcSSSK.......',
  '.....KSSSSssSSSSK........',
  '......KKSSSSSSKK.........',
  '........KSs.sSK..........',
  '......KKbbBBBBbbKK.......',
  '.....KbBBBBBBBBBBbK......',
  '....KSKnBBBBBBBBnKSK.....',
  '...KSSKbBBBBBBBBKSSK.....',
  '...KSSK.bBBBBBB.KSSK.....',
  '...KK..KCCCCCCCCK..KK....',
  '.......KCHHHHHHHCK.......',
  '.......KCHsHHsHHCK.......',
  '.......KCccccccccK.......',
  '.......KSSsK.KsSSK.......',
  '.......KSSSK.KSSSK.......',
  '......KKggKK.KKggKK......',
  '......KKKKK...KKKKK......',
  '........................',
];

// walk: forward foot, trailing foot, a one-row head bob.
// prettier-ignore
const DIEB_WALK = [
  '........................',
  '.........KKKKKKK.........',
  '.......KKCCCCCCCKK.......',
  '.....KKCCHHHHHHHCCKKKKK..',
  '...KKCCCCCCCCCCCCCK.KnK..',
  '..KKHHHHHHHHHHHHHHKKKNK..',
  '.KKCCCCCCCCCCCCCCCCKKNK..',
  '.KKKKKKKKKKKKKKKKKKK.NK..',
  '...KSSSSssssssSSSSK.K....',
  '...KSSKKKSSSSKKKSSK......',
  '...KCCCCCCCCCCCCCCK......',
  '...KCWEsCCCCCCWEsCK......',
  '...KCWEECCCCCCWEECK......',
  '...KKCCCCCCCCCCCCKK......',
  '....KSSSSSKKSSSSSK.......',
  '....KSSSSSSSSSSSSK.......',
  '....KsSSSSSSSSSSsK.......',
  '.....KSScKKKKcSSSK.......',
  '.....KSSSSssSSSSK........',
  '......KKSSSSSSKK.........',
  '........KSs.sSK..........',
  '......KKbbBBBBbbKK.......',
  '.....KbBBBBBBBBBBbK......',
  '....KSKnBBBBBBBBnKSK.....',
  '...KSSKbBBBBBBBBKSSK.....',
  '...KSSK.bBBBBBB.KSSK.....',
  '...KK..KCCCCCCCCK..KK....',
  '.......KCHHHHHHHCK.......',
  '.......KCHsHHsHHCK.......',
  '......KCccccccccK........',
  '.....KSSsK....KsSSK......',
  '.....KSSSK....KSSSK......',
  '....KKggKK....KKggKK.....',
  '....KKKKK......KKKKK.....',
];

// telegraph: brow up hard, near arm cocked the pole back over the far shoulder.
// prettier-ignore
const DIEB_TELE = [
  '...KK....KKKKKKK.........',
  '..KSSK.KKCCCCCCCKK.......',
  '..KSSKKCCHHHHHHHCCKKKKK..',
  '...KKKCCCCCCCCCCCCK.KnK..',
  '..KKHHHHHHHHHHHHHHKKKNK..',
  '.KKCCCCCCCCCCCCCCCCKKNK..',
  '.KKKKKKKKKKKKKKKKKKK.NK..',
  '...KSSKKKSSSSKKKSSK.K....',
  '...KSSSSssssssSSSSK......',
  '...KCCCCCCCCCCCCCCK......',
  '...KCWEECCCCCCWEECK......',
  '...KCWEECCCCCCWEECK......',
  '...KKCCCCCCCCCCCCKK......',
  '....KSSSSSKKSSSSSK.......',
  '....KSSSSSSSSSSSSK.......',
  '....KsSSSSSSSSSSsK.......',
  '.....KSScccccSSSK.......',
  '.....KSSSSSSSSSSK........',
  '......KKSSSSSSKK.........',
  '........sSKsS............',
  '......KKbbBBBBbbKKK......',
  '.....KbBBBBBBBBBBbKSK....',
  '....KSKnBBBBBBBBnKSSK....',
  '...KSSKbBBBBBBBBKSSK.....',
  '...KSSK.bBBBBBB.KK.......',
  '...KK..KCCCCCCCCK..KK....',
  '.......KCHHHHHHHCK.......',
  '.......KCHsHHsHHCK.......',
  '.......KCccccccccK.......',
  '......KSSsK..KsSSK.......',
  '.......KSSK..KSSSK.......',
  '.....KKggKK..KKggKK......',
  '.....KKKKK....KKKKK......',
  '........................',
];

// hurt: eyes screwed to X's, head knocked back-right, arms flung out.
// prettier-ignore
const DIEB_HURT = [
  '.........KKKKKKK.........',
  '.......KKCCCCCCCKK.......',
  '.....KKCCHHHHHHHCCKKKKK..',
  '...KKCCCCCCCCCCCCCK.KnK..',
  '..KKHHHHHHHHHHHHHHKKKNK..',
  '.KKCCCCCCCCCCCCCCCCKKNK..',
  '.KKKKKKKKKKKKKKKKKKK.NK..',
  '...KSSSSSSSSSSSSSSK.K....',
  '...KSSKKSSSSSSKKSSK......',
  '...KCKCKCCCCKCKCCK.......',
  '...KCCKCCCCCCKCCCK.......',
  '...KCKCKCCCCKCKCCK.......',
  '...KKCCCCCCCCCCCKK.......',
  '....KSSSSSSSSSSSK........',
  '....KSSSSSSSSSSSK........',
  '....KsSSSSSSSSSsK........',
  '.....KSSSSccSSSK.........',
  '.....KSSSSSSSSSK.........',
  '......KKSSSSSSKK.........',
  '.......sSK.KSs...........',
  '...KKKbbBBBBbbKKK........',
  '..KSKbBBBBBBBBBBbKSK.....',
  '..KSSKnBBBBBBBBnKSSK.....',
  '...KK.bBBBBBBBBK.KK......',
  '.....KbBBBBBBBBK.........',
  '...KK..KCCCCCCCCK..KK....',
  '.......KCHHHHHHHCK.......',
  '.......KCHsHHsHHCK.......',
  '.......KCccccccccK.......',
  '......KSSsK..KsSSK.......',
  '......KSSSK..KSSSK.......',
  '.....KKggKK..KKggKK......',
  '.....KKKKK....KKKKK......',
  '........................',
];

// death-1: same X-eyed head but crumpling — knees buckled, sinking.
// prettier-ignore
const DIEB_DEATH1 = [
  '........................',
  '........................',
  '.........KKKKKKK.........',
  '.......KKCCCCCCCKK.......',
  '.....KKCCHHHHHHHCCKKKKK..',
  '...KKCCCCCCCCCCCCCK.KnK..',
  '..KKHHHHHHHHHHHHHHKKKNK..',
  '.KKCCCCCCCCCCCCCCCCKKNK..',
  '.KKKKKKKKKKKKKKKKKKK.NK..',
  '...KSSSSSSSSSSSSSSK.K....',
  '...KCKCKCCCCKCKCCK.......',
  '...KCCKCCCCCCKCCCK.......',
  '...KCKCKCCCCKCKCCK.......',
  '...KKCCCCCCCCCCCKK.......',
  '....KSSSSSSSSSSSK........',
  '....KsSSSSSSSSSsK........',
  '.....KSSSSccSSSK.........',
  '.....KKSSSSSSKK..........',
  '...KKKbbBBBBbbKKK........',
  '..KSKbBBBBBBBBBBbKSK.....',
  '...KKnBBBBBBBBnKK........',
  '.....bBBBBBBBBK..........',
  '.....KbBBBBBBBK..........',
  '......KCCCCCCCCK.........',
  '......KCHHHHHHHCK........',
  '......KCccccccccK........',
  '.....KSSSK..KSSSK........',
  '.....KSSSK..KSSSK........',
  '....KKggKK..KKggKK.......',
  '....KKKKK....KKKKK.......',
  '........................',
  '........................',
  '........................',
  '........................',
];

// death-2: flat on his back, cap knocked off to the side.
// prettier-ignore
const DIEB_DEATH2 = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..............KKK.......',
  '....KKKK....KKCCCKK.....',
  '..KKCHHCKK.KCCHHHCCK....',
  '.KCCCCCCCCK.KCCCCCCK....',
  '.KbBBBBBBbK..KKKKKK.....',
  'KbBBBBBBBBbK.SSSS.......',
  'KbBBnBBnBBbKKSssSK......',
  'KbBBBBBBBBbKKSKKSK......',
  '.KCCCCCCCCK.KKssKK......',
  '.KCHHHHHHCK.............',
  '.KCccccccK.............',
  '..KSK..KSK.............',
  '..KSK..KSK.............',
  '.KKgKK.KKgKK...........',
  '.KKKK..KKKK............',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];

// idle-b: the whole body settled a pixel lower — a slow breath.
const DIEB_IDLE_B = ['........................', ...DIEB_IDLE.slice(0, DIEB_H - 1)];

export const DIEB_FRAMES = [
  diebGrid('dieb-idle', DIEB_IDLE),
  diebGrid('dieb-walk', DIEB_WALK),
  diebGrid('dieb-idle-b', DIEB_IDLE_B),
  diebGrid('dieb-telegraph', DIEB_TELE),
  diebGrid('dieb-hurt', DIEB_HURT),
  diebGrid('dieb-death-1', DIEB_DEATH1),
  diebGrid('dieb-death-2', DIEB_DEATH2),
];

// ------------------------------------------------------------------ exports
export const STRIPS = {
  'grosse-kellerassel': KELLERASSEL_FRAMES,
  'der-stier': STIER_FRAMES,
  'der-stier-maibaum-dieb': DIEB_FRAMES,
};
export const SINGLES = {};

/** Which floor bucket each strip/single is authored against. */
export const BOSS_BUCKETS = {
  'grosse-kellerassel': 'floor-1-cellar',
  'der-stier': 'floor-2-rural',
  'der-stier-maibaum-dieb': 'floor-2-rural',
};
