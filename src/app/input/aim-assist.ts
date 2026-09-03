/**
 * Aim assist (#53, "an optional aim assist" — `docs/GAME_DESIGN.md` §12):
 * nudges an analog aim direction toward the nearest enemy inside a narrow
 * cone ahead of it, so a controller's imprecise stick still reads as "aiming
 * at that guy" the way a mouse cursor already does implicitly.
 *
 * Pure and allocation-free per call — `sampler.ts` calls this once a tick
 * from `sampleGamepad`/`sampleTouch`, and the result is written into a
 * shared scratch object rather than a fresh one, the same discipline
 * `normaliseDiagonal`/`snapToOctant` already hold themselves to there.
 */

/** Mutable scratch, so a call never allocates. */
const result = { x: 0, y: 0 };

/** How far ahead of the raw aim direction a target still counts — `cos(20°)`, a narrow cone, not a lock-on. */
export const AIM_ASSIST_CONE_COS = Math.cos((20 * Math.PI) / 180);

/** How far away a target can be and still qualify, in world units — roughly a screen's width. */
export const AIM_ASSIST_MAX_DISTANCE = 220;

/** How hard the nudge pulls, once a target qualifies — a lean, not a lock-on. */
export const DEFAULT_AIM_ASSIST_STRENGTH = 0.4;

/**
 * Blends `(rawX, rawY)` toward the nearest qualifying target's direction by
 * `strength` (0 disables the effect entirely, 1 snaps straight to it), then
 * rescales back to the raw input's own magnitude — assist changes *where*
 * the stick points, never how far it is pushed, so it composes with
 * whatever dead zone already ran.
 *
 * `visitTargets` is a `forEach`-shaped callback rather than an array, so the
 * caller (`sampler.ts`, reading `GameSim.world.forEach(sim.enemyMask, …)`)
 * never has to materialise a per-tick array of enemy positions just to ask
 * this question.
 */
export function applyAimAssist(
  rawX: number,
  rawY: number,
  playerX: number,
  playerY: number,
  strength: number,
  visitTargets: (visit: (targetX: number, targetY: number) => void) => void,
): { x: number; y: number } {
  result.x = rawX;
  result.y = rawY;
  const rawMagnitude = Math.hypot(rawX, rawY);
  if (rawMagnitude === 0 || strength <= 0) {
    return result;
  }

  const aimDirX = rawX / rawMagnitude;
  const aimDirY = rawY / rawMagnitude;
  let bestDistance = Infinity;
  let bestDirX = 0;
  let bestDirY = 0;

  visitTargets((targetX, targetY) => {
    const dx = targetX - playerX;
    const dy = targetY - playerY;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance > AIM_ASSIST_MAX_DISTANCE) {
      return;
    }
    const dirX = dx / distance;
    const dirY = dy / distance;
    const alignment = dirX * aimDirX + dirY * aimDirY;
    if (alignment < AIM_ASSIST_CONE_COS) {
      return;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDirX = dirX;
      bestDirY = dirY;
    }
  });

  // No target ever beat `Infinity` — nothing in cone and in range.
  if (bestDistance === Infinity) {
    return result;
  }

  const blendedX = aimDirX + (bestDirX - aimDirX) * strength;
  const blendedY = aimDirY + (bestDirY - aimDirY) * strength;
  const blendedMagnitude = Math.hypot(blendedX, blendedY) || 1;
  result.x = (blendedX / blendedMagnitude) * rawMagnitude;
  result.y = (blendedY / blendedMagnitude) * rawMagnitude;
  return result;
}
