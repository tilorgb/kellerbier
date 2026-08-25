import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Ticks (60/s, `sim/time.ts`'s `TICKS_PER_SECOND` — a value, so its number is
 * repeated here rather than imported) to refill the cooldown, and ticks the
 * burst itself lasts once triggered.
 */
const COOLDOWN_TICKS = 900;
const BURST_TICKS = 600;
const BURST_FIRE_RATE_MULTIPLIER = 0.15;

/**
 * Enzian — gentian schnapps. Ten seconds of enormous fire rate, then a shot
 * of Promille for having taken it.
 *
 * An active item whose `state.charge` does double duty: while non-negative
 * it is the ordinary cooldown meter `GameSim.useActiveItem`/`chargeActiveItem`
 * already understand (0 up to `maxCharge`, gating when it may fire again);
 * `onActivate` drops it to `-BURST_TICKS`, and while negative `onTick` counts
 * it back up toward zero instead — one number, two phases, never both at
 * once. `modifyStats` reads the sign alone, so `refreshItemStats` only has
 * to run at the two ticks the sign actually changes (the activation, and the
 * tick the burst ends), not every tick in between.
 */
export const enzian: ItemDefinition = {
  id: 'enzian',
  name: 'Enzian',
  description: 'Active: ten seconds of huge fire rate, then Promille +1.0',
  flavourText: 'Distilled from a flower most people are legally not allowed to pick.',
  sprite: 'enzian',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  active: { maxCharge: COOLDOWN_TICKS },
  hooks: {
    modifyStats: (state) =>
      state.charge < 0
        ? [{ stat: 'schluckfrequenz', op: 'multiply', value: BURST_FIRE_RATE_MULTIPLIER }]
        : [],
    onActivate: (ctx) => {
      ctx.state.charge = -BURST_TICKS;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.charge < 0) {
        state.charge += 1;
        if (state.charge === 0) {
          ctx.sim.addPromille(1.0);
          ctx.sim.refreshItemStats(ctx.itemId);
        }
        return;
      }
      if (state.charge < COOLDOWN_TICKS) {
        ctx.sim.chargeActiveItem(ctx.itemId, 1);
      }
    },
  },
};
