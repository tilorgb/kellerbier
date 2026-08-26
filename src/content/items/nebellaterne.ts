import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Nebellaterne — a lantern carried into `docs/CONTENT_BIBLE.md` §1's Floor 3
 * "lantern-radius darkness" rooms. A small, honest boost to how far you can
 * see and how well things go once you can.
 */
export const nebellaterne: ItemDefinition = {
  id: 'nebellaterne',
  name: 'Nebellaterne',
  description: 'Reichweite +8%, Dusel +1',
  flavourText: 'Burns steady. Everything past its reach is, for tonight, none of your business.',
  sprite: 'nebellaterne',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'reichweite', op: 'multiply', value: 1.08 },
      { stat: 'dusel', op: 'add', value: 1 },
    ],
  },
};
