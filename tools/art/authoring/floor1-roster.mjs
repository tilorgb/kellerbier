import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * Der Keller's roster, as text grids — the Floor 1 half of the chibi redraw
 * (`docs/DECISIONS.md` #55, issue #191). Floor 2's roster (#192) is the other
 * half and established the shared method: a per-floor key map, a full-canvas
 * text grid per sprite, and `inkOutline` putting the hard `#000000` edge on
 * automatically.
 *
 * #55's three rules do not transfer to this roster — half of it is not a
 * person: a woodlouse, a mould patch, a rolling barrel, a barrel splinter, a
 * wall tap. What carries, and what does not (both decided in #191's option
 * round, recorded in #55's amendment):
 *
 * - **Face — only for the animals.** The Kellerassel, its shed segment and
 *   the Bierratte get an eye: a white sclera against a near-black pupil, big
 *   enough to read a blink and a flinch, which is the whole of what a chibi
 *   direction buys. The **Schimmelfleck does not** — it is a spreading growth,
 *   and it reads by its lumpy silhouette and the way it pulses, not by
 *   staring back; its Spore inherits that. The **Zapfhahn and Rollfass do
 *   not** either — a tap is plumbing and a barrel is a barrel, the same call
 *   #192 made for the Traktor. The Fasssplitter is flung debris, no face.
 * - **Proportion becomes "the head-feature is oversized".** The Kellerassel's
 *   front plate and the Bierratte's head are drawn large against a shrunk
 *   body; there is no `HUMAN_FACE`-style shared block because there is no
 *   shared head shape.
 * - **Prop mostly does not apply** and is not forced.
 *
 * Palette is Der Keller's five — three close greys, one brown, one amber —
 * plus the neutrals and their ramps (`CELLAR`, checked on load). This is the
 * game's lowest-contrast floor by design (`tools/art/palette.mjs`), so #55's
 * "flat fills, lean on the outline not the shading" clause matters most here:
 * a creature drawn with soft internal shading disappears into the wall, and
 * the `#000000` edge is the only thing that reliably separates it.
 *
 * The Kellerassel is a seven-frame strip and stays one — same frame count,
 * same clip names as its committed `.anim.json` (idle/move/hurt/death). It is
 * built from shared parts (a body, an eye per expression, a leg pose per
 * beat, three curl beats) for Alois's exact reason (#55): seven copies of one
 * drawing hand-edited is how a walk cycle ends up a pixel off on frame 3.
 */

// ------------------------------------------------------------------ palette
export const CELLAR = {
  '.': null,
  K: 0x000000, // outline + internal ink
  x: 0x1c1a1f, // near-black shade, and the eye pupil
  D: 0x3c3e40, // grey, darkest (Der Keller base)
  M: 0x4a4d50, // grey, mid
  L: 0x5b5f63, // grey, light
  H: 0x888d92, // grey, highlight (one step up from light)
  G: 0x8a8a8a, // neutral grey — brass fittings, iron hoops
  B: 0x54402e, // brown (the wooden racks' wood)
  b: 0x36291e, // brown, dark
  r: 0x72573e, // brown, lit
  R: 0x8f6d4e, // brown, highlight
  A: 0xd99a3f, // amber — the one warm light source, used as a rim only
  W: 0xffffff, // eye sclera, hot glint
};

{
  const legal = legalPixelColorsFor('floor-1-cellar');
  for (const [key, colour] of Object.entries(CELLAR)) {
    if (colour !== null && !legal.has(colour)) {
      throw new Error(
        `floor1-roster key "${key}" is #${colour.toString(16).padStart(6, '0')}, ` +
          `not legal for floor-1-cellar — see tools/art/palette.mjs`,
      );
    }
  }
}

// --------------------------------------------------------------- raster core
// (the same core `tools/art/authoring/floor2-roster.mjs` uses; kept per-module
// the way `bosses.mjs` keeps its own, rather than a shared import.)
function canvas(w, h) {
  return { w, h, px: Array.from({ length: h }, () => Array.from({ length: w }, () => null)) };
}

/** Text rows → canvas. Widest row sets the width; shorter rows pad transparent. */
function paint(name, rows) {
  const w = Math.max(...rows.map((row) => row.length));
  if (w === 0) throw new Error(`${name}: no rows`);
  const cv = canvas(w, rows.length);
  rows.forEach((row, y) => {
    const padded = row.padEnd(w, '.');
    for (let x = 0; x < w; x++) {
      const ch = padded[x];
      if (!(ch in CELLAR)) throw new Error(`${name}: row ${String(y)} has unknown key "${ch}"`);
      cv.px[y][x] = CELLAR[ch];
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

/** A whole sprite from one full-canvas text grid, auto-inked. */
function single(name, rows) {
  return frameOf(name, inkOutline(paint(name, rows)));
}

/**
 * Compose one frame from a stack of `{ rows, x, y }` parts on a `w`×`h`
 * canvas, then auto-ink. Later parts paint over earlier ones. Used only for
 * the Kellerassel, whose seven frames are one body re-posed.
 */
function compose(name, w, h, parts) {
  const cv = canvas(w, h);
  for (const { rows, x = 0, y = 0 } of parts) {
    const part = paint(`${name}-part`, rows);
    for (let py = 0; py < part.h; py++) {
      for (let px = 0; px < part.w; px++) {
        const c = part.px[py][px];
        if (c === null) continue;
        const tx = x + px;
        const ty = y + py;
        if (tx >= 0 && ty >= 0 && tx < w && ty < h) cv.px[ty][tx] = c;
      }
    }
  }
  return frameOf(name, inkOutline(cv));
}

/** Throws if any painted pixel is not legal for floor-1-cellar. */
export function assertOnPalette(_bucket, framesIn) {
  const legal = legalPixelColorsFor('floor-1-cellar');
  for (const f of framesIn) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const c = f.px[y][x];
        if (c !== null && !legal.has(c)) {
          throw new Error(
            `${f.name}: pixel ${x},${y} is #${c.toString(16).padStart(6, '0')}, not legal for floor-1-cellar`,
          );
        }
      }
    }
  }
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
        `${name}: frame ${f.name} is ${String(f.width)}x${String(f.height)}, ` +
          `expected ${String(first.width)}x${String(first.height)}`,
      );
    }
  }
  const width = first.width * frames.length;
  const pixels = Buffer.alloc(width * first.height * 4);
  frames.forEach((f, i) => putFrame(pixels, width, f, i * first.width));
  return encodePng({ width, height: first.height, pixels });
}

// ============================================================ KELLERASSEL
// A chibi woodlouse seen three-quarters from the front: an oversized brown
// chitin head plate carrying two eyes, four ridged armour segments trailing
// behind it, a fringe of legs and two antennae. Threatened, it rolls into a
// ball — which is what the three death beats are.
//
// Canvas 26×18, `normal` (collider 28): the body reads ~24 wide, mid-band.
// Brown, not grey — chitin, and on Der Keller's grey wall the brown is what
// separates it before the outline even has to.
const KA_W = 26;
const KA_H = 18;

// The shared body: antennae, ridged segments trailing up, the wide head plate
// low (toward the camera). Eyes and legs are stamped per frame.
const kaBody = [
  '.....b..........b.....',
  '.....b..........b.....',
  '......b........b......',
  '.......rBBBBBBr.......',
  '......rBBBBBBBBr......',
  '......rbbbbbbbbr......',
  '.....rBBBBBBBBBBr.....',
  '.....rbbbbbbbbbbr.....',
  '....rBBBBBBBBBBBBr....',
  '....rbbbbbbbbbbbbr....',
  '...rBBBBBBBBBBBBBBr...',
  '..rBBBBBBBBBBBBBBBBr..',
  '..rBBBBBBBBBBBBBBBBr..',
  '..rBBBBBBBBBBBBBBBBr..',
  '..rrBBBBBBBBBBBBBBrr..',
  '...rrbBBBBBBBBBBbrr...',
  '....rr.rr..rr.rr.....',
];

/** Eyes on the head plate: `open` for idle/walk, `shut` for the flinch. */
const kaEyes = {
  open: { y: 11, rows: ['....KWWK....KWWK....', '....KxxK....KxxK....'] },
  shut: { y: 11, rows: ['....KKKK....KKKK....', '...................'] },
};

/** Leg fringe down each side of the plate, in three contact poses. */
const kaLegs = {
  plant: { y: 10, x: 1, rows: ['K..............K', 'K..............K', 'K..............K'] },
  fwd: { y: 10, x: 1, rows: ['KK............K.', 'K............KK.', 'KK............K.'] },
  back: { y: 10, x: 1, rows: ['.K............KK', '.KK............K', '.K............KK'] },
};

function kaFrame(name, eyes, legs) {
  return compose(name, KA_W, KA_H, [
    { rows: kaBody, x: 2, y: 0 },
    { rows: eyes.rows, x: 2, y: eyes.y },
    { rows: legs.rows, x: legs.x, y: legs.y },
  ]);
}

// Death: half-curl, tight ball, settled ball with a cracked plate.
const kaCurl1 = [
  '.....rBBBBBBBBr.....',
  '...rBBBBBBBBBBBBr...',
  '..rBBBbbbbbbBBBBBr..',
  '..rBBKWWKBBKWWKBBr..',
  '.rBBBBBBBBBBBBBBBBr.',
  '.rbBBBBBBBBBBBBBBbr.',
  '.rBBBBBBBBBBBBBBBBr.',
  '..rrbBBBBBBBBBBbrr..',
  '....rr.rr..rr.rr....',
];
const kaCurl2 = [
  '....rBBBBBBBBr....',
  '..rBBBBBBBBBBBBr..',
  '.rBBBbbbbbbbBBBBr.',
  '.rBBBBBBBBBBBBBBr.',
  '.rbBBBBBBBBBBBBbr.',
  '.rBBBBBBBBBBBBBBr.',
  '..rrBBBBBBBBBBrr..',
  '....rrr..rrr......',
];
const kaCurl3 = [
  '...rBBBBBBBBBBr...',
  '.rBBBKbbbbbKBBBBr.',
  '.rBBBBKbbbKBBBBBr.',
  '.rbBBBBKbKBBBBBbr.',
  '.rBBBBBBBBBBBBBBr.',
  '..rrbBBBBBBBBbrr..',
  '....rrrrrrrrr.....',
];

function centred(name, rows) {
  const cv = canvas(KA_W, KA_H);
  const w = Math.max(...rows.map((r) => r.length));
  const ox = Math.floor((KA_W - w) / 2);
  const oy = KA_H - rows.length - 1;
  const part = paint(`${name}-c`, rows);
  for (let y = 0; y < part.h; y++)
    for (let x = 0; x < part.w; x++) {
      const c = part.px[y][x];
      if (c !== null) cv.px[oy + y][ox + x] = c;
    }
  return frameOf(name, inkOutline(cv));
}

export const KELLERASSEL_FRAMES = [
  kaFrame('kellerassel-0', kaEyes.open, kaLegs.plant),
  kaFrame('kellerassel-1', kaEyes.open, kaLegs.fwd),
  kaFrame('kellerassel-2', kaEyes.open, kaLegs.back),
  kaFrame('kellerassel-3', kaEyes.shut, kaLegs.plant),
  centred('kellerassel-4', kaCurl1),
  centred('kellerassel-5', kaCurl2),
  centred('kellerassel-6', kaCurl3),
];

// ============================================================ KELLERASSEL-SEGMENT
// One shed armour plate of the same insect (`content/enemies/grosse-kellerassel.ts`
// spawns it). In `PENDING_REDRAW` at 0.54× its collider — this issue is what
// takes it out: a curved chitin plate, ridged, ~22 wide over a `normal` 28px
// collider.
export const kellerasselSegment = single('kellerassel-segment', [
  '...................',
  '...................',
  '....rrBBBBBBBBrr....',
  '..rrBBBBBBBBBBBBrr..',
  '.rBBBBBBBBBBBBBBBBr.',
  '.rBBBbbbbbbbbbbBBBr.',
  'rBBBBBBBBBBBBBBBBBBr',
  'rbBBBBBBBBBBBBBBBBbr',
  'rBBBBBBBBBBBBBBBBBBr',
  '.rBBBBBBBBBBBBBBBBr.',
  '.rrBBBBBBBBBBBBBBrr.',
  '..rrbBBBBBBBBBBbrr..',
  '....rrrrrrrrrrrr....',
  '...................',
  '...................',
  '...................',
]);

// ============================================================ BIERRATTE
// A `mini` swarm rat (collider 16): an oversized head with one big eye, a
// snub snout, round ears, a small body and a long bare tail. Brown.
export const bierratte = single('bierratte', [
  '..............',
  '..............',
  '.b.........b..',
  'bBBb......bBBb',
  'bBBBb....bBBBb',
  '.bBBBbbbbBBBb.',
  '.bBBBBBBBBBBb.',
  'bBBBWWKBBBBBrb',
  'bBBBWxKBBBBrrrb',
  'bBBBBBBBBBBrrrr',
  '.bBBBBBBBBBb.b.',
  '..bBBBBBBBb....',
  '..bKKbbKKb.....',
  '..............',
  '..............',
  '..............',
]);

// ============================================================ FASSSPLITTER
// A flung splinter of barrel stave (`content/enemies/rollfass.ts` spawns it
// on the barrel's death). `mini`. Debris — no face. Dark wood, a lit edge.
export const fasssplitter = single('fasssplitter', [
  '.......Kr',
  '......Krr',
  '.....Krrb',
  '.....Krbb',
  '....Krrb.',
  '....Krbb.',
  '...Krrbb.',
  '...Krbb..',
  '..Krrbb..',
  '..Krbb...',
  '.Krrbb...',
  '.Krbbb...',
  '.Krbb....',
  'Kbbb.....',
  'Kbb......',
  '.K.......',
]);

// ============================================================ ROLLFASS
// A rolling barrel (`mid`, collider 40). No face — staves and two iron hoops,
// it reads by rolling at you. Bigger and rounder than the old one so it sits
// mid-band.
export const rollfass = single('rollfass', [
  '.........KKKKKKKKKKKKKK.........',
  '......KKKrbbbbbbbbbbbbrKKK......',
  '....KKrrbBBBBBBBBBBBBBBbrrKK....',
  '..KKrbbBBBBGGBBBBBBGGBBBBbbrKK..',
  '.KrbBBBBBBBGGBBBBBBGGBBBBBBBbrK.',
  '.KbBBBBBBBBGGBBBBBBGGBBBBBBBBbK.',
  'KrbrrrrrrrrGGrrrrrrGGrrrrrrrrbrK',
  'KbBBBBBBBBBGGBBBBBBGGBBBBBBBBBbK',
  'KbBBBBBBBBBGGBBBBBBGGBBBBBBBBBbK',
  'KrbrrrrrrrrGGrrrrrrGGrrrrrrrrbrK',
  'KbBBBBBBBBBGGBBBBBBGGBBBBBBBBBbK',
  '.KbBBBBBBBBGGBBBBBBGGBBBBBBBBbK.',
  '.KrbBBBBBBBGGBBBBBBGGBBBBBBBbrK.',
  '..KKrbbBBBBGGBBBBBBGGBBBBbbrKK..',
  '....KKrrbBBBBBBBBBBBBBBbrrKK....',
  '......KKKrbbbbbbbbbbbbrKKK......',
  '.........KKKKKKKKKKKKKK.........',
]);

// ============================================================ SCHIMMELFLECK
// A spreading patch of cellar mould (`normal`, collider 28). No face
// (#191's call): it reads as a lumpy, irregular growth with a few tendrils
// creeping off it, and by the way it pulses. Grey with a sickly lit edge.
export const schimmelfleck = single('schimmelfleck', [
  '...................',
  '.....LL....L...L....',
  '..L.LLLL..LLL.LL.L..',
  '.LLLLLLLLLLLLLLLLLL.',
  'LLHHLLLLHHLLLLHHLLLL',
  'LLLLLLLLLLLLLLLLLLLL',
  'MLLLLLLLLLLLLLLLLLLM',
  'MMMLLLLLLLLLLLLLLMMM',
  'DMMMMMLLLLLLLLMMMMMD',
  '.DMMMMMMMMMMMMMMMMD.',
  'L.DDMMMMMMMMMMMMDD.L',
  '.L..DDDDDMMDDDDD..L.',
  '..L...L..DD..L...L..',
  '.......L..L.........',
  '...................',
  '...................',
]);

// ============================================================ SCHIMMELSPORE
// A single spore drifting off the patch (`mini`). No face — a fuzzy grey
// mote with a lit rim, a couple of stray filaments.
export const schimmelspore = single('schimmelspore', [
  '............',
  '....L...L...',
  '..L..LLL..L.',
  '...LLLLLLL..',
  '..LLHHHHLLL.',
  '.LLLLLLLLLLL',
  '.LLLLLLLLLLL',
  '.LLLLLLLLLLL',
  '..LLLLLLLLL.',
  '..L.DDMMDD.L',
  '.....L..L...',
  '............',
  '............',
  '............',
  '............',
  '............',
]);

// ============================================================ ZAPFHAHN
// A brass tap bolted to the wall (`normal`, contact damage 0). No face — the
// spout and the cross handle are the read, and the handle winding up is the
// telegraph. The one amber note on the floor is legal here as the brass
// catching the cellar's single warm bulb — a rim, not a fill.
export const zapfhahn = single('zapfhahn', [
  '..KKKKKK..',
  '.KGGGGGGK.',
  'KGGHHHHGGK',
  'KGHHGGHHGK',
  'KGHGGGGHGK',
  'KGHGGGGHGK',
  'KGHHGGHHGK',
  'KGGHHHHGGK',
  '.KGGGGGGK.',
  '..KGGGGK..',
  '..KGAAGK..',
  '..KGGGGK..',
  '..KGGGGK..',
  '.KGGHHGGK.',
  'KGGHHHHGGK',
  'KGHHGGHHGK',
  'KGHGGGGHGK',
  'KGGHGGHGGK',
  '.KGGHHGGK.',
  '..KGGGGK..',
  '...KGGK...',
  '...KGGK...',
  '..KGGGGK..',
  '..KAAAAK..',
  '..KGGGGK..',
  '...KKKK...',
]);

/** The single-frame sprites `build-floor1-roster` writes. */
export const ROSTER = {
  'kellerassel-segment': kellerasselSegment,
  bierratte,
  fasssplitter,
  rollfass,
  schimmelfleck,
  schimmelspore,
  zapfhahn,
};

export const ROSTER_BUCKET = 'floor-1-cellar';
