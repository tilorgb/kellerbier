/**
 * Sprite categories, their file-size spec, and the floor bucket list.
 *
 * Sizes are in *file* pixels — simulation units, per `docs/CONTENT_BIBLE.md`
 * §5 and issue #34's comment thread. Sprites are drawn at `WORLD_ZOOM`
 * (`src/render/resolution.ts`), so these numbers are half what lands on
 * screen; the atlas build never sees screen pixels at all.
 *
 * `min`/`max` rather than an exact size for `character` and `boss`: the bible
 * says "roughly 12×16" and "up to 48×48", not one fixed number, and a boss
 * silhouette shrinking a few pixels between floors is exactly the kind of
 * variation that spec is meant to allow.
 */

export const CATEGORY_FOLDERS = {
  tile: 'tiles',
  character: 'characters',
  boss: 'bosses',
  projectile: 'projectiles',
};

export const CATEGORY_SPECS = {
  tile: { minWidth: 16, maxWidth: 16, minHeight: 16, maxHeight: 16 },
  // "roughly 12×16" — width has some room, height does not: a character
  // sprite that isn't a full 16px tall reads as floating above the floor.
  character: { minWidth: 8, maxWidth: 16, minHeight: 16, maxHeight: 16 },
  // Floor of 17 keeps a boss from silently passing as an oversized tile.
  boss: { minWidth: 17, maxWidth: 48, minHeight: 17, maxHeight: 48 },
  // Not in the bible directly — derived from "enemy shots must read against
  // every background", which only makes sense for something tile-scale or
  // smaller.
  projectile: { minWidth: 2, maxWidth: 16, minHeight: 2, maxHeight: 16 },
};

/**
 * One bucket per floor, keyed the same way `src/content/floors/definition.ts`
 * keys `FloorConfig.floorTag` — kept in sync by
 * `tests/art/palette.test.ts`, which imports both and compares them, rather
 * than by hand.
 */
export const FLOOR_BUCKETS = [
  { id: 'floor-1-cellar', floor: 1, floorTag: 'cellar', name: 'Der Keller' },
  { id: 'floor-2-rural', floor: 2, floorTag: 'rural', name: 'Dorf & Acker' },
  { id: 'floor-3-wald', floor: 3, floorTag: 'wald', name: 'Der Wald' },
  { id: 'floor-4-alpen', floor: 4, floorTag: 'alpen', name: 'Die Alpen' },
  { id: 'floor-5-schloss', floor: 5, floorTag: 'schloss', name: 'Schloss Neuschwanstein' },
  { id: 'floor-6-brauerei', floor: 6, floorTag: 'brauerei', name: 'Die Brauerei' },
  { id: 'floor-7-wiesn', floor: 7, floorTag: 'wiesn', name: 'Die Wiesn' },
];

/** Shared assets that do not belong to one floor — UI-adjacent icons, generic pickups. */
export const COMMON_BUCKET_ID = 'common';

export const ALL_BUCKET_IDS = [COMMON_BUCKET_ID, ...FLOOR_BUCKETS.map((bucket) => bucket.id)];

/** The floor tag a bucket id was built from, or `null` for the common bucket. */
export function floorTagForBucket(bucketId) {
  const bucket = FLOOR_BUCKETS.find((entry) => entry.id === bucketId);
  return bucket ? bucket.floorTag : null;
}
