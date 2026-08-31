import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * Composing a character strip out of text.
 *
 * Every other sprite in the tree is drawn in the pixel editor and committed as
 * a PNG, and that is still the default. This exists for the one shape the
 * editor is bad at: a strip whose frames are *the same drawing rearranged* —
 * six directions of one body, each with an idle, a blink, two walk contacts, a
 * flinch and three death beats. Alois is forty-four frames that between them
 * contain about a dozen distinct drawings, and hand-editing forty-four copies
 * of a head is how a walk cycle ends up with the hat one pixel left on frame 3
 * and nobody notices for a month.
 *
 * So a body is authored as *blocks* — a head, a torso, a set of legs, a prop —
 * and a frame says which blocks, at what offset. Fixing the face is one edit in
 * one place and every frame that uses it follows.
 *
 * This is the same argument `docs/DECISIONS.md` #43 makes for UI art being
 * source in `src/render/ui/` rather than committed textures, applied to the one
 * sprite in `assets/` that has the same repetition problem. It is deliberately
 * *not* a general policy: a Kellerassel is one drawing seven times and belongs
 * in the editor.
 */

/**
 * The character-to-colour key every grid in `authoring/` is written in.
 *
 * Upper case is the base tone, lower case its shade, which is why the map looks
 * like it has a shift-key convention: `A` brass, `a` brass in shadow. `.` is
 * transparent. Each value is checked against the real palette below, so a key
 * added here cannot be a colour the atlas build would reject — the mistake this
 * catches is a hand-typed hex that is one digit off a legal one, which
 * `validate.mjs` would otherwise only find at build time and only by
 * coordinate.
 */
export const PIXEL_KEYS = {
  '.': null,
  K: 0x000000, // outline ink
  k: 0x1c1a1f, // soft dark, for a shadow that is not an edge
  S: 0xe8c28c, // skin
  s: 0xe1ae65, // skin in shadow
  H: 0x54402e, // hair
  D: 0x36291e, // hair in shadow
  L: 0x72573e, // hair highlight
  R: 0xd92b3c, // Trachtenhemd red
  M: 0xb6212f, // open mouth
  W: 0xffffff, // eye highlight
  E: 0x274b6b, // iris
  B: 0x8a5a24, // Lederhosen leather
  n: 0xae722d, // the Hosenlatz flap, a shade lighter than the leg
  C: 0xe8e2d0, // Loferl socks
  G: 0x4a2f18, // harness strap
  g: 0x27190d, // Haferlschuh, and the keg's iron hoops
  A: 0xd4af37, // the Trink-Rucksack's brass, and the Lederhosen buttons
  a: 0xb69427, // brass in shadow
  P: 0xe893a8, // cheek flush
  T: 0x3f7a3a, // Trachtenhut felt
  t: 0x2f5b2b, // the Hut's brim, in its own shadow
  F: 0xf5f0e6, // Gamsbart, and the foam leaving the Schlauch
  o: 0xd99a3f, // the beer behind the foam
};

const LEGAL = legalPixelColorsFor('common');
for (const [key, colour] of Object.entries(PIXEL_KEYS)) {
  if (colour !== null && !LEGAL.has(colour)) {
    throw new Error(
      `authoring key "${key}" is #${colour.toString(16).padStart(6, '0')}, which is not a legal ` +
        `colour for the common bucket — see tools/art/palette.mjs`,
    );
  }
}

/**
 * A rectangle of `PIXEL_KEYS` characters, checked on the way in.
 *
 * Ragged rows and unknown characters are the two mistakes text-authored pixel
 * art actually makes, and both are invisible in the source: a row one character
 * short shifts everything after it, and a typo'd key silently drops a pixel. So
 * both throw here, naming the row, rather than turning into a wrong PNG.
 */
export function grid(name, rows) {
  const width = rows[0]?.length ?? 0;
  if (width === 0) {
    throw new Error(`${name}: no rows`);
  }
  rows.forEach((row, index) => {
    if (row.length !== width) {
      throw new Error(
        `${name}: row ${String(index)} is ${String(row.length)} wide, expected ${String(width)}\n  "${row}"`,
      );
    }
    for (const character of row) {
      if (!(character in PIXEL_KEYS)) {
        throw new Error(`${name}: row ${String(index)} has unknown key "${character}"`);
      }
    }
  });
  return { name, width, height: rows.length, rows };
}

/** `part` slid `dx` sideways on its own canvas, for a body drawn off-centre. */
export function shiftGrid(part, dx) {
  return grid(
    `${part.name}${dx > 0 ? '+' : ''}${String(dx)}`,
    part.rows.map((row) => {
      const out = Array.from({ length: part.width }, () => '.');
      for (let x = 0; x < part.width; x++) {
        if (row[x] === '.') continue;
        const tx = x + dx;
        if (tx >= 0 && tx < part.width) out[tx] = row[x];
      }
      return out.join('');
    }),
  );
}

/** A mutable character canvas, the thing `stamp` draws into. */
export function blankCanvas(width, height) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => '.'));
}

/**
 * Draws `part` into `canvas` at `(ox, oy)`, transparent characters skipped and
 * anything past an edge dropped. Later stamps paint over earlier ones, so the
 * caller's order is the layer order.
 */
export function stamp(canvas, part, ox, oy) {
  const height = canvas.length;
  const width = canvas[0]?.length ?? 0;
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const character = part.rows[y]?.[x];
      if (character === undefined || character === '.') continue;
      const ty = oy + y;
      const tx = ox + x;
      if (ty < 0 || ty >= height || tx < 0 || tx >= width) continue;
      const row = canvas[ty];
      if (row !== undefined) row[tx] = character;
    }
  }
}

/** A stamped canvas back as a `grid`, ready to be written or previewed. */
export function finishCanvas(name, canvas) {
  return grid(
    name,
    canvas.map((row) => row.join('')),
  );
}

/**
 * A horizontal frame strip as PNG bytes, in the layout
 * `assets/sprites/README.md` specifies.
 *
 * Frames must agree on their canvas: a strip whose width does not divide evenly
 * by its frame count is rejected by `tools/art/scan.mjs` anyway, and catching it
 * here says *which* frame is the odd one.
 */
export function encodeStrip(name, frames) {
  const first = frames[0];
  if (first === undefined) {
    throw new Error(`${name}: no frames`);
  }
  for (const frame of frames) {
    if (frame.width !== first.width || frame.height !== first.height) {
      throw new Error(
        `${name}: frame ${frame.name} is ${String(frame.width)}x${String(frame.height)}, ` +
          `expected ${String(first.width)}x${String(first.height)}`,
      );
    }
  }
  const width = first.width * frames.length;
  const pixels = Buffer.alloc(width * first.height * 4);
  frames.forEach((frame, index) => {
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const colour = PIXEL_KEYS[frame.rows[y]?.[x] ?? '.'];
        if (colour === null || colour === undefined) continue;
        const at = (y * width + index * frame.width + x) * 4;
        pixels[at] = (colour >> 16) & 0xff;
        pixels[at + 1] = (colour >> 8) & 0xff;
        pixels[at + 2] = colour & 0xff;
        pixels[at + 3] = 0xff;
      }
    }
  });
  return encodePng({ width, height: first.height, pixels });
}
