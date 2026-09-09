import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Radler — beer cut with lemonade. Half the punch, twice the pace.
 *
 * A pure `modifyStats` item: `damage` halved, `fireRate` halved
 * right back — Fire Rate is a tick *delay* (`sim/stats/definition.js`),
 * so halving it is what doubles the rate a shot actually fires at. Tagged
 * `impure` for Reinheitsgebot 1516, which strips and locks out every item
 * that mixes beer with something that is not beer.
 */
export const radler: ItemDefinition = {
  id: 'radler',
  name: 'Radler',
  description: 'items.radler.description',
  flavourText: 'items.radler.flavourText',
  sprite: 'radler',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  tags: ['impure'],
  hooks: {
    modifyStats: () => [
      { stat: 'damage', op: 'multiply', value: 0.5 },
      { stat: 'fireRate', op: 'multiply', value: 0.5 },
    ],
    // Half lemonade: paler and smaller shots, twice as many of them. The
    // stream should look as thin as it hits.
    onProjectileSpawn: (ctx) => {
      const projectiles = ctx.sim.projectiles;
      projectiles.radius[ctx.projectile] = (projectiles.radius[ctx.projectile] ?? 0) * 0.75;
      ctx.sim.tintProjectile(ctx.projectile, 'radler');
    },
  },
};
