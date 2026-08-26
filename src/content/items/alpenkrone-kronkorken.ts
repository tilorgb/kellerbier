import type { ItemDefinition } from '../../sim/item/definition.js';

/** Biermarken paid out per kill. */
const BIERMARKEN_PER_KILL = 1;

/**
 * Alpenkrone Kronkorken — a bottle cap from `docs/CONTENT_BIBLE.md` §0's
 * invented Alpenkrone brand, the kind you check the underside of for a
 * prize. Flat luck, and every kill pays out a Biermarken like the cap
 * itself just won something.
 */
export const alpenkroneKronkorken: ItemDefinition = {
  id: 'alpenkrone-kronkorken',
  name: 'Alpenkrone Kronkorken',
  description: 'Dusel +1 per stack. Kills pay out a Biermarken',
  flavourText: 'Printed underside: "Leider nichts gewonnen." Every single time, until this one.',
  sprite: 'alpenkrone-kronkorken',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) => [{ stat: 'dusel', op: 'add', value: state.count }],
    onKill: (ctx) => {
      ctx.sim.addBiermarken(BIERMARKEN_PER_KILL);
    },
  },
};
