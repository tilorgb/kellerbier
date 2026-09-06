import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Glücksklee — a four-leaf clover. Flat Luck, no strings attached — the
 * roster's second `angel`-pool item, after `schutzengerl.ts`.
 */
export const gluecksklee: ItemDefinition = {
  id: 'gluecksklee',
  name: 'Glücksklee',
  description: 'Luck +3',
  flavourText: 'Found by accident. Kept on purpose.',
  sprite: 'gluecksklee',
  pools: ['treasure', 'shop', 'angel'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'luck', op: 'add', value: 3 }],
  },
};
