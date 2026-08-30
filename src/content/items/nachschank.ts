import type { ItemDefinition } from '../../sim/item/definition.js';

/** Cooldown (60/s), the health it tops up, and the Promille it costs. */
const COOLDOWN_TICKS = 180;
const HEAL_AMOUNT = 1;
const PROMILLE_COST = 0.1;

/**
 * Nachschank — a refill, brought without being asked. Unlike
 * `feuerwasser.ts`'s full heal and `bergrettung.ts`'s soul heart, both
 * single-use, this is a small, cheap, fast-cycling top-up meant to be
 * pressed often rather than saved for an emergency.
 */
export const nachschank: ItemDefinition = {
  id: 'nachschank',
  name: 'Nachschank',
  description: 'Active: a quick top-up. Heals 1, costs a little Promille. Fast cooldown',
  flavourText: "The Bedienung doesn't even wait for you to ask anymore.",
  sprite: 'nachschank',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  // No tier gate — but it is Promille machinery all the same (its top-up heal is paid for in Promille),
  // so a sober run never offers it (#85).
  needsPromille: true,
  active: { maxCharge: COOLDOWN_TICKS },
  hooks: {
    onActivate: (ctx) => {
      ctx.sim.addPlayerHealth(HEAL_AMOUNT);
      ctx.sim.addPromille(PROMILLE_COST);
    },
    onTick: (ctx) => {
      ctx.sim.chargeActiveItem(ctx.itemId, 1);
    },
  },
};
