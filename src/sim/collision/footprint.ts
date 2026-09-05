/**
 * The two circles a body has, and the relationship between them.
 *
 * Until `docs/DECISIONS.md` #73 a body was one circle used for four different
 * jobs: what it walks into, what pushes it, what hurts to touch, and what a
 * shot has to cross to hit it. That is fine while a sprite is the same size as
 * its collider — which every sprite in this game was, because #45 sized the
 * art to the collider on purpose — and it is what stopped anything ever
 * reading as having *height*. A creature whose hitbox is its whole silhouette
 * has no head to stick out over a rock.
 *
 * So there are two now:
 *
 * - **The footprint** (`GameSim.body`) is the circle on the floor: movement,
 *   walls, pushing, contact damage, pickup reach, melee reach. It is the part
 *   of a body that is *on the ground*, and it is smaller than the drawing.
 * - **The hurtbox** (`GameSim.hurtbox`) is the circle a projectile has to
 *   cross, offset up the screen from the footprint's centre. It is the part of
 *   a body that is *in the air* — the drawing itself.
 *
 * The offset is not a free parameter. A sprite is drawn standing on its
 * footprint's south pole (`render/depth.ts`), so shrinking the footprint by
 * `d` lifts the drawing by `d` — and the hurtbox is lifted by the same `d`, so
 * that it keeps sitting on the body rather than sliding down to its feet as
 * the footprint shrinks. **Shooting an enemy is meant to feel exactly as it
 * did**: the hurtbox keeps the radius every balance number was tuned against,
 * and it rises with the art rather than against it. `tests/unit/footprint.test.ts`
 * pins both halves. What genuinely moves is only what was always supposed to
 * be on the floor — and the player's own hurtbox, which is a deliberate
 * exception (`GameSim`'s `PLAYER_FOOTPRINT`).
 */

/**
 * How much of a body's drawn radius is actually standing on the floor, for a
 * body that has no authored footprint of its own — a barrel, the arena
 * maypole, a training target, a placed Bierfassl.
 *
 * Seven tenths, from the roster: a creature's silhouette is between 0.6x and
 * 1.8x its collider (`tests/content/sprite-scale.test.ts`) and the ones in the
 * middle of that band — Alois at 20 authored pixels wide over a 28-pixel
 * collider, Bauer at 21 — put their actual ground contact at roughly two
 * thirds of the circle they were being collided as. Rounder than it is precise:
 * the four enemy size classes state their own (`ENEMY_PROFILES`) and the player
 * states his, so this covers the bodies nobody has authored a base width for
 * rather than being the number the game is tuned on.
 */
export const FOOTPRINT_RATIO = 0.7;

/** The floor circle a body of drawn radius `bodyRadius` stands on. */
export function footprintRadius(bodyRadius: number): number {
  return bodyRadius * FOOTPRINT_RATIO;
}

/**
 * How far *up the screen* a body's hurtbox sits from its footprint's centre —
 * always negative or zero, since a drawing is above the floor it stands on.
 *
 * Exactly the amount the footprint shrank, for the reason this module's own
 * doc comment gives: the sprite rises by that much when it is stood on the
 * smaller circle, so the hurtbox has to rise by the same amount to keep
 * covering the same pixels.
 *
 * Rounded to a whole world unit — the same rule `render/resolution.ts` states
 * for everything else that is a *position* rather than a size. A world unit is
 * two internal pixels, so an unrounded offset would put a body's hurtbox half
 * a screen pixel off the grid its own art is drawn on, and the sub-pixel
 * remainder buys nothing: it is a shift of at most half a unit applied to a
 * circle four to twenty-two units across. Sizes stay fractional (`footprint`
 * is 0.7 of a radius and reads as such); only where a circle *sits* is
 * snapped.
 */
export function hurtboxOffsetY(bodyRadius: number, footprint: number): number {
  return Math.round(footprint - bodyRadius);
}

/**
 * The radius of the circle a shot has to cross, given a body's stored
 * `hurtbox` radius and its footprint.
 *
 * Zero means "no hurtbox of its own", which resolves to the footprint — so a
 * body nobody has split (a pickup; anything a test builds by hand) is collided
 * exactly as everything was before #73. Written as a function because the
 * fallback is a rule rather than a convenience, and five call sites reaching
 * for `||` each time is five chances to write `??` and get a hurtbox of zero.
 *
 * `sim/systems/collision.ts` deliberately inlines this instead of calling it —
 * see that file's opening note on what it does and does not do per candidate.
 */
export function hurtboxRadiusOf(hurtRadius: number, footprint: number): number {
  return hurtRadius > 0 ? hurtRadius : footprint;
}
