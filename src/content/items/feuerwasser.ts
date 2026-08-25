import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Feuerwasser — firewater, saved for when it's needed. Charges as the run
 * goes on; spending it fully heals and burns the bottle out.
 *
 * Proves the active-item half of #26's format: a charge bar, an `onActivate`
 * hook, and `consumable` removing the item the instant it fires — #28 (item
 * pools/pedestals/UI) is what will actually offer this in a run and wire a
 * button to `GameSim.useActiveItem`; #26 only has to make the mechanism work.
 * `rausch`-gated on purpose, so the Promille requirement field has one real
 * consumer to check against besides `'any'`.
 */
export const feuerwasser: ItemDefinition = {
  id: 'feuerwasser',
  name: 'Feuerwasser',
  description: 'Charges as the floor goes on. Fully heals, then burns out.',
  sprite: 'feuerwasser',
  pools: ['shop', 'secret'],
  quality: 2,
  promilleRequirement: 'rausch',
  active: { maxCharge: 3, consumable: true },
  hooks: {
    onActivate: (ctx) => {
      ctx.sim.addPlayerHealth(12);
    },
  },
};
