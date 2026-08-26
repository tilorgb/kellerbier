import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks of unbroken safety per stack, the stack cap, and Dusel granted per stack. */
const TICKS_PER_STACK = 300;
const MAX_STACKS = 5;
const DUSEL_PER_STACK = 1;

/**
 * Gartenzwerg-Hut — a garden gnome's hat. `docs/CONTENT_BIBLE.md` §2's
 * `Gartenzwerg` "plays dead until you turn your back": the longer nothing
 * has touched you, the more it decides you are not worth bothering with,
 * and the luckier that makes you. One hit undoes the whole act at once.
 *
 * `state.timer` counts ticks toward the next stack (capped, so it never
 * silently overflows while a stack is already at the cap); `state.charge`
 * holds the stack count `modifyStats` actually reads. Both only ever change
 * at the tick or hit that crosses a threshold, so `refreshItemStats` is
 * called exactly there rather than every tick.
 */
export const gartenzwergHut: ItemDefinition = {
  id: 'gartenzwerg-hut',
  name: 'Gartenzwerg-Hut',
  description: 'Dusel rises the longer you go without taking a hit; one hit resets it',
  flavourText: 'Face down in the flower bed. Somehow this is still the lucky pose.',
  sprite: 'gartenzwerg-hut',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) =>
      state.charge <= 0
        ? []
        : [{ stat: 'dusel', op: 'add', value: state.charge * DUSEL_PER_STACK }],
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.charge >= MAX_STACKS) {
        return;
      }
      state.timer += 1;
      if (state.timer < TICKS_PER_STACK) {
        return;
      }
      state.timer = 0;
      state.charge += 1;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
    onDamageTaken: (ctx) => {
      const state = ctx.state;
      if (ctx.amount <= 0 || state.charge <= 0) {
        return;
      }
      state.charge = 0;
      state.timer = 0;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
