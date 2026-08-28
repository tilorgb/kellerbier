/**
 * Sprite categories, their file-size spec, and the floor bucket list.
 *
 * Sizes are in *file* pixels — simulation units, per `docs/CONTENT_BIBLE.md`
 * §5 and issue #34's comment thread. Sprites are drawn at `WORLD_ZOOM`
 * (`src/render/resolution.ts`), so these numbers are half what lands on
 * screen; the atlas build never sees screen pixels at all.
 *
 * `min`/`max` rather than an exact size for `character` and `boss`: a boss
 * silhouette shrinking between floors, or a character denser than the floor
 * of the range, is exactly the kind of variation that spec is meant to
 * allow — see `docs/DECISIONS.md` #25 for `character`'s and `boss`'s actual
 * ceilings, raised there from the original 16 and 48: "16-bit era" (the
 * bible's own art-direction line) describes an SNES-era colour/shading
 * budget, not a pixel-dimension rule, and the original numbers under-shot
 * what that era's actual character/boss sprites looked like.
 */

export const CATEGORY_FOLDERS = {
  tile: 'tiles',
  character: 'characters',
  boss: 'bosses',
  projectile: 'projectiles',
};

export const CATEGORY_SPECS = {
  tile: { minWidth: 16, maxWidth: 16, minHeight: 16, maxHeight: 16 },
  // Height's floor is the original "roughly 12x16" ceiling, kept as the
  // floor so every already-committed floor-1/2 character sprite (authored at
  // 16 tall) stays legal — `docs/DECISIONS.md` #25 raised the height
  // ceiling to 32 for new content wanting more detail, and #26 raised the
  // width ceiling to match: a character's silhouette was never guaranteed to
  // be taller than it is wide (a stout body, a wide-bellied enemy), so
  // capping width at the old 16 while height could reach 32 baked in a
  // portrait-only assumption nothing here actually requires.
  character: { minWidth: 8, maxWidth: 32, minHeight: 16, maxHeight: 32 },
  // Floor of 17 keeps a boss from silently passing as an oversized tile.
  // Ceiling raised from 48 to 160 by `docs/DECISIONS.md` #25 — no boss art
  // exists yet to invalidate, and 160 (320 on screen, most of a 180-tall
  // playfield) is deliberately close to "fills the screen."
  boss: { minWidth: 17, maxWidth: 160, minHeight: 17, maxHeight: 160 },
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
