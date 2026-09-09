import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Kraftbier — a strong, heavy beer. Big damage up, big speed down; the
 * straightforward trade-off every roster needs at least one of.
 */
export const kraftbier: ItemDefinition = {
  id: 'kraftbier',
  name: 'Kraftbier',
  description: 'items.kraftbier.description',
  flavourText: 'items.kraftbier.flavourText',
  sprite: 'kraftbier',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'damage', op: 'multiply', value: 1.4 },
      { stat: 'moveSpeed', op: 'multiply', value: 0.8 },
    ],
    // A 9% beer pours darker and heavier: `dunkel` tint and a fatter shot,
    // so the trade a player made is on the shot they fire and not only in
    // how slowly they walk.
    onProjectileSpawn: (ctx) => {
      const projectiles = ctx.sim.projectiles;
      projectiles.radius[ctx.projectile] = (projectiles.radius[ctx.projectile] ?? 0) * 1.3;
      ctx.sim.tintProjectile(ctx.projectile, 'dunkel');
    },
  },
  /**
   * Der Losbrunnen's rarest roll (#218): the same damage bump, the move
   * speed penalty all but brewed out — "a distinct, strictly-better named
   * variant," not a bigger version of the same trade-off.
   */
  legendaryRoll: [
    { stat: 'damage', op: 'multiply', value: 1.4 },
    { stat: 'moveSpeed', op: 'multiply', value: 0.98 },
  ],
};
