import type { ItemDefinition } from '../../sim/item/definition.js';

/** Shot-speed and range bonuses. */
const WURFKRAFT_BONUS = 0.15;
const REICHWEITE_BONUS = 0.1;

/**
 * Schießbudenfigur — a shooting-gallery target, the kind that pops up on a
 * track for exactly long enough to be hit (`docs/CONTENT_BIBLE.md` §2's
 * Floor 7 enemy of the same name). Carried instead of shot at, it steadies
 * your own aim: shots fly faster and further.
 *
 * Stat-only, no drawback — the same shape `watzmannkraxn.ts` ships, in a
 * different pair of stats.
 */
export const schiessbudenfigur: ItemDefinition = {
  id: 'schiessbudenfigur',
  name: 'Schießbudenfigur',
  description: 'Wurfkraft +15%, Reichweite +10%',
  flavourText: 'Knock it down and it pops right back up. Nobody has ever asked how.',
  sprite: 'schiessbudenfigur',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'wurfkraft', op: 'multiply', value: 1 + WURFKRAFT_BONUS },
      { stat: 'reichweite', op: 'multiply', value: 1 + REICHWEITE_BONUS },
    ],
  },
};
