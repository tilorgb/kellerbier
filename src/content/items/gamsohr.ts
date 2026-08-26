import type { ItemDefinition } from '../../sim/item/definition.js';

/** Range and luck bonuses, and the speed penalty that pays for them. */
const REICHWEITE_BONUS = 0.15;
const DUSEL_BONUS = 3;
const SPEED_PENALTY = 0.1;

/**
 * Gamsohr — a chamois ear, pinned to a hat as a hunting trophy. It sees
 * further and it is lucky to carry, and it never stops weighing the hat
 * down.
 *
 * Stat-only, the same `modifyStats`-alone shape `kartoffelsalat.ts` and
 * `spatenstich.ts` already ship — a genuine trade-off (two stats up, one
 * down) rather than `watzmannkraxn.ts`'s no-drawback pair.
 */
export const gamsohr: ItemDefinition = {
  id: 'gamsohr',
  name: 'Gamsohr',
  description: 'Reichweite +15%, Dusel +3. Gschwindigkeit -10%',
  flavourText: 'One ear. The other one is a story nobody tells the same way twice.',
  sprite: 'gamsohr',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'reichweite', op: 'multiply', value: 1 + REICHWEITE_BONUS },
      { stat: 'dusel', op: 'add', value: DUSEL_BONUS },
      { stat: 'gschwindigkeit', op: 'multiply', value: 1 - SPEED_PENALTY },
    ],
  },
};
