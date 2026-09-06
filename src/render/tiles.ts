import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import type { Texture } from './gfx/index.js';

/**
 * Which of a floor's tile variants a cell draws — the "living floor" mix
 * (#37): a positional hash, so the same cell always lands on the same variant
 * and the mix neither shimmers between frames nor repeats in a visible stride.
 * Shared by the room builder and by click-to-pick (`app/sprite-pick.ts`),
 * which has to know which variant a click landed on.
 */
export function pickTileVariant(col: number, row: number, variantCount: number): number {
  if (variantCount <= 1) {
    return 0;
  }
  let hash = (col * 374761393 + row * 668265263) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  return hash % variantCount;
}

/**
 * The scale that draws a tile texture over exactly one `ROOM_TILE_UNITS`-wide
 * cell, whichever of the two authoring sizes it is (#48/#182): a 16px tile
 * draws at 1, a 32px tile at 0.5 — so a 32px prop sits on the same grid as a
 * 16px one and the extra pixels are detail, not size.
 */
export function tileGridScale(texture: Texture): number {
  return ROOM_TILE_UNITS / texture.width;
}
