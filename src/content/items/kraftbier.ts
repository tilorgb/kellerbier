import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Kraftbier — a strong, heavy beer. Big damage up, big speed down; the
 * straightforward trade-off every roster needs at least one of.
 */
export const kraftbier: ItemDefinition = {
  id: 'kraftbier',
  name: 'Kraftbier',
  description: 'Damage +40%, move speed -20%',
  flavourText: 'The label does not say 9% for decoration.',
  sprite: 'kraftbier',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'stammwuerze', op: 'multiply', value: 1.4 },
      { stat: 'gschwindigkeit', op: 'multiply', value: 0.8 },
    ],
  },
};
