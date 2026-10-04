import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Steckerlfisch — grilled whole over an open flame on a stick. Shots pick up
 * the habit.
 */
export const steckerlfisch: ItemDefinition = {
  id: 'steckerlfisch',
  name: 'Steckerlfisch',
  description: 'items.steckerlfisch.description',
  flavourText: 'items.steckerlfisch.flavourText',
  sprite: 'steckerlfisch',
  pools: ['treasure', 'shop'],
  // 2, not 1: alone it took the simulator's bot from 3% of runs won to 55%,
  // the strongest single item in the pool, and quality 1 is the tier the
  // treasure room offers most.
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'burning');
    },
  },
};
