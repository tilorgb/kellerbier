import { type Texture, textureFromPixels } from './gfx/index.js';

/**
 * The Waldradler's ramps, drawn (#412): a wooden wedge seen from the room's
 * fixed camera, one drawing per way its high edge can point on screen.
 *
 * The ramp line is axis-aligned (`captureLine`: horizontal or vertical), so a
 * ramp only ever points one of four ways, and each way is a different view of
 * the same wedge rather than a turned copy of one picture:
 *
 * - `side` — high edge to the right, a profile of the wedge. The left-pointing
 *   ramp is this drawing mirrored (`Billboard.setTexture`'s `mirror`).
 * - `front` — high edge toward the camera: the tall plank face, with a sliver
 *   of the deck's slope falling away behind its top lip.
 * - `back` — high edge away from the camera: the sloped deck itself, planks
 *   converging up to the lip, rails down both sides.
 *
 * Canvases are in authored pixels, two per room unit (`docs/DECISIONS.md`
 * #45): the wedge is 22 units long, 30 wide and 11 high, as its collider-free
 * predecessor was. Pure pixels, no GPU — `rampPixels` is what tests and
 * specimen sheets call, `buildRampTextures` is what uploads them.
 */

export type RampView = 'side' | 'front' | 'back';

export const RAMP_SIDE_WIDTH = 44;
export const RAMP_SIDE_HEIGHT = 22;
export const RAMP_FACE_WIDTH = 60;
export const RAMP_FRONT_HEIGHT = 28;
export const RAMP_BACK_HEIGHT = 22;

const CLEAR = -1;
const INK = 0x2a1a0e;
const WOOD_DARK = 0x5a3a1e;
const WOOD = 0x7a5230;
const WOOD_LIGHT = 0x9a6c40;
const WOOD_HIGHLIGHT = 0xb98a56;

export interface RampPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Int32Array;
}

class Canvas {
  readonly data: Int32Array;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Int32Array(width * height).fill(CLEAR);
  }

  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.width || y >= this.height
      ? CLEAR
      : (this.data[y * this.width + x] ?? CLEAR);
  }

  set(x: number, y: number, colour: number): void {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
      this.data[y * this.width + x] = colour;
    }
  }

  /** Dark outline round everything drawn, on the clear pixels touching it. */
  outline(): void {
    const marks: number[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== CLEAR) {
          continue;
        }
        if (
          this.get(x - 1, y) !== CLEAR ||
          this.get(x + 1, y) !== CLEAR ||
          this.get(x, y - 1) !== CLEAR ||
          this.get(x, y + 1) !== CLEAR
        ) {
          marks.push(x, y);
        }
      }
    }
    for (let i = 0; i < marks.length; i += 2) {
      this.set(marks[i] ?? 0, marks[i + 1] ?? 0, INK);
    }
  }
}

/** Profile of the wedge: a slope from the low toe at the left up to the tall face on the right. */
function side(): RampPixels {
  const w = RAMP_SIDE_WIDTH - 2;
  const h = RAMP_SIDE_HEIGHT - 2;
  const c = new Canvas(RAMP_SIDE_WIDTH, RAMP_SIDE_HEIGHT);
  for (let x = 0; x < w; x++) {
    const top = h - 1 - Math.round(((h - 1) * (x + 1)) / w);
    for (let y = top; y < h; y++) {
      const depth = y - top;
      let colour = depth < 2 ? WOOD_LIGHT : WOOD;
      if (depth === 0) {
        colour = WOOD_HIGHLIGHT;
      }
      // Horizontal boards in the end grain, and a dark beam along the ground.
      if (depth >= 2 && (y - top - 2) % 5 === 4) {
        colour = WOOD_DARK;
      }
      if (y >= h - 2) {
        colour = WOOD_DARK;
      }
      c.set(x + 1, y + 1, colour);
    }
  }
  // Two posts bracing the slope from below.
  for (const postX of [14, 28]) {
    for (let y = 0; y < h; y++) {
      if (c.get(postX + 1, y + 1) === WOOD || c.get(postX + 1, y + 1) === WOOD_DARK) {
        c.set(postX + 1, y + 1, WOOD_DARK);
        c.set(postX + 2, y + 1, WOOD_DARK);
      }
    }
  }
  c.outline();
  return { width: c.width, height: c.height, data: c.data };
}

/** The high edge toward the camera: a tall plank face, the slope receding behind its lip. */
function front(): RampPixels {
  const c = new Canvas(RAMP_FACE_WIDTH, RAMP_FRONT_HEIGHT);
  const slopeRows = 6;
  // The deck falling away behind the lip: narrower the further it goes.
  for (let y = 0; y < slopeRows; y++) {
    const inset = Math.round(((slopeRows - 1 - y) * 4) / (slopeRows - 1)) + 1;
    for (let x = inset; x < RAMP_FACE_WIDTH - inset; x++) {
      c.set(x, y + 1, (x + y) % 12 === 0 ? WOOD : WOOD_LIGHT);
    }
  }
  const faceTop = slopeRows + 1;
  for (let y = faceTop; y < RAMP_FRONT_HEIGHT - 1; y++) {
    for (let x = 1; x < RAMP_FACE_WIDTH - 1; x++) {
      let colour = (x - 1) % 12 === 11 ? WOOD_DARK : WOOD;
      if (y === faceTop) {
        colour = WOOD_HIGHLIGHT;
      } else if (y === faceTop + 1) {
        colour = WOOD_LIGHT;
      }
      // A board seam across the face and a shadowed foot.
      if (y >= RAMP_FRONT_HEIGHT - 3) {
        colour = WOOD_DARK;
      }
      c.set(x, y, colour);
    }
  }
  for (let x = 1; x < RAMP_FACE_WIDTH - 1; x++) {
    const braceY = faceTop + 9;
    c.set(x, braceY, WOOD_DARK);
    c.set(x, braceY + 1, WOOD_DARK);
  }
  c.outline();
  return { width: c.width, height: c.height, data: c.data };
}

/** The high edge away from the camera: the sloped deck, planks running up to the lip. */
function back(): RampPixels {
  const c = new Canvas(RAMP_FACE_WIDTH, RAMP_BACK_HEIGHT);
  const rows = RAMP_BACK_HEIGHT - 2;
  for (let y = 0; y < rows; y++) {
    // Narrower at the top (further from the camera), full width at the toe.
    const inset = Math.round(((rows - 1 - y) * 4) / (rows - 1));
    const left = inset + 1;
    const right = RAMP_FACE_WIDTH - 1 - inset;
    for (let x = left; x < right; x++) {
      const plank = Math.floor(((x - left) * 6) / (right - left));
      const rail = x < left + 3 || x >= right - 3;
      let colour = plank % 2 === 0 ? WOOD : WOOD_LIGHT;
      if (rail) {
        colour = WOOD_DARK;
      }
      // Cross cleats, nearer ones thicker.
      if (y % 6 === 5) {
        colour = WOOD_DARK;
      }
      if (y === 0) {
        colour = WOOD_HIGHLIGHT;
      }
      c.set(x, y + 1, colour);
    }
  }
  c.outline();
  return { width: c.width, height: c.height, data: c.data };
}

/** One view's pixels as `-1`-for-clear colours, the format `textureFromPixels` takes. */
export function rampPixels(view: RampView): RampPixels {
  return view === 'side' ? side() : view === 'front' ? front() : back();
}

export interface RampTextures {
  readonly side: Texture;
  readonly front: Texture;
  readonly back: Texture;
}

export function buildRampTextures(): RampTextures {
  const upload = (view: RampView): Texture => {
    const { width, height, data } = rampPixels(view);
    return textureFromPixels(width, height, data);
  };
  return { side: upload('side'), front: upload('front'), back: upload('back') };
}

export interface RampLook {
  readonly view: RampView;
  /** -1 draws the `side` view mirrored: a ramp whose high edge is on the left. */
  readonly mirror: 1 | -1;
}

/**
 * Which drawing a ramp wears, from the direction its high edge points in the
 * room (`dx` east, `dy` south — toward the camera). Lines are axis-aligned, so
 * the larger component decides.
 */
export function rampLook(dx: number, dy: number): RampLook {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { view: 'side', mirror: dx >= 0 ? 1 : -1 };
  }
  return { view: dy > 0 ? 'front' : 'back', mirror: 1 };
}
