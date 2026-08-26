import type { ItemDefinition } from '../../sim/item/definition.js';

/** Health at or below which the mask wakes up, and the damage multiplier it grants while it is. */
const LOW_HEALTH_THRESHOLD = 2;
const DAMAGE_MULTIPLIER = 1.5;

/**
 * Drudmaske — the `Drud`'s own condition (`docs/CONTENT_BIBLE.md` §2: "only
 * spawns when the player is on their last half-Maß") worn as a mask instead
 * of feared as an enemy. Only wakes up once you are already in exactly the
 * trouble it describes.
 *
 * `sim.playerHealth` is only readable with `ctx.sim`, which `modifyStats`
 * never receives — `onTick` polls it once a tick and mirrors the verdict
 * into `state.charge` as a plain 0/1 flag, `refreshItemStats` firing only on
 * the tick the flag actually flips, the same shape `ahnenbueste.ts` uses for
 * its own sim-driven, `modifyStats`-consumed state.
 */
export const drudmaske: ItemDefinition = {
  id: 'drudmaske',
  name: 'Drudmaske',
  description: 'Stammwürze +50% while low on health',
  flavourText: "It only shows up when you're already having a bad night.",
  sprite: 'drudmaske',
  pools: ['boss', 'secret', 'curse'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) =>
      state.charge > 0 ? [{ stat: 'stammwuerze', op: 'multiply', value: DAMAGE_MULTIPLIER }] : [],
    onTick: (ctx) => {
      const state = ctx.state;
      const low = ctx.sim.playerHealth <= LOW_HEALTH_THRESHOLD ? 1 : 0;
      if (low === state.charge) {
        return;
      }
      state.charge = low;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
