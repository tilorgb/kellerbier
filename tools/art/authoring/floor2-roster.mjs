import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * Dorf & Acker's roster, as text grids — the Floor 2 half of the chibi redraw
 * (`docs/DECISIONS.md` #55, issue #192). Floor 1's roster (#191) is the other
 * half.
 *
 * Why composed rather than seven hand-drawn PNGs in the editor, when #55 said
 * "a single drawing belongs in the editor": the constraint that made this a
 * decision worth logging is that the *human* roster — Bauer, Blaskapellist,
 * Böllerschmeißer — has to share one head ratio and one face with Alois and
 * with each other, or they read as four species standing in one room.
 * `HUMAN_FACE` below is that face, written once and spliced into every human
 * grid verbatim; the test checks it is there, so the roster cannot drift the
 * way four separately-edited files would.
 *
 * The three #55 rules, translated for Floor 2:
 *
 * - **Proportion.** A person's head (with headwear) is ~44% of the sprite —
 *   the same ratio Alois lands at without the Hut's full stack, so a Bauer
 *   reads as Alois's brother, not as an adult he is a child next to (issue
 *   #192's first call, decided: same ratio). The gnome is already chibi and
 *   keeps its own outsized-hat proportion; the animals scale the feature that
 *   reads as the head — the Kuh's muzzle, the Gockel's whole head — up
 *   against a shrunken body.
 * - **Face.** Alois's exact eye — a white sclera block, a dark-blue iris, a
 *   lash line above — reused pixel-for-pixel on every creature that has a
 *   face, because "same eye" is what "same game" reduces to at this size.
 *   The Kuh has one (it is livestock, not a vehicle). The **Traktor does
 *   not** (issue #192's second call, decided: it stays a machine — a grille
 *   and two headlamps, no eyes, because a tractor with a face is a different
 *   game's tone).
 * - **Prop.** One silhouette-carrying object per body: the Bauer's pitchfork,
 *   the Blaskapellist's tuba, the Böller on its fuse, the Gnome's hat (the
 *   thing he throws), the Gockel's comb, the Kuh's cowbell, the Traktor's
 *   exhaust stack.
 *
 * Palette is Floor 2's five (green, sky blue, Bavarian blue, cream) plus the
 * neutrals and their ramps — `RURAL` is checked against
 * `legalPixelColorsFor('floor-2-rural')` on load. There is no skin tone on
 * this floor; `#cabc92`, cream two steps down, is "the warmest tone Floor 2
 * allows" (the Maibaum-Dieb established it, `tools/art/authoring/bosses.mjs`).
 *
 * Hard `#000000` ink on every silhouette edge (auto-applied by `inkOutline`),
 * flat fills, at most one shade step — #55's rule, and it matters more on the
 * bright side: a Floor 2 body with too much saturated fill competes with the
 * tileset, and the black outline is what keeps it in front.
 */

// ------------------------------------------------------------------ palette
export const RURAL = {
  '.': null,
  K: 0x000000, // outline + internal ink
  k: 0x1c1a1f, // soft shade, under a brim / deep fold
  S: 0xcabc92, // "skin" — cream, two steps down; the warmest Floor 2 allows
  s: 0xd9cfb1, // skin, one step down (lit cheek, muzzle)
  C: 0xe8e2d0, // cream — shirts, beard, bunting white, Kuh hide
  o: 0xd9cfb1, // cream shadow (hide underside, sleeve fold)
  b: 0x2e4f8c, // Bavarian blue
  B: 0x3962af, // blue, lit
  d: 0x172847, // blue, deep shadow
  e: 0x233c69, // iris (blue, one step down) — Alois's own `E` isn't legal here
  n: 0x3f7a3a, // green
  N: 0x4f9949, // green, lit
  L: 0x7fbf6a, // green, bright (rural base) — machine highlight edge
  m: 0x2f5b2b, // green, deep
  Y: 0x6ab0d9, // sky blue
  y: 0x8fc3e2, // sky blue, lit
  g: 0x8a8a8a, // neutral grey — brass, iron, pitchfork, tuba
  G: 0xa1a1a1, // grey, one step up
  h: 0x737373, // grey, one step down
  W: 0xffffff, // eye sclera, tiny glints, hot spark
};

{
  const legal = legalPixelColorsFor('floor-2-rural');
  for (const [key, colour] of Object.entries(RURAL)) {
    if (colour !== null && !legal.has(colour)) {
      throw new Error(
        `floor2-roster key "${key}" is #${colour.toString(16).padStart(6, '0')}, ` +
          `not legal for floor-2-rural — see tools/art/palette.mjs`,
      );
    }
  }
}

// --------------------------------------------------------------- raster core
/** A mutable canvas of hex-or-null. */
function canvas(w, h) {
  return { w, h, px: Array.from({ length: h }, () => Array.from({ length: w }, () => null)) };
}

/**
 * A block of text rows painted into a fresh canvas. Canvas width is the widest
 * row; shorter rows are right-padded with transparent, so a grid can be
 * authored ragged on its right edge (a silhouette that narrows) without
 * counting dots. An unknown character still throws, naming the row — that is
 * the mistake (a typo'd key silently dropping a pixel) worth catching.
 */
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

/** `{ name, width, height, px }` — the shape `encodeSingle` and the test read. */
function frame(name, cv) {
  return { name, width: cv.w, height: cv.h, px: cv.px };
}

/** A whole sprite from one full-canvas text grid, auto-inked. */
function single(name, rows) {
  return frame(name, inkOutline(paint(name, rows)));
}

/** Throws if any painted pixel is not legal for floor-2-rural. */
export function assertOnPalette(_bucket, framesIn) {
  const legal = legalPixelColorsFor('floor-2-rural');
  for (const f of framesIn) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const c = f.px[y][x];
        if (c !== null && !legal.has(c)) {
          throw new Error(
            `${f.name}: pixel ${x},${y} is #${c.toString(16).padStart(6, '0')}, not legal for floor-2-rural`,
          );
        }
      }
    }
  }
}

/** One frame as PNG bytes. */
export function encodeSingle(f) {
  const pixels = Buffer.alloc(f.width * f.height * 4);
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const c = f.px[y][x];
      if (c === null) continue;
      const at = (y * f.width + x) * 4;
      pixels[at] = (c >> 16) & 0xff;
      pixels[at + 1] = (c >> 8) & 0xff;
      pixels[at + 2] = c & 0xff;
      pixels[at + 3] = 0xff;
    }
  }
  return encodePng({ width: f.width, height: f.height, pixels });
}

// =====================================================================
//  Shared human head — #55's proportion and face rule, written once
// =====================================================================

/**
 * The chibi face every person on this floor carries: Alois's eye and mouth
 * exactly — a `W`/`e` sclera-and-iris pair under a `K` lash line, a `K`
 * mouth, on the `S` warm-cream "skin" — 12 wide. Each human grid below
 * embeds this block verbatim (`tests/art/floor2-roster-authoring.test.ts`
 * checks that it does), which is what "reads as the same game as Alois"
 * reduces to at this size.
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

// ============================================================ BAUER
// #55 proportion (issue #192's decided call): cap + head = 14 of 32 rows,
// ~44% — Alois's own ratio, so the Bauer reads as his brother, not as an
// adult he is a child beside. Prop: the pitchfork, held upright at his side.
export const bauer = single('bauer', [
  '....................',
  '......bbbbb...g.g.g..',
  '....bbbbbbbbb.g.g.g..',
  '...bbbbbbbbbbbggggg..',
  '..bkbbbbbbbbbbb.g....',
  '...SSSSSSSSSSSS.g....',
  '...SSSSSSSSSSSS.g....',
  '...SSKKKSSKKKSS.g....',
  '...SSWeeSSWeeSS.g....',
  '...SSeeeSSeeeSS.g....',
  '...SsSSSSSSSSsS.g....',
  '...SSSSKKKKSSSS.g....',
  '....SSSSSSSSSS..g....',
  '......SSSSSS....g....',
  '.....CCCCCCCC...g....',
  '....CCbbbbbbCC..g....',
  '...CCbbbbbbbbCC.g....',
  '...SCbbbbbbbbCSgg....',
  '...SCbbdbbdbbCS.g....',
  '....CbbbbbbbbC..g....',
  '.....bbbbbbbb...g....',
  '.....bbdddddb...g....',
  '.....dd...dd....g....',
  '.....dd...dd....g....',
  '.....dd...dd....g....',
  '.....dd...dd.........',
  '.....dd...dd.........',
  '.....ddd.ddd.........',
  '....kKKK.KKKk........',
  '....kkkk.kkkk........',
  '....................',
  '....................',
]);

// ============================================================ BLASKAPELLIST
// Tuba player. The tuba is the prop — a brass mass hugging the front of the
// body with the bell flaring up past the right shoulder. Musikkapelle cap.
export const blaskapellist = single('blaskapellist', [
  '..........................',
  '.......bbbbbb....gggg.....',
  '......bbbbbbbb..gg..gg....',
  '.....bkbbbbbbBB.g.GG.g....',
  '......SSSSSSSSSS.g.GG.g...',
  '......SSSSSSSSSS.gg..gg...',
  '......SSKKKSSKKKS.gg.gg...',
  '......SSWeeSSWeeS..ggg....',
  '......SSeeeSSeeeS..gg.....',
  '......SsSSSSSSSsS.gg......',
  '......SSSSKKKKSSSgg.......',
  '.......SSSSSSSSggg........',
  '......CCCCCCCCggg.........',
  '.....CCbbbbbbggg..........',
  '....CCbbbbbbggGGGgg.......',
  '....CbbbbbbbggGGGGgg......',
  '....CbbbbbbbggGGGGGgg.....',
  '....bbbbbbbbggGGGGGgg.....',
  '....bbdddbbbggGGGGGgg.....',
  '.....bbbbbbbggGGGGgg......',
  '.....bbbbbbbbgggggg.......',
  '.....bbbbbbbbbgggg........',
  '......dd...dd.............',
  '......dd...dd.............',
  '......dd...dd.............',
  '......dd...dd.............',
  '.....kKKK.KKKk............',
  '.....kkkk.kkkk............',
  '..........................',
  '..........................',
]);

// ============================================================ BÖLLERSCHMEISSER
// Lean, one arm thrown up with a lit Böller — the round bomb, its short fuse
// and the spark are the whole silhouette read (`docs/CONTENT_BIBLE.md`: "the
// fuse is the whole enemy").
export const boellerschmeisser = single('boellerschmeisser', [
  '...............W..',
  '..............W.W.',
  '...............y..',
  '.............kkkk.',
  '....bbbb....kkkkkk',
  '...bbbbbb...kkkkkk',
  '...SSSSSSSSS.kkkk.',
  '...SSKKKSSKKKS.SS.',
  '...SSWeeSSWeeSS.S.',
  '...SSeeeSSeeeSS.S.',
  '...SsSSSSSSSSsS.S.',
  '...SSSSKKKKSSSSSS.',
  '....SSSSSSSSSS....',
  '......SSSSSS......',
  '.....CCCCCCCC.....',
  '....CCbbbbbbCC....',
  '....SbbbbbbbbS....',
  '....bbbdddbbb.....',
  '.....bbbbbbbb.....',
  '.....bbdddddb.....',
  '......dd..dd......',
  '......dd..dd......',
  '......dd..dd......',
  '......dd..dd......',
  '.....kKKK.KKKk....',
  '.....kkkk.kkkk....',
  '.................',
  '.................',
]);

// ============================================================ GARTENZWERG
// Already chibi — an outsized pointed hat and a full beard, a face barely
// peeking between (issue #192: "the question is what changes at all"). The
// answer: Alois's eye, and the hat becomes the prop (the thing he throws).
// Blue, not the traditional red — Floor 2 has no red.
export const gartenzwerg = single('gartenzwerg', [
  '........b.........',
  '.......bbb........',
  '.......bbb........',
  '......bbbbb.......',
  '......bbbbb.......',
  '.....bbbbbbb......',
  '.....bbbbbbb......',
  '....bbbbbbbbb.....',
  '...BbbbbbbbbbB....',
  '....SSSSSSSSS.....',
  '....SWeeSSWeeS....',
  '....SSSSSSSSS.....',
  '...CCCSSSSSCCC....',
  '..CCCCCCCCCCCCC...',
  '..CCCCCCCCCCCCC...',
  '...CCCCCCCCCCC....',
  '..nnCCCCCCCCCnn...',
  '..nnnCCCCCCCnnn...',
  '..nnnnnCCCnnnnn...',
  '..nnnnnnnnnnnnn...',
  '..NnnnnnnnnnnnN...',
  '...nnn.....nnn....',
  '...kKK.....KKk....',
  '...kk.......kk....',
  '.................',
  '.................',
]);

// ============================================================ GOCKEL
// Rooster: an oversized head with Alois's eye and a tall comb, on a shrunken
// body over thin legs. Comb, wattle and beak-shadow in Bavarian blue and the
// warm cream tone — Floor 2 has no red.
export const gockel = single('gockel', [
  '.......bb.............',
  '......bbbb............',
  '.....bb.bb...........',
  '....bbbbbbb..........',
  '...CCCCCCCCCC........',
  '..CCCCCCCCCCCC.......',
  '..CCCCCCCCCCCC.......',
  '.CCCKKKCCCCCCCC.....',
  '.CCKWeeKCCCCCCC.....',
  'SSCKeeeKCCCCCCC.....',
  'SSSKKKCCCCCCCCC.....',
  '.SSCCCCCCCCCCCC.....',
  '..bbCCCCCCCCCCC.....',
  '..bbCCCCCCCCCCCd.....',
  '...CCCCCCCCCCddd.....',
  '...CCCCCCCCCddddd.dd.',
  '..oCCCCCCCCddddd.ddd.',
  '..ooCCCCCCddd...dddd.',
  '...ooCCCCCC...........',
  '....oCCCCC...........',
  '.....CCCC............',
  '.....S..S............',
  '.....S..S............',
  '....kKK.KKk..........',
  '....kk...kk..........',
  '.....................',
]);

// ============================================================ KUH
// Chibi cow: a huge head turned to camera (Alois's eye, twice), a small body
// behind, stubby legs. Cream hide with a Bavarian-blue flank patch; the
// cowbell is the prop. `mid` collider is 40px — the silhouette stays well
// inside 1.8x without the head growing sideways past the `character` ceiling.
export const kuh = single('kuh', [
  '..........................................',
  '..........................................',
  '..CC..........CC..........................',
  '.CCCC........CCCC.........................',
  '.CCCC........CCCC.........................',
  'CCCCCCCCCCCCCCCCCCCC......................',
  'CCCCCCCCCCCCCCCCCCCCCC....................',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCC...............',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...........',
  'CCCKKKCCCCCCCKKKCCCCCbbbbbbCCCCCCCCC......',
  'CCKWeeKCCCCCKWeeKCCCCbbbbbbbbCCCCCCCCC....',
  'CCKeeeKCCCCCKeeeKCCCCbbbbbbbbCCCCCCCCCC...',
  'CCCKKKCCCCCCCKKKCCCCCbbbbbbCCCCCCCCCCC....',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCo.....',
  'CsssssssssssssssssCCCCCCCCCCCCCCCCCoo.....',
  'CsssssKKsssssKKssssCCCCCCCCCCCCCCCCoo.....',
  'CssssssssssssssssssCCCCCCCCCCCCCCCoo......',
  '.CssssssssssssssssCCCCCCCCCCCCCCCoo.......',
  '..CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCoo........',
  '.....CCCCCCCCCCCCCCCCCCCCCCCCCCoo.........',
  '........oooooooooooooooooooooooo.........',
  '.........g.g.............................',
  '........ggggg.....CCC......CCC....CCC....',
  '........ggGgg.....CCC......CCC....CCC....',
  '........ggggg.....CCC......CCC....CCC....',
  '.........ggg......ooo......ooo....ooo....',
  '.................kKK......kKK....kKK......',
  '..........................................',
  '..........................................',
  '..........................................',
  '..........................................',
  '..........................................',
]);

// ============================================================ TRAKTOR
// A machine, and it stays one (issue #192's decided second call): a radiator
// grille and corner headlamps, no eyes. Chibi lives in the proportion — a fat
// rear wheel, a stubby hood, and the tall exhaust stack that puffs the
// vision-blocking cloud (`docs/CONTENT_BIBLE.md`), which is also the prop.
// Green body, Bavarian-blue side panel.
export const traktor = single('traktor', [
  '.......kk......................',
  '.....yyyyLLLLLLL...............',
  '....LLnyyLLLLLLLL..............',
  '....LnyymmmmmmmLL..............',
  '....LnyymmmmmmmLL..............',
  '....LnyymmmmmmmLNNNNNNNNN......',
  '....LnyymmmmmmmLNNNNNNNNN......',
  '....LLLLLLLLLLLLNNNNNNNNN......',
  '....LLLLLLLLLLLLNNNNNNNNN......',
  '.....nnnnnnnnnnnnnnnnmmmmmm....',
  '.....nnnnnnnnnnnnnnnnmmmmmm....',
  '.....nnnnnnnnnnnnnnnnmmmmmm....',
  '....nnnnnnnnnnnnnnnnnmmmmmm....',
  '...nnnnnnnnnnnnnnnnnnmmmmmm....',
  '...kkkCCCCCkkknnnnnnnnmmmmm....',
  '..kkkkCCCCCkkkk......kkkkk.....',
  '..kkkkCCCCCCCkkk....kkkCkkk....',
  '.kkkkkCCCCCCCkkkk...kkCCCkk....',
  '..kkkkCCCCCCCkkk....kkCCCkk....',
  '..kkkkCCCCCkkkk.....kkkCkkk....',
  '...kkkkkkkkkkk.......kkkkk.....',
  '....kkkkkkkkk................',
]);

/**
 * The seven sprites `build-floor2-roster` writes. Order matches
 * `assets/sprites/floor-2-rural/characters/`.
 */
export const ROSTER = {
  bauer,
  blaskapellist,
  boellerschmeisser,
  gartenzwerg,
  gockel,
  kuh,
  traktor,
};

/** Every sprite is authored against Floor 2's palette. */
export const ROSTER_BUCKET = 'floor-2-rural';
