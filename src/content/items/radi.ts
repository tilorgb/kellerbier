import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Radi (#484) — three new heart containers, bought by eating almost
 * nothing: everything filled drops to a single heart and the new room is
 * empty. Whatever feeds you from then on has somewhere to go.
 */
export const radi: ItemDefinition = {
  id: 'radi',
  name: 'Radi',
  description: 'items.radi.description',
  flavourText: 'items.radi.flavourText',
  sprite: 'radi',
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
