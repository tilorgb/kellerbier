import type { ItemDefinition } from '../../sim/item/definition.js';

/** Half-hearts a Semmel banks: three whole soul hearts. */
export const SEMMEL_SOUL = 6;

/** Semmel (#484) — a platter of white sausages: three soul hearts at once. */
export const semmel: ItemDefinition = {
  id: 'semmel',
  name: 'Semmel',
  description: 'items.semmel.description',
  flavourText: 'items.semmel.flavourText',
  sprite: 'semmel',
  pools: ['treasure', 'angel', 'shop'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.addSoulHealth(SEMMEL_SOUL);
    },
  },
};
