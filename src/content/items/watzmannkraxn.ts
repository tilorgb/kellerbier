import type { ItemDefinition } from '../../sim/item/definition.js';

/** Range and shot-speed bonuses. */
const REICHWEITE_BONUS = 0.2;
const WURFKRAFT_BONUS = 0.15;

/**
 * Watzmannkraxn — the climb up the Watzmann's east face, the one that
 * kills a handful of people most summers and draws twice as many back the
 * next year anyway. Everything you throw carries further, and faster.
 *
 * Stat-only, the same `modifyStats`-alone shape `kartoffelsalat.ts` and
 * `gamsbart.ts` already ship — no drawback this time, so it sits at a
 * lower quality than a comparable trade-off item would.
 */
export const watzmannkraxn: ItemDefinition = {
  id: 'watzmannkraxn',
  name: 'Watzmannkraxn',
  description: 'Reichweite +20%, Wurfkraft +15%',
  flavourText: 'The mountain has a body count and a fan club. Frequently the same people.',
  sprite: 'watzmannkraxn',
  pools: ['treasure', 'shop', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'reichweite', op: 'multiply', value: 1 + REICHWEITE_BONUS },
      { stat: 'wurfkraft', op: 'multiply', value: 1 + WURFKRAFT_BONUS },
    ],
  },
};
