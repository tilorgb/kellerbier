import { FLOOR_BUCKETS, COMMON_BUCKET_ID, floorTagForBucket } from './spec.mjs';

/**
 * The master palette and per-floor sub-palettes, per
 * `docs/CONTENT_BIBLE.md` §5 ("Palette capped at ~40 colours overall, with a
 * per-floor sub-palette so each chapter has its own mood while staying
 * visually one game").
 *
 * This is the *authored* palette — the moods below are transcribed from
 * `docs/CONTENT_BIBLE.md` §1's floor descriptions, five colours per floor.
 * Nothing here is derived from real art yet, because none exists; this is
 * the fence the seven floors of art (#35-#43 and friends) get built inside.
 *
 * Neutrals are allowed on every floor in addition to that floor's own five —
 * outlines, hit-flash white, and shared shading all need to work everywhere
 * rather than being re-litigated as a sixth colour per floor.
 */
export const NEUTRAL_PALETTE = [
  0x000000, // outline ink
  0x1c1a1f, // near-black shade
  0x8a8a8a, // mid grey
  0xffffff, // hit-flash white (see src/render/placeholder-art.ts's entityFlash)
];

export const FLOOR_PALETTES = {
  // Der Keller — bare-concrete grey dominates (a German Keller is poured
  // concrete or concrete block, not a wooden cellar), one brown for the
  // wooden racks as a detail rather than the base material, one warm amber
  // light source. The three greys sit close together on purpose — a damp
  // basement is a low-contrast room lit by one bulb, not a checkerboard,
  // and a tile texture built from far-apart values turns "busy" the moment
  // it repeats across a whole floor.
  cellar: [0x3c3e40, 0x4a4d50, 0x5b5f63, 0x54402e, 0xd99a3f],
  // Dorf & Acker — "green, sky blue, white-and-blue bunting"
  rural: [0x3f7a3a, 0x7fbf6a, 0x6ab0d9, 0x2e4f8c, 0xe8e2d0],
  // Der Wald — "deep green, black, sickly luminous fungus"
  wald: [0x16261a, 0x234d2b, 0x3d6b3a, 0x9fe066, 0xc060d9],
  // Die Alpen — "white, granite, alpenglow pink"
  alpen: [0xeef2f5, 0xb9c4cc, 0x6e7680, 0xe893a8, 0x274b6b],
  // Schloss Neuschwanstein — "royal blue, gold, candlelight"
  schloss: [0x1f3a70, 0x3a5ba0, 0xd4af37, 0xf4d78a, 0x7a1f2b],
  // Die Brauerei — "steel, hazard yellow, cola brown. Deliberately the ugliest floor."
  brauerei: [0x6d747a, 0x494f54, 0xe0b400, 0x4a2f18, 0x8a5a24],
  // Die Wiesn — "everything at once, gaudy, over-lit"
  wiesn: [0xd92b3c, 0xf2a900, 0x2fb8c4, 0xb23bd9, 0xf5f0e6],
};

export const MASTER_PALETTE = Array.from(
  new Set([...NEUTRAL_PALETTE, ...Object.values(FLOOR_PALETTES).flat()]),
);

/**
 * The set of colours a sprite in `bucketId` is allowed to use.
 *
 * `common` may draw from the whole master palette — it is shared across
 * floors and has no mood of its own to protect. A floor bucket is held to
 * its own five plus the neutrals, which is the actual palette-discipline
 * check: the master palette caps the *game's* colour budget, the per-floor
 * set is what keeps floor 3 from quietly borrowing floor 5's gold.
 */
export function allowedColorsFor(bucketId) {
  if (bucketId === COMMON_BUCKET_ID) {
    return new Set(MASTER_PALETTE);
  }
  const floorTag = floorTagForBucket(bucketId);
  const floorColors = floorTag !== null ? FLOOR_PALETTES[floorTag] : undefined;
  if (floorColors === undefined) {
    throw new Error(`unknown sprite bucket "${bucketId}"`);
  }
  return new Set([...NEUTRAL_PALETTE, ...floorColors]);
}

/**
 * The subset of each floor's palette that actually fills large background
 * areas — walls, floors, foliage — as opposed to a small-area accent or
 * light source. Transcribed from the same `docs/CONTENT_BIBLE.md` §1
 * sentences `FLOOR_PALETTES` was: a floor's "one warm amber light source",
 * its bunting, its gold trim and candlelight, are explicitly called out as
 * details rather than the base material, and a legibility test that weighs
 * a two-pixel highlight the same as the wall behind it is testing against
 * a background nobody will actually see the projectile in front of.
 *
 * Neutrals are excluded for the same reason from the other direction: black
 * outline ink and hit-flash white cover a few pixels each, never a wall.
 */
const FLOOR_BACKGROUND_SWATCHES = {
  // The wood accent is excluded here for the same reason the amber light is
  // — a wooden rack is furniture sitting in a concrete room, not the wall or
  // floor material itself.
  cellar: [0x3c3e40, 0x4a4d50, 0x5b5f63],
  rural: [0x3f7a3a, 0x7fbf6a, 0x6ab0d9],
  wald: [0x16261a, 0x234d2b, 0x3d6b3a],
  alpen: [0xeef2f5, 0xb9c4cc, 0x6e7680],
  schloss: [0x1f3a70, 0x3a5ba0],
  brauerei: [0x6d747a, 0x494f54, 0x4a2f18, 0x8a5a24],
  // Wiesn is "everything at once" by design — every one of its five colours
  // is meant to fill the screen at once, so none of them is an accent.
  wiesn: FLOOR_PALETTES.wiesn,
};

/** Every floor's own background swatches — what `contrast.mjs` checks projectiles against. */
export function floorBackgroundSwatches(floorTag) {
  const backgroundColors = FLOOR_BACKGROUND_SWATCHES[floorTag];
  if (backgroundColors === undefined) {
    throw new Error(`unknown floor tag "${floorTag}"`);
  }
  return backgroundColors;
}

export { FLOOR_BUCKETS };
