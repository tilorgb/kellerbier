import type { ItemDefinition } from '../../sim/item/definition.js';

/** Half-hearts a Black Pudding banks: three whole eternal hearts. */
export const BLACK_PUDDING_ETERNAL = 6;

/** Black Pudding (#484) — a slab of blood sausage: three eternal hearts at once. */
export const blackPudding: ItemDefinition = {
  id: 'black-pudding',
  name: 'Black Pudding',
  description: 'items.black-pudding.description',
  flavourText: 'items.black-pudding.flavourText',
  sprite: 'black-pudding',
  pools: ['angel', 'secret', 'boss'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.addEternalHealth(BLACK_PUDDING_ETERNAL);
    },
  },
};
