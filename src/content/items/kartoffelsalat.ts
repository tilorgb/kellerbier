import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Kartoffelsalat — the festival side dish everyone fills up on. Hearty and
 * heavy: it carries you further and lets you outrun trouble, at the cost of
 * how hard your shots leave the barrel.
 *
 * Stat-only, no hook beyond `modifyStats` — the same shape `gamsbart.ts`,
 * `haferlschuh.ts` and `kraftbier.ts` already ship, and `hasModifyStats`'s
 * end-to-end format proof does not need a fourth example to still be true;
 * this is here because the trade-off itself (range and speed for shot
 * speed) is one the roster did not have yet, not because the mechanism is
 * new.
 */
export const kartoffelsalat: ItemDefinition = {
  id: 'kartoffelsalat',
  name: 'Kartoffelsalat',
  description: 'Reichweite and Gschwindigkeit up. Wurfkraft down',
  flavourText: 'Every family recipe is the only correct one and they cannot all be right.',
  sprite: 'kartoffelsalat',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'reichweite', op: 'multiply', value: 1.2 },
      { stat: 'gschwindigkeit', op: 'multiply', value: 1.1 },
      { stat: 'wurfkraft', op: 'multiply', value: 0.85 },
    ],
  },
};
