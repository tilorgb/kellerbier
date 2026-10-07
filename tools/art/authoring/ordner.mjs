import { canvas, fillRect, outline, px, roundRect, toRows } from './draw.mjs';
import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * Der Ordner — the bouncer familiar the item of the same name puts at
 * Alois's side: walks with him, strides over to whatever gets too close and
 * shoves it back out (`content/items/der-ordner.ts`).
 *
 * Option C of three (a smaller sidekick bouncer in shades, 18×26 — shorter
 * than Alois's 20×32 so the two never read as one body), signed off by Tilo,
 * shown next to Alois at true scale. Drawn as block art from primitives, the
 * `docs/DECISIONS.md` #43/#55 way, in the item icon's own colours (dark
 * beanie and jacket, the red Ordner armband).
 *
 * Three directions, filed the way Alois's are (`assets/sprites/README.md`,
 * "Directions"): `-side` (authored facing left, mirrored for right),
 * `-south` (walking toward the camera) and `-north` (walking away). Each is
 * four frames: standing, a step on each foot, and the shove — both fists
 * thrown forward.
 */

/** Colours by key, all from the item icon (`item-der-ordner.png`). */
export const ORDNER_KEYS = {
  '.': null,
  K: 0x000000, // ink
  j: 0x3c3e40, // jacket
  J: 0x525558, // jacket, lit; the folded forearms
  b: 0x1c1a1f, // beanie, trousers, shades
  g: 0x494451, // beanie fold, soles, the glint on the shades
  s: 0xe893a8, // skin
  m: 0xd8476b, // skin shade, mouth, ear
  r: 0xd92b3c, // armband
};

export const ORDNER_WIDTH = 18;
export const ORDNER_HEIGHT = 26;

const HEAD_W = 12;
const HEAD_H = 11;
const SHOULDERS = 6;
const FEET = ORDNER_HEIGHT - 2;
const HEAD_TOP = 1;
const NECK = HEAD_TOP + HEAD_H;
const LEGS_TOP = FEET - 4;
const CX = Math.floor(ORDNER_WIDTH / 2);
const BEANIE = Math.floor(HEAD_H * 0.4);
const EYE_Y = HEAD_TOP + Math.floor(HEAD_H * 0.55);

/** Two leg pillars and boots; `step` lifts that one (`'a'` the left, `'b'` the right) a row. */
function legs(c, step, bootDx) {
  const liftA = step === 'a' ? 1 : 0;
  const liftB = step === 'b' ? 1 : 0;
  fillRect(c, CX - 4, LEGS_TOP, 3, FEET - LEGS_TOP - liftA, 'b');
  fillRect(c, CX + 1, LEGS_TOP, 3, FEET - LEGS_TOP - liftB, 'b');
  fillRect(c, CX - 4 - bootDx, FEET - liftA, 3 + bootDx, 1, 'g');
  fillRect(c, CX + 1, FEET - liftB, 3 + bootDx, 1, 'g');
}

/** The barrel-chested jacket. */
function jacket(c) {
  roundRect(c, CX - SHOULDERS, NECK - 1, SHOULDERS * 2, LEGS_TOP - NECK + 2, 3, 'j');
}

/** Side-on, facing left: the signed-off design. */
function side(step, shove) {
  const c = canvas(ORDNER_WIDTH, ORDNER_HEIGHT, '.');
  legs(c, step, 2);
  jacket(c);
  fillRect(c, CX - SHOULDERS + 1, NECK + 1, 2, LEGS_TOP - NECK - 2, 'J');
  // Forearms folded across the chest, fist at the front — or thrown forward.
  const armY = NECK + 2;
  const reach = shove ? 2 : 0;
  fillRect(c, CX - SHOULDERS - reach, armY, SHOULDERS * 2 + reach, 3, 'J');
  fillRect(c, CX - SHOULDERS - 1 - reach, armY, 3, 3, 's');
  // The armband on the near upper arm.
  fillRect(c, CX + 1, armY - 2, 4, 2, 'r');
  // Head: big, a beanie pulled low, shades, a profile nose, a flat mouth.
  const hx = CX - Math.floor(HEAD_W / 2) - 1;
  roundRect(c, hx, HEAD_TOP, HEAD_W, HEAD_H, 4, 's');
  fillRect(c, hx, HEAD_TOP, HEAD_W, BEANIE, 'b');
  fillRect(c, hx, HEAD_TOP + BEANIE, HEAD_W, 1, 'g');
  fillRect(c, hx + HEAD_W - 4, EYE_Y, 2, 2, 'm');
  fillRect(c, hx, EYE_Y, 5, 2, 'b');
  px(c, hx + 1, EYE_Y, 'g');
  px(c, hx - 1, EYE_Y + 2, 's');
  px(c, hx - 1, EYE_Y + 3, 's');
  fillRect(c, hx + 1, EYE_Y + 4, 3, 1, 'm');
  outline(c, 'K');
  return toRows(c);
}

/**
 * Facing the camera: shades across both eyes, the arms folded in front of the
 * chest with a fist each side — on the shove, both fists punch out to the
 * jacket's edges. The armband on his right arm, the viewer's left.
 */
function south(step, shove) {
  const c = canvas(ORDNER_WIDTH, ORDNER_HEIGHT, '.');
  legs(c, step, 0);
  jacket(c);
  const armY = NECK + 2;
  if (shove) {
    // Arms out wide, fists at shoulder height.
    fillRect(c, CX - SHOULDERS - 1, armY - 1, 3, 3, 's');
    fillRect(c, CX + SHOULDERS - 2, armY - 1, 3, 3, 's');
    fillRect(c, CX - SHOULDERS + 2, armY + 1, SHOULDERS * 2 - 4, 1, 'J');
  } else {
    fillRect(c, CX - SHOULDERS + 1, armY, SHOULDERS * 2 - 2, 3, 'J');
    fillRect(c, CX - SHOULDERS + 1, armY + 1, 2, 2, 's');
    fillRect(c, CX + SHOULDERS - 3, armY + 1, 2, 2, 's');
  }
  fillRect(c, CX - SHOULDERS, armY - 2, 2, 2, 'r');
  const hx = CX - Math.floor(HEAD_W / 2);
  roundRect(c, hx, HEAD_TOP, HEAD_W, HEAD_H, 4, 's');
  fillRect(c, hx, HEAD_TOP, HEAD_W, BEANIE, 'b');
  fillRect(c, hx, HEAD_TOP + BEANIE, HEAD_W, 1, 'g');
  // Shades, a bar across, the glint on the left lens.
  fillRect(c, hx + 1, EYE_Y, HEAD_W - 2, 2, 'b');
  px(c, hx + 2, EYE_Y, 'g');
  // Ears either side, a flat mouth.
  px(c, hx - 1, EYE_Y + 1, 'm');
  px(c, hx + HEAD_W, EYE_Y + 1, 'm');
  fillRect(c, CX - 2, EYE_Y + 4, 4, 1, 'm');
  outline(c, 'K');
  return toRows(c);
}

/**
 * Walking away: the back of the beanie and of the neck, a broad jacket back
 * with a lit stripe where "ORDNER" would be printed, the armband on his right
 * (now the viewer's right). On the shove, the elbows go out.
 */
function north(step, shove) {
  const c = canvas(ORDNER_WIDTH, ORDNER_HEIGHT, '.');
  legs(c, step, 0);
  jacket(c);
  const armY = NECK + 2;
  fillRect(c, CX - SHOULDERS + 2, armY, SHOULDERS * 2 - 4, 2, 'J');
  if (shove) {
    fillRect(c, CX - SHOULDERS - 1, armY - 1, 2, 3, 'j');
    fillRect(c, CX + SHOULDERS - 1, armY - 1, 2, 3, 'j');
  }
  fillRect(c, CX + SHOULDERS - 2, armY - 2, 2, 2, 'r');
  const hx = CX - Math.floor(HEAD_W / 2);
  roundRect(c, hx, HEAD_TOP, HEAD_W, HEAD_H, 4, 's');
  // A beanie pulled further down at the back, over a skin nape.
  fillRect(c, hx, HEAD_TOP, HEAD_W, BEANIE + 3, 'b');
  fillRect(c, hx, HEAD_TOP + BEANIE + 3, HEAD_W, 1, 'g');
  px(c, hx - 1, EYE_Y + 1, 'm');
  px(c, hx + HEAD_W, EYE_Y + 1, 'm');
  outline(c, 'K');
  return toRows(c);
}

function frame(name, rows) {
  return {
    name,
    width: ORDNER_WIDTH,
    height: ORDNER_HEIGHT,
    px: rows.map((row) => Array.from(row, (ch) => ORDNER_KEYS[ch] ?? null)),
  };
}

function strip(direction, draw) {
  return [
    frame(`der-ordner-${direction}-stand`, draw(null, false)),
    frame(`der-ordner-${direction}-step-a`, draw('a', false)),
    frame(`der-ordner-${direction}-step-b`, draw('b', false)),
    frame(`der-ordner-${direction}-shove`, draw(null, true)),
  ];
}

/** Every direction's four frames, by the strip name they are committed under. */
export const ORDNER_STRIPS = {
  'der-ordner-side': strip('side', side),
  'der-ordner-south': strip('south', south),
  'der-ordner-north': strip('north', north),
};

/** The sidecar each strip gets: `idle` stands, `move` walks, `telegraph` is the shove (his one "attack"). */
export const ORDNER_ANIM = {
  frames: 4,
  frameDurationMs: 120,
  loop: true,
  clips: {
    idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
    move: { frames: [1, 0, 2, 0], frameDurationMs: 100, mode: 'loop' },
    telegraph: { frames: [3], frameDurationMs: 120, mode: 'loop' },
  },
};

/** Committed in `common` — the familiar follows Alois onto every floor. */
export const ORDNER_BUCKET = 'common';

export function assertOnPalette() {
  const legal = legalPixelColorsFor(ORDNER_BUCKET);
  for (const frames of Object.values(ORDNER_STRIPS)) {
    for (const f of frames) {
      f.px.forEach((row, y) =>
        row.forEach((c, x) => {
          if (c !== null && !legal.has(c)) {
            throw new Error(`${f.name}: pixel ${String(x)},${String(y)} is not legal for common`);
          }
        }),
      );
    }
  }
}

/** One direction's strip as PNG bytes (`assets/sprites/README.md` layout). */
export function encodeOrdnerStrip(frames) {
  const width = ORDNER_WIDTH * frames.length;
  const pixels = Buffer.alloc(width * ORDNER_HEIGHT * 4);
  frames.forEach((f, i) => {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const c = f.px[y][x];
        if (c === null) continue;
        const at = (y * width + i * ORDNER_WIDTH + x) * 4;
        pixels[at] = (c >> 16) & 0xff;
        pixels[at + 1] = (c >> 8) & 0xff;
        pixels[at + 2] = c & 0xff;
        pixels[at + 3] = 0xff;
      }
    }
  });
  return encodePng({ width, height: ORDNER_HEIGHT, pixels });
}
