import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Schnapsleiche — Bavarian idiom, not a euphemism for anything worse: dead
 * drunk, out cold, still breathing. A big `rausch`-gated damage trade-off
 * against your own ability to get away from anything.
 */
export const schnapsleiche: ItemDefinition = {
  id: 'schnapsleiche',
  name: 'Schnapsleiche',
  description: 'Damage +60%, Move Speed -40%',
  flavourText: "Isn't going anywhere in particular. Neither, now, are you.",
  sprite: 'schnapsleiche',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'rausch',
  hooks: {
    modifyStats: () => [
      { stat: 'damage', op: 'multiply', value: 1.6 },
      { stat: 'moveSpeed', op: 'multiply', value: 0.6 },
    ],
  },
};
