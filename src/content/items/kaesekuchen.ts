import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Käsekuchen (#484) — every red heart container is poured out and comes back
 * as a soul heart. There is no red health afterwards, only what soul hearts
 * and eternal hearts the run still has, until a max-health item adds a
 * container again.
 */
export const kaesekuchen: ItemDefinition = {
  id: 'kaesekuchen',
  name: 'Käsekuchen',
  description: 'items.kaesekuchen.description',
  flavourText: 'items.kaesekuchen.flavourText',
  sprite: 'kaesekuchen',
  pools: ['treasure', 'angel'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.convertRedToSoul();
    },
  },
};
