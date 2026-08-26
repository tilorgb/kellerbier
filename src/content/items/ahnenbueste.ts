import type { ItemDefinition } from '../../sim/item/definition.js';

/** Damage bonus per floor reached. */
const DAMAGE_PER_FLOOR = 0.08;

/**
 * Ahnenbüste — a bust from Walhalla's own hall of heroes
 * (`docs/GAME_DESIGN.md`'s secret areas), where "the busts of the Bavarian
 * ancestors step down off their plinths." Carried this far, they favour
 * you more with every floor you clear.
 *
 * `seilbahn.ts`'s exact "mirror the floor into `state.charge`, permanent
 * and never rolled back" shape, spent on flat damage instead of range —
 * `secret`/`boss`-pooled only and quality 3, the roster's third item at
 * that tier, to match how far into a run this one is meant to matter.
 */
export const ahnenbueste: ItemDefinition = {
  id: 'ahnenbueste',
  name: 'Ahnenbüste',
  description: 'Stammwürze grows with every floor you reach',
  flavourText: 'Stone eyes. They have been watching the stairs since long before you arrived.',
  sprite: 'ahnenbueste',
  pools: ['secret', 'boss'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) =>
      state.charge <= 0
        ? []
        : [{ stat: 'stammwuerze', op: 'add', value: state.charge * DAMAGE_PER_FLOOR }],
    onPickup: (ctx) => {
      ctx.state.charge = Math.max(0, ctx.sim.currentFloor);
    },
    onFloorStart: (ctx) => {
      const state = ctx.state;
      const nextCharge = Math.max(0, ctx.floor);
      if (nextCharge === state.charge) {
        return;
      }
      state.charge = nextCharge;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
