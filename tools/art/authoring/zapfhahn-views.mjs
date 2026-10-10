import { blankFrame, frameFromRows, mirrored, renamed } from './views-kit.mjs';

/**
 * The Zapfhahn's three views and its pour (user-drawn art, recoloured onto
 * Der Keller's palette): a tap column on a foot, a round head with a lever,
 * and a spout off the side of the housing. It turns to whichever axis it is
 * about to spray down (`facing: 'aim'`), pulls the lever through its wind-up
 * and pours beer out of the spout while it sprays.
 *
 * Every strip shares one 36×40 canvas with the column centred on it, so the
 * body stands on its collider whichever way it faces. Frame order, by the
 * sidecar below: 0 at rest, 1 and 2 the lever going down, 3 and 4 pouring.
 */

/**
 * The colours this art uses, Der Keller's (`floor1-roster.mjs`'s `CELLAR`, which
 * imports this module and so cannot be imported back).
 */
const CELLAR = {
  '.': null,
  K: 0x000000,
  L: 0x5b5f63,
  G: 0x8a8a8a,
  b: 0x36291e,
  r: 0x72573e,
  R: 0x8f6d4e,
  A: 0xd99a3f,
  W: 0xffffff,
};

const W = 36;
const H = 40;
/** The user's drawing, spout to the right, as drawn (outline included). */
const SOURCE = [
  '........................',
  '....KKKK................',
  '...KLGGGK...KKKKKKK.KKK.',
  '..KLGGGWGKKKAAAAAAAKrRrK',
  '..KLGGGGGKLKAbbbbbAKrrRK',
  '..KLLGGGGKKKAAAAAAAKrRrK',
  '...KLLLGK...KKKKKKK.KKK.',
  '....KKKK................',
  '.....KK.................',
  '.....KK.................',
  '....KKKK................',
  '...KKKKKK...............',
  '..KKLGGGKKK.............',
  '..KKKKKKKKKKKKKKKK......',
  '..KLGGGGKLKLLLLLLKK.....',
  '..KLGGWGKLKKKKKKLGK.....',
  '..KKLGGGKKK....KGGK.....',
  '...KKLGGKK.....KKKK.....',
  '....KLLKK...............',
  '....KKKK................',
  ...Array.from({ length: 14 }, () => '....KLGK................'),
  '....KKKK................',
  '...KKKKKK...............',
  '..KKKKKKKK..............',
  '.KKLGGGGWKK.............',
  '.KLLGGGGGGK.............',
  'KKKKKKKKKKKK............',
];
/** Columns the drawing is moved right by, so its column (source x 4..7) sits mid-canvas. */
const OFFSET = 12;
/** Where the lever turns: the joint between the head and the bar. */
const PIVOT = [22, 4];
/** Lever angles, radians downward from level, for the rest pose and the two pull frames. */
const LEVER_ANGLES = [0, 0.35, 0.7];

const K = CELLAR.K;
const A = CELLAR.A;
const WH = CELLAR.W;

const sourceFrame = frameFromRows('zapfhahn-source', CELLAR, SOURCE, { ink: false });

function place(frame, name) {
  const out = blankFrame(name, W, H);
  frame.px.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c !== null) out.px[y][x + OFFSET] = c;
    }),
  );
  return out;
}

const set = (f, x, y, c) => {
  if (x >= 0 && y >= 0 && x < f.width && y < f.height) f.px[y][x] = c;
};

/** Paint text rows onto `f` with their top-left at (`ox`, `oy`); `.` leaves what is there. */
function stamp(f, ox, oy, rows) {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== '.') set(f, ox + x, oy + y, CELLAR[ch]);
    }),
  );
}

/* ------------------------------------------------------------------- side */

/** Distance from (`px`, `py`) to the segment (`ax`, `ay`)–(`bx`, `by`). */
function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
}

/**
 * The side view with its lever turned `angle` down about `PIVOT`. The level
 * pose is the drawing itself; a turned one is redrawn as the same bar (amber,
 * brown inlay, ink edge) and knob, so the pull reads as one solid handle
 * rather than a rotated, broken-up copy.
 */
function sideLever(name, angle) {
  const out = place(sourceFrame, name);
  if (angle === 0) return out;
  for (let y = 2; y <= 6; y++) for (let x = PIVOT[0] + 2; x < W; x++) out.px[y][x] = null;
  const at = (r) => [PIVOT[0] + r * Math.cos(angle), PIVOT[1] + r * Math.sin(angle)];
  const [ax, ay] = at(2);
  const [bx, by] = at(8.5);
  const [kx, ky] = at(11);
  for (let y = 0; y < H; y++) {
    for (let x = PIVOT[0] + 1; x < W; x++) {
      const knob = Math.hypot(x - kx, y - ky);
      const bar = segmentDistance(x, y, ax, ay, bx, by);
      let c = null;
      if (knob <= 1.6) c = x - kx + (y - ky) < -0.5 ? CELLAR.R : CELLAR.r;
      else if (bar <= 0.55) c = CELLAR.b;
      else if (bar <= 1.45 && knob > 2.4) c = A;
      else if (bar <= 2.2 || knob <= 2.5) c = K;
      if (c !== null) out.px[y][x] = c;
    }
  }
  return out;
}

/** The spout's mouth in canvas pixels: the two-wide opening the beer leaves by. */
const SIDE_MOUTH = [28, 18];

/** A stream `len` rows long falling from (`x`, `y`), two wide, inked down both sides, with drops `drops` rows below its top. */
function pour(f, x, y, len, drops) {
  for (let i = 0; i < len; i++) {
    set(f, x - 1, y + i, K);
    set(f, x, y + i, A);
    set(f, x + 1, y + i, A);
    set(f, x + 2, y + i, K);
  }
  set(f, x, y, WH);
  for (let i = -1; i <= 2; i++) set(f, x + i, y + len, K);
  for (const d of drops) stamp(f, x - 1, y + d, ['.KK.', 'KAAK', '.KK.']);
}

const POUR = [
  { len: 10, drops: [12, 18] },
  { len: 7, drops: [9, 15] },
];

/** The front pour, shorter: it falls in front of the column and must land above the foot. */
const POUR_FRONT = [
  { len: 5, drops: [7] },
  { len: 3, drops: [5, 9] },
];

function sideStrip() {
  const frames = LEVER_ANGLES.map((a, i) => sideLever(`zapfhahn-side-${String(i)}`, a));
  POUR.forEach(({ len, drops }, i) => {
    const f = sideLever(`zapfhahn-side-${String(3 + i)}`, LEVER_ANGLES[2]);
    pour(f, SIDE_MOUTH[0], SIDE_MOUTH[1], len, drops);
    frames.push(f);
  });
  // drawn spout-right; the side strip is authored facing left
  return frames.map((f) => mirrored(f));
}

/* ----------------------------------------------------------- front / back */

/** The column, head and foot without the spout arm or the lever: what both end-on views share. */
function endOn(name) {
  const f = place(sourceFrame, name);
  for (let y = 0; y < H; y++) {
    for (let x = OFFSET + 10; x < W; x++) f.px[y][x] = null;
  }
  // close the housing and the head where the arm and the lever left them open
  for (let y = 12; y <= 16; y++) set(f, OFFSET + 9, y, K);
  for (let y = 3; y <= 5; y++) set(f, OFFSET + 9, y, K);
  set(f, OFFSET + 8, 4, CELLAR.G);
  return f;
}

/** The lever's knob seen end-on, pulled down `step` (0 rest, 1, 2) toward the viewer. */
function frontKnob(f, step) {
  const top = 2 + step * 2;
  // the bar, foreshortened, from the head's middle down to the knob
  for (let y = 4; y < top; y++) stamp(f, 16, y, ['KAAK']);
  stamp(f, 15, top, ['.KKKK.', 'KrRrrK', 'KRrrrK', 'KrrrrK', '.KKKK.']);
}

/** The spout pointing at the viewer: its mouth hangs in front of the column under the housing. */
function frontSpout(f) {
  stamp(f, 15, 18, ['KKKKKK', 'KLGGGK', 'KLGWGK', 'KKLGKK', '.KKKK.']);
}

function frontStrip() {
  const frames = [];
  for (let i = 0; i < 5; i++) {
    const f = endOn(`zapfhahn-south-${String(i)}`);
    frontSpout(f);
    frontKnob(f, Math.min(i, 2));
    if (i >= 3) {
      const { len, drops } = POUR_FRONT[i - 3];
      pour(f, 17, 23, len, drops);
    }
    frames.push(f);
  }
  return frames;
}

/** From behind the spout is hidden by the housing; the lever shows only as it tips back over the head. */
function backStrip() {
  const frames = [];
  for (let i = 0; i < 5; i++) {
    const f = endOn(`zapfhahn-north-${String(i)}`);
    const step = Math.min(i, 2);
    if (step > 0) {
      // the knob rising over the head's rim as the far end of the lever comes up
      stamp(f, 15, 2 - step, ['.KKKK.', 'KrRrrK', '.KKKK.']);
    }
    if (i >= 3) {
      // beer splashing out either side of the column below the hidden spout
      const d = i === 3 ? 0 : 3;
      stamp(f, 13, 22 + d, ['.KK.', 'KAAK', '.KK.']);
      stamp(f, 19, 25 - d, ['.KK.', 'KAAK', '.KK.']);
      stamp(f, 14, 31 + d, ['KK', 'AK', 'KK']);
      stamp(f, 20, 33 - d, ['KK', 'KA', 'KK']);
    }
    frames.push(f);
  }
  return frames;
}

export const ZAPFHAHN_STRIPS = {
  'zapfhahn-side': sideStrip(),
  'zapfhahn-south': frontStrip(),
  'zapfhahn-north': backStrip(),
};

/** The rest pose, side-on — what the single `zapfhahn.png` is. */
export const zapfhahnRest = renamed(ZAPFHAHN_STRIPS['zapfhahn-side'][0], 'zapfhahn');

/**
 * Lever down through the wind-up (held on its last frame — the telegraph clip
 * is `once`), the pour looping while the spray state lasts.
 */
export const ZAPFHAHN_ANIM = {
  frames: 5,
  frameDurationMs: 120,
  loop: true,
  clips: {
    idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
    move: { frames: [0], frameDurationMs: 400, mode: 'loop' },
    telegraph: { frames: [0, 1, 2], frameDurationMs: 160, mode: 'once' },
    attack: { frames: [3, 4], frameDurationMs: 90, mode: 'loop' },
    hurt: { frames: [1], frameDurationMs: 120, mode: 'once', onEnd: 'idle' },
  },
};
