import type { ItemDefinition } from '../../sim/item/definition.js';

/** Half-hearts a Soul Platter banks: three whole soul hearts. */
export const SOUL_PLATTER_SOUL = 6;

/** Soul Platter (#484) — a platter of white sausages: three soul hearts at once. */
export const soulPlatter: ItemDefinition = {
  id: 'soul-platter',
  name: 'Soul Platter',
  description: 'items.soul-platter.description',
  flavourText: 'items.soul-platter.flavourText',
  sprite: 'soul-platter',
  pools: ['treasure', 'angel', 'shop'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.addSoulHealth(SOUL_PLATTER_SOUL);
    },
  },
};
