import type { ItemDefinition } from '../../sim/item/definition.js';

/** Fraction of every hit refunded. */
const REFUND_FRACTION = 0.25;

/**
 * Murmeltierpfiff — a marmot's whistle, the warning call that goes up
 * before the danger actually arrives. A quarter of every hit you take
 * comes back, every time, forever — not a full block once a room the way
 * `lederhosn.ts` works, a smaller refund that never runs out.
 */
export const murmeltierpfiff: ItemDefinition = {
  id: 'murmeltierpfiff',
  name: 'Murmeltierpfiff',
  description: 'Refunds a quarter of every hit you take',
  flavourText: 'By the time you hear it, it has already seen you three times.',
  sprite: 'murmeltierpfiff',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onDamageTaken: (ctx) => {
      if (ctx.amount <= 0) {
        return;
      }
      ctx.sim.addPlayerHealth(Math.round(ctx.amount * REFUND_FRACTION));
    },
  },
};
