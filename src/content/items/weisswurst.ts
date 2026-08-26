import type { ItemDefinition } from '../../sim/item/definition.js';

/** Last floor (inclusive) the tradition still holds, and the damage bonus while it does. */
const LAST_FLOOR = 3;
const DAMAGE_MULTIPLIER = 1.3;

/**
 * Weißwurst — the tradition says before the noon bell. Here, before Floor 4:
 * a strong early boost that quietly stops paying out once the run has moved
 * on, rather than a flat number that keeps mattering less and less.
 *
 * `state.charge` mirrors "is the tradition still honoured" as 0/1, checked
 * once per floor in `onFloorStart` the same way `ahnenbueste.ts` mirrors the
 * floor number itself — `refreshItemStats` only runs on the one floor
 * transition that actually flips it.
 */
export const weisswurst: ItemDefinition = {
  id: 'weisswurst',
  name: 'Weißwurst',
  description: 'Stammwürze +30% before floor 4. Nothing after',
  flavourText: 'The tradition says before the noon bell. The run says before the Brauerei.',
  sprite: 'weisswurst',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) =>
      state.charge > 0 ? [{ stat: 'stammwuerze', op: 'multiply', value: DAMAGE_MULTIPLIER }] : [],
    onPickup: (ctx) => {
      ctx.state.charge = ctx.sim.currentFloor <= LAST_FLOOR ? 1 : 0;
    },
    onFloorStart: (ctx) => {
      const state = ctx.state;
      const stillHonoured = ctx.floor <= LAST_FLOOR ? 1 : 0;
      if (stillHonoured === state.charge) {
        return;
      }
      state.charge = stillHonoured;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
