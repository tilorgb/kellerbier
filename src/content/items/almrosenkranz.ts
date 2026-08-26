import type { ItemDefinition } from '../../sim/item/definition.js';

/** Rooms cleared between soul-heart grants. */
const ROOMS_PER_HEART = 3;

/**
 * Almrosenkranz — an alpine rose wreath, picked sober and worn sober. Every
 * third room cleared grants a soul heart. `sober`-gated, closing out the
 * roster's `sober`-item run this batch started with `nachtwache.ts`.
 */
export const almrosenkranz: ItemDefinition = {
  id: 'almrosenkranz',
  name: 'Almrosenkranz',
  description: 'Sober. Every third room cleared grants a soul heart',
  flavourText: 'Picked sober, worn sober. The mountain does not negotiate on this one.',
  sprite: 'almrosenkranz',
  pools: ['treasure', 'secret'],
  quality: 1,
  promilleRequirement: 'sober',
  hooks: {
    onRoomClear: (ctx) => {
      const state = ctx.state;
      state.charge += 1;
      if (state.charge < ROOMS_PER_HEART) {
        return;
      }
      state.charge = 0;
      ctx.sim.addSoulHealth(1);
    },
  },
};
