import type { ItemDefinition } from '../../sim/item/definition.js';

/** Damage multiplier, and the Promille floor the pact holds you at. */
const DAMAGE_MULTIPLIER = 1.3;
const PROMILLE_FLOOR = 1.0;

/**
 * Teufelstrittstein — the devil's footprint, the one pressed into stone
 * outside the Frauenkirche (`docs/GAME_DESIGN.md`'s Der Teufelstritt).
 * Real power, for a pact that does not let go: Promille can rise or fall
 * as normal, but it can never drop below the floor the pact set.
 *
 * `onTick` tops Promille back up to `PROMILLE_FLOOR` the instant it would
 * dip under it, through `addPromille`'s own "raises, clamped at the max"
 * behaviour — the same chokepoint every other Promille-raising item
 * (`enzian.ts`, `nikolausgabe.ts`) already goes through, just run every
 * tick instead of on an event. `lowerPromille.ts`'s own doc comment
 * already establishes that this is inert, not merely ineffective, in a run
 * where Promille has not been unlocked — nothing to special-case here.
 */
export const teufelstrittstein: ItemDefinition = {
  id: 'teufelstrittstein',
  name: 'Teufelstrittstein',
  description: 'Stammwürze +30%. Promille can never drop below 1.0',
  flavourText: 'The stone is warm to the touch. It has been warm for six hundred years.',
  sprite: 'teufelstrittstein',
  pools: ['shop', 'devil', 'secret'],
  quality: 3,
  promilleRequirement: 'any',
  // No tier gate — but it is Promille machinery all the same (its Stammwürze is paid for with a Promille floor),
  // so a sober run never offers it (#85).
  needsPromille: true,
  hooks: {
    modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: DAMAGE_MULTIPLIER }],
    onTick: (ctx) => {
      const sim = ctx.sim;
      if (sim.promille >= PROMILLE_FLOOR) {
        return;
      }
      sim.addPromille(PROMILLE_FLOOR - sim.promille);
    },
  },
};
