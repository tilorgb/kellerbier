import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Cream Soup (#484) — every red heart container is poured out and comes back
 * as a soul heart. There is no red health afterwards, only what soul hearts
 * and eternal hearts the run still has, until a max-health item adds a
 * container again.
 */
export const creamSoup: ItemDefinition = {
  id: 'cream-soup',
  name: 'Cream Soup',
  description: 'items.cream-soup.description',
  flavourText: 'items.cream-soup.flavourText',
  sprite: 'cream-soup',
  pools: ['treasure', 'angel'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.convertRedToSoul();
    },
  },
};
