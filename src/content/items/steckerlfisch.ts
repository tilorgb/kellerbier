import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Steckerlfisch — grilled whole over an open flame on a stick. Shots pick up
 * the habit.
 */
export const steckerlfisch: ItemDefinition = {
  id: 'steckerlfisch',
  name: 'Steckerlfisch',
  description: 'Shots burn on hit',
  flavourText: 'Cooked over an open flame for an hour. The shots learned fast.',
  sprite: 'steckerlfisch',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'burning');
    },
  },
};
