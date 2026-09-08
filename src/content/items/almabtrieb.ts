import type { ItemDefinition } from '../../sim/item/definition.js';

/** How still counts as "not moving" (pixels/tick, `schuhplattler.ts`'s own epsilon), and the damage multiplier a moving shot gets. */
const STILL_EPSILON = 0.05;
const MOVING_SHOT_MULTIPLIER = 2;

/**
 * Almabtrieb — driving the herd down off the mountain at the end of summer:
 * keep moving and every shot lands twice as hard.
 *
 * "Moving" is read the same way `schuhplattler.ts` reads "still" — position
 * against `previousX`/`previousY`, the pair render interpolation already
 * tracks — just inverted and without a timer, since the bonus is a per-shot
 * check rather than something that has to build up. `onProjectileSpawn` is
 * where it lands, the same hook `mass.ts` uses to touch a fired shot's own
 * fields. The "different colour" the description promises is
 * `tintProjectile`'s `almabtrieb` — the only way a player can tell which of
 * two identical-looking shots is the one hitting twice as hard.
 */
export const almabtrieb: ItemDefinition = {
  id: 'almabtrieb',
  name: 'Almabtrieb',
  description: 'Shooting while moving has 2x damage. The "moving shots" have different color.',
  flavourText: 'Run and Gun',
  sprite: 'almabtrieb',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const dx = sim.positionX(playerIndex) - sim.previousX(playerIndex);
      const dy = sim.positionY(playerIndex) - sim.previousY(playerIndex);
      if (Math.abs(dx) <= STILL_EPSILON && Math.abs(dy) <= STILL_EPSILON) {
        return;
      }
      const projectiles = sim.projectiles;
      projectiles.damage[ctx.projectile] = Math.round(
        (projectiles.damage[ctx.projectile] ?? 0) * MOVING_SHOT_MULTIPLIER,
      );
      sim.tintProjectile(ctx.projectile, 'almabtrieb');
    },
  },
};
