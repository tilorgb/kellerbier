import { LITTER_VARIANTS } from '../sim/particle/litter.js';
import { type Texture, textureFromPixels } from './gfx/index.js';
import { LITTER_PIXEL_DATA } from './litter-pixels.js';

/**
 * The Müll item's rubbish, drawn: a banana peel, a nail, an apple core and a
 * sheet of paper. One 14×14 drawing each — two authored pixels per room unit
 * across the 7-unit piece (`LITTER_SIZE`, `docs/DECISIONS.md` #45) — worn by
 * the shot in flight and, turned and set down, by the litter it leaves.
 *
 * The drawings are the pixel-bench candidates Tilo picked from a board of
 * options (`tools/art/authoring/picks/litter-*.png`), cut down to 14×14 and
 * given a dark rim by `tools/art/litter-pixels.mjs`, which writes
 * `litter-pixels.ts`. Pure pixels, no GPU — `litterPixels` is what tests and
 * specimen sheets call, `buildLitterArt` is what uploads them.
 */

/** Canvas side in authored pixels. */
export const LITTER_PIXELS = 14;

/** One piece as `-1`-for-clear colours, the format `textureFromPixels` takes. */
export function litterPixels(variant: number): Int32Array {
  const data = LITTER_PIXEL_DATA[variant % LITTER_PIXEL_DATA.length];
  return Int32Array.from(data ?? new Array<number>(LITTER_PIXELS * LITTER_PIXELS).fill(-1));
}

/** Every piece, uploaded: `art[variant]`. */
export function buildLitterTextures(): readonly Texture[] {
  const out: Texture[] = [];
  for (let variant = 0; variant < LITTER_VARIANTS; variant++) {
    out.push(textureFromPixels(LITTER_PIXELS, LITTER_PIXELS, litterPixels(variant)));
  }
  return out;
}

/** The litter store's art in the shape `DecalView` reads: one kind, `LITTER_VARIANTS` drawings. */
export function buildLitterArt(textures: readonly Texture[] = buildLitterTextures()): Texture[][] {
  return [[...textures]];
}
