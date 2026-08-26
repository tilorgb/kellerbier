import type { ItemDefinition } from '../../sim/item/definition.js';

/** The opening tap's extra splash radius, and its damage relative to Stammwürze. */
const BURST_RADIUS = 50;
const DAMAGE_SCALE = 0.6;

/**
 * Fassanstich — "O'zapft is!", the mayor's ceremonial first tap of the keg.
 * The first hit landed in every room gets the same ceremony: an extra burst
 * of damage around it.
 *
 * `bauern-mistgabel.ts`'s exact "arm on pickup and every room clear, spend
 * on the next relevant hook" shape, moved from the first shot fired to the
 * first hit landed.
 */
export const fassanstich: ItemDefinition = {
  id: 'fassanstich',
  name: 'Fassanstich',
  description: 'The first hit landed in every room deals extra splash damage',
  flavourText: "O'zapft is. Everything after the first tap is just details.",
  sprite: 'fassanstich',
  pools: ['treasure', 'shop', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.charge = 1;
    },
    onRoomClear: (ctx) => {
      ctx.state.charge = 1;
    },
    onHit: (ctx) => {
      const state = ctx.state;
      if (state.charge <= 0) {
        return;
      }
      state.charge = 0;
      const sim = ctx.sim;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.applySplashDamage(ctx.hitX, ctx.hitY, BURST_RADIUS, damage, ctx.target);
    },
  },
};
