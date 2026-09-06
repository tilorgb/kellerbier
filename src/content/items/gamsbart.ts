import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Gamsbart — a chamois-hair hat tuft. The bigger the beard, the luckier the
 * man. Flat Luck per stack.
 */
export const gamsbart: ItemDefinition = {
  id: 'gamsbart',
  name: 'Gamsbart',
  description: 'Luck +2 per stack',
  flavourText: 'Grown, not bought. Allegedly.',
  sprite: 'gamsbart',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) => [{ stat: 'luck', op: 'add', value: state.count * 2 }],
  },
};
