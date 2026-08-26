import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Lichterkette — festival string lights, run floor to floor without ever
 * once catching fire. A flat, quality-0 Wurfkraft bump.
 */
export const lichterkette: ItemDefinition = {
  id: 'lichterkette',
  name: 'Lichterkette',
  description: 'Wurfkraft +15%',
  flavourText: 'Strung ourselves, floor to floor. Somehow never once caught fire.',
  sprite: 'lichterkette',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'wurfkraft', op: 'multiply', value: 1.15 }],
  },
};
