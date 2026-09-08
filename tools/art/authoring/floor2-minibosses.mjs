import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * Dorf & Acker's two mini-bosses (#277) — Die Blaskapelle and Der Ladewagen.
 *
 * Authored the same way as the floor's roster (`floor2-roster.mjs`, `docs/
 * DECISIONS.md` #55) and floor 1's mini-bosses (`floor1-minibosses.mjs`): a
 * per-floor key map, full-canvas text grids, and `inkOutline` putting the hard
 * `#000000` edge on automatically. The raster core is duplicated per module on
 * purpose, the same call every other file in this folder makes.
 *
 * There is no GPU in a cloud session, so these are programmatic block art
 * rather than diffusion candidates — the second of `docs/DECISIONS.md` #77's
 * two tracks. The track only decides how candidates get produced; the gate is
 * the same either way, and both of these went through an options round shown
 * standing in the real floor-2 arena at true scale before anything landed here
 * (`CLAUDE.md`).
 *
 * ## Die Blaskapelle: three sprites, not one wide one
 *
 * #277 asks for that choice to be made out loud rather than settled while
 * drawing, and the fight settles it: killing one bandsman has to *change the
 * pattern*, which means three bodies with three healths and three positions,
 * which means three silhouettes to aim at. One wide sprite would be one body.
 * What was actually open — and what the options round was about — is how the
 * three are told apart, and each is the roster Blaskapellist's build grown to
 * the `mid` class with its own instrument carrying the read: a player has to
 * know from across the room which one is firing the fast ring.
 *
 * ## Der Ladewagen: one body, drawn wide
 *
 * The tractor and its trailer are one thing that drives one circuit, so unlike
 * the band it genuinely is one sprite — long and low, so the silhouette reads
 * as a vehicle on a circuit rather than as another animal, and so the hay it
 * shed sits visibly lower than the machine that shed it.
 *
 * Everything is authored **facing left** (`render/animation/state.ts`'s
 * `AUTHORED_FACING`); the engine mirrors it when a body moves right.
 */

// ------------------------------------------------------------------ palette
// Floor 2's five plus the neutrals — the identical key map `floor2-roster.mjs`
// uses, kept here rather than imported per the per-module rule above.
export const RURAL = {
  '.': null,
  K: 0x000000, // outline + internal ink
  k: 0x1c1a1f, // soft shade, under a brim / deep fold
  S: 0xcabc92, // "skin" — cream, two steps down; the warmest Floor 2 allows
  s: 0xd9cfb1, // skin, one step down (lit cheek, muzzle)
  C: 0xe8e2d0, // cream — shirts, beard, hay in the light
  o: 0xd9cfb1, // cream shadow (hay underside, sleeve fold)
  b: 0x2e4f8c, // Bavarian blue
  B: 0x3962af, // blue, lit
  d: 0x172847, // blue, deep shadow
  e: 0x233c69, // iris
  n: 0x3f7a3a, // green
  N: 0x4f9949, // green, lit
  L: 0x7fbf6a, // green, bright — machine highlight edge
  m: 0x2f5b2b, // green, deep
  Y: 0x6ab0d9, // sky blue
  y: 0x8fc3e2, // sky blue, lit
  g: 0x8a8a8a, // neutral grey — brass, iron
  G: 0xa1a1a1, // grey, one step up
  h: 0x737373, // grey, one step down
  W: 0xffffff, // eye sclera, tiny glints
};

{
  const legal = legalPixelColorsFor('floor-2-rural');
  for (const [key, colour] of Object.entries(RURAL)) {
    if (colour !== null && !legal.has(colour)) {
      throw new Error(
        `floor2-minibosses key "${key}" is #${colour.toString(16).padStart(6, '0')}, ` +
          `not legal for floor-2-rural — see tools/art/palette.mjs`,
      );
    }
  }
}

// --------------------------------------------------------------- raster core
function canvas(w, h) {
  return { w, h, px: Array.from({ length: h }, () => Array.from({ length: w }, () => null)) };
}

function paint(name, rows) {
  const w = Math.max(...rows.map((row) => row.length));
  if (w === 0) throw new Error(`${name}: no rows`);
  const cv = canvas(w, rows.length);
  rows.forEach((row, y) => {
    const padded = row.padEnd(w, '.');
    for (let x = 0; x < w; x++) {
      const ch = padded[x];
      if (!(ch in RURAL)) throw new Error(`${name}: row ${String(y)} has unknown key "${ch}"`);
      cv.px[y][x] = RURAL[ch];
    }
  });
  return cv;
}

/** 1px `#000000` around every painted pixel that borders emptiness (8-way). */
function inkOutline(cv) {
  const snap = cv.px.map((row) => [...row]);
  const on = (x, y) => x >= 0 && y >= 0 && x < cv.w && y < cv.h && snap[y][x] !== null;
  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      if (on(x, y)) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (on(x + dx, y + dy)) {
            cv.px[y][x] = 0x000000;
            dx = dy = 2;
          }
        }
      }
    }
  }
  return cv;
}

function frameOf(name, cv) {
  return { name, width: cv.w, height: cv.h, px: cv.px };
}

/**
 * One transparent pixel of margin on every side, added before the outline
 * pass so a shape that reaches the edge of its own text grid still gets its
 * `#000000` edge. Without it a tuba bell drawn out to the last column comes
 * out with three inked sides and one raw one, which reads as the sprite
 * having been cropped.
 */
function padded(rows) {
  const width = Math.max(...rows.map((row) => row.length));
  const blank = '.'.repeat(width + 2);
  return [blank, ...rows.map((row) => `.${row.padEnd(width, '.')}.`), blank];
}

/** A whole sprite from one full-canvas text grid, margined and auto-inked. */
function single(name, rows) {
  return frameOf(name, inkOutline(paint(name, padded(rows))));
}

/**
 * One text grid drawn over another: a non-`.` cell in `top` replaces `base`'s.
 *
 * The three bandsmen are one body carrying three different instruments, and
 * that is exactly the drift trap `compose.mjs`'s doc comment describes — three
 * separately-edited copies of one uniform end up with the hat a pixel out on
 * one of them and nobody notices for a month. The body is written once, below,
 * and each instrument is an overlay on it.
 */
function overlay(base, top) {
  const height = Math.max(base.length, top.length);
  const width = Math.max(...base.map((row) => row.length), ...top.map((row) => row.length));
  const out = [];
  for (let y = 0; y < height; y++) {
    const b = (base[y] ?? '').padEnd(width, '.');
    const t = (top[y] ?? '').padEnd(width, '.');
    let row = '';
    for (let x = 0; x < width; x++) {
      row += t[x] === '.' ? b[x] : t[x];
    }
    out.push(row);
  }
  return out;
}

function putFrame(pixels, stripWidth, frame, ox) {
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const c = frame.px[y][x];
      if (c === null) continue;
      const at = (y * stripWidth + ox + x) * 4;
      pixels[at] = (c >> 16) & 0xff;
      pixels[at + 1] = (c >> 8) & 0xff;
      pixels[at + 2] = c & 0xff;
      pixels[at + 3] = 0xff;
    }
  }
}

export function encodeSingle(f) {
  const pixels = Buffer.alloc(f.width * f.height * 4);
  putFrame(pixels, f.width, f, 0);
  return encodePng({ width: f.width, height: f.height, pixels });
}

/** Throws if any painted pixel is not legal for floor-2-rural. */
export function assertOnPalette(framesIn) {
  const legal = legalPixelColorsFor('floor-2-rural');
  for (const f of framesIn) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const c = f.px[y][x];
        if (c !== null && !legal.has(c)) {
          throw new Error(
            `${f.name}: pixel ${x},${y} is #${c.toString(16).padStart(6, '0')}, not legal`,
          );
        }
      }
    }
  }
}

// =====================================================================
//  Die Blaskapelle — one uniform, three instruments
// =====================================================================

/**
 * The face every human on this floor carries, verbatim from
 * `floor2-roster.mjs`'s `HUMAN_FACE`: the same white sclera, the same
 * `#233c69` iris, the same lash line and mouth. "Same eye" is what "same
 * game" reduces to at this size, and a mini-boss is the last body that should
 * be exempt from it — three of them stand in one room with the roster.
 */
export const HUMAN_FACE = [
  'SSSSSSSSSSSS',
  'SSSSSSSSSSSS',
  'SSKKKSSKKKSS',
  'SSWeeSSWeeSS',
  'SSeeeSSeeeSS',
  'SsSSSSSSSSsS',
  'SSSSKKKKSSSS',
  '.SSSSSSSSSS.',
  '..SSSSSSSS..',
];

/**
 * The shared body: Musikkapelle cap with its feather, the roster face, a cream
 * shirt under a blue Tracht waistcoat, and Loferl-socked legs. 34 wide by 38
 * tall — grown out of the roster Blaskapellist's 26x30 rather than scaled from
 * it, so the head stays the roster's own 12-wide block and the extra height
 * goes into the body. That is what makes a bandsman here read as an adult
 * standing among the chibi roster instead of as a chibi holding a bigger tuba.
 *
 * Columns 22 onward are left clear on purpose: that is the instrument's room.
 */
const BANDSMAN_BODY = [
  '......bbbbbbbbbbbbbb',
  '.....bbbbbbbbbbbbbbbb',
  '.....bkbbbbbbbbbbbbbB',
  '....bbbbbbbbbbbbbbbbbb',
  '....bbbbbbbbbbbbbbbbbb',
  '........SSSSSSSSSSSS',
  '........SSSSSSSSSSSS',
  '........SSKKKSSKKKSS',
  '........SSWeeSSWeeSS',
  '........SSeeeSSeeeSS',
  '........SsSSSSSSSSsS',
  '........SSSSKKKKSSSS',
  '.........SSSSSSSSSS',
  '..........SSSSSSSS',
  '.......CCCCCCCCCCCCCC',
  '......CCbbbbbbbbbbbbCC',
  '.....CCbbbbbbbbbbbbbbCC',
  '.....CbbbbbbbbbbbbbbbbC',
  '.....CbbbbbdbbbbdbbbbbC',
  '.....CbbbbbbbbbbbbbbbbC',
  '.....CbbbbbdbbbbdbbbbbC',
  '.....CbbbbbbbbbbbbbbbbC',
  '.....CbbbbbbbbbbbbbbbbC',
  '.....CbbbbbbbbbbbbbbbbC',
  '.....CbbbbbbbbbbbbbbbbC',
  '.....CbbbbbbbbbbbbbbbbC',
  '.....bbbbdddddddddbbbbb',
  '......bbbbbbbbbbbbbbb',
  '.......ddd......ddd',
  '.......ddd......ddd',
  '.......ddd......ddd',
  '.......ddd......ddd',
  '.......ddd......ddd',
  '......Cddd......dddC',
  '......CCCC......CCCC',
  '.....kKKKK......KKKKk',
  '.....kkkkk......kkkkk',
  '',
];

/**
 * The tuba: a brass mass hugging the front of the body with the bell flaring
 * up past the shoulder — the roster Blaskapellist's own prop, grown. It is the
 * widest and the most of a silhouette, which is right: this is the body firing
 * the slow dense ring the whole lattice is built on.
 */
const TUBA = [
  '',
  '',
  '.....................gggggggggg',
  '.....................gGGGGGGGGg',
  '.....................gGGGGGGGGg',
  '......................gGGGGGGg',
  '.......................gGGGGg',
  '........................gGGg',
  '........................gGGg',
  '.......................gGGg',
  '......................gGGg',
  '.....................gGGg',
  '....................gGGg',
  '...................gGGg',
  '..................gGGg',
  '.................ggGGgg',
  '................gGGGGGGg',
  '...............gGGGGGGGGg',
  '...............gGGhhhhGGGg',
  '...............gGGhggghGGGg',
  '...............gGGhggghGGGg',
  '...............gGGhhhhhGGGg',
  '...............gGGGGGGGGGGg',
  '................gGGGGGGGGg',
  '.................ggGGGGgg',
];

/**
 * The trumpet: small, bright, and the only instrument here pointed *up and
 * out* rather than hugged to the chest. It is the least of the three
 * silhouettes, which is the point: this is the body a player most wants gone
 * first and has to pick out of a crowded room to do it.
 */
const TROMPETE = [
  '',
  '',
  '............................gggg',
  '...........................gGGGGGg',
  '..........................gGGGGGGGg',
  '..........................gGGGGGGg',
  '.........................gGGGGg',
  '........................gGGGg',
  '.......................gGGg',
  '......................gGGg',
  '.....................gGGg',
  '....................ghGhg',
  '....................ghGhg',
  '....................gGGg',
];

/**
 * The trombone: a bell at the shoulder and the slide thrown straight out. A
 * long horizontal line is the one shape neither of the other two has, and it
 * is what makes the third body legible in a room that already holds a mass of
 * brass and a spark of one.
 */
const POSAUNE = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '.................gggggg',
  '................gGGGGGGg',
  '...............gGGGGGGGGg',
  '...............gGGGGGGGGg',
  '...............gGGGGGGGGgggggggggggg',
  '...............gGGGGGGGGGGGGGGGGGGGg',
  '...............gGGGGGGGGgggggggggggg',
  '...............gGGGGGGGGg',
  '................gGGGGGGg',
  '.................gggggg',
];

export const blaskapelleTuba = single('die-blaskapelle-tuba', overlay(BANDSMAN_BODY, TUBA));
export const blaskapelleTrompete = single(
  'die-blaskapelle-trompete',
  overlay(BANDSMAN_BODY, TROMPETE),
);
export const blaskapellePosaune = single(
  'die-blaskapelle-posaune',
  overlay(BANDSMAN_BODY, POSAUNE),
);

// =====================================================================
//  Der Ladewagen — tractor and trailer, one body
// =====================================================================

/**
 * Long and low: green tractor at the front (the roster Traktor's grille and
 * two headlamps, and deliberately no face — issue #192's decided call, a
 * tractor with eyes is a different game's tone), a hitch, and behind it the
 * hay wagon whose load is the thing it is about to start leaving on the floor.
 *
 * 46 wide against the `mid` class's 40px collider — inside
 * `sprite-scale.test.ts`'s band, and wide on purpose: the whole read is "this
 * is a vehicle driving a circuit", which a body as tall as it is wide does not
 * give. The hay on the trailer is the same cream the dropped bale is drawn in,
 * so the first bale that lands reads as having come off *this*.
 */
export const derLadewagen = single('der-ladewagen', [
  '..................CCCCCCCCCCCCCCCCCC',
  '.................CCCCCCCCCCCCCCCCCCCC',
  '................CCCoCCCCCCCCoCCCCCCCCC',
  '....gg..........CCCCCCCCCCCCCCCCCCCCCC',
  '....gg..........CoCCCCCoCCCCCCCoCCCCCC',
  '....gg.........CCCCCCCCCCCCCCCCCCCCCCC',
  '....gg.........CCCoCCCCCCCoCCCCCCCCoCC',
  '..nnnnnn.......CCCCCCCCCCCCCCCCCCCCCCC',
  '.nnnnnnnn......hhhhhhhhhhhhhhhhhhhhhhh',
  '.nnnnnnnnn.....hgggggggggggggggggggggh',
  '.nyyyynnnn.....hgnnnghnnnghnnnghnnnngh',
  '.yyyyyynnnn....hgnnnghnnnghnnnghnnnngh',
  '.yyyyyynnnn....hgnnnghnnnghnnnghnnnngh',
  '.nyyyynnnnn....hgggggggggggggggggggggh',
  '.nnnnnnnnnn....hhhhhhhhhhhhhhhhhhhhhhh',
  'nnnnnnnnnnnnnnnnhhhhhhhhhhhhhhhhhhhhh',
  'nnnnnnnnnnnnnnnnhhhhhhhhhhhhhhhhhhhhh',
  'WnnnnnnnnnnnnnnL',
  'WnnnnnnnnnnnnnnL',
  'nnnnnnnnnnnnnnn',
  '.nnnnnnnnnnnnn',
  '..hhhhhhhhhhh.....hhhhhhh....hhhhhhh',
  '.hgggggggggggh...hgggggggh..hgggggggh',
  'hgggghhhhhggggh..hgghhhggh..hgghhhggh',
  'hggghhhhhhhgggh..hghhhhhgh..hghhhhhgh',
  'hggghhhhhhhgggh..hghhhhhgh..hghhhhhgh',
  'hgggghhhhhggggh..hgghhhggh..hgghhhggh',
  '.hgggggggggggh...hgggggggh..hgggggggh',
  '..hhhhhhhhhhh.....hhhhhhh....hhhhhhh',
]);

/** The single-frame sprites `build-floor2-minibosses` writes, keyed by enemy id. */
export const MINIBOSSES = {
  'die-blaskapelle-tuba': blaskapelleTuba,
  'die-blaskapelle-trompete': blaskapelleTrompete,
  'die-blaskapelle-posaune': blaskapellePosaune,
  'der-ladewagen': derLadewagen,
};

export const MINIBOSS_BUCKET = 'floor-2-rural';
