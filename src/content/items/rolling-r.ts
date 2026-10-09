import type { ItemDefinition } from '../../sim/item/definition.js';

/** The trade: much faster, much smaller, much weaker. */
export const ROLLING_R_SPEED_SCALE = 2;
export const ROLLING_R_RADIUS_SCALE = 0.5;
export const ROLLING_R_DAMAGE_SCALE = 0.6;

/**
 * Rolling R — the letter every Bavarian has and every Prussian fails the
 * entrance test on. Shots fly twice as fast and are half the size, for 40%
 * less damage each.
 *
 * Shot speed is applied to the projectile itself rather than through the Shot
 * Speed stat: `fire` reads `tuning.shotSpeed` directly, so a stat modifier
 * would change nothing on screen. The shot's lifetime is halved to match, so
 * the item buys speed and not range — Range is its own stat and its own item.
 * The shot sound is the trill (`sfx.ts`'s `player-shot-rolling-r`, chosen by
 * `app/audio/impact.ts` while the item is held).
 */
export const rollingR: ItemDefinition = {
  id: 'rolling-r',
  name: 'Rolling R',
  description: 'items.rolling-r.description',
  flavourText: 'items.rolling-r.flavourText',
  sprite: 'rolling-r',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'multiply', value: ROLLING_R_DAMAGE_SCALE }],
    onProjectileSpawn: (ctx) => {
      const projectiles = ctx.sim.projectiles;
      const slot = ctx.projectile;
      projectiles.velocityX[slot] = (projectiles.velocityX[slot] ?? 0) * ROLLING_R_SPEED_SCALE;
      projectiles.velocityY[slot] = (projectiles.velocityY[slot] ?? 0) * ROLLING_R_SPEED_SCALE;
      projectiles.radius[slot] = (projectiles.radius[slot] ?? 0) * ROLLING_R_RADIUS_SCALE;
      projectiles.lifetime[slot] = Math.max(
        1,
        Math.round((projectiles.lifetime[slot] ?? 1) / ROLLING_R_SPEED_SCALE),
      );
    },
  },
};
