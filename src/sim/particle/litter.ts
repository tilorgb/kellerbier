/**
 * The Müll item's trash (`content/items/muell.ts`): what its shots look like in
 * flight and what they leave on the floor. Presentational constants shared by
 * the sim (which owns the litter store) and `render/litter-art.ts` (which
 * draws it).
 */

/** Pieces of litter kept on the floor of one room; the oldest gives way. */
export const LITTER_CAPACITY = 40;

/** Banana peel, nail, apple core, paper (a decal store holds four look-alikes per kind). */
export const LITTER_VARIANTS = 4;

/** Side of a lying piece in room units. */
export const LITTER_SIZE = 7;
