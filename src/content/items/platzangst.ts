import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Platzangst — every festival tent, elbow to elbow, and you have made your
 * peace with it. A close-range trade-off: brutal up close, useless at a
 * distance. The roster's fifth `curse`-pooled item.
 */
export const platzangst: ItemDefinition = {
  id: 'platzangst',
  name: 'Platzangst',
  description: 'items.platzangst.description',
  flavourText: 'items.platzangst.flavourText',
  sprite: 'platzangst',
  pools: ['shop', 'boss', 'secret', 'curse'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'damage', op: 'multiply', value: 1.5 },
      { stat: 'range', op: 'multiply', value: 0.5 },
    ],
  },
};
