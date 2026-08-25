import type { ItemDefinition } from '../../sim/item/definition.js';

/** Stack cap, damage per stack, and how long a kill keeps the stacks alive before they all drop at once (60 ticks/s). */
const MAX_STACKS = 5;
const DAMAGE_PER_STACK = 0.15;
const DECAY_TICKS = 240;

/**
 * Zwoa, drei, gsuffa — "two, three, drink up": the drinking-game count that
 * ends in everyone downing their glass at once. Kills grant a stacking
 * damage buff that fades if the kills stop coming.
 *
 * `state.charge` holds the stack count, `state.timer` the ticks left before
 * every stack drops at once — two independent numbers, which is exactly what
 * `ItemRuntimeState.timer` (#29) was added for: `charge` alone cannot hold
 * "how many stacks" and "how long until they decay" at the same time. Drops
 * all at once on expiry rather than draining one stack at a time, the same
 * "everyone downs their glass together" the name describes, not a trickle.
 */
export const zwoaDreiGsuffa: ItemDefinition = {
  id: 'zwoa-drei-gsuffa',
  name: 'Zwoa, drei, gsuffa',
  description: 'Kills grant a stacking damage buff that fades if they stop',
  flavourText: 'By the third round nobody remembers what they were counting.',
  sprite: 'zwoa-drei-gsuffa',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'rausch',
  hooks: {
    modifyStats: (state) =>
      state.charge <= 0
        ? []
        : [{ stat: 'stammwuerze', op: 'multiply', value: 1 + state.charge * DAMAGE_PER_STACK }],
    onKill: (ctx) => {
      const state = ctx.state;
      const gained = Math.min(MAX_STACKS, state.charge + 1);
      state.timer = DECAY_TICKS;
      if (gained === state.charge) {
        return;
      }
      state.charge = gained;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.timer <= 0) {
        return;
      }
      state.timer -= 1;
      if (state.timer > 0 || state.charge === 0) {
        return;
      }
      state.charge = 0;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
