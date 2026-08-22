/**
 * Entity handles.
 *
 * A handle packs a dense array index and a generation counter into one 32-bit
 * integer. The index is where the entity's components live; the generation is
 * bumped every time that index is recycled, so a handle kept across a
 * destruction is *detectably* stale rather than silently pointing at whatever
 * entity took the slot over. Use-after-free is the defining bug of a pooled
 * entity system, and this is what turns it from a mystery into an assertion.
 */

const INDEX_BITS = 20;
const GENERATION_BITS = 12;

const INDEX_MASK = (1 << INDEX_BITS) - 1;
const GENERATION_MASK = (1 << GENERATION_BITS) - 1;

/** Largest number of simultaneous entity slots a world can address. */
export const MAX_ENTITY_SLOTS = INDEX_MASK + 1;

/**
 * Highest generation before wraparound.
 *
 * Generation 0 is never used, so a handle of 0 is never valid and can serve as
 * the null handle. On wraparound the counter returns to 1 rather than 0.
 */
export const MAX_GENERATION = GENERATION_MASK;

declare const entityBrand: unique symbol;

/**
 * An opaque entity handle. Branded so a raw array index cannot be passed where
 * a handle is expected — the two are both numbers and mixing them silently is
 * exactly the mistake this type exists to prevent.
 */
export type Entity = number & { readonly [entityBrand]: never };

/** The null handle. No live entity ever has this value. */
export const NULL_ENTITY = 0 as Entity;

/** Packs an index and generation into a handle. */
export function packEntity(index: number, generation: number): Entity {
  return (((generation & GENERATION_MASK) << INDEX_BITS) | (index & INDEX_MASK)) as Entity;
}

/** The storage slot a handle refers to. Meaningless unless the handle is live. */
export function entityIndex(entity: Entity): number {
  return entity & INDEX_MASK;
}

/** The generation a handle was minted in. */
export function entityGeneration(entity: Entity): number {
  return (entity >>> INDEX_BITS) & GENERATION_MASK;
}

/** Advances a generation, skipping 0 so the null handle stays unreachable. */
export function nextGeneration(generation: number): number {
  const next = (generation + 1) & GENERATION_MASK;
  return next === 0 ? 1 : next;
}
