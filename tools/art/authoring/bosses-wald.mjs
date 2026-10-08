import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { legalPixelColorsFor } from '../palette.mjs';
import { loadKeyArt, mapping, cutParts, composeFrame } from './boss-rig.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEY_ART = path.join(HERE, '../../../assets/art/bosses');

/**
 * Floor 3's boss, as two cel-traced rigs (`docs/BOSS_SPRITES.md`): Der
 * Waldradler (#412, a trail biker) and Das Waldradl (#413, the one wheel of
 * his bike that survives). Each is cut from its own key art in
 * `assets/art/bosses/` — the Waldradler's is the intro postcard, the Radl's is
 * source art only — and both keep the canvases they had as block-art stand-ins
 * (62×48 and 40×40), which were signed off separately from the art.
 *
 * Facing left, ground on the bottom rows, twelve frames each:
 *
 *   0-1 idle · 2-5 move · 6-7 telegraph · 8 hurt · 9-11 death
 */

const WALD = {
  K: 0x000000, // outline ink
  x: 0x1c1a1f, // black: shorts, tyre, shoe
  X: 0x332f38,
  y: 0x494451,
  g: 0x737373, // grey metal
  G: 0xa1a1a1,
  d: 0x234d2b, // jersey, darkest
  j: 0x316d3d, // jersey / helmet shade
  J: 0x408c4e, // jersey / helmet
  L: 0x5fa65b, // jersey, lit
  l: 0x87d840, // helmet, lit
  o: 0xd99940, // skin shade
  k: 0xe8c28c, // skin
  s: 0xf0d6b2, // skin, lit
};

for (const [key, colour] of Object.entries(WALD)) {
  if (!legalPixelColorsFor('floor-3-wald').has(colour)) {
    throw new Error(
      `bosses-wald key ${key} is #${colour.toString(16)}, not legal for floor-3-wald`,
    );
  }
}

const BUCKET = 'floor-3-wald';

/** An ellipse as a polygon, key-art pixels. */
function ellipse(cx, cy, rx, ry, n = 40) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry];
  });
}

/** A ring as one even-odd polygon: outer loop, a seam in, the inner loop back, the seam out. */
function ring(cx, cy, ro, ri, n = 48) {
  const outer = ellipse(cx, cy, ro, ro, n);
  const inner = ellipse(cx, cy, ri, ri, n).reverse();
  return [...outer, outer[0], inner[inner.length - 1], ...inner, outer[0]];
}

/** A tapered stroke, `wa` wide at `a` and `wb` at `b`, as a polygon. */
function stroke([ax, ay], [bx, by], wa, wb) {
  const len = Math.hypot(bx - ax, by - ay);
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len;
  return [
    [ax + (nx * wa) / 2, ay + (ny * wa) / 2],
    [bx + (nx * wb) / 2, by + (ny * wb) / 2],
    [bx - (nx * wb) / 2, by - (ny * wb) / 2],
    [ax - (nx * wa) / 2, ay - (ny * wa) / 2],
  ];
}

// =================================================================== RADLER
const RW = 62,
  RH = 48;
const RADLER_ART = path.join(KEY_ART, 'waldradler.png');
// The bike spans ~820 key-art px; 0.068 is 56 sprite px, tyres on row 46.
const RADLER_MAP = mapping({ scale: 0.068, originX: 270, originY: 712, dstX: 2.5, dstY: 46.5 });

const TYRE = { tones: [WALD.x, WALD.X, WALD.y], cuts: [0.45, 0.93] };
const JERSEY = { tones: [WALD.d, WALD.j, WALD.J], cuts: [0.3, 0.62], cutsAbsolute: true };
const ARM = { tones: [WALD.j, WALD.J, WALD.L], cuts: [0.4, 0.7], cutsAbsolute: true };
const HELMET = {
  tones: [WALD.j, WALD.J, WALD.L, WALD.l],
  cuts: [0.25, 0.5, 0.78],
  cutsAbsolute: true,
};
const SKIN = {
  tones: [WALD.x, WALD.o, WALD.k, WALD.s],
  cuts: [0.25, 0.5, 0.74],
  cutsAbsolute: true,
};
const SHORTS = { tones: [WALD.x, WALD.X, WALD.y], cuts: [0.45, 0.85] };
const METAL = { tones: [WALD.y, WALD.g, WALD.G], cuts: [0.4, 0.8] };

const HIP = [790, 350];
const NECK = [668, 180];

const RADLER_SPECS = {
  rearWheel: {
    polygon: ring(965, 572, 138, 98),
    key: 'dark',
    keyThreshold: 0.45,
    coverage: 0.4,
    material: TYRE,
    pivot: [965, 572],
  },
  frontWheel: {
    polygon: ring(414, 588, 140, 98),
    key: 'dark',
    keyThreshold: 0.45,
    coverage: 0.4,
    material: TYRE,
    pivot: [414, 588],
  },
  frame: {
    polygon: [
      [470, 300],
      [575, 300],
      [625, 365],
      [830, 400],
      [965, 545],
      [965, 605],
      [660, 612],
      [520, 600],
      [430, 602],
      [440, 540],
      [490, 440],
    ],
    key: 'sat',
    keyThreshold: 0.5,
    coverage: 0.35,
    material: { tones: [WALD.j, WALD.J, WALD.L], cuts: [0.3, 0.75] },
  },
  fork: {
    polygon: stroke([505, 395], [450, 590], 32, 22),
    coverage: 0.35,
    material: METAL,
  },
  shorts: {
    polygon: [
      [690, 300],
      [880, 300],
      [892, 360],
      [830, 422],
      [760, 432],
      [700, 400],
      [660, 340],
    ],
    material: SHORTS,
    pivot: HIP,
  },
  leg: {
    polygon: [
      [650, 330],
      [745, 330],
      [778, 385],
      [742, 470],
      [782, 505],
      [778, 560],
      [792, 602],
      [700, 652],
      [640, 642],
      [620, 612],
      [700, 590],
      [702, 540],
      [690, 500],
      [650, 420],
    ],
    material: SKIN,
    pivot: HIP,
  },
  pack: {
    polygon: [
      [700, 68],
      [800, 65],
      [852, 95],
      [872, 165],
      [868, 215],
      [800, 205],
      [740, 200],
      [690, 175],
      [695, 100],
    ],
    material: HELMET,
    pivot: HIP,
  },
  torso: {
    polygon: [
      [690, 150],
      [780, 150],
      [850, 190],
      [875, 230],
      [896, 280],
      [890, 325],
      [800, 338],
      [715, 322],
      [660, 290],
      [640, 215],
      [672, 160],
    ],
    material: JERSEY,
    pivot: HIP,
  },
  arm: {
    polygon: stroke([700, 215], [555, 325], 74, 50),
    material: ARM,
    pivot: [700, 215],
  },
  glove: {
    polygon: [
      [505, 300],
      [545, 282],
      [590, 300],
      [592, 345],
      [550, 362],
      [510, 346],
    ],
    material: SHORTS,
    pivot: [700, 215],
  },
  helmet: {
    polygon: [
      [545, 148],
      [600, 85],
      [665, 82],
      [695, 115],
      [690, 140],
      [640, 140],
      [600, 152],
    ],
    material: HELMET,
    pivot: NECK,
  },
  face: {
    polygon: [
      [575, 150],
      [640, 140],
      [690, 140],
      [690, 175],
      [660, 205],
      [620, 215],
      [592, 213],
      [578, 190],
    ],
    material: SKIN,
    pivot: NECK,
  },
};
const RP = cutParts(loadKeyArt(RADLER_ART), RADLER_MAP, RADLER_SPECS);
/** The art's spokes are hairlines that vanish at this size; four flat grey ones per wheel say "spoked" instead. */
const RADLER_SPOKES = Object.values(
  cutParts(
    loadKeyArt(RADLER_ART),
    RADLER_MAP,
    Object.fromEntries(
      [
        ['rear', 965, 572],
        ['front', 414, 588],
      ].flatMap(([which, cx, cy]) =>
        Array.from({ length: 3 }, (_, i) => {
          const a = (i * Math.PI) / 3 + 0.2;
          const dx = Math.cos(a) * 108;
          const dy = Math.sin(a) * 108;
          return [
            `${which}Spoke${String(i)}`,
            {
              polygon: stroke([cx - dx, cy - dy], [cx + dx, cy + dy], 12, 12),
              coverage: 0.5,
              material: { tones: [WALD.g] },
            },
          ];
        }),
      ),
    ),
  ),
);

// Sprite-space pivots: where the tyres meet the ground.
const REAR_GROUND = RADLER_MAP.toSprite(965, 706);

/**
 * One Waldradler pose. `leg` swings the near leg at the hip and `farLeg` the
 * copy behind it (a shade darker); `bob` lifts the whole rider; `lean` tips
 * rider and head at the hip, positive back; `bike` rotates the lot about the
 * rear tyre (positive lifts the front wheel); `tint` is the hurt flash.
 */
function radlerPose(name, o = {}) {
  const t = o.tint ?? 0;
  const bob = o.bob ?? 0;
  const lay = (part, extra = {}) => ({ part, pivot: part.pivot, tint: t, ...extra });
  const rider = { dy: bob, rotate: o.lean ?? 0, pivot: RP.torso.pivot };
  const armT = { ...rider, rotate: (o.lean ?? 0) + (o.arm ?? 0), pivot: RP.arm.pivot };
  const headT = {
    dy: bob,
    rotate: (o.lean ?? 0) + (o.head ?? 0),
    pivot: RP.helmet.pivot,
    sx: 1.18,
    sy: 1.18,
  };
  return composeFrame(
    name,
    RW,
    RH,
    [
      lay(RP.rearWheel, { dy: o.wheelDy ?? 0 }),
      lay(RP.frontWheel, { dy: o.wheelDy ?? 0 }),
      ...RADLER_SPOKES.map((part) => lay(part, { ink: false })),
      lay(RP.frame),
      lay(RP.fork),
      lay(RP.leg, { dx: -2, dy: bob - 1, rotate: o.farLeg ?? 0, tint: t - 1 }),
      lay(RP.shorts, { dy: bob, rotate: o.lean ?? 0 }),
      lay(RP.leg, { dy: bob, rotate: o.leg ?? 0 }),
      lay(RP.pack, rider),
      lay(RP.torso, rider),
      lay(RP.arm, armT),
      lay(RP.glove, armT),
      lay(RP.face, headT),
      lay(RP.helmet, headT),
    ],
    {
      rotate: o.bike ?? 0,
      dy: o.dy ?? 0,
      dx: o.dx ?? 0,
      sy: o.sy ?? 1,
      pivot: o.pivot ?? REAR_GROUND,
    },
    BUCKET,
  );
}

export const RADLER_FRAMES = [
  radlerPose('radler-idle-a'),
  radlerPose('radler-idle-b', { bob: 1, head: 2 }),
  // riding in place: the pedals turn, the rider bobs on the bumps
  radlerPose('radler-move-1', { leg: 14, farLeg: -14, bob: 0 }),
  radlerPose('radler-move-2', { leg: 0, farLeg: 0, bob: 1, wheelDy: 0 }),
  radlerPose('radler-move-3', { leg: -14, farLeg: 14, bob: 0 }),
  radlerPose('radler-move-4', { leg: 0, farLeg: 0, bob: 1 }),
  // the wind-up of both his attacks: the front wheel comes up and he leans back
  radlerPose('radler-telegraph-a', { bike: 14, lean: 6, leg: 8, farLeg: -8, head: -4 }),
  radlerPose('radler-telegraph-b', { bike: 22, lean: 10, leg: 12, farLeg: -12, head: -6 }),
  radlerPose('radler-hurt', { tint: 1, lean: 12, head: 8, bob: -1, bike: 4 }),
  // the wheelie goes too far: he comes off the back and ends on it, wheels in the air
  radlerPose('radler-death-1', { bike: 24, lean: 14, head: 12, leg: 6, farLeg: -6 }),
  radlerPose('radler-death-2', {
    bike: 44,
    dx: -4,
    dy: 2,
    lean: 22,
    head: 18,
    leg: 18,
    farLeg: 10,
  }),
  radlerPose('radler-death-3', {
    pivot: [RW / 2, 24.75],
    sy: -1,
    lean: 8,
    head: 16,
    leg: 20,
    farLeg: 12,
  }),
];

// ====================================================================== RADL
const DW = 40,
  DH = 40;
const RADL_ART = path.join(KEY_ART, 'waldradl.png');
// The wheel is ~657 key-art px across; 0.058 is 38 sprite px, resting on row 39.
const RADL_MAP = mapping({ scale: 0.058, originX: 318, originY: 685, dstX: 1, dstY: 38.5 });
const CENTRE = [646, 362];

const RADL_SPECS = {
  tyre: {
    polygon: ring(CENTRE[0], CENTRE[1], 334, 252),
    blur: 2,
    coverage: 0.4,
    material: { tones: [WALD.X, WALD.y, WALD.g], cuts: [0.35, 0.85] },
    pivot: CENTRE,
  },
  // Eight spokes, as flat strokes: the art's are painted, but a painted spoke
  // at 38 px is a smear. Alternating grey and green is the art's own pattern.
  ...Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4 + 0.35;
      return [
        `spoke${String(i)}`,
        {
          polygon: stroke(
            CENTRE,
            [CENTRE[0] + Math.cos(a) * 258, CENTRE[1] + Math.sin(a) * 258],
            44,
            32,
          ),
          material: { tones: [i % 2 === 0 ? WALD.g : WALD.J] },
          pivot: CENTRE,
        },
      ];
    }),
  ),
  hub: {
    polygon: ellipse(CENTRE[0], CENTRE[1], 96, 96),
    material: {
      tones: [WALD.x, WALD.y, WALD.g, WALD.G],
      cuts: [0.25, 0.5, 0.78],
      cutsAbsolute: true,
    },
    pivot: CENTRE,
  },
};
const DP = cutParts(loadKeyArt(RADL_ART), RADL_MAP, RADL_SPECS);
const WHEEL_GROUND = RADL_MAP.toSprite(CENTRE[0], 685);

/**
 * One Waldradl pose. `spin` turns the whole wheel (tyre tread and spokes
 * together) in degrees, which is the whole of its motion — the pattern it
 * fires is what moves; `sx`/`sy` squash it on the ground; `bike` tips it over
 * about its lowest point.
 */
function radlPose(name, o = {}) {
  const t = o.tint ?? 0;
  const spin = o.spin ?? 0;
  const lay = (part, extra = {}) => ({ part, pivot: part.pivot, tint: t, ...extra });
  return composeFrame(
    name,
    DW,
    DH,
    [
      ...Array.from({ length: 8 }, (_, i) =>
        lay(DP[`spoke${String(i)}`], { rotate: spin, ink: false }),
      ),
      lay(DP.tyre, { rotate: spin }),
      lay(DP.hub, { rotate: spin }),
    ],
    {
      rotate: o.tip ?? 0,
      sx: o.sx ?? 1,
      sy: o.sy ?? 1,
      dy: o.dy ?? 0,
      pivot: o.pivot ?? WHEEL_GROUND,
    },
    BUCKET,
  );
}

export const RADL_FRAMES = [
  radlPose('radl-idle-a'),
  radlPose('radl-idle-b', { spin: 6, dy: -1 }),
  // rolling: a quarter of the spoke pitch per frame reads as a turning wheel
  radlPose('radl-move-1', { spin: 0 }),
  radlPose('radl-move-2', { spin: 11 }),
  radlPose('radl-move-3', { spin: 22 }),
  radlPose('radl-move-4', { spin: 34 }),
  // spinning up for the pattern: squashed on its tyre, whirling
  radlPose('radl-telegraph-a', { spin: 18, sx: 1.05, sy: 0.94 }),
  radlPose('radl-telegraph-b', { spin: 40, sx: 1.07, sy: 0.92 }),
  radlPose('radl-hurt', { tint: 1, spin: -8, tip: -5 }),
  // it wobbles, tips, and lies flat in the dirt
  radlPose('radl-death-1', { spin: 10, tip: 14 }),
  radlPose('radl-death-2', { spin: 20, tip: 38, sy: 0.9 }),
  radlPose('radl-death-3', { spin: 30, tip: 0, sy: 0.32, dy: 0 }),
];

export const WALD_FRAMES = { waldradler: RADLER_FRAMES, waldradl: RADL_FRAMES };

/** For `boss-rig-preview.mjs`. */
export const WALD_RIGS = {
  waldradler: { art: RADLER_ART, specs: RADLER_SPECS, previewCrop: [240, 40, 1120, 740, 1] },
  waldradl: { art: RADL_ART, specs: RADL_SPECS, previewCrop: [280, 20, 1010, 720, 1] },
};
