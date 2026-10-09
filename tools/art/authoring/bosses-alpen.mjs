import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { legalPixelColorsFor } from '../palette.mjs';
import { composeFrame, cutParts, loadKeyArt, mapping, pixelPart, touchUp } from './boss-rig.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Die Alpen's boss, The First Human (#437, #40): the man out of the glacier as
 * the museum shows him — dried tan-orange skin drawn tight over the ribs, a bald
 * skull-faced head with the mouth open, thin withered limbs — cut into a rig
 * from his own key art (`keyart/the-first-human-o1.png`, option O1 from the
 * ComfyUI key-art bench, signed off by Tilo) the way the Stier's is
 * (`docs/BOSS_SPRITES.md`; this is its §10).
 *
 * **One view, no left or right.** He is drawn standing, seen from the front,
 * and `facing: 'fixed'` keeps the renderer from mirroring him toward the player.
 * What turns him is the *sweep*: the renderer mirrors the art to the stance of
 * the swing it is about to make (`enemySweepDirection`), so the pendulum reads
 * as his arms swinging from one known-for pose to the other, not as him
 * turning. The art as authored is the clockwise stance; the counter-clockwise
 * one is the same frames mirrored.
 *
 * Phase two (#437) is the same rig with the arrowhead stuck to his forehead
 * and his eyes open red: `eyes` 1 is the dull red glow, 2 the burning one with
 * its halo (the telegraph frames), `0` is phase one's closed, dark sockets.
 *
 * Twelve frames, `docs/BOSS_SPRITES.md` §0's order:
 *
 *   0-1 idle · 2-5 move · 6-7 telegraph · 8 hurt · 9-11 death · 12-13 sweep (the `attack` clip)
 */

const BUCKET = 'floor-4-alpen';
const KEY_ART = path.join(HERE, 'keyart/the-first-human-o1.png');

const W = 96,
  H = 108;

/** Source pixels (key art 832×1216) → sprite pixels: the figure, ~0.08 sprite px per source px, standing on the bottom rows. */
const MAP = mapping({ scale: 0.08, originX: 530, originY: 1188, dstX: 48, dstY: 106 });

const hex = (n) => n;
const SKIN = {
  // Deep shadow and the gaps between the ribs, then the leathery orange and its lights.
  tones: [hex(0x494451), hex(0xd99940), hex(0xe0ae66), hex(0xe8c28c)],
  cuts: [0.15, 0.48, 0.83],
};
/** Limbs: no dark band — the shadows between the bones are drawn on the torso, and a leg that is half shadow reads as dirt. */
const LIMB = {
  tones: [hex(0xd99940), hex(0xe0ae66), hex(0xe8c28c)],
  cuts: [0.42, 0.8],
};
const SKIN_LIGHT = {
  tones: [hex(0x494451), hex(0xd99940), hex(0xe0ae66), hex(0xe8c28c), hex(0xf0d6b2)],
  cuts: [0.1, 0.4, 0.72, 0.92],
};

for (const colour of [...SKIN.tones, ...SKIN_LIGHT.tones, 0xd8476b, 0xe893a8, 0xf8dfe5, 0xffffff]) {
  if (!legalPixelColorsFor(BUCKET).has(colour)) {
    throw new Error(`bosses-alpen colour #${colour.toString(16)} is not legal for ${BUCKET}`);
  }
}

// ------------------------------------------------------------- the parts
// Polygons are in key-art pixels; the key art's alpha already removes the room
// behind him, so a polygon only has to separate one part from the next.
const SPECS = {
  legFar: {
    polygon: [
      [438, 505],
      [472, 480],
      [515, 500],
      [505, 560],
      [502, 640],
      [512, 720],
      [524, 790],
      [526, 880],
      [516, 960],
      [518, 1030],
      [516, 1100],
      [498, 1135],
      [455, 1135],
      [450, 1105],
      [466, 1060],
      [476, 990],
      [470, 900],
      [460, 820],
      [440, 740],
      [430, 640],
    ],
    pivot: [478, 505],
    material: LIMB,
    coverage: 0.4,
  },
  legNear: {
    polygon: [
      [548, 515],
      [602, 505],
      [610, 560],
      [608, 660],
      [604, 780],
      [596, 880],
      [588, 960],
      [578, 1040],
      [580, 1120],
      [570, 1190],
      [512, 1192],
      [514, 1130],
      [526, 1060],
      [536, 980],
      [532, 900],
      [538, 820],
      [540, 740],
      [544, 640],
    ],
    pivot: [575, 505],
    material: LIMB,
    coverage: 0.4,
  },
  armDown: {
    polygon: [
      [418, 262],
      [440, 236],
      [472, 244],
      [476, 290],
      [460, 332],
      [440, 372],
      [400, 408],
      [348, 432],
      [312, 462],
      [300, 505],
      [316, 550],
      [290, 566],
      [252, 560],
      [236, 536],
      [244, 506],
      [262, 478],
      [320, 418],
      [384, 356],
      [404, 300],
    ],
    pivot: [446, 256],
    material: LIMB,
    coverage: 0.35,
  },
  body: {
    polygon: [
      [418, 262],
      [455, 224],
      [520, 205],
      [600, 198],
      [645, 212],
      [668, 250],
      [648, 300],
      [628, 360],
      [616, 405],
      [606, 430],
      [612, 470],
      [606, 545],
      [500, 552],
      [446, 520],
      [436, 470],
      [470, 428],
      [505, 404],
      [462, 384],
      [430, 336],
      [412, 296],
    ],
    pivot: [525, 480],
    material: SKIN,
    coverage: 0.4,
    blur: 0,
  },
  armUp: {
    polygon: [
      [165, 95],
      [180, 62],
      [235, 55],
      [280, 78],
      [310, 96],
      [390, 130],
      [460, 160],
      [520, 185],
      [585, 196],
      [645, 202],
      [672, 226],
      [668, 252],
      [640, 268],
      [560, 266],
      [470, 254],
      [438, 228],
      [392, 198],
      [322, 163],
      [258, 142],
      [205, 132],
      [168, 114],
    ],
    pivot: [640, 238],
    material: LIMB,
    coverage: 0.35,
  },
};

const ART = loadKeyArt(KEY_ART);
const PARTS = cutParts(ART, MAP, SPECS);

/**
 * The skull is cut at half again the body's scale and drawn that much bigger: at
 * the body's ~0.08 it is nine pixels across and a face cannot live there, and a
 * large skull on a thin frame is also the silhouette the museum's body has. Its
 * neck sits where the body's does.
 */
const NECK_SRC = [560, 205];
const NECK = MAP.toSprite(...NECK_SRC);
const HEAD_MAP = mapping({
  scale: 0.125,
  originX: NECK_SRC[0],
  originY: NECK_SRC[1],
  dstX: NECK[0],
  dstY: NECK[1],
});
PARTS.head = {
  ...cutParts(ART, HEAD_MAP, {
    head: {
      polygon: [
        [495, 100],
        [505, 60],
        [545, 38],
        [600, 38],
        [635, 70],
        [645, 130],
        [630, 172],
        [605, 200],
        [560, 208],
        [520, 188],
        [500, 150],
      ],
      pivot: NECK_SRC,
      material: SKIN_LIGHT,
      coverage: 0.4,
      blur: 0,
    },
  }).head,
};
const headAt = (x, y) => HEAD_MAP.toSprite(x, y).map(Math.round);
const DARK = 0x332f38;
const BONE = 0xf7ebd9;

{
  // The face, drawn on the cut skull: two deep sockets, the nasal slit, a dark mouth with teeth.
  const dots = [];
  const blob = (cx, cy, rx, ry, colour) => {
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++)
        if ((x * x) / (rx * rx + 0.25) + (y * y) / (ry * ry + 0.25) <= 1.05)
          dots.push([cx + x, cy + y, colour]);
  };
  const [lx, ly] = headAt(550, 124);
  const [rx, ry] = headAt(598, 124);
  const [nx, ny] = headAt(574, 154);
  const [mx, my] = headAt(578, 184);
  blob(lx, ly, 2, 2, DARK);
  blob(rx, ry, 2, 2, DARK);
  dots.push([nx, ny, DARK], [nx, ny + 1, DARK]);
  for (let x = -2; x <= 2; x++)
    dots.push([mx + x, my, DARK], [mx + x, my + 1, x % 2 === 0 ? BONE : DARK]);
  touchUp(PARTS.head, dots);
}

{
  // The ribs, drawn on the cut torso: arcs of shadow with the sternum left open.
  const dots = [];
  const [x0, y0] = MAP.toSprite(438, 246);
  const [x1] = MAP.toSprite(640, 246);
  const left = Math.round(x0) + 1;
  const right = Math.round(x1) - 1;
  const mid = Math.round((left + right) / 2) + 1;
  for (let i = 0; i < 5; i++) {
    const y = Math.round(y0) + 3 + i * 2;
    const inset = i === 0 ? 3 : i === 4 ? 2 : 0;
    for (let x = left + inset; x <= right - inset; x++) {
      if (Math.abs(x - mid) <= 1) continue;
      // the rib drops a pixel toward the spine and rises toward the sternum
      const sag = Math.abs(x - mid) > (right - left) / 3 ? 1 : 0;
      dots.push([x, y + sag, 0x494451]);
    }
  }
  touchUp(PARTS.body, dots);
}

// The eyes (phase two): where the sockets are in the cut head, in sprite pixels.
const [EYE_L_X, EYE_L_Y] = headAt(550, 124);
const [EYE_R_X, EYE_R_Y] = headAt(598, 124);
const [ARROW_X, ARROW_Y] = headAt(574, 56);

/** Phase two's face: red eyes opening (`level` 1 dull, 2 burning with a halo), the arrowhead stuck to the forehead. */
function phaseTwoFace(level) {
  const RED = 0xd8476b;
  const eye = (cx, cy) => {
    const list = [];
    if (level >= 2) {
      // The aura: a pink glow ringed round the burning eye.
      for (let y = -3; y <= 3; y++)
        for (let x = -4; x <= 4; x++) {
          const d = (x * x) / 16 + (y * y) / 9;
          if (d > 0.55 && d <= 1) list.push([cx + x, cy + y, 0xe893a8]);
        }
    }
    // Slit pupils burning red, white-hot in the middle when the eyes are charged.
    for (let x = -2; x <= 2; x++) for (let y = -1; y <= 1; y++) list.push([cx + x, cy + y, RED]);
    if (level >= 2) for (let x = -1; x <= 1; x++) list.push([cx + x, cy, 0xf8dfe5]);
    return list;
  };
  const arrow = [
    [ARROW_X, ARROW_Y - 3, 0xe893a8],
    [ARROW_X, ARROW_Y - 2, 0xf8dfe5],
    [ARROW_X - 1, ARROW_Y - 1, 0xe893a8],
    [ARROW_X, ARROW_Y - 1, 0xf8dfe5],
    [ARROW_X + 1, ARROW_Y - 1, 0xe893a8],
    [ARROW_X, ARROW_Y, 0xd8476b],
  ];
  return pixelPart('phase-two-face', [
    ...eye(EYE_L_X, EYE_L_Y),
    ...eye(EYE_R_X, EYE_R_Y),
    ...arrow,
  ]);
}

const HIP = MAP.toSprite(525, 480);
const FEET = [48, H - 2];

// ----------------------------------------------------------------- poses
/**
 * One pose. `bob` lifts the body; `lean` tips everything above the hips
 * (positive: toward the right of the frame); `head` nods at the neck; `armUp`
 * swings the raised arm at its shoulder (positive: clockwise, i.e. lowering it
 * toward the chest); `armDown` likewise for the hanging one; `leg`/`farLeg`
 * swing at the hip; `legDy` drops the legs with a collapsing body; `tint` is the
 * hurt flash; `fall` is a whole-body rotation about the feet, with `dx`/`dy`.
 */
function pose(name, o = {}, { eyes = 0 } = {}) {
  const t = o.tint ?? 0;
  const bob = o.bob ?? 0;
  const lean = o.lean ?? 0;
  const upper = { dy: bob, rotate: lean, pivot: HIP, tint: t };
  const lay = (part, extra = {}) => ({ part, pivot: part.pivot, tint: t, ...extra });
  const placements = [
    lay(PARTS.legFar, { dy: o.legDy ?? 0, rotate: o.farLeg ?? 0, tint: t - 1 }),
    lay(PARTS.legNear, { dy: o.legDy ?? 0, rotate: o.leg ?? 0 }),
    lay(PARTS.armDown, { ...upper, pivot: PARTS.armDown.pivot, rotate: lean + (o.armDown ?? 0) }),
    lay(PARTS.body, upper),
    lay(PARTS.head, { dy: bob, rotate: lean + (o.head ?? 0), pivot: NECK }),
    lay(PARTS.armUp, { ...upper, pivot: PARTS.armUp.pivot, rotate: lean + (o.armUp ?? 0) }),
  ];
  if (eyes > 0) {
    placements.push({
      part: phaseTwoFace(eyes),
      dy: bob,
      rotate: lean + (o.head ?? 0),
      pivot: NECK,
      tint: 0,
      ink: false,
    });
  }
  return composeFrame(
    name,
    W,
    H,
    placements,
    { rotate: o.fall ?? 0, dx: o.dx ?? 0, dy: o.dy ?? 0, pivot: FEET },
    BUCKET,
  );
}

/**
 * The twelve poses, built twice: phase one with the eyes shut, and phase two
 * (#437, `phaseArtBelow`) with the arrowhead on his forehead and the eyes open —
 * dull in the walking frames, burning in the telegraph ones.
 */
function frames(phaseTwo) {
  const e = (level) => (phaseTwo ? { eyes: level } : { eyes: 0 });
  const p = (name, o, level = 1) => pose(phaseTwo ? `${name}-phase-two` : name, o, e(level));
  return [
    // idle: a breath, the raised arm drifting.
    p('human-idle-a', {}),
    p('human-idle-b', { bob: 1, armUp: 2, head: 1 }),
    // move: a slow stride — the sim adds the stops that make it jerky.
    p('human-move-1', { leg: 12, farLeg: -12, armUp: 1 }),
    p('human-move-2', { leg: 4, farLeg: -4, bob: -1, armUp: 0 }),
    p('human-move-3', { leg: -12, farLeg: 12, armUp: -1 }),
    p('human-move-4', { leg: -4, farLeg: 4, bob: -1, armUp: 0 }),
    // telegraph: the raised arm lifted and drawn back for the sweep, the body leaning into it.
    p('human-telegraph-a', { armUp: 12, lean: -2, head: -3, armDown: 5 }, 2),
    p('human-telegraph-b', { armUp: 26, lean: -4, head: -5, armDown: 9 }, 2),
    // hurt: knocked back, the arm dropped, a shade lighter.
    p('human-hurt', { tint: 1, lean: 5, head: 8, armUp: -10, armDown: -6 }),
    // death: the knees go, he folds, he lies on his back in the snow.
    p('human-death-1', { leg: 5, farLeg: 3, lean: 7, head: 10, armUp: -12, dy: 3, legDy: 1 }),
    p('human-death-2', { leg: 12, farLeg: 9, lean: 16, head: 16, armUp: -22, dy: 8, legDy: 2 }),
    p(
      'human-death-3',
      { leg: 6, farLeg: 10, lean: 4, head: 12, armUp: -26, fall: 86, dx: -34, dy: 1 },
      0,
    ),
    // sweep: the half circle the arms travel to the other side — the mid-swing, then the top of it. The
    // rest of the swing is the stance (frame 0) and its mirror, which the renderer flips half way through.
    p('human-sweep-mid', { armUp: 42, armDown: 50, lean: -3, head: -4 }),
    p('human-sweep-top', { armUp: 84, armDown: 105, lean: -5, head: -6 }),
  ];
}

export const FIRST_HUMAN_FRAMES = frames(false);
export const FIRST_HUMAN_PHASE_TWO_FRAMES = frames(true);

// Fixing a stray pixel or two is `touchUp`'s job; there are none yet.

/** What `bosses.mjs` merges into its `STRIPS`. */
export const ALPEN_FRAMES = {
  'the-first-human': FIRST_HUMAN_FRAMES,
  'the-first-human-phase-two': FIRST_HUMAN_PHASE_TWO_FRAMES,
};
