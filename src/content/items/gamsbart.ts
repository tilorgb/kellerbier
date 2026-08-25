import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Gamsbart — a chamois-hair hat tuft. The bigger the beard, the luckier the
 * man. Flat Dusel per stack.
 */
export const gamsbart: ItemDefinition = {
  id: 'gamsbart',
  name: 'Gamsbart',
  description: 'Dusel +2 per stack',
  flavourText: 'Grown, not bought. Allegedly.',
  sprite: 'gamsbart',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) => [{ stat: 'dusel', op: 'add', value: state.count * 2 }],
  },
};
