import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';
import { canvas, ellipse, fillRect, line, outline, poly, px, roundRect } from './draw.mjs';

/**
 * Der Wald's mini-boss (#467) — Bieber the beaver and the log he rolls.
 *
 * Programmatic block art (`docs/DECISIONS.md` #77's cloud track, #43/#55): the
 * shapes are drawn with `draw.mjs`, not typed as grids, because the log has to
 * be drawn at several phases of a turn. The PNGs stay committed and
 * `tests/art/floor3-minibosses-authoring.test.ts` holds them to this file byte
 * for byte, so editing it without `npm run art:minibosses3` fails a pull request.
 *
 * The design and the canvas size were signed off by Tilo after an options round
 * (A walker 40x24, **B upright 34x36**, C chunky 32x28 for the beaver; end-on
 * disc, small disc and a side-lying log for the log). Picked: B, and the
 * rolling log *rotated a quarter turn from the standing trunk* so it lies along
 * the way it travels. The resting log is the floor's own `wald-log-1`, not new
 * art. Floor 3's palette has no brown, so the fur is the amber from the skin
 * ramp, and the tail is the floor's violet-grey.
 *
 * Everything is authored **facing left**; the engine mirrors a body that moves
 * right (`render/animation/state.ts`'s `AUTHORED_FACING`).
 */

export const MINIBOSS_BUCKET = 'floor-3-wald';

// ------------------------------------------------------------------ palette
export const WALD_MINI = {
  '.': null,
  K: 0x000000, // ink
  f: 0xd99940, // fur
  F: 0xe0ae66, // fur, lit
  k: 0xe8c28c, // muzzle and belly
  m: 0x737373, // feet and the shaded arm
  b: 0x332f38, // tail
  c: 0x494451, // tail scales
  w: 0xe8e8e8, // teeth
  n: 0x2e2e2e, // nose
  D: 0x234d2b, // bark
  j: 0x316d3d, // bark, lit
  J: 0x408c4e, // moss
  u: 0x152d19, // bark ridge, in shadow
  S: 0xd1d1d1, // cut face, lit
  s: 0xb8b8b8, // cut face
  l: 0x8a8a8a, // cut face rings
};

{
  const legal = legalPixelColorsFor(MINIBOSS_BUCKET);
  for (const [key, colour] of Object.entries(WALD_MINI)) {
    if (colour !== null && !legal.has(colour)) {
      throw new Error(
        `floor3-minibosses key "${key}" is #${colour.toString(16).padStart(6, '0')}, ` +
          `not legal for ${MINIBOSS_BUCKET} — see tools/art/palette.mjs`,
      );
    }
  }
}

/** A drawn canvas as a built frame. */
function frame(name, c) {
  const px_ = c.rows.map((row, y) =>
    row.map((ch) => {
      if (!(ch in WALD_MINI)) throw new Error(`${name}: unknown key "${ch}" in row ${String(y)}`);
      return WALD_MINI[ch];
    }),
  );
  return { name, width: c.width, height: c.height, px: px_ };
}

// ============================================================ BIEBER
// Bieber, upright on his hind legs, belly out, a flat tail propped behind him.
// 34x36 — taller than Alois (32), which is the point of him.
const BEAVER_W = 34;
const BEAVER_H = 36;

/**
 * `pose` shifts the parts that move: `lift` raises one foot, `bob` drops the
 * body a pixel on the step, `brace` is the telegraph — tail up behind him, arms
 * out, and the lean of a beaver about to do something.
 */
function beaver(name, { lift = 0, bob = 0, brace = false } = {}) {
  const c = canvas(BEAVER_W, BEAVER_H);
  const dy = bob;
  if (brace) {
    // Tail swung up high behind him — the swish, wound up.
    poly(
      c,
      [
        [22, 29],
        [25, 8],
        [32, 4],
        [33, 17],
        [28, 29],
      ],
      'b',
    );
    for (let y = 9; y < 28; y += 3) px(c, 27 + (((y / 3) | 0) % 2), y, 'c');
    for (let y = 11; y < 26; y += 4) px(c, 30, y, 'c');
  } else {
    roundRect(c, 20, 26, 13, 8, 3, 'b');
    for (let y = 27; y < 33; y += 2)
      for (let x = 22; x < 32; x += 3) px(c, x + (y % 4 ? 0 : 1), y, 'c');
  }
  ellipse(c, 14, 22 + dy, 8, 10, 'f'); // body
  ellipse(c, 12, 24 + dy, 5, 7, 'k'); // belly
  ellipse(c, 11, 8 + dy, 7, 6, 'f'); // head
  ellipse(c, 12, 6 + dy, 4, 3, 'F'); // head, lit
  ellipse(c, 8, 10 + dy, 4, 3, 'k'); // muzzle
  ellipse(c, 14, 3 + dy, 2, 2, 'f'); // ears
  ellipse(c, 7, 3 + dy, 2, 2, 'f');
  px(c, 9, 7 + dy, 'K'); // eye
  px(c, 5, 10 + dy, 'n'); // nose
  px(c, 4, 10 + dy, 'n');
  fillRect(c, 6, 13 + dy, 2, 3, 'w'); // teeth
  if (brace) {
    line(c, 8, 18 + dy, 2, 17 + dy, 'f', 3); // arms out
    line(c, 20, 18 + dy, 25, 17 + dy, 'm', 3);
  } else {
    line(c, 8, 18 + dy, 4, 24 + dy, 'f', 3);
    line(c, 20, 18 + dy, 22, 24 + dy, 'm', 3);
  }
  // A step: one foot comes up, the other takes the weight.
  roundRect(c, 7, 30 - lift + dy, 6, 4, 1, 'm');
  roundRect(c, 15, 30 + dy, 6, 4, 1, 'f');
  outline(c);
  return frame(name, c);
}

export const bieber = beaver('bieber');
export const bieberStepA = beaver('bieber-step-a', { lift: 2, bob: 1 });
export const bieberStepB = beaver('bieber-step-b', { lift: 0, bob: 1 });
export const bieberBrace = beaver('bieber-brace', { brace: true });

// ============================================================ THE LOG
// Lying along the way it travels, mossy bark with a grey cut end — the
// floor's stump (`wald-stump`) laid on its side. Four phases of a quarter turn
// about its own long axis: three bark ridges ride round it, visible only on
// the side facing the camera.
const LOG_W = 40;
const LOG_H = 20;

function rollingLog(name, phase) {
  const c = canvas(LOG_W, LOG_H);
  const cy = (LOG_H - 1) / 2;
  const radius = LOG_H / 2 - 2;
  roundRect(c, 3, 2, LOG_W - 4, LOG_H - 3, 3, 'D');
  fillRect(c, 4, 3, LOG_W - 6, 3, 'j'); // lit top
  for (let ridge = 0; ridge < 3; ridge++) {
    const angle = phase * (Math.PI / 6) + (ridge * 2 * Math.PI) / 3;
    if (Math.cos(angle) <= 0) continue; // round the back
    const y = Math.round(cy + radius * Math.sin(angle));
    line(c, 8, y, LOG_W - 4, y, 'u');
  }
  for (const [x, y] of [
    [11, 5],
    [24, 4],
    [33, 6],
  ])
    px(c, x, y + (phase % 2), 'J'); // moss
  ellipse(c, 4, cy, 3, LOG_H / 2 - 1, 's'); // cut end
  ellipse(c, 4, cy, 1.5, LOG_H / 2 - 3, 'l');
  px(c, 3, Math.round(cy), 'S');
  outline(c);
  return frame(name, c);
}

function flipFrame(name, source) {
  return {
    name,
    width: source.width,
    height: source.height,
    px: source.px.map((row) => [...row].reverse()),
  };
}

const logPhases = [0, 1, 2, 3].map((phase) =>
  rollingLog(`bieber-log-east-${String(phase)}`, phase),
);

/** Single-frame sprites, by the file they are committed as. */
export const MINIBOSSES = {};

/** Strips with a sidecar, by the file stem they are committed as. */
export const STRIPS = {
  bieber: {
    frames: [bieber, bieberStepA, bieberStepB, bieberBrace],
    anim: {
      frames: 4,
      frameDurationMs: 120,
      loop: true,
      clips: {
        idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
        move: { frames: [1, 0, 2, 0], frameDurationMs: 110, mode: 'loop' },
        telegraph: { frames: [3], frameDurationMs: 120, mode: 'loop' },
        hurt: { frames: [0], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
      },
    },
  },
  'bieber-log-east': {
    frames: logPhases,
    anim: {
      frames: 4,
      frameDurationMs: 90,
      loop: true,
      clips: {
        idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
        move: { frames: [0, 1, 2, 3], frameDurationMs: 70, mode: 'loop' },
        hurt: { frames: [0], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
      },
    },
  },
  'bieber-log-west': {
    frames: logPhases.map((source, i) => flipFrame(`bieber-log-west-${String(i)}`, source)),
    anim: {
      frames: 4,
      frameDurationMs: 90,
      loop: true,
      clips: {
        idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
        move: { frames: [0, 1, 2, 3], frameDurationMs: 70, mode: 'loop' },
        hurt: { frames: [0], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
      },
    },
  },
};

/** Throws if any painted pixel is not legal for floor-3-wald. */
export function assertOnPalette(framesIn) {
  const legal = legalPixelColorsFor(MINIBOSS_BUCKET);
  for (const f of framesIn) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const colour = f.px[y][x];
        if (colour !== null && !legal.has(colour)) {
          throw new Error(
            `${f.name}: pixel ${String(x)},${String(y)} is #${colour.toString(16).padStart(6, '0')}, ` +
              `not legal for ${MINIBOSS_BUCKET}`,
          );
        }
      }
    }
  }
}

function putFrame(pixels, stripWidth, f, ox) {
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const colour = f.px[y][x];
      if (colour === null) continue;
      const at = (y * stripWidth + ox + x) * 4;
      pixels[at] = (colour >> 16) & 0xff;
      pixels[at + 1] = (colour >> 8) & 0xff;
      pixels[at + 2] = colour & 0xff;
      pixels[at + 3] = 0xff;
    }
  }
}

/** One frame as PNG bytes. */
export function encodeSingle(f) {
  const pixels = Buffer.alloc(f.width * f.height * 4);
  putFrame(pixels, f.width, f, 0);
  return encodePng({ width: f.width, height: f.height, pixels });
}

/** A horizontal frame strip as PNG bytes (`assets/sprites/README.md` layout). */
export function encodeStrip(name, frames) {
  const first = frames[0];
  if (first === undefined) throw new Error(`${name}: no frames`);
  for (const f of frames) {
    if (f.width !== first.width || f.height !== first.height) {
      throw new Error(
        `${name}: frame ${f.name} is not ${String(first.width)}x${String(first.height)}`,
      );
    }
  }
  const width = first.width * frames.length;
  const pixels = Buffer.alloc(width * first.height * 4);
  frames.forEach((f, i) => putFrame(pixels, width, f, i * first.width));
  return encodePng({ width, height: first.height, pixels });
}

/** A strip's sidecar, as the bytes committed next to it. */
export function encodeAnim(anim) {
  return `${JSON.stringify(anim, null, 2)}\n`;
}
