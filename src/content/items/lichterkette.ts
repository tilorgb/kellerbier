import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Lichterkette — festival string lights, run floor to floor without ever
 * once catching fire. A flat, quality-0 Shot Speed bump.
 */
export const lichterkette: ItemDefinition = {
  id: 'lichterkette',
  name: 'Lichterkette',
  description: 'Shot Speed +15%',
  flavourText: 'Strung ourselves, floor to floor. Somehow never once caught fire.',
  sprite: 'lichterkette',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'shotSpeed', op: 'multiply', value: 1.15 }],
  },
};
