import {
  BROWN,
  GOLD,
  GOLD2,
  STEEL,
  STEEL2,
  X,
  assertOnPalette,
  canvas,
  encodeSingle,
  hline,
  ink,
  put,
  rect,
  sh,
  vline,
} from './items.mjs';

export { assertOnPalette, encodeSingle };

/**
 * Chest and Locked Chest art (#353), authored as programmatic block art and
 * written to `assets/sprites/common/characters/pickup-<id>.png` by
 * `npm run art:chests`. Same source-composed contract as `items.mjs`
 * (`docs/DECISIONS.md` #55): `tests/art/chests-authoring.test.ts` holds the
 * committed PNGs byte-identical to this file.
 *
 * **The direction** was picked in the #353 option round (`CLAUDE.md`'s
 * sign-off ritual), out of three designs shown standing in the cellar next to
 * Alois at two sizes: *A, the domed chest* — brown planks, a rounded lid, two
 * vertical bands. The Chest's bands are dark iron with a small gold latch; the
 * Locked Chest's are gold with a padlock hanging off the lid seam, so the two
 * read apart at a glance without the toast. **24×18** was picked over 16×12:
 * a pickup's art is ~15×20 inside its 24×24 canvas, and at 16×12 a chest read
 * as smaller than a Maß. Since `docs/DECISIONS.md` #45 the canvas is its size
 * on screen, so 24×18 is "about a Maß tall and clearly wider" — an object in
 * the room rather than one more coin.
 *
 * The rejected alternatives were a flat-lidded plank crate (locked variant
 * with crossed chains) and a dark trimmed trunk.
 *
 * Each type has an open frame: once opened a chest stays in the room, empty,
 * lid tipped back (`chest-open`/`locked-chest-open` in the pickup roster).
 */

export const WIDTH = 24;
export const HEIGHT = 18;

/** Drawable area inside a 1px border left for the ink outline. */
const X0 = 1;
const Y0 = 1;
const W = WIDTH - 2;
const H = HEIGHT - 2;
const LID_H = Math.round(H * 0.42);
const BODY_Y = Y0 + LID_H;
const BODY_H = H - LID_H;
const BAND_X = [X0 + Math.round(W * 0.18), X0 + W - 1 - Math.round(W * 0.18)];
const CX = X0 + W / 2 - 0.5;

function padlock(cv, top) {
  const bw = 5;
  const bh = 4;
  const bx = Math.round(CX - bw / 2);
  hline(cv, bx + 1, bx + bw - 2, top, STEEL);
  vline(cv, bx, top + 1, top + 1, STEEL);
  vline(cv, bx + bw - 1, top + 1, top + 1, STEEL);
  rect(cv, bx, top + 2, bw, bh, GOLD);
  hline(cv, bx, bx + bw - 1, top + 2, GOLD2);
  put(cv, bx + Math.floor(bw / 2), top + 2 + Math.floor(bh / 2), X);
}

function body(cv, band) {
  rect(cv, X0, BODY_Y, W, BODY_H, BROWN);
  for (let y = BODY_Y + 2; y < BODY_Y + BODY_H; y += 3) hline(cv, X0, X0 + W - 1, y, sh(BROWN, -1));
  for (const bx of BAND_X) vline(cv, bx, BODY_Y, BODY_Y + BODY_H - 1, band);
  hline(cv, X0, X0 + W - 1, Y0 + H - 1, sh(BROWN, -2));
}

function closedLid(cv, band) {
  rect(cv, X0 + 1, Y0, W - 2, 1, sh(BROWN, 1));
  rect(cv, X0, Y0 + 1, W, LID_H - 1, BROWN);
  hline(cv, X0 + 1, X0 + W - 2, Y0 + 1, sh(BROWN, 1));
  for (const bx of BAND_X) vline(cv, bx, Y0, BODY_Y - 1, band);
  hline(cv, X0, X0 + W - 1, BODY_Y - 1, sh(BROWN, -2));
}

/**
 * The lid tipped back: its underside, narrower than the body because it
 * leans away from the camera, above the dark mouth of an empty chest.
 */
function openLid(cv, band) {
  const lidTop = Y0;
  const lidBottom = BODY_Y - 3;
  rect(cv, X0 + 2, lidTop, W - 4, lidBottom - lidTop + 1, sh(BROWN, -1));
  hline(cv, X0 + 3, X0 + W - 4, lidTop, BROWN);
  for (const bx of BAND_X) vline(cv, bx + (bx < CX ? 1 : -1), lidTop, lidBottom, band);
  // the rim, then the empty inside
  hline(cv, X0, X0 + W - 1, BODY_Y - 2, sh(BROWN, 1));
  rect(cv, X0 + 1, BODY_Y - 1, W - 2, 2, X);
}

function chest(cv, { locked, open }) {
  const band = locked ? GOLD : STEEL2;
  body(cv, band);
  if (open) {
    openLid(cv, band);
    return;
  }
  closedLid(cv, band);
  if (locked) {
    padlock(cv, BODY_Y - 2);
  } else {
    rect(cv, Math.round(CX) - 1, BODY_Y, 2, 3, GOLD);
  }
}

/** Pickup id → how to draw it. Every id is a pickup in `src/content/pickups/pickups.ts`. */
export const CHEST_ART = {
  chest: (cv) => chest(cv, { locked: false, open: false }),
  'chest-open': (cv) => chest(cv, { locked: false, open: true }),
  'locked-chest': (cv) => chest(cv, { locked: true, open: false }),
  'locked-chest-open': (cv) => chest(cv, { locked: true, open: true }),
};

/** One chest as a built frame, named for the file it becomes. */
export function chestFrame(id) {
  const draw = CHEST_ART[id];
  if (draw === undefined) {
    throw new Error(`no chest art for "${id}"`);
  }
  const cv = canvas(WIDTH, HEIGHT);
  draw(cv);
  ink(cv);
  return { name: `pickup-${id}`, width: WIDTH, height: HEIGHT, px: cv.px };
}

export function chestFrames() {
  return Object.fromEntries(Object.keys(CHEST_ART).map((id) => [id, chestFrame(id)]));
}
