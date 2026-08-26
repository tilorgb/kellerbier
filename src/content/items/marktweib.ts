import type { ItemDefinition } from '../../sim/item/definition.js';

/** Rooms cleared between a spare key. */
const ROOMS_PER_KEY = 3;

/**
 * Marktweib — the market stall keeper, the one who knows everyone and
 * misses nothing. Clear enough rooms and she slips you a spare key.
 *
 * `state.charge` counts rooms cleared since the last key, the same simple
 * counter-with-a-threshold shape `zwoa-drei-gsuffa.ts` uses for stacks —
 * here reset to zero rather than decayed, since there is nothing to fade
 * between rooms, only a running total to hit.
 */
export const marktweib: ItemDefinition = {
  id: 'marktweib',
  name: 'Marktweib',
  description: 'Every third room cleared grants a Kellerschlüssel',
  flavourText: 'She has never once given anyone the wrong change.',
  sprite: 'marktweib',
  pools: ['treasure', 'shop', 'secret'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onRoomClear: (ctx) => {
      const state = ctx.state;
      state.charge += 1;
      if (state.charge < ROOMS_PER_KEY) {
        return;
      }
      state.charge = 0;
      ctx.sim.addKeys(1);
    },
  },
};
