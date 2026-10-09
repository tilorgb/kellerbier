import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * The Patriot — the white-and-blue flag, flown from the roof of the car. You
 * know the lyrics. Damage +1 per stack, nothing else: the item is the
 * straightforward "more" the roster needs at least one of, and the flag
 * Alois carries is what makes it visible.
 */
export const thePatriot: ItemDefinition = {
  id: 'the-patriot',
  name: 'The Patriot',
  description: 'items.the-patriot.description',
  flavourText: 'items.the-patriot.flavourText',
  sprite: 'the-patriot',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'add', value: 1 }],
  },
};
