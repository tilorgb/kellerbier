import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Russ'n — Weißbier and lemonade, the Radler's paler cousin. Shots gain
 * `homing` (#27) and chase the nearest target.
 *
 * The one-tag proof item for `ctx.sim.addProjectileTag` (#29): everything it
 * does is this single call. Tagged `impure` for Reinheitsgebot 1516.
 */
export const russn: ItemDefinition = {
  id: 'russn',
  name: "Russ'n",
  description: 'Shots home in on the nearest target',
  flavourText: 'The lemonade did not ask to be here. It is here anyway.',
  sprite: 'russn',
  pools: ['treasure', 'shop'],
  quality: 2,
  promilleRequirement: 'any',
  tags: ['impure'],
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'homing');
    },
  },
};
