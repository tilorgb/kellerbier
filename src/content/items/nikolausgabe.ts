import type { ItemDefinition } from '../../sim/item/definition.js';

/** Biermarken paid out on a good room, and the Promille owed for a coal one. */
const GIFT_BIERMARKEN = 4;
const COAL_PROMILLE = 0.3;

/**
 * Nikolausgabe — St. Nicholas's gift, left in the boot. Sometimes it is
 * coins; sometimes it is coal.
 *
 * A real coin flip runs into the same wall every other #59 item with
 * "random" in its seed text hits: no `sim/rng/streams.ts` stream is meant
 * for a gameplay roll from inside an item hook. This ships the honest
 * alternative, a strict alternation rather than a flip — `state.charge`
 * toggles 0/1 on every room clear, so the run always gets exactly as many
 * gifts as lumps of coal rather than a chance of an unlucky streak of
 * either.
 */
export const nikolausgabe: ItemDefinition = {
  id: 'nikolausgabe',
  name: 'Nikolausgabe',
  description: 'Clearing a room alternates between Biermarken and a little Promille',
  flavourText: 'He remembers everything. He has never once explained his methodology.',
  sprite: 'nikolausgabe',
  pools: ['treasure', 'shop', 'secret'],
  quality: 1,
  promilleRequirement: 'any',
  // No tier gate — but it is Promille machinery all the same (half its room-clear reward is Promille),
  // so a sober run never offers it (#85).
  needsPromille: true,
  hooks: {
    onRoomClear: (ctx) => {
      const sim = ctx.sim;
      const state = ctx.state;
      if (state.charge === 0) {
        sim.addBiermarken(GIFT_BIERMARKEN);
      } else {
        sim.addPromille(COAL_PROMILLE);
      }
      state.charge = state.charge === 0 ? 1 : 0;
    },
  },
};
