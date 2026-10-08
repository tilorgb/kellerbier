import { fileURLToPath } from 'node:url';
import { RURAL } from './floor2-roster.mjs';
import {
  VIEW_ANIM,
  assertViewsOnPalette,
  bobSteps,
  frameFromRows,
  readFrames,
} from './views-kit.mjs';

/**
 * The per-heading views of Floor 2's front-on creatures (#451-#455, epic
 * #457): `-side` (authored facing left, mirrored for right), `-north` (away)
 * and `-south` (toward the camera = the existing front art, bobbed), filed the
 * way Alois's and Der Ordner's are (`assets/sprites/README.md`, "Directions").
 *
 * Best-guess designs, no sign-off round (the user waived it for this batch):
 * Bauer (pitchfork out front / upright), Blaskapellist (tuba in front of him /
 * its coils round the sides), Böllerschmeißer (the lit Böller overhead, its
 * spark in every view), Gartenzwerg (hat and beard in profile / hat and back),
 * and Die Blaskapelle's Posaune, Trompete and Tuba (each instrument in profile
 * / from behind). Every view is the same canvas as its base art, so the
 * colliders and `sprite-scale.test.ts` stay valid; the colours are the
 * roster's own `RURAL` keys, on the floor-2-rural bucket.
 *
 * None of these is a multi-frame strip today, so each view is three frames
 * (stand, a step on each foot) with the shared `VIEW_ANIM` sidecar. Legs are
 * drawn per beat; the south strips are the front art bobbed.
 */

export { encodeViewStrip } from './views-kit.mjs';

export const bucket = 'floor-2-rural';

const DIR = fileURLToPath(
  new URL('../../../assets/sprites/floor-2-rural/characters/', import.meta.url),
);

// ------------------------------------------------------------------ grid kit
function grid(W, H) {
  return { W, H, c: Array.from({ length: H }, () => Array.from({ length: W }, () => '.')) };
}

/** Paints `s` at (x, y); `.` is skipped, `_` erases. Off-canvas pixels are dropped. */
function put(G, x, y, s) {
  [...s].forEach((ch, i) => {
    if (ch === '.' || y < 0 || y >= G.H || x + i < 0 || x + i >= G.W) return;
    G.c[y][x + i] = ch === '_' ? '.' : ch;
  });
}

function rect(G, x, y, w, h, ch) {
  for (let j = 0; j < h; j++) put(G, x, y + j, ch.repeat(w));
}

/** Fills columns x0..x1, centred on row `yc`, from half-height h0 to h1 — a flared horn. */
function cone(G, x0, x1, yc, h0, h1, edge = 'g', fill = 'G') {
  for (let x = x0; x <= x1; x++) {
    const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
    const h = Math.round(h0 + (h1 - h0) * t);
    for (let y = yc - h; y <= yc + h; y++) {
      put(G, x, y, Math.abs(y - yc) === h || x === x0 ? edge : fill);
    }
  }
}

/** A filled ellipse, `edge` on its rim and `fill` inside. */
function disc(G, cx, cy, rx, ry, edge = 'g', fill = 'G') {
  const inside = (x, y) => ((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2 <= 1;
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (!inside(x, y)) continue;
      const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      put(G, x, y, rim ? edge : fill);
    }
  }
}

function toFrame(name, G) {
  return frameFromRows(
    name,
    RURAL,
    G.c.map((r) => r.join('')),
  );
}

const BEATS = ['stand', 'a', 'b'];

/** One leg: `legH` rows of `ch` (the last `sock` of them `C`) lifted `lift` rows, then two rows of boot. */
function leg(G, x, y0, legH, w, ch, { lift = 0, toe = 0, sock = 0 } = {}) {
  const h = legH - lift;
  rect(G, x, y0, w, h, ch);
  if (sock > 0) rect(G, x, y0 + h - sock, w, sock, 'C');
  put(G, x - toe, y0 + h, 'K'.repeat(w + toe + 1));
  put(G, x - toe, y0 + h + 1, 'k'.repeat(w + toe + 1));
}

/** Two legs in profile (toes left): beat `a` strides, `b` passes with the front foot lifted. */
function sideLegs(G, cx, y0, legH, w, beat, sock = 0) {
  const [bx, fx, bl, fl] =
    beat === 'a'
      ? [cx + 2, cx - 3, 1, 0]
      : beat === 'b'
        ? [cx - 1, cx + 1, 0, 1]
        : [cx, cx - 1, 0, 0];
  leg(G, bx, y0, legH, w, 'k', { lift: bl, toe: 1, sock });
  leg(G, fx, y0, legH, w, 'd', { lift: fl, toe: 1, sock });
}

/** Two legs seen from behind: beat `a` lifts the left foot, `b` the right. */
function backLegs(G, lx, rx, y0, legH, w, beat, sock = 0) {
  leg(G, lx, y0, legH, w, 'd', { lift: beat === 'a' ? 1 : 0, sock });
  leg(G, rx, y0, legH, w, 'd', { lift: beat === 'b' ? 1 : 0, sock });
}

/** `[stand, step-a, step-b]` frames from a per-beat drawing function. */
function trio(name, W, H, draw) {
  return BEATS.map((beat) => {
    const G = grid(W, H);
    draw(G, beat);
    return toFrame(`${name}-${beat === 'stand' ? 'stand' : `step-${beat}`}`, G);
  });
}

// ===================================================================== BAUER
// 21x32. Front art: cap, cream sleeves, blue dungarees, pitchfork upright at
// his side. Side: profile, the fork held out in front, tines to the left.
// North: round cap, hair and nape, crossed braces, the fork still upright.
function bauerSide(G, beat) {
  // The fork first, so the body covers its middle: tines left, tail out behind.
  put(G, 2, 15, 'g');
  put(G, 2, 16, 'g');
  put(G, 0, 15, 'gg');
  put(G, 0, 17, 'gg');
  put(G, 0, 19, 'gg');
  put(G, 2, 17, 'g');
  put(G, 2, 18, 'g');
  put(G, 2, 19, 'g');
  put(G, 2, 17, 'gggggggggggggggggg');
  const ox = 2;
  put(G, ox + 6, 1, 'bbbbbb');
  put(G, ox + 5, 2, 'bbbbbbbb');
  put(G, ox + 5, 3, 'bbbbbbbbbb');
  put(G, ox + 1, 4, 'bkkbbbbbbbbbbb');
  put(G, ox + 5, 5, 'SSSSSSSSS');
  put(G, ox + 5, 6, 'SSSSSSSSS');
  put(G, ox + 5, 7, 'SKKKSSSSS');
  put(G, ox + 5, 8, 'SWeeSSSSS');
  put(G, ox + 4, 9, 'SSeeeSSsSS');
  put(G, ox + 4, 10, 'SSSSSSSSSS');
  put(G, ox + 5, 11, 'SSSKKSSSS');
  put(G, ox + 6, 12, 'SSSSSSSS');
  put(G, ox + 8, 13, 'SSSS');
  put(G, ox + 5, 14, 'CCCCCCCCC');
  rect(G, ox + 4, 15, 9, 7, 'b');
  rect(G, ox + 4, 15, 1, 5, 'C');
  rect(G, ox + 12, 15, 1, 5, 'C');
  put(G, ox + 6, 18, 'd');
  put(G, ox + 5, 21, 'bdddddb');
  // The near arm reaches out to the fork: cream sleeve, hand on the shaft.
  rect(G, ox + 2, 16, 4, 3, 'C');
  put(G, ox + 1, 16, 'SS');
  put(G, ox + 1, 17, 'SS');
  put(G, ox + 4, 18, 'bb');
  sideLegs(G, ox + 8, 22, 6, 3, beat);
}

function bauerNorth(G, beat) {
  // Fork, upright at the viewer's right, as in the front art.
  put(G, 14, 1, 'g.g.g'.replaceAll('.', '.'));
  put(G, 14, 2, 'g.g.g');
  put(G, 14, 3, 'ggggg');
  rect(G, 16, 4, 1, 21, 'g');
  put(G, 6, 1, 'bbbbb');
  put(G, 4, 2, 'bbbbbbbbb');
  put(G, 3, 3, 'bbbbbbbbbbb');
  put(G, 3, 4, 'bbbbbbbbbbbb');
  put(G, 3, 5, 'bbbbbbbbbbbb');
  put(G, 3, 6, 'bbbbbbbbbbbb');
  put(G, 3, 7, 'SddddddddddS');
  put(G, 3, 8, 'SsSSSSSSSSsS');
  put(G, 3, 9, 'SSSSSSSSSSSS');
  put(G, 3, 10, 'SSSSSSSSSSSS');
  put(G, 3, 11, 'SSSSSSSSSSSS');
  put(G, 4, 12, 'SSSSSSSSSS');
  put(G, 6, 13, 'SSSSSS');
  put(G, 5, 14, 'CCCCCCCC');
  put(G, 4, 15, 'CCbbbbbbCC');
  put(G, 3, 16, 'CCbbbbbbbbCC');
  put(G, 3, 17, 'SCbbbbbbbbCS');
  rect(G, 4, 18, 10, 3, 'C');
  rect(G, 5, 18, 8, 4, 'b');
  put(G, 7, 15, 'd');
  put(G, 12, 15, 'd');
  put(G, 8, 16, 'd');
  put(G, 11, 16, 'd');
  put(G, 9, 17, 'dd');
  put(G, 9, 18, 'dd');
  put(G, 9, 19, 'dd');
  put(G, 6, 20, 'dd');
  put(G, 11, 20, 'dd');
  put(G, 5, 21, 'bbdddddb');
  backLegs(G, 5, 10, 22, 6, 2, beat);
}

// ============================================================ BLASKAPELLIST
// 26x30. Tuba mass in front of him, the bell up beyond it. North: the coils
// round both sides of his back, the bell over the right shoulder.
function blaskapellistSide(G, beat) {
  // Bell, its tube, the mass and the mouthpiece pipe — behind the body.
  put(G, 2, 1, 'gggggggg');
  put(G, 2, 2, 'gGhhhhGg');
  put(G, 3, 3, 'gGGGGg');
  put(G, 3, 4, 'gGGGGg');
  for (let y = 5; y <= 12; y++) put(G, 4, y, 'gGGg');
  const mass = [
    [5, 'gggggggg'],
    [3, 'gGGGGGGGGg'],
    [2, 'gGGGGGGGGGGg'],
    [2, 'gGGGhhhhGGGg'],
    [2, 'gGGhggggGGGg'],
    [2, 'gGGhggggGGGg'],
    [2, 'gGGGhhhhGGGg'],
    [2, 'gGGGGGGGGGGg'],
    [3, 'gGGGGGGGGg'],
    [5, 'gggggggg'],
  ];
  mass.forEach(([x, s], i) => put(G, x, 13 + i, s));
  put(G, 12, 9, 'g');
  put(G, 11, 10, 'gg');
  put(G, 10, 11, 'gg');
  put(G, 10, 12, 'gg');
  // Head in profile, the Musikkapelle cap's brim to the front.
  put(G, 14, 2, 'bbbbbbb');
  put(G, 13, 3, 'bbbbbbbbb');
  put(G, 11, 4, 'bkbbbbbbbbbb');
  put(G, 13, 5, 'SSSSSSSSS');
  put(G, 13, 6, 'SSSSSSSSS');
  put(G, 13, 7, 'SKKKSSSSS');
  put(G, 13, 8, 'SWeeSSSSS');
  put(G, 12, 9, 'SSeeeSSsSS');
  put(G, 12, 10, 'SSSSSSSSSS');
  put(G, 13, 11, 'SSKKSSSSS');
  put(G, 14, 12, 'SSSSSSS');
  put(G, 16, 13, 'SSSS');
  // Torso and the arm round the tuba.
  put(G, 14, 14, 'CCCCCCCCC');
  rect(G, 13, 15, 10, 7, 'b');
  rect(G, 13, 15, 1, 5, 'C');
  rect(G, 22, 15, 1, 5, 'C');
  put(G, 15, 18, 'd');
  put(G, 15, 20, 'd');
  put(G, 14, 21, 'bbbdddbb');
  rect(G, 12, 16, 3, 3, 'C');
  put(G, 10, 17, 'SS');
  put(G, 10, 18, 'SS');
  sideLegs(G, 17, 22, 4, 3, beat);
}

function blaskapellistNorth(G, beat) {
  // Bell over the right shoulder, its tube, and the coil round that side.
  put(G, 17, 1, 'gggggg');
  put(G, 16, 2, 'gGGGGGg');
  put(G, 16, 3, 'gGGGGGg');
  put(G, 17, 4, 'gGGGGg');
  put(G, 18, 5, 'gGGg');
  for (let y = 6; y <= 12; y++) put(G, 18, y, 'gGGg');
  put(G, 6, 2, 'bbbbbbbb');
  put(G, 5, 3, 'bbbbbbbbbb');
  put(G, 5, 4, 'bbbbbbbbbb');
  put(G, 5, 5, 'bbbbbbbbbb');
  put(G, 6, 6, 'bbbbbbbbbb');
  put(G, 6, 7, 'SddddddddS');
  put(G, 6, 8, 'SsSSSSSSsS');
  put(G, 6, 9, 'SSSSSSSSSS');
  put(G, 6, 10, 'SSSSSSSSSS');
  put(G, 6, 11, 'SSSSSSSSSS');
  put(G, 7, 12, 'SSSSSSSS');
  put(G, 9, 13, 'SSSSS');
  put(G, 5, 13, 'CCCCCCCCCCC');
  rect(G, 4, 14, 12, 8, 'b');
  rect(G, 4, 14, 1, 6, 'C');
  rect(G, 15, 14, 1, 6, 'C');
  // The coils wrapped round both sides of the body.
  rect(G, 15, 14, 5, 9, 'G');
  rect(G, 15, 14, 1, 9, 'g');
  rect(G, 19, 15, 1, 7, 'g');
  put(G, 16, 17, 'hhh');
  put(G, 16, 18, 'hhh');
  rect(G, 2, 15, 3, 7, 'G');
  rect(G, 2, 15, 1, 7, 'g');
  put(G, 7, 16, 'dd');
  put(G, 9, 17, 'dd');
  put(G, 9, 18, 'dd');
  put(G, 6, 20, 'bddddb');
  backLegs(G, 6, 10, 22, 4, 2, beat);
}

// ======================================================= BÖLLERSCHMEISSER
// 18x28. The lit Böller overhead, spark in every view. Side: held out in
// front of him; north: raised on the viewer's right, as in the front art.
function spark(G, x) {
  put(G, x, 0, 'W');
  put(G, x - 1, 1, 'W.W');
  put(G, x, 2, 'y');
}

function bomb(G, x, y) {
  put(G, x + 1, y, 'kkkk');
  put(G, x, y + 1, 'kkhkkk');
  put(G, x, y + 2, 'kkkkkk');
  put(G, x, y + 3, 'kkkkkk');
  put(G, x + 1, y + 4, 'kkkk');
}

function boellerSide(G, beat) {
  spark(G, 4);
  bomb(G, 1, 3);
  put(G, 3, 8, 'SS');
  put(G, 4, 9, 'SS');
  put(G, 5, 10, 'bb');
  put(G, 6, 11, 'bb');
  put(G, 7, 12, 'bb');
  put(G, 9, 4, 'bbbbbb');
  put(G, 8, 5, 'bbbbbbbb');
  put(G, 7, 6, 'kbbbbbbbb');
  put(G, 9, 7, 'SSSSSSSS');
  put(G, 8, 8, 'SKKKSSSSS');
  put(G, 8, 9, 'SWeeSSSSS');
  put(G, 7, 10, 'SSeeeSSsSS');
  put(G, 8, 11, 'SSKKSSSSS');
  put(G, 9, 12, 'SSSSSSSS');
  put(G, 11, 13, 'SSSS');
  put(G, 10, 14, 'CCCCCCC');
  rect(G, 9, 15, 7, 5, 'b');
  rect(G, 9, 15, 1, 3, 'C');
  rect(G, 15, 15, 1, 3, 'C');
  put(G, 11, 17, 'ddd');
  put(G, 10, 19, 'bddddb');
  put(G, 12, 16, 'S');
  sideLegs(G, 12, 20, 4, 2, beat);
}

function boellerNorth(G, beat) {
  spark(G, 15);
  bomb(G, 12, 3);
  put(G, 14, 8, 'SS');
  put(G, 13, 9, 'bb');
  put(G, 13, 10, 'bb');
  put(G, 12, 11, 'bb');
  put(G, 12, 12, 'bb');
  put(G, 4, 4, 'bbbbbbb');
  put(G, 3, 5, 'bbbbbbbbb');
  put(G, 3, 6, 'bbbbbbbbb');
  put(G, 3, 7, 'bbbbbbbbb');
  put(G, 3, 8, 'SdddddddS');
  put(G, 3, 9, 'SsSSSSSsS');
  put(G, 3, 10, 'SSSSSSSSS');
  put(G, 3, 11, 'SSSSSSSSS');
  put(G, 4, 12, 'SSSSSSS');
  put(G, 6, 13, 'SSSSS');
  put(G, 4, 14, 'CCCCCCCC');
  put(G, 4, 15, 'CCbbbbbbCC');
  rect(G, 4, 16, 10, 4, 'b');
  put(G, 6, 16, 'd');
  put(G, 11, 16, 'd');
  put(G, 7, 17, 'dd');
  put(G, 8, 18, 'dd');
  put(G, 4, 19, 'bbdddddddb');
  put(G, 2, 16, 'S');
  put(G, 3, 17, 'S');
  backLegs(G, 5, 9, 20, 4, 2, beat);
}

// ============================================================ GARTENZWERG
// 18x26. Pointed hat and full beard. Side: the beard juts in front of the
// chest, the hat tilts back. North: hat, white hair down the back, green coat.
function hat(G, ox) {
  put(G, ox + 4, 0, 'b');
  put(G, ox + 3, 1, 'bbb');
  put(G, ox + 3, 2, 'bbb');
  put(G, ox + 2, 3, 'bbbbb');
  put(G, ox + 2, 4, 'bbbbb');
  put(G, ox + 1, 5, 'bbbbbbb');
  put(G, ox + 1, 6, 'bbbbbbb');
  put(G, ox, 7, 'bbbbbbbbb');
}

function gnomeSide(G, beat) {
  hat(G, 3);
  put(G, 2, 8, 'kbbbbbbbbbbB');
  put(G, 4, 9, 'SSSSSSSS');
  put(G, 3, 10, 'SSWeeSSSS');
  put(G, 4, 11, 'SSSSSSSS');
  // The beard: out in front of the chest, hanging in a point.
  put(G, 2, 12, 'CCCCCCCCCCC');
  put(G, 1, 13, 'CCCCCCCCCCCC');
  put(G, 1, 14, 'CCCCCCCCCCC');
  put(G, 2, 15, 'CCCCCCCCC');
  put(G, 3, 16, 'CCCCCCC');
  put(G, 4, 17, 'CCCCC');
  put(G, 5, 18, 'CCC');
  rect(G, 6, 13, 9, 7, 'n');
  rect(G, 6, 13, 1, 7, 'N');
  put(G, 11, 14, 'N');
  rect(G, 11, 15, 3, 3, 'm');
  put(G, 6, 18, 'mmmmmmmmm');
  put(G, 10, 18, 'L');
  put(G, 6, 19, 'nnnnnnnnn');
  put(G, 7, 20, 'nnnnnnn');
  sideLegs(G, 10, 21, 1, 3, beat);
}

function gnomeNorth(G, beat) {
  hat(G, 3);
  put(G, 2, 8, 'bbbbbbbbbbbb');
  put(G, 3, 9, 'CCCCCCCCCC');
  put(G, 3, 10, 'CCoooooooC');
  put(G, 3, 11, 'CCCCCCCCCC');
  put(G, 2, 12, 'CCCCCCCCCCCC');
  put(G, 2, 13, 'nnnnnnnnnnnn');
  put(G, 2, 14, 'nnnnnnnnnnnn');
  put(G, 2, 15, 'nnnnnmmnnnnn');
  put(G, 2, 16, 'nnnnnmmnnnnn');
  put(G, 2, 17, 'nnnnnmmnnnnn');
  put(G, 2, 18, 'mmmmmmmmmmmm');
  put(G, 2, 19, 'nnnnnnnnnnnn');
  put(G, 2, 20, 'NnnnnnnnnnnN');
  backLegs(G, 4, 9, 21, 1, 3, beat);
}

// ======================================================= DIE BLASKAPELLE
// The Musikkapelle's three bodies (tuba 33x40, trompete 37x40, posaune 38x40)
// share one bandsman: side-on or from behind, instrument added per creature.
function bandsmanSide(G, cx, beat) {
  put(G, cx - 4, 1, 'bbbbbbbbb');
  put(G, cx - 5, 2, 'bbbbbbbbbbb');
  put(G, cx - 6, 3, 'bbbbbbbbbbbbB');
  put(G, cx - 8, 4, 'bbbbbbbbbbbbbbb');
  put(G, cx - 8, 5, 'kkkkbbbbbbbbb');
  put(G, cx - 5, 6, 'SSSSSSSSSSS');
  put(G, cx - 5, 7, 'SSSSSSSSSSS');
  put(G, cx - 5, 8, 'SSKKKSSSSSS');
  put(G, cx - 5, 9, 'SSWeeSSSSSS');
  put(G, cx - 7, 10, 'SSSSeeeSSsSS');
  put(G, cx - 7, 11, 'SSSSSSSSSSSS');
  put(G, cx - 5, 12, 'SSKKSSSSSSS');
  put(G, cx - 4, 13, 'SSSSSSSSS');
  put(G, cx - 3, 14, 'SSSSSS');
  put(G, cx - 6, 15, 'CCCCCCCCCCCC');
  rect(G, cx - 7, 16, 15, 12, 'b');
  rect(G, cx - 7, 16, 1, 9, 'C');
  rect(G, cx + 7, 16, 1, 9, 'C');
  put(G, cx - 4, 18, 'd');
  put(G, cx - 4, 20, 'd');
  put(G, cx - 4, 22, 'd');
  put(G, cx - 6, 26, 'bbddddddddbb');
  put(G, cx - 6, 28, 'bbbbbbbbbbbb');
  sideLegs(G, cx, 29, 7, 3, beat, 2);
}

function bandsmanBack(G, beat) {
  put(G, 7, 1, 'bbbbbbbbbbbbbb');
  put(G, 6, 2, 'bbbbbbbbbbbbbbbb');
  put(G, 6, 3, 'bbbbbbbbbbbbbbbB');
  put(G, 5, 4, 'bbbbbbbbbbbbbbbbbb');
  put(G, 5, 5, 'bbbbbbbbbbbbbbbbbb');
  put(G, 9, 6, 'bbbbbbbbbbbb');
  put(G, 9, 7, 'bbbbbbbbbbbb');
  put(G, 9, 8, 'SddddddddddS');
  put(G, 9, 9, 'SsSSSSSSSSsS');
  put(G, 9, 10, 'SSSSSSSSSSSS');
  put(G, 9, 11, 'SSSSSSSSSSSS');
  put(G, 9, 12, 'SSSSSSSSSSSS');
  put(G, 10, 13, 'SSSSSSSSSS');
  put(G, 11, 14, 'SSSSSS');
  put(G, 7, 15, 'CCCCCCCCCCCCCC');
  rect(G, 6, 16, 18, 12, 'b');
  rect(G, 6, 16, 1, 9, 'C');
  rect(G, 23, 16, 1, 9, 'C');
  rect(G, 14, 17, 2, 8, 'd');
  put(G, 9, 17, 'd');
  put(G, 20, 17, 'd');
  put(G, 10, 18, 'd');
  put(G, 19, 18, 'd');
  put(G, 11, 19, 'd');
  put(G, 18, 19, 'd');
  put(G, 10, 26, 'ddddddddddd');
  put(G, 7, 28, 'bbbbbbbbbbbbbbbb');
  backLegs(G, 8, 17, 29, 7, 3, beat, 2);
}

function tubaSide(G, beat) {
  const cx = 22;
  // Bell and its tube, the mass in front of the chest, the pipe to the mouth.
  put(G, 2, 2, 'gggggggggg');
  put(G, 1, 3, 'gGGGhhhhGGGg');
  put(G, 2, 4, 'gGGGGGGGGg');
  put(G, 3, 5, 'gGGGGGGg');
  put(G, 4, 6, 'gGGGGg');
  for (let y = 7; y <= 16; y++) put(G, 5, y, 'gGGg');
  const mass = [
    [5, 'gggggggg'],
    [3, 'gGGGGGGGGGGg'],
    [2, 'gGGGGGGGGGGGGg'],
    [2, 'gGGGGhhhhGGGGg'],
    [2, 'gGGGhggggGGGGg'],
    [2, 'gGGGhggggGGGGg'],
    [2, 'gGGGGhhhhGGGGg'],
    [2, 'gGGGGGGGGGGGGg'],
    [3, 'gGGGGGGGGGGg'],
    [5, 'gggggggg'],
  ];
  mass.forEach(([x, s], i) => put(G, x, 17 + i, s));
  put(G, 13, 12, 'gg');
  put(G, 12, 13, 'gg');
  put(G, 11, 14, 'gg');
  put(G, 10, 15, 'gg');
  put(G, 10, 16, 'gg');
  bandsmanSide(G, cx, beat);
  rect(G, 12, 20, 3, 3, 'C');
  put(G, 11, 21, 'SS');
  put(G, 11, 22, 'SS');
}

function tubaNorth(G, beat) {
  // Bell over the right shoulder and the coil bulging out behind it.
  put(G, 22, 2, 'gggggggggg');
  put(G, 22, 3, 'gGGGhhhhGGg');
  put(G, 23, 4, 'gGGGGGGGGg');
  put(G, 24, 5, 'gGGGGGGg');
  put(G, 25, 6, 'gGGGGg');
  for (let y = 7; y <= 15; y++) put(G, 25, y, 'gGGg');
  const coil = [
    [22, 'gggggg'],
    [22, 'gGGGGGg'],
    [22, 'gGGGGGGg'],
    [22, 'gGGhhGGGg'],
    [22, 'gGGhhGGGg'],
    [22, 'gGGGGGGGg'],
    [22, 'gGGGGGGGg'],
    [22, 'gGGGGGGg'],
    [22, 'gGGGGGg'],
    [22, 'gggggg'],
  ];
  coil.forEach(([x, s], i) => put(G, x, 17 + i, s));
  bandsmanBack(G, beat);
  rect(G, 3, 17, 3, 9, 'G');
  rect(G, 3, 17, 1, 9, 'g');
  put(G, 4, 18, 'h');
}

function trompeteSide(G, beat) {
  const cx = 26;
  // Bell at the far end, the tube, a return loop, three valves.
  cone(G, 1, 9, 12, 5, 1);
  rect(G, 9, 11, 11, 2, 'G');
  put(G, 9, 10, 'g'.repeat(11));
  put(G, 9, 13, 'g'.repeat(11));
  rect(G, 11, 15, 9, 1, 'G');
  put(G, 10, 14, 'g'.repeat(10));
  put(G, 11, 16, 'g'.repeat(9));
  put(G, 10, 15, 'g');
  put(G, 14, 8, 'G');
  put(G, 14, 9, 'g');
  put(G, 16, 8, 'G');
  put(G, 16, 9, 'g');
  put(G, 18, 8, 'G');
  put(G, 18, 9, 'g');
  bandsmanSide(G, cx, beat);
  put(G, 24, 17, 'bb');
  put(G, 22, 16, 'bb');
  put(G, 21, 15, 'bb');
  put(G, 20, 14, 'bb');
  put(G, 18, 12, 'SSS');
  put(G, 18, 13, 'SSS');
}

function trompeteNorth(G, beat) {
  // The bell's rear over the right shoulder, the tube swung over it.
  disc(G, 30, 5, 5, 4);
  disc(G, 30, 5, 2, 1, 'h', 'h');
  put(G, 24, 9, 'gGg');
  put(G, 23, 10, 'gGg');
  put(G, 22, 11, 'gGg');
  put(G, 21, 12, 'gGg');
  put(G, 21, 13, 'gGg');
  put(G, 20, 14, 'gGg');
  bandsmanBack(G, beat);
  put(G, 8, 16, 'g'.repeat(14));
  put(G, 8, 17, 'G'.repeat(14));
  put(G, 9, 18, 'hh');
}

function posauneSide(G, beat) {
  const cx = 25;
  // Bell behind the shoulder, rising up and back.
  cone(G, 27, 36, 7, 4, 1, 'g', 'G');
  rect(G, 36, 3, 1, 9, 'g');
  put(G, 29, 11, 'gGGg');
  put(G, 29, 12, 'gGGg');
  put(G, 29, 13, 'gGGg');
  put(G, 29, 14, 'gGGg');
  bandsmanSide(G, cx, beat);
  // The slide thrown out in front: two tubes, a U at the end, a brace and the hand.
  rect(G, 1, 17, 18, 1, 'G');
  put(G, 1, 16, 'g'.repeat(18));
  put(G, 1, 18, 'g'.repeat(18));
  rect(G, 1, 21, 22, 1, 'G');
  put(G, 1, 20, 'g'.repeat(22));
  put(G, 1, 22, 'g'.repeat(22));
  rect(G, 1, 16, 2, 7, 'g');
  rect(G, 1, 17, 1, 5, 'G');
  rect(G, 10, 16, 2, 7, 'g');
  put(G, 16, 12, 'gg');
  put(G, 16, 13, 'gg');
  put(G, 16, 14, 'gg');
  put(G, 16, 15, 'gg');
  put(G, 9, 18, 'SSS');
  put(G, 9, 19, 'SSS');
  rect(G, 19, 19, 4, 2, 'C');
}

function posauneNorth(G, beat) {
  // The bell's rear at the right shoulder, the slide's tubes crossing the back.
  disc(G, 30, 14, 6, 6);
  disc(G, 30, 14, 3, 3, 'h', 'h');
  bandsmanBack(G, beat);
  put(G, 7, 16, 'g'.repeat(19));
  put(G, 7, 17, 'G'.repeat(19));
  put(G, 7, 18, 'g'.repeat(19));
}

// ------------------------------------------------------------------- sources
function base(id) {
  return readFrames(`${DIR}${id}.png`, 1, id)[0];
}

const CREATURES = [
  ['bauer', bauerSide, bauerNorth],
  ['blaskapellist', blaskapellistSide, blaskapellistNorth],
  ['boellerschmeisser', boellerSide, boellerNorth],
  ['gartenzwerg', gnomeSide, gnomeNorth],
  ['die-blaskapelle-posaune', posauneSide, posauneNorth],
  ['die-blaskapelle-trompete', trompeteSide, trompeteNorth],
  ['die-blaskapelle-tuba', tubaSide, tubaNorth],
];

/** Every strip by the name it is committed under: three frames each. */
export const strips = {};
/** Each creature's front art (the base PNG) and canvas, for the test. */
export const bases = {};

for (const [id, side, north] of CREATURES) {
  const front = base(id);
  bases[id] = { width: front.width, height: front.height };
  strips[`${id}-side`] = trio(`${id}-side`, front.width, front.height, side);
  strips[`${id}-north`] = trio(`${id}-north`, front.width, front.height, north);
  strips[`${id}-south`] = bobSteps(front, `${id}-south`);
}

/** Every strip's sidecar: `idle` stands, `move` walks. */
export const sidecars = Object.fromEntries(Object.keys(strips).map((name) => [name, VIEW_ANIM]));

export function assertOnPalette() {
  assertViewsOnPalette(bucket, strips);
}
