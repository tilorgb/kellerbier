import type { ItemDefinition } from '../../sim/item/definition.js';

/** Extra invulnerability ticks (60/s) a hit grants on top of the normal window. */
const EXTRA_INVULNERABILITY_TICKS = 30;

/**
 * Weidezaun — a pasture fence. `docs/CONTENT_BIBLE.md` §2's `Kuh` "needs a
 * wall to stop" the other way round: getting hit buys you a longer moment
 * to get clear before anything can touch you again.
 */
export const weidezaun: ItemDefinition = {
  id: 'weidezaun',
  name: 'Weidezaun',
  description: 'Getting hit grants a moment of extra invulnerability',
  flavourText: 'Cows respect a fence. Nothing else in Bavaria does.',
  sprite: 'weidezaun',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onDamageTaken: (ctx) => {
      if (ctx.amount <= 0) {
        return;
      }
      ctx.sim.makePlayerInvulnerable(EXTRA_INVULNERABILITY_TICKS);
    },
  },
};
