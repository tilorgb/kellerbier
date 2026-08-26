import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Gockelkamm — a rooster's comb, all aggression and no patience. Fires
 * faster, reaches less far, `docs/CONTENT_BIBLE.md` §2's `Gockel` played as
 * a stat trade-off rather than an enemy behaviour.
 */
export const gockelkamm: ItemDefinition = {
  id: 'gockelkamm',
  name: 'Gockelkamm',
  description: 'Schluckfrequenz +25%, Reichweite -15%',
  flavourText: 'Crows the instant the sun even considers rising.',
  sprite: 'gockelkamm',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'schluckfrequenz', op: 'multiply', value: 1.25 },
      { stat: 'reichweite', op: 'multiply', value: 0.85 },
    ],
  },
};
