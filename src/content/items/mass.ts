import type { ItemDefinition } from '../../sim/item/definition.js';

/** How much bigger the one enormous shot reads on screen than an ordinary one. */
const RADIUS_SCALE = 2.5;

/**
 * Maß — one litre, one glass, one shot. Trades the stream of ordinary shots
 * for one enormous, slow, hard-hitting one.
 *
 * `modifyStats` carries the damage/rate/speed trade-off; `onProjectileSpawn`
 * enlarges the one shot that actually fires by writing `radius` directly on
 * `ProjectileStore` — there is no stat for a shot's size, so the field is
 * reached through `ctx.sim.projectiles`, the same public surface every other
 * hook already reaches `ctx.sim` through.
 */
export const mass: ItemDefinition = {
  id: 'mass',
  name: 'Maß',
  description: 'One huge, slow shot instead of a stream. Damage +200%, fire rate -66%',
  flavourText: 'One litre. One decision. No refills mid-fight.',
  sprite: 'mass',
  pools: ['shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'stammwuerze', op: 'multiply', value: 3 },
      { stat: 'schluckfrequenz', op: 'multiply', value: 3 },
      { stat: 'wurfkraft', op: 'multiply', value: 0.6 },
    ],
    onProjectileSpawn: (ctx) => {
      const radius = ctx.sim.projectiles.radius[ctx.projectile] ?? 0;
      ctx.sim.projectiles.radius[ctx.projectile] = radius * RADIUS_SCALE;
    },
  },
};
