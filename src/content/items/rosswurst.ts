import type { ItemDefinition } from '../../sim/item/definition.js';

/** Half-hearts a Rosswurst banks: three whole eternal hearts. */
export const ROSSWURST_ETERNAL = 6;

/** Rosswurst (#484) — a slab of blood sausage: three eternal hearts at once. */
export const rosswurst: ItemDefinition = {
  id: 'rosswurst',
  name: 'Rosswurst',
  description: 'items.rosswurst.description',
  flavourText: 'items.rosswurst.flavourText',
  sprite: 'rosswurst',
  pools: ['angel', 'secret', 'boss'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.addEternalHealth(ROSSWURST_ETERNAL);
    },
  },
};
