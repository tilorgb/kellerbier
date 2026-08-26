import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Nachtwache — the night watch. Somebody has to stay sharp; tonight,
 * apparently, it is you. `sober`-gated: a stone-cold read on the room only
 * works if nothing has dulled it.
 */
export const nachtwache: ItemDefinition = {
  id: 'nachtwache',
  name: 'Nachtwache',
  description: 'Sober. Reichweite +20%, Dusel +2',
  flavourText: "Somebody has to stay sharp. Tonight, apparently, that's you.",
  sprite: 'nachtwache',
  pools: ['shop', 'secret'],
  quality: 1,
  promilleRequirement: 'sober',
  hooks: {
    modifyStats: () => [
      { stat: 'reichweite', op: 'multiply', value: 1.2 },
      { stat: 'dusel', op: 'add', value: 2 },
    ],
  },
};
