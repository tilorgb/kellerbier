/**
 * Which palette tier each sprite is drawn on (#214, `docs/DECISIONS.md` #62).
 *
 * **Foreground** — the default, and everything the player acts on: the player,
 * every enemy and boss, projectiles, VFX, pickups, the obstacle `blockVariants`
 * (#60), the `destructibles` (barrel, Maibaum), doors, the pedestal. Drawn from
 * `FLOOR_PALETTES` (`palette.mjs`'s `allowedColorsFor`), unchanged.
 *
 * **Background** — walls, floors, the wall-boundary lip, and every free-standing
 * decorative prop that is art-only (no collision, nothing to destroy). Drawn
 * from the quieter derived tier (`palette.mjs`'s `backgroundColorsFor`) so it
 * recedes instead of implying an interaction it does not have.
 *
 * This is a **manifest, not a naming convention** — the same call `FLOOR_TILESETS`
 * and `PROP_TILE_NAMES` are. Which of a floor's tiles is its wall is a decision;
 * inferring "background" from a `-wall` suffix would make a rename a silent
 * behaviour change. Background is the explicit list below; foreground is
 * everything else. `tile` is the one category that can go either way, so
 * `tests/content/sprite-coverage.test.ts` requires every tile on disk to appear
 * in one of the two sets here and fails a pull request on a tile that appears in
 * neither.
 *
 * Floors 3-7 (parked, #39-#43) inherit the tier for free: `BACKGROUND_PALETTES`
 * already covers every floor tag, so their content landing only adds tile names
 * here, no palette work.
 */

/** Every sprite drawn on the quiet background tier, by name. */
export const BACKGROUND_SPRITE_NAMES = new Set([
  // Floor 1 — Der Keller: structure + the art-only bulb.
  'cellar-wall',
  'cellar-wall-lip',
  'cellar-wall-lip-corner',
  'cellar-floor',
  'cellar-bulb',
  // Floor 2 — Dorf & Acker: structure.
  'rural-wall',
  'rural-wall-lip',
  'rural-wall-lip-corner',
  'rural-floor-1',
  'rural-floor-2',
  'rural-floor-3',
  'rural-floor-4',
  // Floor 2 — decorative props with no collision and nothing to destroy.
  'rural-fence-post',
  'rural-well',
  'rural-hay-bale',
  'rural-bunting',
  'rural-trough',
  'rural-tractor',
  'rural-market-stall',
  'rural-bandstand',
  // common — shared scenery that appears on every floor.
  'crate-opa',
  'crate-neu',
  'crate-stack',
  'shopkeeper-stand',
  'boss-plate',
]);

/**
 * Tiles that are explicitly foreground — the player breaks, opens, routes
 * around or picks these up. Listed rather than left implicit so that adding a
 * new tile forces a tier decision (an unlisted tile fails the coverage test)
 * rather than defaulting quietly to foreground and reading wrong.
 */
export const FOREGROUND_TILE_NAMES = new Set([
  // Destructibles.
  'cellar-barrel',
  'rural-barrel',
  'rural-maibaum-base',
  'rural-maibaum-top',
  // Obstacle block variants (#60).
  'cellar-boulder-1',
  'cellar-boulder-2',
  'cellar-boulder-3',
  'cellar-boulder-4',
  'rural-fieldstone-1',
  'rural-fieldstone-2',
  'rural-fieldstone-3',
  'rural-fieldstone-4',
  // Interactables and markers the player deals with directly.
  'door-closed',
  'door-open',
  'door-locked',
  'pedestal',
  'minimap-boss',
  'minimap-shop',
  'minimap-treasure',
]);

/**
 * The tier a sprite is drawn on. Background when it is in the manifest above;
 * foreground otherwise — including every non-`tile` category, which is never
 * scenery.
 */
export function spriteTier(_bucketId, _category, name) {
  return BACKGROUND_SPRITE_NAMES.has(name) ? 'background' : 'foreground';
}

/** Whether `name` has an explicit tier declaration — what the coverage test asserts for every tile on disk. */
export function tileTierDeclared(name) {
  return BACKGROUND_SPRITE_NAMES.has(name) || FOREGROUND_TILE_NAMES.has(name);
}
