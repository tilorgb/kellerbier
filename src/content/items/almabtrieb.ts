import type { ItemDefinition } from '../../sim/item/definition.js';

/** Stack cap and speed granted per stack. */
const MAX_STACKS = 6;
const SPEED_PER_STACK = 0.05;

/**
 * Almabtrieb — driving the herd down off the mountain at the end of
 * summer, faster and faster once it gets moving. Every kill without
 * taking a hit builds momentum; getting hit scatters the herd back to a
 * standstill.
 *
 * Shares `zwoa-drei-gsuffa.ts`'s "stack on kill, `modifyStats` reads
 * `state.charge`" shape, but resets outright on `onDamageTaken` instead of
 * decaying on a timer — a different trigger for the same primitive, the
 * same way `watschn.ts` reuses `onDamageTaken` itself for an effect
 * `lederhosn.ts` and `sankt-anzelm-klostersud.ts` already read for
 * something else entirely.
 */
export const almabtrieb: ItemDefinition = {
  id: 'almabtrieb',
  name: 'Almabtrieb',
  description: 'Kills build stacking speed. Getting hit resets it',
  flavourText: 'Nobody has ever explained how forty cows agree on a direction.',
  sprite: 'almabtrieb',
  pools: ['treasure', 'shop', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) =>
      state.charge <= 0
        ? []
        : [{ stat: 'gschwindigkeit', op: 'multiply', value: 1 + state.charge * SPEED_PER_STACK }],
    onKill: (ctx) => {
      const state = ctx.state;
      const gained = Math.min(MAX_STACKS, state.charge + 1);
      if (gained === state.charge) {
        return;
      }
      state.charge = gained;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
    onDamageTaken: (ctx) => {
      const state = ctx.state;
      if (state.charge === 0) {
        return;
      }
      state.charge = 0;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
