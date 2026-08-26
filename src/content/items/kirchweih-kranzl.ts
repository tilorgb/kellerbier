import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Kirchweih-Kranzl — a little wreath worn at the parish church fair, only
 * while you can still stand up straight for it. `sober`-gated: a clear head
 * and quick feet, and nothing else — the mirror image of Ruhige Hand's
 * sober-only precision, this batch's own entry in the same slot Konterbier
 * would otherwise have filled (that seed needs the Kater debuff, #31, which
 * does not exist yet).
 */
export const kirchweihKranzl: ItemDefinition = {
  id: 'kirchweih-kranzl',
  name: 'Kirchweih-Kranzl',
  description: 'While sober: Gschwindigkeit +15%, Dusel +2',
  flavourText: 'Worn once a year. Photographed every year.',
  sprite: 'kirchweih-kranzl',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'sober',
  hooks: {
    modifyStats: () => [
      { stat: 'gschwindigkeit', op: 'multiply', value: 1.15 },
      { stat: 'dusel', op: 'add', value: 2 },
    ],
  },
};
