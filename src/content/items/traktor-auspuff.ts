import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Traktor-Auspuff — a tractor's exhaust stack, loud and blunt. Faster, and
 * loud enough that luck stops paying attention to you. The roster's third
 * `curse`-pooled item, after `foehn.ts` and `sauwetter.ts`.
 */
export const traktorAuspuff: ItemDefinition = {
  id: 'traktor-auspuff',
  name: 'Traktor-Auspuff',
  description: 'Gschwindigkeit +25%, Dusel -3',
  flavourText: 'You can hear it two fields over. So can everything with a choice in the matter.',
  sprite: 'traktor-auspuff',
  pools: ['shop', 'boss', 'secret', 'curse'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'gschwindigkeit', op: 'multiply', value: 1.25 },
      { stat: 'dusel', op: 'add', value: -3 },
    ],
  },
};
