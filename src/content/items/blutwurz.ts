import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Blutwurz (#84) — a real Alpine schnaps, Tormentil root, deep red, high
 * proof. Held rather than activated: `onLethalDamage` fires from
 * `GameSim.applyPlayerDamage`'s lethal branch, once an eternal heart has
 * already been ruled out, and this is the one item in the roster that
 * defines it — consumed automatically the moment it saves the run, the
 * same "found or bought like any other, spent without a button press"
 * shape the issue's own "the gate" section asks for.
 *
 * `!ctx.sim.blutwurzActive` guards the one real edge case: holding a
 * second bottle while the first spirit walk is still unresolved must not
 * restart it out from under itself (a fresh corpse position, a fresh
 * health reset) on a second lethal hit landing mid-walk.
 *
 * Quality 3 and spread thin — this is the one pedestal find that changes
 * what a death means for the rest of the run, and it should read as rare.
 */
export const blutwurz: ItemDefinition = {
  id: 'blutwurz',
  name: 'Blutwurz',
  description: 'A death does not end the run — if you can walk back for the corpse',
  flavourText: 'Blut. Geist. Same word, in two languages that never talk to each other.',
  sprite: 'blutwurz',
  pools: ['treasure', 'shop', 'boss'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    onLethalDamage: (ctx) => {
      if (!ctx.sim.blutwurzActive) {
        ctx.sim.startBlutwurz();
      }
    },
  },
};
