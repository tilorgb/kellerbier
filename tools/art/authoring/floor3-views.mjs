import { fileURLToPath } from 'node:url';
import { canvas, ellipse, fillRect, line, px, roundRect, toRows } from './draw.mjs';
import { WALD } from './floor3-roster.mjs';
import {
  assertViewsOnPalette,
  encodeSidecar,
  encodeViewStrip,
  frameFromRows,
} from './views-kit.mjs';
import { readFileSync } from 'node:fs';

/**
 * The Floor 3 animals' toward-the-camera and away views (#448 Boar, #449
 * Kaninchen, #450 Bachforelle; epic #457) — what `render/entities.ts` picks
 * by heading, beside the side-on art each already has.
 *
 * - **Boar** and **Kaninchen** ship `-south` and `-north` strips only. Their
 *   side view stays the committed strip, because a `facing: 'mirror'` body
 *   turns to what it is about to charge or hop at while it stands still
 *   (`render/animation/state.ts`, `resolveMirrorFacing`) and a `-side` strip
 *   would trade that for the heading. Each view keeps its animal's canvas
 *   and sidecar (idle / move / hurt), so the collider and the clips are
 *   exactly what they were.
 * - **Bachforelle** swims as `bachforelle-shadow` (side-on, darkened and
 *   flattened by the renderer); its toward and away shadows are two more
 *   single frames, `bachforelle-shadow-south` / `-north`, on the same canvas.
 *
 * Same colours as the signed-off side views (`floor3-roster.mjs`'s `WALD`).
 * Drawn from primitives, then inked once.
 */

export const FLOOR3_BUCKET = 'floor-3-wald';
export const CHARACTER_DIR = fileURLToPath(
  new URL('../../../assets/sprites/floor-3-wald/characters/', import.meta.url),
);

const BOAR_W = 49;
const BOAR_H = 31;

/** The boar's two forelegs / hind legs, `lift` rows off the ground on the chosen side. */
function boarLegs(c, lifted) {
  for (const [side, x] of [
    ['l', 12],
    ['r', 31],
  ]) {
    const lift = lifted === side ? 2 : 0;
    fillRect(c, x, 23, 6, 7 - lift, 'c');
    fillRect(c, x, 29 - lift, 6, 1, 'a');
  }
}

/** Toward the camera: ears, a muted snout between two tusks, the mane over the shoulders. */
function boarSouth(lifted) {
  const c = canvas(BOAR_W, BOAR_H, '.');
  boarLegs(c, lifted);
  // Shoulders and the bristly mane over them.
  roundRect(c, 10, 4, 29, 20, 7, '7');
  fillRect(c, 15, 1, 19, 1, 'a');
  for (let x = 15; x <= 33; x += 2) px(c, x, 0, 'a');
  fillRect(c, 13, 2, 23, 3, 'a');
  // Head, a shade lighter, ears at the top corners.
  roundRect(c, 15, 7, 19, 17, 5, '7');
  fillRect(c, 17, 8, 15, 2, 'm');
  fillRect(c, 14, 6, 4, 4, 'c');
  fillRect(c, 31, 6, 4, 4, 'c');
  // Eyes, small and set deep.
  fillRect(c, 19, 13, 2, 2, 'K');
  fillRect(c, 28, 13, 2, 2, 'K');
  // Snout, the muted disc, and its nostrils.
  roundRect(c, 20, 17, 9, 6, 2, 'c');
  px(c, 22, 20, 'K');
  px(c, 26, 20, 'K');
  // The tusks: pale crescents curving up either side of the snout.
  for (const [x, y] of [
    [19, 22],
    [18, 21],
    [18, 20],
    [18, 19],
    [19, 18],
  ]) {
    px(c, x, y, 'w');
    px(c, 48 - x, y, 'w');
  }
  px(c, 19, 21, 's');
  px(c, 29, 21, 's');
  return frameFromRows('boar-south', WALD, toRows(c));
}

/** Away: ears over the nape, the dark mane ridge down the middle, hams, a tail stub. */
function boarNorth(lifted) {
  const c = canvas(BOAR_W, BOAR_H, '.');
  boarLegs(c, lifted);
  roundRect(c, 10, 6, 29, 18, 7, '7');
  // Neck and head from behind, ears out at the sides.
  roundRect(c, 16, 2, 17, 10, 4, '7');
  fillRect(c, 14, 3, 4, 4, 'c');
  fillRect(c, 31, 3, 4, 4, 'c');
  // The mane ridge, nape to rump.
  fillRect(c, 22, 1, 5, 17, 'a');
  for (let y = 1; y <= 16; y += 2) {
    px(c, 21, y, 'a');
    px(c, 27, y, 'a');
  }
  // Hams: a lit curve on each side of the rump.
  ellipse(c, 16, 17, 4, 4, 'm');
  ellipse(c, 33, 17, 4, 4, 'm');
  fillRect(c, 22, 18, 5, 1, 'c');
  // The tail, a short dark curl.
  line(c, 24, 18, 24, 21, 'a');
  px(c, 25, 21, 'a');
  px(c, 25, 22, 'a');
  return frameFromRows('boar-north', WALD, toRows(c));
}

const KANIN_W = 15;
const KANIN_H = 16;

/** The rabbit toward the camera; `hop` stretches it up off the ground and spreads the paws. */
function kaninSouth(hop) {
  const c = canvas(KANIN_W, KANIN_H, '.');
  const up = hop ? 2 : 0;
  // Ears, the inner pink down the middle.
  fillRect(c, 4, 0, 2, 5, 'm');
  fillRect(c, 9, 0, 2, 5, 'm');
  px(c, 4, 1, 'q');
  px(c, 4, 2, 'q');
  px(c, 10, 1, 'q');
  px(c, 10, 2, 'q');
  roundRect(c, 3, 4, 9, 7, 3, 'm');
  fillRect(c, 4, 5, 7, 1, 'l');
  // Eyes and nose.
  px(c, 5, 7, 'K');
  px(c, 9, 7, 'K');
  px(c, 7, 8, 'q');
  roundRect(c, 2, 10, 11, 5 - 0, 2, 'm');
  fillRect(c, 6, 11, 3, 3, 'S');
  // Front paws, then the hind feet showing either side.
  fillRect(c, 5, 14 - up, 2, 1, 'S');
  fillRect(c, 8, 14 - up, 2, 1, 'S');
  fillRect(c, 2, 14, 2, 1, 'K');
  fillRect(c, 11, 14, 2, 1, 'K');
  const frame = frameFromRows(hop ? 'kaninchen-south-hop' : 'kaninchen-south', WALD, toRows(c));
  return hop ? liftOff(frame, 1) : frame;
}

/** The rabbit from behind: two ears, a round nape, the white scut. */
function kaninNorth(hop) {
  const c = canvas(KANIN_W, KANIN_H, '.');
  fillRect(c, 4, 0, 2, 5, 'm');
  fillRect(c, 9, 0, 2, 5, 'm');
  fillRect(c, 4, 0, 1, 5, 'l');
  fillRect(c, 9, 0, 1, 5, 'l');
  roundRect(c, 3, 4, 9, 6, 3, 'm');
  roundRect(c, 2, 8, 11, 7, 3, 'm');
  fillRect(c, 4, 9, 7, 1, 'l');
  // The scut.
  ellipse(c, 7, 12, 2, 2, 'S');
  fillRect(c, 2, 14, 3, 1, 'K');
  fillRect(c, 10, 14, 3, 1, 'K');
  const frame = frameFromRows(hop ? 'kaninchen-north-hop' : 'kaninchen-north', WALD, toRows(c));
  return hop ? liftOff(frame, 1) : frame;
}

/** The frame lifted `rows` off the ground (everything up, the bottom rows left empty). */
function liftOff(frame, rows) {
  const px2 = frame.px.map((row) => [...row]);
  px2.splice(0, rows);
  for (let i = 0; i < rows; i++) px2.push(frame.px[0].map(() => null));
  return { ...frame, px: px2 };
}

const TROUT_W = 26;
const TROUT_H = 16;

/** The swimming shadow toward the camera: the head-on oval, eyes, gill plates and the pectoral fins out to the sides. */
function troutSouth() {
  const c = canvas(TROUT_W, TROUT_H, '.');
  // Dorsal fin peeking over the back.
  fillRect(c, 12, 2, 2, 2, '1');
  ellipse(c, 12.5, 9, 5.5, 5.5, '3');
  ellipse(c, 12.5, 11, 4.5, 3.5, '5');
  fillRect(c, 9, 5, 8, 2, '2');
  // Pectoral fins.
  fillRect(c, 4, 10, 4, 2, '2');
  fillRect(c, 18, 10, 4, 2, '2');
  // Eyes and the mouth.
  px(c, 9, 7, 'K');
  px(c, 16, 7, 'K');
  px(c, 9, 6, 'w');
  px(c, 16, 6, 'w');
  fillRect(c, 11, 11, 3, 1, '6');
  // Spots.
  px(c, 10, 9, '6');
  px(c, 15, 9, '6');
  px(c, 13, 5, 'V');
  return frameFromRows('bachforelle-shadow-south', WALD, toRows(c));
}

/** The swimming shadow from behind: the broad tail fan, the dorsal ridge, the pectoral tips. */
function troutNorth() {
  const c = canvas(TROUT_W, TROUT_H, '.');
  ellipse(c, 12.5, 6, 4.5, 4, '3');
  fillRect(c, 12, 1, 2, 4, '1');
  fillRect(c, 11, 4, 4, 4, '2');
  // The tail fan, spreading to the bottom.
  for (let y = 9; y <= 14; y++) {
    const half = 2 + (y - 9);
    fillRect(c, 12 - half + 1, y, half * 2, 1, y % 2 === 0 ? '2' : '3');
  }
  fillRect(c, 4, 6, 3, 2, '2');
  fillRect(c, 19, 6, 3, 2, '2');
  px(c, 11, 5, '6');
  px(c, 15, 6, '6');
  px(c, 13, 10, 'V');
  return frameFromRows('bachforelle-shadow-north', WALD, toRows(c));
}

/** Boar: stand, a diagonal pair up, the other pair up — the side strip's own walk. */
const BOAR_SOUTH = [boarSouth(null), boarSouth('l'), boarSouth('r')];
const BOAR_NORTH = [boarNorth(null), boarNorth('l'), boarNorth('r')];
const KANIN_SOUTH = [kaninSouth(false), kaninSouth(true)];
const KANIN_NORTH = [kaninNorth(false), kaninNorth(true)];

/** Every animated strip, by committed name. */
export const STRIPS = {
  'boar-south': BOAR_SOUTH.map((f, i) => ({ ...f, name: `boar-south-${String(i)}` })),
  'boar-north': BOAR_NORTH.map((f, i) => ({ ...f, name: `boar-north-${String(i)}` })),
  'kaninchen-south': KANIN_SOUTH,
  'kaninchen-north': KANIN_NORTH,
};

/** Single frames: the swimming shadow's two extra headings. */
export const SINGLES = {
  'bachforelle-shadow-south': troutSouth(),
  'bachforelle-shadow-north': troutNorth(),
};

/** Each strip's sidecar is its animal's committed one, verbatim. */
export const SIDECARS = {
  'boar-south': JSON.parse(readFileSync(`${CHARACTER_DIR}boar.anim.json`, 'utf8')),
  'boar-north': JSON.parse(readFileSync(`${CHARACTER_DIR}boar.anim.json`, 'utf8')),
  'kaninchen-south': JSON.parse(readFileSync(`${CHARACTER_DIR}kaninchen.anim.json`, 'utf8')),
  'kaninchen-north': JSON.parse(readFileSync(`${CHARACTER_DIR}kaninchen.anim.json`, 'utf8')),
};

/** Each creature's own canvas — what every one of its views is drawn on. */
export const BASE_CANVAS = {
  boar: [BOAR_W, BOAR_H],
  kaninchen: [KANIN_W, KANIN_H],
  'bachforelle-shadow': [TROUT_W, TROUT_H],
};

export function assertOnPalette() {
  assertViewsOnPalette(FLOOR3_BUCKET, {
    ...STRIPS,
    ...Object.fromEntries(Object.entries(SINGLES).map(([name, frame]) => [name, [frame]])),
  });
}

export { encodeSidecar, encodeViewStrip };
