/**
 * Sprite categories, their file-size spec, and the floor bucket list.
 *
 * Sizes are in *file* pixels, and since `docs/DECISIONS.md` #45 they are also
 * the sprite's size on screen: everything that is a body — a character, a
 * boss, a pickup — is drawn at `render/resolution.ts`'s `ACTOR_SPRITE_SCALE`,
 * one authored pixel per internal pixel, so a 24x16 canvas is 24x16 of the
 * 640x360 frame. `tile` covers a fixed `ROOM_TILE_UNITS` footprint by
 * definition, so — per `docs/DECISIONS.md` #48 — it may be authored at either
 * of exactly two square sizes rather than a size the spec range would
 * otherwise suggest is continuously variable: 16 draws on the coarser room
 * grid (`TILE_SPRITE_SCALE`, two internal pixels per authored pixel, #45's
 * original default), 32 draws on the same 1:1 grid a character does
 * (`ACTOR_SPRITE_SCALE`) for an author who wants more resolvable detail.
 * `tools/art/validate.mjs`'s `validateSpriteSize` enforces the two-sizes-only
 * rule directly; the `min`/`max` here just bound the range for generic
 * consumers (the pixel editor's size presets) that don't need to know tile
 * art is special.
 *
 * That makes these numbers a *composition* budget, not just a memory one:
 * a ceiling here is how much of the screen the category may cover.
 *
 * `min`/`max` rather than an exact size for `character` and `boss`: a boss
 * silhouette shrinking between floors, or a character denser than the floor
 * of the range, is exactly the kind of variation that spec is meant to
 * allow — see `docs/DECISIONS.md` #26 for `character`'s and `boss`'s actual
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
  vfx: 'vfx',
};

export const CATEGORY_SPECS = {
  tile: { minWidth: 16, maxWidth: 32, minHeight: 16, maxHeight: 32 },
  // Height's floor is the original "roughly 12x16" ceiling, kept as the
  // floor so every already-committed floor-1/2 character sprite (authored at
  // 16 tall) stays legal — `docs/DECISIONS.md` #26 raised the height
  // ceiling to 32 for new content wanting more detail, and #27 raised the
  // width ceiling to match: a character's silhouette was never guaranteed to
  // be taller than it is wide (a stout body, a wide-bellied enemy), so
  // capping width at the old 16 while height could reach 32 baked in a
  // portrait-only assumption nothing here actually requires.
  //
  // Raised again to 64x48 by `docs/DECISIONS.md` #45, and this time the
  // number means something concrete rather than "some more detail". A
  // character's canvas is now its size in internal pixels, so the ceiling has
  // to clear the largest body that is not a boss: a `mid` creature's collider
  // is 40 internal pixels across (`ENEMY_PROFILES`), and the widest things in
  // the roster — Kuh, Traktor — are roughly half again as wide as they are
  // tall. 48 tall gives a `mid` body its collider plus headroom; 64 wide
  // gives that same body room to be the shape it is. Anything wanting more
  // than that is a boss and belongs in `bosses/`.
  character: { minWidth: 8, maxWidth: 64, minHeight: 16, maxHeight: 48 },
  // Floor of 17 keeps a boss from silently passing as an oversized tile.
  // Ceiling raised from 48 to 160 by `docs/DECISIONS.md` #26, on the
  // reasoning that a boss is the one category meant to dominate the screen.
  //
  // That reasoning was not true when it was written: #26 assumed a boss drew
  // at its authored size, while `EntityView` was in fact drawing every body
  // at `2 * radius` world units tall, and the largest radius in the game is
  // `mid`'s 10 — so every boss was 40 internal pixels tall whatever it was
  // authored at, and a 160-tall one would have lost three rows in four. #45
  // made the assumption true: at `ACTOR_SPRITE_SCALE` a 160-tall boss really
  // is 160 of the 360-line frame. The number is unchanged; it just finally
  // does what it says.
  boss: { minWidth: 17, maxWidth: 160, minHeight: 17, maxHeight: 160 },
  // Not in the bible directly — derived from "enemy shots must read against
  // every background", which only makes sense for something tile-scale or
  // smaller.
  projectile: { minWidth: 2, maxWidth: 16, minHeight: 2, maxHeight: 16 },
  // Effect art (#153): particles, the muzzle flash, the telegraph ring. Same
  // size range as a projectile and deliberately a *separate* category, for one
  // reason: the projectile legibility gate (`contrast.mjs`) must not apply
  // here. A shot has to read against every background because misreading one
  // is a hit the player takes; a dust puff has to do the opposite, and the
  // gate would force every soft effect to grow a hard outline it should not
  // have. The trade is that an effect's legibility is a review judgement
  // rather than a build gate — which is the right way round, since #153's own
  // constraint is that an effect must be *removable* without losing
  // information, not that it must be readable.
  // Wider than `projectile`'s 16 at the top end, because one member of this
  // set is not a particle: the telegraph ring is drawn at 2.6x an enemy's
  // radius (`render/entities.ts`'s `TELEGRAPH_SCALE`), which for a `mid` body
  // is 52 units across. Authored at 16 it would be blown up more than three
  // times and read as a different, chunkier game than everything around it;
  // 48 lands it near 1:1 where the generated ring it replaces already was.
  vfx: { minWidth: 2, maxWidth: 48, minHeight: 2, maxHeight: 48 },
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

/**
 * The animation states a clip may be authored for.
 *
 * Fixed, not open-ended: every one of these is derived from simulation state
 * the engine already computes (`src/render/animation/state.ts`), so a clip
 * named anything else is a clip nothing would ever play — a typo, in other
 * words, and `validateAnimation` rejects it as one rather than leaving a walk
 * cycle mysteriously unused.
 *
 * `idle` is mandatory whenever a sidecar authors clips at all: it is what
 * every other state falls back to when its own clip has not been drawn yet
 * (`docs/DECISIONS.md` #19), and a fallback that might itself be missing is
 * not a fallback.
 *
 * The runtime reads this list from here rather than keeping its own copy
 * (`src/render/animation/definition.ts` imports it, the way
 * `src/pixel-editor/size-presets.ts` already imports `CATEGORY_SPECS`): the
 * build's idea of a legal clip name and the animator's have to agree, and a
 * shared constant makes that true by construction where a second list plus a
 * sync test only makes drift detectable. Nothing Node-only comes along for
 * the ride — this module and `validate.mjs` are pure functions over plain
 * objects, which is why they were split out of `build.mjs` in the first place.
 */
export const ANIMATION_STATES = ['idle', 'move', 'telegraph', 'hurt', 'death'];

/** The state every other one falls back to. */
export const DEFAULT_ANIMATION_STATE = 'idle';

/**
 * How a clip advances once it reaches its last frame.
 *
 * `pingPong` counts back down through the frames it already played, minus
 * both endpoints, so a 4-frame ping-pong is a 6-frame cycle rather than one
 * that stutters on each end.
 */
export const CLIP_MODES = ['loop', 'once', 'pingPong'];

/**
 * What a `once` clip does when it ends: hold its last frame, or hand back to
 * `idle`. A death clip holds; a hurt flinch returns to idle. Meaningless on
 * a clip that never ends, so it is rejected on one.
 */
export const CLIP_END_ACTIONS = ['hold', 'idle'];

/**
 * Frames of walk cycle a creature is authored with.
 *
 * Four: contact, passing, contact, passing — the smallest count that reads as
 * a cycle rather than as a two-pose flicker, and the count 16-bit era sprite
 * work settled on for the same reason. This is a budget decision five parked
 * floors inherit (`docs/ROADMAP.md`'s M6 sequencing note): roughly thirty-five
 * more creatures will be authored to whatever number is written here, so the
 * argument for it is worth having once — see `docs/DECISIONS.md` #37.
 *
 * Advisory rather than enforced: a strip may hold more frames than one walk
 * cycle (the Kellerassel's holds a hurt pose and a three-frame death on top of
 * its four walk frames), and a creature that genuinely reads better on two —
 * something that hovers, or rolls — is not a spec violation. It is the number
 * to reach for absent a reason not to.
 */
export const WALK_CYCLE_FRAMES = 4;
