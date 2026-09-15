import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';
import { loadKeyArt, mapping, cutPart, drawnPart, pixelPart, composeFrame } from './boss-rig.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEY_ART = path.join(HERE, '../../../assets/art/bosses');

/**
 * Die Große Kellerassel, Der Stier and the Maibaum-Dieb, as frame lists.
 *
 * The two big bosses are **cel-traced rigs** (`./boss-rig.mjs`, `docs/
 * DECISIONS.md` #102): the boss's own signed-off key art in
 * `assets/art/bosses/` is cut along hand-placed polygons into a body, a head,
 * legs, a tail or a pair of feelers; each part is downscaled straight to the
 * sprite's canvas, flattened to two to four tones of one legal palette
 * material, given its own ink edge, and re-posed per frame — legs swing at
 * the hip, the head drops at the neck, the body squashes on planted feet.
 * That is what makes the sprite both *recognisably the postcard* (its
 * shapes and colour placement are the illustration's) and *a game
 * character* (flat ink-outlined fills like the rest of the roster, and a
 * real walk cycle, telegraph, flinch and death instead of one raster
 * warped about). #100/#101's "cut out the picture and pixelate it"
 * technique is gone: its output read as a photograph, not a creature, and a
 * single frozen raster had nothing to articulate.
 *
 * The Maibaum-Dieb (#199) is small enough to stay hand-drawn as pixel grids,
 * the way `alois.mjs` does its heads — the right tool for a 24×34 face.
 *
 * Everything is authored **facing left** (`render/animation/state.ts`'s
 * `AUTHORED_FACING`); the engine mirrors it when the body moves right.
 * Ground contact is on the canvas's bottom rows (`docs/DECISIONS.md` #56).
 *
 * Frame order is what each boss's `.anim.json` indexes by position:
 *
 *   0 idle-a · 1 idle-b · 2-5 walk · 6-7 telegraph · 8 hurt · 9-11 death
 *
 * `npm run art:bosses` writes the strips; `tests/art/boss-authoring.test.ts`
 * re-encodes and compares byte for byte.
 */

// ----------------------------------------------------------------- palettes
// Every value below is a real shade of its floor's legal set
// (`tools/art/palette.mjs`'s `legalPixelColorsFor`), checked at import.
const CELLAR = {
  K: 0x000000, // outline ink
  x: 0x1c1a1f, // deepest shadow (the underbody the legs hang from)
  d: 0x36291e, // shell, darkest (segment recess)
  m: 0x54402e, // shell, base
  l: 0x72573e, // shell, lit
  L: 0x8f6d4e, // shell, highlight rim
  h: 0x343638, // head + legs, shadow
  H: 0x4a4d50, // head + legs, base
  G: 0x606468, // legs, lit
  F: 0x71767b, // head dome highlight, feelers lit
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
  q: 0xcabc92, // cream, deepest — the horn's underside
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

/** A tapered stroke from `a` to `b`, `wa`/`wb` wide at each end, as a polygon — a leg, a feeler. */
function stroke([ax, ay], [bx, by], wa, wb) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  return [
    [ax + (nx * wa) / 2, ay + (ny * wa) / 2],
    [bx + (nx * wb) / 2, by + (ny * wb) / 2],
    [bx - (nx * wb) / 2, by - (ny * wb) / 2],
    [ax - (nx * wa) / 2, ay - (ny * wa) / 2],
  ];
}

/** Cuts every part in `specs` (see `cutPart`) and attaches its pivot in sprite pixels. */
function cutParts(art, map, specs) {
  const parts = {};
  for (const [name, spec] of Object.entries(specs)) {
    parts[name] = {
      ...cutPart(art, map, { name, ...spec }),
      pivot: spec.pivot ? map.toSprite(...spec.pivot) : undefined,
    };
  }
  return parts;
}

// ============================================================ KELLERASSEL
// Canvas 140×86, head to the left, feet on the bottom rows. The rig: the
// shell (one piece — a woodlouse's plates flex as a whole, and the art's
// segment grooves survive the 4-tone flattening as the shell's own texture),
// the dark underbody the legs hang from, a grey head that rears at the neck,
// two feelers, and seven legs each swinging at its own hip.
const KW = 140,
  KH = 86;
const KELLERASSEL_ART = path.join(KEY_ART, 'grosse-kellerassel.png');
// Key-art pixel → sprite pixel: the creature spans ~1110 source px across
// the 1344-wide postcard; 0.125 lands it at 139 px wide, feet on row 84.
const KELLERASSEL_MAP = mapping({ scale: 0.125, originX: 55, originY: 700, dstX: 0.5, dstY: 84.5 });

const SHELL = { tones: [CELLAR.d, CELLAR.m, CELLAR.l, CELLAR.L], cuts: [0.22, 0.6, 0.9] };
const UNDERBODY = { tones: [CELLAR.x, CELLAR.d], cuts: [0.6] };
const ASSEL_HEAD = { tones: [CELLAR.h, CELLAR.H, CELLAR.F], cuts: [0.3, 0.75] };
const ASSEL_LEG = { tones: [CELLAR.h, CELLAR.H, CELLAR.G], cuts: [0.35, 0.8] };
const FEELER = { tones: [CELLAR.H, CELLAR.F], cuts: [0.5] };

// Hip → foot, in key-art pixels, front leg first.
const ASSEL_LEG_STROKES = [
  [
    [420, 505],
    [347, 647],
  ],
  [
    [507, 512],
    [487, 633],
  ],
  [
    [613, 518],
    [567, 680],
  ],
  [
    [727, 525],
    [677, 687],
  ],
  [
    [820, 525],
    [771, 653],
  ],
  [
    [927, 512],
    [877, 620],
  ],
  [
    [1047, 492],
    [1007, 593],
  ],
];

const ASSEL_SPECS = {
  under: {
    polygon: [
      [330, 470],
      [1150, 470],
      [1152, 545],
      [1067, 552],
      [933, 550],
      [800, 545],
      [667, 545],
      [560, 540],
      [467, 535],
      [387, 525],
      [333, 505],
    ],
    material: UNDERBODY,
  },
  shell: {
    // Traced along the shell's actual rim — #101's rectangular background
    // wedge was a polygon that guessed this edge 50-100px too low.
    polygon: [
      [313, 450],
      [327, 370],
      [360, 303],
      [413, 237],
      [480, 183],
      [560, 143],
      [640, 117],
      [720, 103],
      [800, 110],
      [880, 123],
      [960, 157],
      [1027, 210],
      [1080, 277],
      [1120, 357],
      [1147, 437],
      [1153, 490],
      [1147, 503],
      [1067, 510],
      [933, 503],
      [800, 497],
      [667, 497],
      [560, 490],
      [467, 483],
      [387, 477],
      [333, 463],
    ],
    material: SHELL,
    pivot: [730, 500],
  },
  head: {
    polygon: [
      [285, 395],
      [330, 378],
      [400, 378],
      [440, 395],
      [455, 440],
      [450, 500],
      [420, 560],
      [380, 590],
      [330, 590],
      [290, 560],
      [265, 500],
      [262, 440],
    ],
    material: ASSEL_HEAD,
    pivot: [430, 470],
  },
  feelerA: {
    polygon: stroke([275, 478], [63, 641], 22, 10),
    coverage: 0.3,
    material: FEELER,
    blur: 0,
    pivot: [278, 480],
  },
  feelerB: {
    polygon: stroke([282, 522], [196, 620], 20, 10),
    coverage: 0.3,
    material: FEELER,
    blur: 0,
    pivot: [284, 522],
  },
};
ASSEL_LEG_STROKES.forEach(([hip, foot], i) => {
  ASSEL_SPECS[`leg${i + 1}`] = {
    polygon: stroke(hip, foot, 52, 30),
    coverage: 0.45,
    material: ASSEL_LEG,
    pivot: hip,
  };
});

const AP = cutParts(loadKeyArt(KELLERASSEL_ART), KELLERASSEL_MAP, ASSEL_SPECS);
const ASSEL_LEGS = [1, 2, 3, 4, 5, 6, 7].map((i) => AP[`leg${i}`]);
const ASSEL_EYE = drawnPart('eye', ['K'], { K: CELLAR.K }, 32, 62);

/**
 * One Kellerassel pose. `legs` is a rotation per leg (degrees, positive
 * swings the foot forward), `head`/`feelers` rotate at the neck (negative
 * rears up), `dip` drops the shell and head on planted legs, `sx`/`sy`
 * squash the body about the ground, `tint` is the hit-flash shade step.
 */
function asselPose(name, o = {}) {
  const t = o.tint ?? 0;
  const dip = o.dip ?? 0;
  const lay = (part, extra = {}) => ({ part, pivot: part.pivot, tint: t, ...extra });
  const legRot = o.legs ?? ASSEL_LEGS.map(() => 0);
  const headT = { dy: dip + (o.headDy ?? 0), rotate: o.head ?? 0, pivot: AP.head.pivot };
  const body = { dy: dip, sx: o.sx ?? 1, sy: o.sy ?? 1, pivot: [72, 84] };
  return composeFrame(
    name,
    KW,
    KH,
    [
      lay(AP.under, body),
      ...ASSEL_LEGS.map((leg, i) => lay(leg, { rotate: legRot[i], dy: o.legDy ?? 0 })),
      lay(AP.shell, body),
      lay(AP.head, headT),
      { part: ASSEL_EYE, ...headT, ink: false },
      lay(AP.feelerA, {
        ...headT,
        rotate: (o.head ?? 0) + (o.feelers ?? 0),
        pivot: AP.feelerA.pivot,
      }),
      lay(AP.feelerB, {
        ...headT,
        rotate: (o.head ?? 0) + (o.feelers ?? 0) * 0.7,
        pivot: AP.feelerB.pivot,
      }),
    ],
    o.global ?? {},
    'floor-1-cellar',
  );
}
/** The walk: a metachronal wave down the seven legs — the gait a many-legged animal actually has. */
const asselWave = (f, amp = 13) =>
  ASSEL_LEGS.map((_, i) =>
    Math.round(amp * Math.sin((2 * Math.PI * f) / 4 + (i * 2 * Math.PI) / 3.5)),
  );

export const KELLERASSEL_FRAMES = [
  asselPose('kellerassel-idle-a'),
  asselPose('kellerassel-idle-b', { dip: 1, feelers: -4 }),
  asselPose('kellerassel-walk-1', { legs: asselWave(0) }),
  asselPose('kellerassel-walk-2', { legs: asselWave(1), dip: -1 }),
  asselPose('kellerassel-walk-3', { legs: asselWave(2) }),
  asselPose('kellerassel-walk-4', { legs: asselWave(3), dip: -1 }),
  // the wind-up before `spit`: rears up, feelers forward, front legs off the floor
  asselPose('kellerassel-telegraph-a', {
    head: -22,
    headDy: -4,
    feelers: -26,
    sx: 0.97,
    legs: [22, 16, 0, 0, 0, 0, 0],
  }),
  asselPose('kellerassel-telegraph-b', {
    head: -32,
    headDy: -7,
    feelers: -40,
    sx: 0.95,
    legs: [30, 24, 6, 0, 0, 0, -4],
  }),
  asselPose('kellerassel-hurt', {
    head: 10,
    sy: 0.94,
    sx: 1.03,
    tint: 1,
    legs: [-10, 10, -10, 10, -10, 10, -10],
  }),
  // legs splay, the body sinks, then it ends the way a woodlouse ends: on its back, legs up
  asselPose('kellerassel-death-1', {
    head: 14,
    dip: 3,
    legs: [34, 30, 20, 0, -20, -30, -34],
    feelers: 10,
  }),
  asselPose('kellerassel-death-2', {
    head: 26,
    dip: 8,
    sy: 0.88,
    legDy: 6,
    legs: [80, 76, 60, 0, -60, -76, -80],
    feelers: 20,
  }),
  asselPose('kellerassel-death-3', {
    head: 6,
    legs: [12, 8, 4, 0, -4, -8, -12],
    global: { sy: -1, pivot: [70, 46] },
  }),
];

// ================================================================ STIER
// Canvas 116×100, head to the left, hooves on the bottom rows. The rig: a
// torso, a head with its two horns and muzzle, a tail, and two legs cut from
// the art — the postcard shows only three legs clearly, so the far pair are
// the near pair again, set back and a shade darker.
const SW = 116,
  SH = 100;
const STIER_ART = path.join(KEY_ART, 'der-stier.png');
// The bull spans ~665 source px from horn tip to tail; 0.17 makes him 113 px wide, hooves on row 98.
const STIER_MAP = mapping({ scale: 0.17, originX: 530, originY: 707, dstX: 1, dstY: 98.5 });

const COAT = { tones: [RURAL.c, RURAL.C, RURAL.H], cuts: [0.4, 0.82] };
const STIER_LEG = { tones: [RURAL.c, RURAL.C, RURAL.H], cuts: [0.55, 0.92] };
const HORN = { tones: [RURAL.q, RURAL.r], cuts: [0.4] };
const MUZZLE = { tones: [RURAL.q, RURAL.R, RURAL.r], cuts: [0.3, 0.7] };

const STIER_SPECS = {
  tail: {
    polygon: [
      [1160, 395],
      [1192, 395],
      [1195, 470],
      [1186, 560],
      [1162, 560],
      [1158, 470],
    ],
    key: 'dark',
    keyThreshold: 0.5,
    erode: 1,
    blur: 2,
    material: { tones: [RURAL.c, RURAL.C], cuts: [0.6] },
    pivot: [1175, 400],
  },
  frontLeg: {
    polygon: [
      [735, 500],
      [800, 500],
      [806, 560],
      [806, 640],
      [812, 703],
      [750, 705],
      [752, 650],
      [748, 580],
    ],
    blur: 2,
    material: STIER_LEG,
    pivot: [770, 505],
  },
  rearLeg: {
    polygon: [
      [1060, 470],
      [1160, 470],
      [1160, 540],
      [1140, 600],
      [1142, 703],
      [1072, 705],
      [1080, 640],
      [1070, 560],
    ],
    blur: 2,
    material: STIER_LEG,
    pivot: [1110, 478],
  },
  torso: {
    // The back line and belly of the postcard bull; `key: 'dark'` drops the
    // bright field and sky the polygon can't help including at the rump.
    polygon: [
      [790, 250],
      [800, 222],
      [880, 208],
      [953, 203],
      [1010, 206],
      [1062, 216],
      [1128, 245],
      [1178, 278],
      [1195, 337],
      [1191, 395],
      [1178, 453],
      [1150, 495],
      [1100, 518],
      [1040, 528],
      [950, 530],
      [850, 524],
      [770, 520],
      [725, 508],
      [705, 470],
      [700, 420],
      [706, 380],
      [730, 330],
    ],
    key: 'dark',
    keyThreshold: 0.42,
    blur: 2,
    material: COAT,
    pivot: [740, 320],
  },
  head: {
    // Horn tips to chin, back edge along the neck fold; the horns themselves
    // are keyed out here (bright) and cut again below as their own parts.
    polygon: [
      [539, 134],
      [534, 155],
      [542, 200],
      [560, 235],
      [551, 276],
      [548, 300],
      [562, 310],
      [575, 352],
      [578, 388],
      [583, 430],
      [600, 438],
      [650, 432],
      [667, 428],
      [683, 411],
      [711, 378],
      [739, 322],
      [761, 278],
      [770, 255],
      [784, 240],
      [784, 153],
      [764, 134],
      [742, 153],
      [735, 205],
      [714, 232],
      [700, 225],
      [660, 222],
      [614, 225],
      [600, 232],
      [590, 215],
      [576, 200],
      [562, 145],
    ],
    key: 'dark',
    keyThreshold: 0.5,
    material: COAT,
    pivot: [745, 300],
  },
  hornL: {
    polygon: [
      [536, 132],
      [548, 130],
      [566, 150],
      [580, 190],
      [596, 225],
      [600, 245],
      [575, 245],
      [560, 220],
      [545, 190],
      [535, 160],
    ],
    key: 'light',
    keyThreshold: 0.45,
    coverage: 0.4,
    material: HORN,
  },
  hornR: {
    polygon: [
      [758, 132],
      [770, 130],
      [788, 150],
      [786, 205],
      [772, 245],
      [750, 245],
      [752, 220],
      [746, 190],
      [735, 160],
    ],
    key: 'light',
    keyThreshold: 0.45,
    coverage: 0.4,
    material: HORN,
  },
  muzzle: {
    polygon: [
      [583, 382],
      [655, 382],
      [655, 432],
      [600, 438],
      [583, 430],
    ],
    key: 'light',
    keyThreshold: 0.4,
    material: MUZZLE,
  },
};
const SP = cutParts(loadKeyArt(STIER_ART), STIER_MAP, STIER_SPECS);
const STIER_EYE = drawnPart('eye', ['WW', 'KW'], { W: RURAL.W, K: RURAL.K }, 25, 29);
/** The green wreath round his neck (`docs/CONTENT_BIBLE.md`) — beads along the neck seam; the picked key art lost it (#99). */
const STIER_WREATH = pixelPart(
  'wreath',
  Array.from({ length: 8 }, (_, i) => {
    const t = i / 7;
    const x = Math.round(41 - t * 13 + Math.sin(t * Math.PI) * 2);
    const y = Math.round(22 + t * 26);
    const c = i % 2 ? RURAL.N : RURAL.n;
    return [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 0],
      [2, 0],
      [0, -1],
      [0, 2],
    ].map(([dx, dy]) => [x + dx, y + dy, c]);
  }).flat(),
);

/**
 * One Der Stier pose. Leg angles are degrees at the hip, positive swinging
 * the hoof forward (toward the head); `head` rotates at the neck, positive
 * lowering it; `dip` drops torso and head on planted legs and `legDy`
 * follows it when the legs fold; `sx`/`sy` squash the torso about the ground.
 */
function stierPose(name, o = {}) {
  const t = o.tint ?? 0;
  const dip = o.dip ?? 0;
  const legDy = o.legDy ?? 0;
  const lay = (part, extra = {}) => ({ part, pivot: part.pivot, tint: t, ...extra });
  const headT = { dy: dip, rotate: o.head ?? 0, pivot: SP.head.pivot };
  const far = (part, dx) => ({
    dx,
    dy: -4 + legDy,
    tint: t - 1,
    pivot: [part.pivot[0] + dx, part.pivot[1] - 4],
  });
  return composeFrame(
    name,
    SW,
    SH,
    [
      lay(SP.frontLeg, { ...far(SP.frontLeg, 9), rotate: o.farFront ?? 0 }),
      lay(SP.rearLeg, { ...far(SP.rearLeg, -9), rotate: o.farRear ?? 0 }),
      lay(SP.tail, { rotate: o.tail ?? 0, dy: o.tailDy ?? 0 }),
      lay(SP.frontLeg, { rotate: o.frontNear ?? 0, dy: (o.frontLift ?? 0) + legDy }),
      lay(SP.rearLeg, { rotate: o.rearNear ?? 0, dy: (o.rearLift ?? 0) + legDy }),
      lay(SP.torso, { dy: dip, sy: o.sy ?? 1, sx: o.sx ?? 1, pivot: [58, 98] }),
      lay(SP.head, headT),
      lay(SP.hornL, headT),
      lay(SP.hornR, headT),
      lay(SP.muzzle, { ...headT, ink: false }),
      { part: STIER_EYE, ...headT, ink: false },
      { part: STIER_WREATH, ...headT, ink: false },
    ],
    o.global ?? {},
    'floor-2-rural',
  );
}

export const STIER_FRAMES = [
  stierPose('stier-idle-a'),
  stierPose('stier-idle-b', { dip: 1, tail: 8, head: 1 }),
  // a quadruped walk: diagonal pairs, near and far legs half a cycle apart
  stierPose('stier-walk-1', { frontNear: 18, rearNear: -16, farFront: -12, farRear: 12, head: 2 }),
  stierPose('stier-walk-2', {
    frontNear: 6,
    rearNear: -5,
    farFront: -4,
    farRear: 4,
    dip: -1,
    frontLift: -2,
  }),
  stierPose('stier-walk-3', { frontNear: -16, rearNear: 18, farFront: 12, farRear: -12, head: -2 }),
  stierPose('stier-walk-4', {
    frontNear: -5,
    rearNear: 6,
    farFront: 4,
    farRear: -4,
    dip: -1,
    rearLift: -2,
  }),
  // the charge wind-up: head down, horns forward, pawing the ground
  stierPose('stier-telegraph-a', {
    head: 20,
    dip: 3,
    sy: 0.95,
    sx: 1.03,
    frontNear: 16,
    frontLift: -4,
    rearNear: -6,
    farRear: -4,
  }),
  stierPose('stier-telegraph-b', {
    head: 24,
    dip: 4,
    sy: 0.94,
    sx: 1.04,
    frontNear: -3,
    rearNear: -8,
    farRear: -6,
    tail: 12,
  }),
  stierPose('stier-hurt', { head: -16, dip: -2, sy: 1.03, tint: 1, frontNear: -8, rearNear: 6 }),
  // front knees go, the body comes down, and he lies where he fell
  stierPose('stier-death-1', {
    head: 12,
    dip: 6,
    legDy: 4,
    frontNear: 34,
    farFront: 30,
    rearNear: -8,
    farRear: -6,
    sy: 0.97,
  }),
  stierPose('stier-death-2', {
    head: 30,
    dip: 17,
    legDy: 14,
    frontNear: 64,
    farFront: 58,
    rearNear: -44,
    farRear: -38,
    tail: 20,
    tailDy: 12,
  }),
  stierPose('stier-death-3', {
    head: 46,
    dip: 27,
    legDy: 25,
    frontNear: 92,
    farFront: 86,
    rearNear: -84,
    farRear: -78,
    tail: 45,
    tailDy: 24,
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
