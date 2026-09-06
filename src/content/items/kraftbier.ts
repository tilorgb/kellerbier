import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Kraftbier — a strong, heavy beer. Big damage up, big speed down; the
 * straightforward trade-off every roster needs at least one of.
 */
export const kraftbier: ItemDefinition = {
  id: 'kraftbier',
  name: 'Kraftbier',
  description: 'Damage +40%, Move Speed -20%',
  flavourText: 'The label does not say 9% for decoration.',
  sprite: 'kraftbier',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'damage', op: 'multiply', value: 1.4 },
      { stat: 'moveSpeed', op: 'multiply', value: 0.8 },
    ],
  },
  /**
   * Der Losbrunnen's rarest roll (#218): the same damage bump, the move
   * speed penalty all but brewed out — "a distinct, strictly-better named
   * variant," not a bigger version of the same trade-off.
   */
  legendaryRoll: [
    { stat: 'damage', op: 'multiply', value: 1.4 },
    { stat: 'moveSpeed', op: 'multiply', value: 0.98 },
  ],
};
