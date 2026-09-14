import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { encodePng, decodePng } from '../png.mjs';
import { legalPixelColorsFor, nudgeShade } from '../palette.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

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
// Rebuilt against the boss's own postcard art (docs/DECISIONS.md #99/#100):
// the reference is two visibly different materials, not one tone re-shaded —
// a warm tan-brown segmented shell and a distinctly cooler pale-grey head
// and legs, the same way a real woodlouse's carapace and its legs read as
// different textures. `d/m/l/L` stay the wood ramp (`FLOOR_PALETTES.cellar`'s
// `0x54402e`) for the shell; `h/H` are the grey ramp instead of the wood one
// for the head, so the two actually contrast the way the reference's do.
const CELLAR = {
  K: 0x000000, // outline ink
  x: 0x1c1a1f, // deepest shadow (leg joints, segment recesses)
  d: 0x36291e, // shell, darkest (segment recess)
  m: 0x54402e, // shell, base
  l: 0x72573e, // shell, lit
  L: 0x8f6d4e, // shell, highlight / gloss streak
  h: 0x4a4d50, // head, base — cooler grey, a different material from the shell
  H: 0x71767b, // head, lit
  g: 0x343638, // legs
  G: 0x606468, // legs, lit
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

/**
 * Stamps a pre-authored raster source onto `cv` — opaque pixels only,
 * `(ox, oy)` offset. `sources/*.png` are not generated: they're the boss's
 * own chosen key art (`assets/art/bosses/*.png`), background-keyed and
 * downscaled straight to this sprite's canvas through
 * `tools/art/diffusion-postprocess.mjs`, hand-cleaned of the reference
 * illustration's fence/grass fragments, then quantized against a
 * *restricted* legal set: every `legalPixelColorsFor` shade of this
 * floor's neutrals and its one cream hue (19 tones once the ±2-step ramp
 * is expanded), but none of the two green or two blue base hues' ramps.
 * A first pass quantized against the floor's full legal palette and
 * snapped the coat's warm brown to rural green — nearest-colour is blind
 * to "a coat has no business being this hue" — and a second pass
 * restricted the *count* of legal tones to just the five base hues, which
 * fixed the colour but banded the shading flat and lost the illustration's
 * own modelling. Restricting which *hues* are eligible while keeping their
 * *full derived ramp* gets both: grayscale-plus-cream only, but with all
 * the shade steps the palette system already grants any legal colour.
 */
const artCache = new Map();
function loadArt(srcPath) {
  let art = artCache.get(srcPath);
  if (!art) {
    art = decodePng(readFileSync(srcPath));
    artCache.set(srcPath, art);
  }
  return art;
}

/**
 * `stampArt` plus the whole-sprite transforms a single static raster can
 * still carry (#104): this source has no separable limbs to re-pose per
 * frame the way `stierBody`/`stierHead`'s primitives could, so the walk/
 * telegraph/hurt beats are squash-stretch and lean around a ground-anchored
 * pivot (`pivotY` defaults to the art's own bottom edge, so a squat or
 * stretch reads as the animal's weight shifting on planted feet, not the
 * whole sprite floating) plus an optional hit-flash `tint`, rather than
 * independent leg or head articulation. `tint` is a *step count*, not a
 * blend fraction — every stamped pixel is already one of the bucket's own
 * legal shades, so flashing it lighter means walking `tint` steps up its
 * own `nudgeShade` ramp (clamped at white), not an arbitrary RGB lerp
 * toward white that would land off-palette. `rotate` (degrees, clockwise)
 * turns the whole raster around the same pivot — a death pose "toppling"
 * the standing art rather than needing a separately-posed lying-down
 * source (#105).
 */
function stampArt(
  cv,
  srcPath,
  bucket,
  { ox = 0, oy = 0, sx = 1, sy = 1, rotate = 0, pivotX, pivotY, tint = 0 } = {},
) {
  const { width, height, pixels } = loadArt(srcPath);
  const px0 = pivotX ?? width / 2;
  const py0 = pivotY ?? height;
  const rad = (rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sampleAt = (sxCoord, syCoord) => {
    const x = Math.round(sxCoord);
    const y = Math.round(syCoord);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const i = (y * width + x) * 4;
    if (pixels[i + 3] < 128) return null;
    let hex = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    for (let step = 0; step < tint; step++) hex = nudgeShade(bucket, hex, 1);
    return hex;
  };
  // Inverse (destination-to-source) mapping, not forward: walking the
  // destination bounds and sampling the source for each one, not the other
  // way round. A non-uniform `sx`/`sy` stretch (or a `rotate`) forward-
  // mapped from the source instead spreads adjacent source pixels apart in
  // the destination, leaving unset gaps between them that `inkOutline`
  // then paints in as a stray internal seam — happened on the first
  // `squash`/`stretch` pass here, visible as a black line straight through
  // the torso on every non-1.0-scale frame. A `rotate`d stamp can land
  // anywhere in the canvas, so its destination bounds are the whole canvas
  // rather than the tight scale-only box below.
  let x0, x1, y0, y1;
  if (rotate !== 0) {
    x0 = 0;
    x1 = cv.w - 1;
    y0 = 0;
    y1 = cv.h - 1;
  } else {
    x0 = Math.floor(px0 + (0 - px0) * Math.min(1, sx) + Math.min(0, ox) - 2);
    x1 = Math.ceil(px0 + (width - px0) * Math.max(1, sx) + Math.max(0, ox) + 2);
    y0 = Math.floor(py0 + (0 - py0) * Math.min(1, sy) + Math.min(0, oy) - 2);
    y1 = Math.ceil(py0 + (height - py0) * Math.max(1, sy) + Math.max(0, oy) + 2);
  }
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const dx = tx - ox - px0;
      const dy = ty - oy - py0;
      const rx = dx * cos + dy * sin;
      const ry = -dx * sin + dy * cos;
      const hex = sampleAt(px0 + rx / sx, py0 + ry / sy);
      if (hex !== null) set(cv, tx, ty, hex);
    }
  }
}

/**
 * Stamps `srcPath` with every column in `[bandY0, bandY1]` given its own
 * small vertical offset — a travelling sine wave across x, `waveLength`
 * pixels per full cycle, `waveAmplitude` pixels of lift at its peak,
 * `phase` (0-1) sliding the wave along for successive frames (#107). This
 * is what gives the legs real per-frame motion without either of the two
 * ways that were tried and rejected first: cutting legs into separate
 * source images (real per-limb rotation, but two hip-pivoted rigid pieces
 * only manage a crude two-phase gait) and cutting the leg band into
 * discrete rectangular strips with `stampArt`'s `srcClip` (independent
 * per-leg offsets, but the strip edges cut across the source at a flat
 * line the real silhouette doesn't follow, so it read as pasted-together
 * boxes, not legs). A per-column wave has no seams to speak of — the
 * offset between column x and x+1 differs by a fraction of a pixel — and
 * it's the right shape for a many-legged animal's real gait anyway: a
 * metachronal ripple down the body, not legs swinging as rigid pairs.
 * Forward-mapped (source column to destination column) rather than the
 * inverse mapping `stampArt` uses elsewhere in this file: safe here only
 * because the wave's per-column slope stays under 1px (amplitude·2π /
 * waveLength), so it can't open the forward-mapping gaps that motivated
 * inverse mapping in the first place — a larger amplitude or shorter
 * waveLength would need to go back to it.
 */
function stampArtRippled(
  cv,
  srcPath,
  bucket,
  { ox = 0, oy = 0, tint = 0, bandY0, bandY1, waveAmplitude = 0, waveLength = 20, phase = 0 } = {},
) {
  const { width, height, pixels } = loadArt(srcPath);
  for (let x = 0; x < width; x++) {
    const colShift = waveAmplitude * Math.sin(2 * Math.PI * (x / waveLength + phase));
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 128) continue;
      let hex = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
      for (let step = 0; step < tint; step++) hex = nudgeShade(bucket, hex, 1);
      const inBand = bandY0 !== undefined && y >= bandY0 && y <= bandY1;
      set(cv, x + ox, y + oy + (inBand ? colShift : 0), hex);
    }
  }
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
// Canvas 140x86, head/front to the left, bottom-anchored (#193).
const KW = 140,
  KH = 86;

const KELLERASSEL_ART = path.join(HERE, 'sources/grosse-kellerassel-idle.png');

/**
 * Standing/walking/hurting frames (#108, retracting #107's per-column
 * ripple for this creature specifically): the ripple reads fine on Der
 * Stier's legs because each is one large, simple hoof mass — shifting
 * neighbouring columns by a slightly different amount just shears the
 * blob smoothly. Die Große Kellerassel's legs are the opposite: several
 * thin, multi-segment joints only a couple of pixels wide, and the same
 * per-column shift tears each one into disconnected diagonal fragments —
 * `inkOutline` then rings every fragment separately, which is exactly the
 * "outline is off the body, looks cut out with scissors" read. So this
 * creature's legs go back to being static, stamped once with the shell
 * and head; `bodyDip`/`squash`/`bodyLean`/`tint` still move the whole
 * animal for the weight-shift/recoil/hit-flash reads every other frame
 * needs, just without the per-leg articulation the ripple can't safely
 * give this particular silhouette.
 */
function kellerasselStandingFrame(
  name,
  { squash = 0, stretch = 0, bodyDip = 0, bodyLean = 0, tint = 0 },
) {
  const cv = canvas(KW, KH);
  const sy = 1 - squash + stretch;
  const sx = 1 + squash * 0.6 - stretch * 0.3;
  stampArt(cv, KELLERASSEL_ART, 'floor-1-cellar', { ox: bodyLean, oy: bodyDip, sx, sy, tint });
  inkOutline(cv, CELLAR.K);
  return finish(name, cv);
}

/** Death frames: the whole (unsliced) art rotated as one piece — same reasoning as `stierDeadFrame`. */
function kellerasselDeadFrame(name, { rotate, pivotX, pivotY, scale, dip = 0, tint = 0 }) {
  const cv = canvas(KW, KH);
  stampArt(cv, KELLERASSEL_ART, 'floor-1-cellar', {
    oy: dip,
    sx: scale,
    sy: scale,
    rotate,
    pivotX,
    pivotY,
    tint,
  });
  inkOutline(cv, CELLAR.K);
  return finish(name, cv);
}

export const KELLERASSEL_FRAMES = [
  kellerasselStandingFrame('kellerassel-idle', {}),
  kellerasselStandingFrame('kellerassel-idle-b', { bodyDip: -1 }),
  kellerasselStandingFrame('kellerassel-walk', { stretch: 0.02, bodyDip: -1 }),
  kellerasselStandingFrame('kellerassel-telegraph', { squash: 0.07, bodyLean: -2, bodyDip: 2 }),
  kellerasselStandingFrame('kellerassel-hurt', { squash: 0.04, bodyLean: 3, tint: 2 }),
  // both death beats topple the same art around a pivot near the tail
  // (#105, the same technique as Der Stier's death-2) instead of the old
  // separately hand-drawn "tipped onto its back" / "curled ball" poses —
  // neither of those silhouettes exists in a side-view raster of an
  // elongated body, so rather than fight the art into an unreachable shape
  // this rolls it further onto its back in two stages, which *is* a real
  // silhouette a rotation can reach.
  kellerasselDeadFrame('kellerassel-death-1', {
    rotate: 45,
    pivotX: 70,
    pivotY: 43,
    scale: 0.6,
    dip: 2,
    tint: 1,
  }),
  kellerasselDeadFrame('kellerassel-death-2', {
    rotate: 90,
    pivotX: 70,
    pivotY: 43,
    scale: 0.55,
    dip: 3,
    tint: 2,
  }),
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

/**
 * The green wreath around the neck (#99: moved to actually wrap the neck,
 * and to draw after the head so the collar doesn't paint over it — it used
 * to sit low on the shoulder, mostly hidden under the neck mass, and read
 * as a stray dot rather than a wreath).
 */
function stierWreath(cv, P, by) {
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const ax = 32 + t * 16;
    const ay = by - 9 + t * 3;
    fillEllipse(cv, ax, ay, 3, 3, i % 2 ? P.N : P.n);
  }
}

/**
 * `squash`/`stretch`/`dip`/`lean`/`tint` are whole-sprite dials, not limb
 * poses (#104's follow-up) — a static raster has no separable legs or head
 * to re-pose per frame, so a walk's weight-shift, a telegraph's crouch, a
 * hurt recoil and a death crumple are all squash-stretch and lean around
 * the art's own ground-anchored bottom edge (`stampArt`'s `pivotY`
 * default) instead. Squash pulls the sprite shorter and a little wider
 * (`sy` down, `sx` up); stretch does the opposite; `dip`/`lean` are a
 * straight pixel offset; `tint` is `stampArt`'s shade-step hit flash.
 */
const STIER_ART = path.join(HERE, 'sources/der-stier-full.png');
// the leg band's own y-range in the source art — everything below this is
// the front/rear hoof mass, everything above is torso and stays still.
// `waveLength` is set so the front leg (~x46) and rear leg (~x98) — the
// two legs actually land half a wave apart, i.e. opposite phase.
const STIER_LEG_BAND = { bandY0: 76, bandY1: 88, waveLength: 104 };

/**
 * Standing/walking/hurting frames (#107, replacing #106's two-hinge
 * attempt — see `stampArtRippled`'s doc comment for why that one got
 * replaced): the torso stamps normally, then the same source re-stamps
 * with a per-column ripple confined to the leg band, so the body stays
 * still while the legs carry all the motion.
 */
function stierStandingFrame(
  name,
  {
    wavePhase = 0,
    waveAmplitude = 2,
    squash = 0,
    stretch = 0,
    bodyDip = 0,
    bodyLean = 0,
    tint = 0,
  },
) {
  const cv = canvas(SW, SH);
  const sy = 1 - squash + stretch;
  const sx = 1 + squash * 0.6 - stretch * 0.3;
  stampArt(cv, STIER_ART, 'floor-2-rural', { ox: bodyLean, oy: bodyDip, sx, sy, tint });
  stampArtRippled(cv, STIER_ART, 'floor-2-rural', {
    ox: bodyLean,
    oy: bodyDip,
    tint,
    waveAmplitude,
    phase: wavePhase,
    ...STIER_LEG_BAND,
  });
  stierWreath(cv, RURAL, SGROUND - 40 + bodyDip * 0.5);
  inkOutline(cv, RURAL.K);
  return finish(name, cv);
}

/** Death frames (#105): the combined art, rotated as one piece — a fallen bull's legs stay put relative to its own body, so there's no swing left to give them. */
function stierDeadFrame(name, { rotate, pivotX, pivotY, scale, dip = 0, tint = 0 }) {
  const cv = canvas(SW, SH);
  stampArt(cv, STIER_ART, 'floor-2-rural', {
    oy: dip,
    sx: scale,
    sy: scale,
    rotate,
    pivotX,
    pivotY,
    tint,
  });
  inkOutline(cv, RURAL.K);
  return finish(name, cv);
}

export const STIER_FRAMES = [
  stierStandingFrame('stier-idle', { wavePhase: 0 }),
  stierStandingFrame('stier-walk', { wavePhase: 0.35, waveAmplitude: 3, bodyDip: -1 }),
  stierStandingFrame('stier-idle-b', { wavePhase: 0.15, bodyDip: -2 }),
  stierStandingFrame('stier-telegraph', {
    wavePhase: 0.5,
    waveAmplitude: 1,
    squash: 0.08,
    bodyDip: 2,
  }),
  stierStandingFrame('stier-hurt', {
    wavePhase: 0.65,
    waveAmplitude: 3,
    squash: 0.05,
    bodyLean: 4,
    tint: 2,
  }),
  stierStandingFrame('stier-death-1', {
    wavePhase: 0.2,
    waveAmplitude: 4,
    squash: 0.12,
    bodyDip: 5,
    bodyLean: -3,
    tint: 1,
  }),
  // toppled fully onto his side — the same art, rotated around a pivot
  // near the hind legs (#105) rather than a separately hand-drawn
  // collapsed pose, so the death beat still reads as *this* bull, not a
  // different, flatter drawing standing in for him
  stierDeadFrame('stier-death-2', {
    rotate: 65,
    pivotX: 63,
    pivotY: 50,
    scale: 0.68,
    dip: 1,
    tint: 1,
  }),
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
