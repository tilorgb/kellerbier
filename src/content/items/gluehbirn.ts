import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Glühbirn — the Keller's one bare bulb, tutorial-floor iconography turned
 * into an item. A small, honest Reichweite bump with no downside, in the
 * spirit of `haferlschuh.ts`'s own quality-0 flat stat.
 */
export const gluehbirn: ItemDefinition = {
  id: 'gluehbirn',
  name: 'Glühbirn',
  description: 'Reichweite +12%',
  flavourText: 'Everything past its reach does not, officially, exist.',
  sprite: 'gluehbirn',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'reichweite', op: 'multiply', value: 1.12 }],
  },
};
