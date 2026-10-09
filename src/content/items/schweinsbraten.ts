import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Schweinsbraten (#484) — a heavy meal: one more heart container, and it comes
 * filled.
 */
export const schweinsbraten: ItemDefinition = {
  id: 'schweinsbraten',
  name: 'Schweinsbraten',
  description: 'items.schweinsbraten.description',
  flavourText: 'items.schweinsbraten.flavourText',
  sprite: 'schweinsbraten',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.raisePlayerMaxHealth(1, 2);
    },
  },
};
