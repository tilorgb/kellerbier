import { grid, shiftGrid, blankCanvas, stamp, finishCanvas } from './compose.mjs';

/**
 * Alois, as blocks and a frame list.
 *
 * The art direction is `docs/DECISIONS.md` #55: a head that is half the sprite
 * with the Trachtenhut on, eyes with a white highlight against a dark iris, a
 * mouth, hard black ink and flat fills, and one silhouette-carrying prop — the
 * Hut, plus the brass Trink-Rucksack keg that is drawn on the hip facing the
 * camera and on the small of his back facing away.
 *
 * Read this file as three layers. The **blocks** below are the drawings: a head
 * per direction and expression, a torso per direction, a set of legs per
 * contact pose, and the keg. `STRIPS` at the bottom is the frame list — which
 * blocks each of the forty-four frames uses, and at what offset. In between is
 * `frame`, which is nine lines and does all the composing.
 *
 * Two knobs carry the whole animation, and it is worth saying why they are
 * enough. `bob` drops the head and torso a pixel without moving the feet, which
 * is the vertical half of a walk; `lean` slides them sideways, which is the
 * horizontal half and, held still, is also the drunk pose. Four leg blocks
 * against those two knobs cover idle, walk, flinch, drunk and two of the three
 * death beats. Only the last beat — face down on the floor — is a drawing of
 * its own, because a body that has stopped being upright shares nothing with
 * one that has not.
 */

/** Alois's canvas. `docs/DECISIONS.md` #45: this is also his size on screen. */
export const WIDTH = 20;
export const HEIGHT = 32;

/**
 * Where the torso and legs blocks sit on that canvas.
 *
 * The head block owns rows 0-15 (the Hut is the top seven of them), the torso
 * 16-24, the legs 25-31. The split is at the neck and at the hem rather than in
 * even thirds, so `bob` moves exactly what a walking body moves.
 */
const TORSO_Y = 16;
const LEGS_Y = 25;

const g = grid;

// --------------------------------------------------------------- Hut + heads
const HAT = [
  '.......KKKKKK.......',
  '.....KKTTTTTTKK.....',
  '....KTTTTTTTTTTK.KFK',
  '....KTTTTTTTTTTKKFFK',
  '..KKKTTTTTTTTTTKKFFK',
  '.KttttttttttttttttKK',
  '.KKKKKKKKKKKKKKKKKK.',
];

const HAT_SIDE = [
  '....KKKKKKK.........',
  '..KKTTTTTTTKK.......',
  '.KTTTTTTTTTTTK.KFK..',
  '.KTTTTTTTTTTTKKFFK..',
  'KKKTTTTTTTTTTKKFFK..',
  'KttttttttttttttttK..',
  'KKKKKKKKKKKKKKKKKK..',
];

export const headSouth = g('head-south', [
  ...HAT,
  '...KHHHHHHHHHHHHK...',
  '...KHSSHSSSSHSSHK...',
  '...KSSKKKSSKKKSSK...',
  '...KSSWEESSWEESSK...',
  '...KSSEEESSEEESSK...',
  '...KSPSSSSSSSSPSK...',
  '....KSSSSKKSSSSK....',
  '.....KSSSSSSSSK.....',
  '.......KSSSSK.......',
]);

export const headSouthBlink = g('head-south-blink', [
  ...HAT,
  '...KHHHHHHHHHHHHK...',
  '...KHSSHSSSSHSSHK...',
  '...KSSSSSSSSSSSSK...',
  '...KSSKKKSSKKKSSK...',
  '...KSSSSSSSSSSSSK...',
  '...KSPSSSSSSSSPSK...',
  '....KSSSSKKSSSSK....',
  '.....KSSSSSSSSK.....',
  '.......KSSSSK.......',
]);

/** Eyes screwed shut into two carets, mouth open. */
export const headSouthHurt = g('head-south-hurt', [
  ...HAT,
  '...KHHHHHHHHHHHHK...',
  '...KHSSHSSSSHSSHK...',
  '...KSSKSKSSKSKSSK...',
  '...KSSSKSSSSKSSSK...',
  '...KSSSSSSSSSSSSK...',
  '...KSPSSSSSSSSPSK...',
  '....KSSKKMMKKSSK....',
  '.....KSSSSSSSSK.....',
  '.......KSSSSK.......',
]);

/** Half-lidded, flushed, grinning. */
export const headSouthDrunk = g('head-south-drunk', [
  ...HAT,
  '...KHHHHHHHHHHHHK...',
  '...KHSSHSSSSHSSHK...',
  '...KSSKKKSSKKKSSK...',
  '...KSSKKKSSKKKSSK...',
  '...KSSEEESSEEESSK...',
  '...KPPSSSSSSSSPPK...',
  '....KSSKKMMKKSSK....',
  '.....KSSSSSSSSK.....',
  '.......KSSSSK.......',
]);

export const headNorth = g('head-north', [
  ...HAT,
  '...KHHHHHHHHHHHHK...',
  '...KHHHHDDHHHHHHK...',
  '...KSHHHDDHHHHHSK...',
  '...KSHHHDDHHHHHSK...',
  '...KHHHDDHHHHHHHK...',
  '...KHHHDHHHHHHHHK...',
  '....KHHHHHHHHHHK....',
  '.....KHDDHHHHHK.....',
  '.......KSSSSK.......',
]);

export const headSide = g('head-side', [
  ...HAT_SIDE,
  '..KSSSSSSHHHHHHHK...',
  '..KSSSSSSSHHHHHHK...',
  '..KSKKKSSSHHHHHHK...',
  '..KSWEESSSHHHHHHK...',
  '.KSSEEESSSHHHHHHK...',
  '..KSPSSSSSHHHHHHK...',
  '..KKSSSSSSHHHHHK....',
  '...KSSSSSSHHHHK.....',
  '......KSSSSK........',
]);

export const headSideBlink = g('head-side-blink', [
  ...HAT_SIDE,
  '..KSSSSSSHHHHHHHK...',
  '..KSSSSSSSHHHHHHK...',
  '..KSSSSSSSHHHHHHK...',
  '..KSKKKSSSHHHHHHK...',
  '.KSSSSSSSSHHHHHHK...',
  '..KSPSSSSSHHHHHHK...',
  '..KKSSSSSSHHHHHK....',
  '...KSSSSSSHHHHK.....',
  '......KSSSSK........',
]);

export const headSideHurt = g('head-side-hurt', [
  ...HAT_SIDE,
  '..KSSSSSSHHHHHHHK...',
  '..KSSSSSSSHHHHHHK...',
  '..KSSSKSSSHHHHHHK...',
  '..KSKSKSSSHHHHHHK...',
  '.KSSSSSSSSHHHHHHK...',
  '..KSPSSSSSHHHHHHK...',
  '..KKMMSSSSHHHHHK....',
  '...KSSSSSSHHHHK.....',
  '......KSSSSK........',
]);

export const headSideDrunk = g('head-side-drunk', [
  ...HAT_SIDE,
  '..KSSSSSSHHHHHHHK...',
  '..KSSSSSSSHHHHHHK...',
  '..KSKKKSSSHHHHHHK...',
  '..KSKKKSSSHHHHHHK...',
  '.KSSEEESSSHHHHHHK...',
  '..KPPSSSSSHHHHHHK...',
  '..KKMMSSSSHHHHHK....',
  '...KSSSSSSHHHHK.....',
  '......KSSSSK........',
]);

// -------------------------------------------------------------------- torsos
export const torsoSouth = g('torso-south', [
  '.....KKRRRRRRKK.....',
  '....KRRGRRRRGRRK....',
  '...KSRRGRRRRGRRSK...',
  '...KSRRGRRRRGRRSK...',
  '...KSRRGRRRRGRRSK...',
  '....KKBBBBBBBBKK....',
  '...KSKBnnnnnnBKSK...',
  '...KSKBnAAAAnBKSK...',
  '....KBBnnnnnnBBK....',
]);

/** From behind, the keg rides the small of his back rather than a hip. */
export const torsoNorth = g('torso-north', [
  '.....KKRRRRRRKK.....',
  '....KRRGRRRRGRRK....',
  '...KSRKAAAAAAKRSK...',
  '...KSRKAggggAKRSK...',
  '...KSRKAAAAAAKRSK...',
  '....KKBKAAAAKBKK....',
  '...KSKBBKKKKBBKSK...',
  '...KSKBBBBBBBBKSK...',
  '....KBBBBBBBBBBK....',
]);

export const torsoSide = g('torso-side', [
  '....KKRRRRRRRKK.....',
  '...KRRRRRRRRGRK.....',
  '..KSRRRRRRRRGRK.....',
  '..KSRRRRRRRRGRK.....',
  '..KSRRRRRRRRGRK.....',
  '...KKBBBBBBBBBK.....',
  '..KSKBnnnnnnnBK.....',
  '..KSKBnAAAAnnBK.....',
  '...KBBnnnnnnnBK.....',
]);

// ---------------------------------------------------------------------- legs
export const legsStand = g('legs-stand', [
  '....KBBBKKKKBBBK....',
  '....KSSSK..KSSSK....',
  '....KSSSK..KSSSK....',
  '....KCCCK..KCCCK....',
  '....KCCCK..KCCCK....',
  '....KgggK..KgggK....',
  '....KKKKK..KKKKK....',
]);

/** Screen-left leg planted and striding, screen-right leg lifted clear. */
export const legsStepA = g('legs-step-a', [
  '....KBBBKKKKBBBK....',
  '...KSSSSK..KSSSK....',
  '...KSSSSK..KSSSK....',
  '...KCCCCK..KCCCK....',
  '...KCCCCK..KKKKK....',
  '...KggggK...........',
  '...KKKKKK...........',
]);

export const legsStepB = g('legs-step-b', [
  '....KBBBKKKKBBBK....',
  '....KSSSK..KSSSSK...',
  '....KSSSK..KSSSSK...',
  '....KCCCK..KCCCCK...',
  '....KKKKK..KCCCCK...',
  '...........KggggK...',
  '...........KKKKKK...',
]);

export const legsWide = g('legs-wide', [
  '...KBBBBKKKKBBBBK...',
  '...KSSSK....KSSSK...',
  '..KSSSK......KSSSK..',
  '..KCCCK......KCCCK..',
  '..KCCCK......KCCCK..',
  '..KgggK......KgggK..',
  '..KKKKK......KKKKK..',
]);

export const legsKneel = g('legs-kneel', [
  '....................',
  '....................',
  '....................',
  '....................',
  '..KSSSKKKKKKKKSSSK..',
  '..KCCCKKKKKKKKCCCK..',
  '..KKKKKKKKKKKKKKKK..',
]);

// --------------------------------------------------------- Trink-Rucksack keg
/** Brass tank with two iron hoops. `[grid, x, y]`, drawn over the torso. */
const KEG = g('keg', ['.KK.', 'KAAK', 'KggK', 'KAAK', 'KAAK', 'KggK', 'KAAK', '.KK.']);
/** The bit of harness that stops the keg reading as a floating pickup. */
const KEG_STRAP = g('keg-strap', ['GK..', '.GK.', '..GK']);

export const kegSouth = [KEG, 16, 18];
export const strapSouth = [KEG_STRAP, 12, 16];
export const kegSide = [KEG, 15, 18];
export const strapSide = [KEG_STRAP, 11, 16];

// --------------------------------------------------------------- death poses
/** Face down, Hut on top, arms out. Reads the same from either camera side. */
export const deathDownFront = g('death-down-front', [
  ...Array.from({ length: 24 }, () => '....................'),
  '.......KKKKKK.......',
  '.....KKTTTTTTKK.....',
  '....KTTTTTTTTTTK....',
  '..KKttttttttttttKK..',
  '..KKKKKKKKKKKKKKKK..',
  '.KSSKRRRRRRRRRRKSSK.',
  '.KSSKRRRRRRRRRRKAAK.',
  '..KKKBBBBBBBBBBKKKK.',
]);

export const deathDownSide = g('death-down-side', [
  ...Array.from({ length: 26 }, () => '....................'),
  '...KKKKKKK..........',
  '..KTTTTTTTK.........',
  '.KttttttttK.KKKKKK..',
  '.KKKKKKKKKKKRRRRRK..',
  '..KHSSSSHKKRRRRRRRK.',
  '..KKKKKKKKKBBBAAKKK.',
]);

// ------------------------------------------------------------- the Schlauch

/**
 * The Trink-Rucksack's hose, as a frame *table* rather than a timeline: eight
 * aim octants resting (0-7), the same eight with a shot just out of it (8-15).
 * `render/player-view.ts` indexes it by aim and never plays it, which is why
 * its sidecar authors no clips at all.
 *
 * Generated rather than hand-drawn, and for a different reason than the body
 * is composed: this is one object swept around a circle, and eight hand-drawn
 * copies of it is eight chances for them to disagree about how long the hose
 * is. Every frame comes out of the same three numbers below.
 */
const SIZE = 24;
const CENTRE = 11.5;
/** Aim octants, in `render/animation/state.ts`'s `schlauchOctant` order. */
const DIRECTIONS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
].map(([x, y]) => {
  const length = Math.hypot(x, y);
  return [x / length, y / length];
});

/** Where the leather hose ends and the brass nozzle starts, in pixels of reach. */
const NOZZLE_FROM = 4.5;
const REACH = 7;
/** How far the beer carries past the nozzle on a firing frame. Fits in 24px in every octant. */
const SPRAY = 10.5;

function plot(buf, x, y, ch) {
  const px = Math.floor(x + 0.5);
  const py = Math.floor(y + 0.5);
  if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) return;
  buf[py][px] = ch;
}

/** A one-pixel black rim around everything drawn, so the hose reads on any floor. */
function outline(buf) {
  const out = buf.map((row) => [...row]);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (buf[y][x] !== '.') continue;
      const touches = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && buf[ny][nx] !== '.';
      });
      if (touches) out[y][x] = 'K';
    }
  return out;
}

function schlauchFrame(octant, firing) {
  const [dx, dy] = DIRECTIONS[octant];
  const px = -dy;
  const py = dx;
  let buf = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => '.'));

  for (let r = -0.5; r <= REACH; r += 0.35) {
    const brass = r >= NOZZLE_FROM;
    for (const w of [-1, 0, 1]) {
      const shade = w === 1 ? (brass ? 'a' : 'g') : brass ? 'A' : 'G';
      plot(buf, CENTRE + dx * r + px * w, CENTRE + dy * r + py * w, shade);
    }
  }
  if (firing) {
    // Beer leaving the nozzle: amber at the bore, foam at the leading edge.
    for (let r = REACH + 0.5; r <= SPRAY; r += 0.35) {
      const foam = r > SPRAY - 1;
      for (const w of foam ? [-1, 0, 1] : [0]) {
        plot(buf, CENTRE + dx * r + px * w, CENTRE + dy * r + py * w, foam ? 'F' : 'o');
      }
    }
  }
  buf = outline(buf);
  return grid(
    `schlauch-${String(octant)}${firing ? '-firing' : ''}`,
    buf.map((row) => row.join('')),
  );
}

export const SCHLAUCH = [
  ...Array.from({ length: 8 }, (_unused, octant) => schlauchFrame(octant, false)),
  ...Array.from({ length: 8 }, (_unused, octant) => schlauchFrame(octant, true)),
];

/**
 * One frame: head, torso and legs, plus the keg and its strap on top.
 *
 * `bob` sinks everything above the knees by a pixel and `lean` slides it
 * sideways; the legs are stamped last and never move, because the pose *is*
 * where the feet are. Overlays follow the body so the keg stays on the hip
 * through both.
 */
function frame(name, { head, torso, legs, bob = 0, lean = 0, overlays = [] }) {
  const canvas = blankCanvas(WIDTH, HEIGHT);
  stamp(canvas, head, lean, bob);
  stamp(canvas, torso, lean, TORSO_Y + bob);
  stamp(canvas, legs, 0, LEGS_Y);
  for (const [part, ox, oy] of overlays) stamp(canvas, part, ox + lean, oy + bob);
  return finishCanvas(name, canvas);
}

/** The keg rides his back rather than his hip when the camera is behind him, so facing away needs no overlay. */
const RIG_SOUTH = [strapSouth, kegSouth];
const RIG_NORTH = [];
const RIG_SIDE = [strapSide, kegSide];

const FRONT_LEGS = {
  stand: legsStand,
  stepA: legsStepA,
  stepB: legsStepB,
  wide: legsWide,
  kneel: legsKneel,
};

/** The side body is drawn a pixel left of the front one; its legs follow it. */
const SIDE_LEGS = Object.fromEntries(
  Object.entries(FRONT_LEGS).map(([key, part]) => [key, shiftGrid(part, -1)]),
);

/**
 * The eight sober frames, in the order the sidecars index them: two idles, two
 * walk contacts, a flinch, then the three death beats.
 *
 * The clip lists in `assets/sprites/common/characters/*.anim.json` are what
 * decide which of these plays when — this only has to put them at the indices
 * those files already name, which is why the shape is fixed rather than derived.
 */
function sober(dir, { head, blink, hurt, torso, legs, rig, down }) {
  return [
    frame(`${dir}-idle`, { head, torso, legs: legs.stand, overlays: rig }),
    frame(`${dir}-blink`, { head: blink, torso, legs: legs.stand, bob: 1, overlays: rig }),
    frame(`${dir}-step-a`, { head, torso, legs: legs.stepA, bob: 1, lean: -1, overlays: rig }),
    frame(`${dir}-step-b`, { head, torso, legs: legs.stepB, bob: 1, lean: 1, overlays: rig }),
    frame(`${dir}-hurt`, { head: hurt, torso, legs: legs.wide, bob: 1, lean: 1, overlays: rig }),
    frame(`${dir}-death-1`, { head: hurt, torso, legs: legs.wide, bob: 3, lean: 2, overlays: rig }),
    frame(`${dir}-death-2`, { head: hurt, torso, legs: legs.kneel, bob: 5, overlays: rig }),
    down,
  ];
}

/**
 * The four drunk frames: two leaning idles and two loose walk contacts.
 *
 * Only `idle` and `move` are authored, on purpose (`assets/sprites/README.md`):
 * a flinch is a flinch, so `render/player-view.ts` asks the sober strip for
 * `hurt` and `death` rather than drawing a drunk one.
 */
function drunk(dir, { head, torso, legs, rig }) {
  return [
    frame(`${dir}-drunk-idle-a`, { head, torso, legs: legs.wide, lean: -1, overlays: rig }),
    frame(`${dir}-drunk-idle-b`, {
      head,
      torso,
      legs: legs.wide,
      bob: 1,
      lean: 1,
      overlays: rig,
    }),
    frame(`${dir}-drunk-step-a`, {
      head,
      torso,
      legs: legs.stepA,
      bob: 1,
      lean: -1,
      overlays: rig,
    }),
    frame(`${dir}-drunk-step-b`, {
      head,
      torso,
      legs: legs.stepB,
      bob: 1,
      lean: 1,
      overlays: rig,
    }),
  ];
}

/** Every strip `render/player-art.ts` looks for, keyed by its file's base name. */
export const STRIPS = {
  'alois-south': sober('south', {
    head: headSouth,
    blink: headSouthBlink,
    hurt: headSouthHurt,
    torso: torsoSouth,
    legs: FRONT_LEGS,
    rig: RIG_SOUTH,
    down: deathDownFront,
  }),
  'alois-north': sober('north', {
    // Nothing to blink and nothing to wince with from behind, so the back of
    // his head is all three. The frames still differ — `bob` and the legs carry
    // them — which is the honest amount of information a back view has.
    head: headNorth,
    blink: headNorth,
    hurt: headNorth,
    torso: torsoNorth,
    legs: FRONT_LEGS,
    rig: RIG_NORTH,
    down: deathDownFront,
  }),
  'alois-side': sober('side', {
    head: headSide,
    blink: headSideBlink,
    hurt: headSideHurt,
    torso: torsoSide,
    legs: SIDE_LEGS,
    rig: RIG_SIDE,
    down: deathDownSide,
  }),
  'alois-drunk-south': drunk('south', {
    head: headSouthDrunk,
    torso: torsoSouth,
    legs: FRONT_LEGS,
    rig: RIG_SOUTH,
  }),
  'alois-drunk-north': drunk('north', {
    head: headNorth,
    torso: torsoNorth,
    legs: FRONT_LEGS,
    rig: RIG_NORTH,
  }),
  'alois-drunk-side': drunk('side', {
    head: headSideDrunk,
    torso: torsoSide,
    legs: SIDE_LEGS,
    rig: RIG_SIDE,
  }),
  'alois-schlauch': SCHLAUCH,
};
