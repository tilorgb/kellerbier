import type { ItemDefinition } from '../../sim/item/definition.js';

/** Trinkfest levels one copy is worth, and the speed it costs to carry it. */
const TRINKFEST_GAIN = 1;
const GSCHWINDIGKEIT_MULTIPLIER = 0.92;

/**
 * Bierbauch — a beer belly. Raises Trinkfest (#92) while held: the player
 * can drink further past the old Vollrausch ceiling before Umgfalln, and
 * unlocks whichever post-Vollrausch stage that buys, at the cost of a small
 * permanent Gschwindigkeit penalty for carrying it.
 *
 * `onPickup`/`onRemove` are a genuine pair — `state.count === 1` guards the
 * raise so a second copy (this item does not stack in effect) does not
 * double it, and `onRemove` only ever fires once, for the whole stack, once
 * the last copy leaves (`ItemHooks`'s own documented contract) — so it
 * always undoes exactly one `TRINKFEST_GAIN`, matching the one raise this
 * item ever applied.
 *
 * Deliberately *not* banking the actually-applied delta in `state.timer` the
 * way an item might for a clamped stat: `ItemInventory.remove` zeroes
 * `timer` (alongside `charge`) before `onRemove` ever sees the state, the
 * same "exactly the prior state" guarantee that makes an active item's spent
 * charge disappear on removal — so there is nothing left to read by the time
 * this hook runs. The one gap that leaves: if Trinkfest is already at
 * `TRINKFEST_MAX` from some other source when this is picked up, the raise
 * is silently clamped away, but removal still subtracts the full
 * `TRINKFEST_GAIN` regardless. Accepted rather than engineered around — the
 * only other thing that can move Trinkfest this milestone is Halbe Portion
 * (the opposite direction, so it cannot cause this) and the debug slider
 * (a testing tool, not real play).
 */
export const bierbauch: ItemDefinition = {
  id: 'bierbauch',
  name: 'Bierbauch',
  description: 'Trinkfest +1 while held. Gschwindigkeit -8%',
  flavourText: 'Not fat. Storage.',
  sprite: 'bierbauch',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'gschwindigkeit', op: 'multiply', value: GSCHWINDIGKEIT_MULTIPLIER },
    ],
    onPickup: (ctx) => {
      if (ctx.state.count === 1) {
        ctx.sim.raiseTrinkfest(TRINKFEST_GAIN);
      }
    },
    onRemove: (ctx) => {
      ctx.sim.lowerTrinkfest(TRINKFEST_GAIN);
    },
  },
};
