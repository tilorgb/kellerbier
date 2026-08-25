import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Wirtshausschläger — a tavern brawler's item. Every kill pays out a coin,
 * as if the room itself were settling a bar tab.
 *
 * Proves the event-hook half of #26's format: `onKill` runs with nothing
 * more than `ctx.sim`, the same object every engine system already has.
 */
export const wirtshausschlaeger: ItemDefinition = {
  id: 'wirtshausschlaeger',
  name: 'Wirtshausschläger',
  description: 'Every kill in the room pays out a Biermarke.',
  sprite: 'wirtshausschlaeger',
  pools: ['treasure', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  tags: ['currency'],
  hooks: {
    onKill: (ctx) => {
      ctx.sim.addBiermarken(1);
    },
  },
};
