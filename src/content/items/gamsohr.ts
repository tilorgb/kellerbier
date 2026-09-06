import type { ItemDefinition } from '../../sim/item/definition.js';

/** Range and luck bonuses, and the speed penalty that pays for them. */
const RANGE_BONUS = 0.15;
const LUCK_BONUS = 3;
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
  description: 'Range +15%, Luck +3. Move Speed -10%',
  flavourText: 'One ear. The other one is a story nobody tells the same way twice.',
  sprite: 'gamsohr',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'range', op: 'multiply', value: 1 + RANGE_BONUS },
      { stat: 'luck', op: 'add', value: LUCK_BONUS },
      { stat: 'moveSpeed', op: 'multiply', value: 1 - SPEED_PENALTY },
    ],
  },
};
