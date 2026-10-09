import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Diet Plate (#484) — three new heart containers, bought by eating almost
 * nothing: everything filled drops to a single heart and the new room is
 * empty. Whatever feeds you from then on has somewhere to go.
 */
export const dietPlate: ItemDefinition = {
  id: 'diet-plate',
  name: 'Diet Plate',
  description: 'items.diet-plate.description',
  flavourText: 'items.diet-plate.flavourText',
  sprite: 'diet-plate',
  pools: ['treasure', 'devil'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.setPlayerHealthAtMost(2);
      ctx.sim.raisePlayerMaxHealth(3);
    },
  },
};
