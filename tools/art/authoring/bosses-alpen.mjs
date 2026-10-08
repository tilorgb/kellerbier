import { legalPixelColorsFor } from '../palette.mjs';
import { composeFrame, drawnPart } from './boss-rig.mjs';

/**
 * Die Alpen's boss, The First Human (#437, #40): a man five thousand winters
 * out of the glacier — bearskin cap, a cape of plaited grass over a coat of
 * alternating goat-hide strips, leather leggings with the tattoo lines on the
 * calves, grass-stuffed shoes, and the flint arrowhead still in his back
 * shoulder. Authored as hand-drawn parts (`drawnPart`) posed through
 * `composeFrame`, the way `bosses.mjs`'s Maibaum-Dieb is hand-drawn rather
 * than cut from key art: there is no signed-off postcard for him yet, and
 * `CLAUDE.md`'s cloud track for pixel art is programmatic block art. When
 * key art lands (`docs/BOSS_SPRITES.md` §1), this becomes a rig cut from it
 * the way the Stier's is; the poses and the canvas carry over.
 *
 * **Canvas 80×80** — about two and a half Alois (32×32), the size #437 asks
 * for — facing left, feet on the bottom rows (`docs/DECISIONS.md` #56).
 * Pending sign-off like every size and design choice.
 *
 * The stance is the fight: one arm folded across the chest, the other held
 * out — Ötzi's. The telegraph frames pull the held-out arm up and back,
 * which is where the `fireSweep` arm starts from; the sweep itself is the
 * shots, not the sprite.
 *
 * Twelve frames, `docs/BOSS_SPRITES.md` §0's order:
 *
 *   0-1 idle · 2-5 move · 6-7 telegraph · 8 hurt · 9-11 death
 */

const BUCKET = 'floor-4-alpen';

const C = {
  K: 0x000000, // ink
  a: 0x1c1a1f, // bearskin cap, iris
  b: 0x332f38, // cap, lit
  c: 0x494451, // beard
  L: 0xd99940, // leather: skin, leggings
  l: 0xe0ae66, // leather, lit
  m: 0xe8c28c, // leather highlight
  n: 0x44484f, // hide strip, dark
  o: 0x595f67, // fur sleeve
  p: 0x6e7680, // fur sleeve, lit
  q: 0x858d96, // hide strip, light
  g: 0xa1a1a1, // grass cape
  h: 0xb8b8b8,
  i: 0xd1d1d1,
  u: 0xeef2f5, // frost
  t: 0xd1dce4,
  R: 0xe893a8, // flint
  P: 0xd8476b, // the wound
  D: 0x274b6b, // tattoo lines
  W: 0xffffff, // eye
};
for (const [key, colour] of Object.entries(C)) {
  if (!legalPixelColorsFor(BUCKET).has(colour)) {
    throw new Error(`bosses-alpen key ${key} is #${colour.toString(16)}, not legal for ${BUCKET}`);
  }
}

const W = 80,
  H = 80;

// ----------------------------------------------------------------- parts
/** A blank part `w`×`h` with its top-left at sprite `(ox, oy)`, painted through `set`. */
function blank(name, w, h, ox, oy) {
  const px = Array.from({ length: h }, () => Array.from({ length: w }, () => null));
  const part = { name, w, h, px, ox, oy };
  part.set = (x, y, colour) => {
    if (x >= 0 && y >= 0 && x < w && y < h) px[y][x] = colour;
  };
  part.rect = (x, y, rw, rh, colour) => {
    for (let yy = y; yy < y + rh; yy++)
      for (let xx = x; xx < x + rw; xx++) part.set(xx, yy, colour);
  };
  return part;
}

// Head, 16×18 at (27, 6). Face left: the eye and the nose on the left edge,
// the cap's fur rolled over the brow, the beard hanging under it.
// prettier-ignore
const HEAD = drawnPart('head', [
  '....aaaaaaaa....',
  '..aaaabbbbaaaa..',
  '.aabbbbbbbbbbaa.',
  '.abbbubbbbbbbba.',
  'aabbbbbbbbbbbbaa',
  'aabbbbbbbbbbbbaa',
  '.llLLLLLLLLLLLb.',
  '.lLLLLLLLLLLLLb.',
  '.WaLLLLLLLLLLb..',
  '.lLLLLLLLLLLLb..',
  'lLLLLLLLLLLLLb..',
  '.LLccLLLLLLLb...',
  '.cccccLLLLccb...',
  '.ccccccccccbb...',
  '..cccccccccb....',
  '..cbcccccbb.....',
  '...ccccccb......',
  '....cccc........',
], C, 27, 6);

/** The grass cape over the shoulders: plaited straw in vertical strands, fringed, a line of frost along the top. */
function cape() {
  const part = blank('cape', 30, 11, 23, 22);
  for (let x = 0; x < 30; x++) {
    const strand = [C.g, C.h, C.i, C.h][x % 4];
    const top = x < 3 || x > 26 ? 2 : x < 6 || x > 23 ? 1 : 0;
    const bottom = 9 + (x % 3 === 1 ? 1 : 0) - (x < 2 || x > 27 ? 2 : 0);
    for (let y = top; y <= bottom; y++) part.set(x, y, strand);
  }
  // Frost settled along the top of the cape.
  for (const x of [6, 7, 10, 14, 15, 19, 23]) part.set(x, 0, C.u);
  return part;
}

/** The coat: alternating dark and light strips of goat hide, a leather belt. */
function torso() {
  const part = blank('torso', 22, 26, 29, 29);
  for (let x = 0; x < 22; x++) {
    const strip = Math.floor(x / 4) % 2 === 0 ? C.n : C.q;
    const inset = x === 0 || x === 21 ? 1 : 0;
    for (let y = inset; y < 24 - inset; y++) part.set(x, y, strip);
    if (x % 4 === 3) for (let y = 1; y < 23; y += 3) part.set(x, y, C.o); // the stitching between strips
  }
  part.rect(0, 22, 22, 3, C.L); // belt
  for (let x = 2; x < 22; x += 5) part.set(x, 23, C.l);
  return part;
}

/** The arm held out (the far arm): fur sleeve, leather hand, a flint flake in it. Pivot: the shoulder. */
function armOut() {
  const part = blank('arm-out', 25, 7, 7, 30);
  part.rect(5, 1, 20, 5, C.o);
  part.rect(5, 1, 20, 1, C.p);
  part.rect(5, 5, 20, 1, C.n);
  part.rect(1, 1, 5, 5, C.L); // hand
  part.rect(2, 1, 3, 1, C.l);
  part.set(0, 2, C.R); // the flint between the fingers
  part.set(0, 3, C.R);
  part.set(1, 3, C.t);
  part.pivot = [31, 33];
  return part;
}

/** The arm folded across the chest (the near arm). Pivot: its own shoulder, at the back. */
function armCross() {
  const part = blank('arm-cross', 21, 7, 28, 33);
  part.rect(5, 1, 16, 5, C.o);
  part.rect(5, 1, 16, 1, C.p);
  part.rect(5, 5, 16, 1, C.n);
  part.rect(0, 1, 6, 5, C.L); // hand, over the far shoulder
  part.rect(1, 1, 3, 1, C.l);
  part.pivot = [48, 36];
  return part;
}

/** A leg: leather leggings, the tattoo lines on the calf, a grass-stuffed fur shoe that reaches forward. Pivot: the hip. */
function leg(name, ox) {
  const part = blank(name, 12, 27, ox, 52);
  part.rect(3, 0, 9, 21, C.L);
  part.rect(4, 0, 2, 20, C.l);
  for (const y of [12, 14, 16]) part.rect(5, y, 6, 1, C.D); // the tattoos
  // The shoe: fur, with the straw showing at the toe.
  part.rect(1, 21, 11, 5, C.o);
  part.rect(1, 21, 11, 1, C.p);
  part.rect(0, 23, 3, 3, C.h);
  part.set(0, 22, C.i);
  part.pivot = [ox + 7, 53];
  return part;
}

/** The arrowhead in his back shoulder, the shaft long broken off. */
// prettier-ignore
const ARROWHEAD = drawnPart('arrowhead', [
  '..RL',
  '.PRL',
  'PP..',
], C, 49, 28);

const CAPE = cape();
const TORSO = torso();
const ARM_OUT = armOut();
const ARM_CROSS = armCross();
const LEG_NEAR = leg('leg-near', 36);
const LEG_FAR = leg('leg-far', 31);

const HIP = [40, 53];
const NECK = [35, 24];
const FEET = [40, 78];

// ----------------------------------------------------------------- poses
/**
 * One pose. `bob` lifts the body; `lean` tips everything above the hips
 * (positive: back, away from the way he faces); `head` adds a nod at the
 * neck; `armOut` swings the held-out arm at the shoulder (positive lifts
 * it); `armCross` likewise for the folded one; `leg`/`farLeg` swing at the
 * hip; `legDy` drops the legs with a collapsing body; `tint` is the hurt
 * flash; `fall` is a whole-body rotation about the feet, with `dx`/`dy`.
 */
function pose(name, o = {}) {
  const t = o.tint ?? 0;
  const bob = o.bob ?? 0;
  const lean = o.lean ?? 0;
  const upper = { dy: bob, rotate: lean, pivot: HIP, tint: t };
  const lay = (part, extra = {}) => ({ part, pivot: part.pivot, tint: t, ...extra });
  return composeFrame(
    name,
    W,
    H,
    [
      lay(LEG_FAR, { dx: -1, dy: (o.legDy ?? 0) - 1, rotate: o.farLeg ?? 0, tint: t - 1 }),
      lay(LEG_NEAR, { dy: o.legDy ?? 0, rotate: o.leg ?? 0 }),
      lay(ARM_OUT, { ...upper, pivot: ARM_OUT.pivot, rotate: lean + (o.armOut ?? -6) }),
      lay(TORSO, upper),
      lay(CAPE, upper),
      lay(HEAD, { dy: bob, rotate: lean + (o.head ?? 0), pivot: NECK }),
      lay(ARM_CROSS, { ...upper, pivot: ARM_CROSS.pivot, rotate: lean + (o.armCross ?? 18) }),
      lay(ARROWHEAD, { ...upper, ink: false }),
    ],
    { rotate: o.fall ?? 0, dx: o.dx ?? 0, dy: o.dy ?? 0, pivot: FEET },
    BUCKET,
  );
}

export const FIRST_HUMAN_FRAMES = [
  // idle: a breath, the held-out arm drifting.
  pose('human-idle-a'),
  pose('human-idle-b', { bob: 1, armOut: -9, head: 2 }),
  // move: a slow stride — the sim adds the stops that make it jerky.
  pose('human-move-1', { leg: 17, farLeg: -17, armOut: -2 }),
  pose('human-move-2', { leg: 5, farLeg: -5, bob: -1, armOut: -6 }),
  pose('human-move-3', { leg: -17, farLeg: 17, armOut: -10 }),
  pose('human-move-4', { leg: -5, farLeg: 5, bob: -1, armOut: -6 }),
  // telegraph: the arm pulled up and back for the sweep, the body leaning into it.
  pose('human-telegraph-a', { armOut: 48, lean: -5, head: -4, armCross: 26 }),
  pose('human-telegraph-b', { armOut: 74, lean: -9, head: -7, armCross: 32 }),
  // hurt: knocked back, a shade lighter.
  pose('human-hurt', { tint: 1, lean: 9, head: 10, armOut: -18, armCross: 8 }),
  // death: the knees go, he folds, he lies on his back in the snow.
  pose('human-death-1', { leg: 28, farLeg: 24, lean: 8, head: 8, armOut: -30, dy: 5, legDy: 3 }),
  pose('human-death-2', {
    leg: 52,
    farLeg: 48,
    lean: 26,
    head: 22,
    armOut: -58,
    armCross: -10,
    dy: 12,
    legDy: 4,
  }),
  pose('human-death-3', {
    leg: 14,
    farLeg: 22,
    lean: 4,
    head: 12,
    armOut: -70,
    armCross: 30,
    fall: 86,
    dx: -46,
    dy: 1,
  }),
];

/** What `bosses.mjs` merges into its `STRIPS`. */
export const ALPEN_FRAMES = { 'the-first-human': FIRST_HUMAN_FRAMES };
