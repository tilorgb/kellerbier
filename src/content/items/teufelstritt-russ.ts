import type { ItemDefinition } from '../../sim/item/definition.js';

/** Damage multiplier, and the Promille owed at the start of every floor. */
const DAMAGE_MULTIPLIER = 1.15;
const PROMILLE_PER_FLOOR = 0.3;

/**
 * Teufelstritt-Ruß — soot out of the footprint pressed into stone outside
 * the Frauenkirche (`docs/CONTENT_BIBLE.md`'s Der Teufelstritt,
 * `teufelstrittstein.ts`'s own source). A smaller pact than that one's: a
 * recurring Promille toll instead of a floor on how low it can drop.
 */
export const teufelstrittRuss: ItemDefinition = {
  id: 'teufelstritt-russ',
  name: 'Teufelstritt-Ruß',
  description: 'Stammwürze +15%. Promille +0.3 every floor',
  flavourText: 'Wipes off your boot easily enough. Never once off anything else.',
  sprite: 'teufelstritt-russ',
  pools: ['shop', 'devil', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  // No tier gate — but it is Promille machinery all the same (its Stammwürze is paid for in Promille every floor),
  // so a sober run never offers it (#85).
  needsPromille: true,
  hooks: {
    modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: DAMAGE_MULTIPLIER }],
    onFloorStart: (ctx) => {
      ctx.sim.addPromille(PROMILLE_PER_FLOOR);
    },
  },
};
