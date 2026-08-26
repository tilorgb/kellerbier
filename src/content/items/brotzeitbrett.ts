import type { ItemDefinition } from '../../sim/item/definition.js';

/** Health regained and Biermarken granted each time a room is cleared. */
const HEAL_AMOUNT = 1;
const BIERMARKEN_AMOUNT = 1;

/**
 * Brotzeitbrett — radishes, cheese, a pretzel, a little of everything. A
 * small heal and a small Biermarken grant on every room cleared, the same
 * "a little of everything" the board itself is.
 */
export const brotzeitbrett: ItemDefinition = {
  id: 'brotzeitbrett',
  name: 'Brotzeitbrett',
  description: 'Clearing a room heals 1 and grants a Biermarken',
  flavourText: 'Radishes, cheese, a pretzel. Nobody has ever once finished one alone.',
  sprite: 'brotzeitbrett',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    onRoomClear: (ctx) => {
      ctx.sim.addPlayerHealth(HEAL_AMOUNT);
      ctx.sim.addBiermarken(BIERMARKEN_AMOUNT);
    },
  },
};
