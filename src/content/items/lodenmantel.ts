import type { ItemDefinition } from '../../sim/item/definition.js';

/** Fraction of every hit refunded, immediately, as health. */
const REFUND_FRACTION = 0.25;

/**
 * Lodenmantel — a loden coat. Repels rain, wind, and roughly a quarter of
 * everything else. Unlike `lederhosn.ts`'s full-hit shield, this never runs
 * out — it just never gives back very much.
 */
export const lodenmantel: ItemDefinition = {
  id: 'lodenmantel',
  name: 'Lodenmantel',
  description: 'Every hit refunds a small sliver of the damage taken',
  flavourText: 'Repels rain, wind, and roughly a quarter of everything else.',
  sprite: 'lodenmantel',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onDamageTaken: (ctx) => {
      const refund = Math.min(ctx.amount, Math.max(1, Math.round(ctx.amount * REFUND_FRACTION)));
      if (ctx.amount <= 0 || refund <= 0) {
        return;
      }
      ctx.sim.addPlayerHealth(refund);
    },
  },
};
