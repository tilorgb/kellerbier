import type { ItemDefinition } from '../../sim/item/definition.js';

/** Fire-rate bonus and the luck this trades away. */
const RATE_BONUS = 0.25;
const DUSEL_PENALTY = 2;

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
  description: 'Schluckfrequenz -25%. Dusel -2',
  flavourText: 'One pinch and the whole Stammtisch knows exactly where you are sitting.',
  sprite: 'schmalzler',
  pools: ['shop', 'secret'],
  quality: 1,
  promilleRequirement: 'sober',
  hooks: {
    modifyStats: () => [
      { stat: 'schluckfrequenz', op: 'multiply', value: 1 - RATE_BONUS },
      { stat: 'dusel', op: 'add', value: -DUSEL_PENALTY },
    ],
  },
};
