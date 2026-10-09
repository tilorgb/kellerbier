import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Pot Roast (#484) — a heavy meal: one more heart container, and it comes
 * filled.
 */
export const potRoast: ItemDefinition = {
  id: 'pot-roast',
  name: 'Pot Roast',
  description: 'items.pot-roast.description',
  flavourText: 'items.pot-roast.flavourText',
  sprite: 'pot-roast',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.raisePlayerMaxHealth(1, 2);
    },
  },
};
