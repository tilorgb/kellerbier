import type { ItemDefinition } from '../../sim/item/definition.js';

/** Fire-rate bonus and the luck this trades away. */
const RATE_BONUS = 0.25;
const LUCK_PENALTY = 2;

/**
 * Schmalzler — snuff, the traditional pinch. A jolt to the system; the
 * sneeze that follows costs you your nerve.
 *
 * `sober`-gated, the third item in that slot alongside `ruhige-hand.ts`
 * and `kirchweih-kranzl.ts` — `docs/CONTENT_BIBLE.md` §4's Promille-gated
 * table only ever seeded one `sober` entry, and #59's own first batch
 * added a second; a `sober` run with only two possible finds in the whole
 * gated category was thin.
 */
export const schmalzler: ItemDefinition = {
  id: 'schmalzler',
  name: 'Schmalzler',
  description: 'Fire Rate -25%. Luck -2',
  flavourText: 'One pinch and the whole Stammtisch knows exactly where you are sitting.',
  sprite: 'schmalzler',
  pools: ['shop', 'secret'],
  quality: 1,
  promilleRequirement: 'sober',
  hooks: {
    modifyStats: () => [
      { stat: 'fireRate', op: 'multiply', value: 1 - RATE_BONUS },
      { stat: 'luck', op: 'add', value: -LUCK_PENALTY },
    ],
  },
};
