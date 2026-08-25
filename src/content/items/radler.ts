import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Radler — beer cut with lemonade. Half the punch, twice the pace.
 *
 * A pure `modifyStats` item: `stammwuerze` halved, `schluckfrequenz` halved
 * right back — Schluckfrequenz is a tick *delay* (`sim/stats/definition.js`),
 * so halving it is what doubles the rate a shot actually fires at. Tagged
 * `impure` for Reinheitsgebot 1516, which strips and locks out every item
 * that mixes beer with something that is not beer.
 */
export const radler: ItemDefinition = {
  id: 'radler',
  name: 'Radler',
  description: 'Damage -50%, fire rate +100%',
  flavourText: 'Half a beer. Twice the argument about whether it counts as one.',
  sprite: 'radler',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  tags: ['impure'],
  hooks: {
    modifyStats: () => [
      { stat: 'stammwuerze', op: 'multiply', value: 0.5 },
      { stat: 'schluckfrequenz', op: 'multiply', value: 0.5 },
    ],
  },
};
