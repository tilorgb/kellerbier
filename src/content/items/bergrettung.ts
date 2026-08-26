import type { ItemDefinition } from '../../sim/item/definition.js';

/** Charge needed (ticks, 60/s) and the soul hearts a flare call brings. */
const CHARGE_TICKS = 600;
const SOUL_HEALTH = 2;

/**
 * Bergrettung — mountain rescue. Fire the flare once, and they bring a soul
 * heart. Then they are gone; this is not a subscription service.
 *
 * `consumable`, like `feuerwasser.ts` — the second single-use active in the
 * roster, and deliberately the gentler of the two: `feuerwasser` is a full
 * heal behind a `rausch` gate, this is a smaller, `any`-gated soul heart
 * (`addSoulHealth`, not `addPlayerHealth`) so an early, sober run has an
 * emergency button too.
 */
export const bergrettung: ItemDefinition = {
  id: 'bergrettung',
  name: 'Bergrettung',
  description: 'Active: call in a soul heart, one use',
  flavourText: 'They ask for your location. You do not actually know where you are.',
  sprite: 'bergrettung',
  pools: ['shop', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  active: { maxCharge: CHARGE_TICKS, consumable: true },
  hooks: {
    onActivate: (ctx) => {
      ctx.sim.addSoulHealth(SOUL_HEALTH);
    },
    onTick: (ctx) => {
      ctx.sim.chargeActiveItem(ctx.itemId, 1);
    },
  },
};
