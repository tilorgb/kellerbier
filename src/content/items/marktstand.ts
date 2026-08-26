import type { ItemDefinition } from '../../sim/item/definition.js';

/** Biermarken granted every room cleared. */
const BIERMARKEN_AMOUNT = 2;

/**
 * Marktstand — a market stall. Business is good; nobody asks what she is
 * actually selling. A plain, quality-0 economy item.
 */
export const marktstand: ItemDefinition = {
  id: 'marktstand',
  name: 'Marktstand',
  description: 'Clearing a room grants 2 Biermarken',
  flavourText: "Business is good. Nobody has ever asked what she's actually selling.",
  sprite: 'marktstand',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    onRoomClear: (ctx) => {
      ctx.sim.addBiermarken(BIERMARKEN_AMOUNT);
    },
  },
};
