import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Kletterseil — an alpine climbing rope, rated for a person's weight and
 * regularly asked to hold much stranger things. Shots stick to whatever
 * they hit.
 */
export const kletterseil: ItemDefinition = {
  id: 'kletterseil',
  name: 'Kletterseil',
  description: 'Shots stick to whatever they hit',
  flavourText: "Rated for a person's weight. Regularly asked to hold much stranger things.",
  sprite: 'kletterseil',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'sticky');
    },
  },
};
