import type { ItemDefinition } from '../../sim/item/definition.js';

/** How still counts as "still" (pixels/tick). */
const STILL_EPSILON = 0.05;

/**
 * Ritterschild — a knight's shield, from Floor 5's `Ritter`
 * (`docs/CONTENT_BIBLE.md` §2), who has to be flanked to be hit at all.
 * Brace, and nothing gets through; move, and the shield is just weight.
 *
 * Stillness is read the same `positionX`/`positionY` vs. `previousX`/
 * `previousY` comparison `schuhplattler.ts` and `almhuettn-jodler.ts`
 * already use, but recomputed fresh every tick rather than accumulated —
 * this is a stance, not a charge-up, so it has nothing to build toward.
 */
export const ritterschild: ItemDefinition = {
  id: 'ritterschild',
  name: 'Ritterschild',
  description: 'Standing still blocks all damage. Moving does not',
  flavourText: 'The trick is not the shield. The trick is standing there while it works.',
  sprite: 'ritterschild',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onTick: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const dx = sim.positionX(playerIndex) - sim.previousX(playerIndex);
      const dy = sim.positionY(playerIndex) - sim.previousY(playerIndex);
      ctx.state.charge = Math.abs(dx) <= STILL_EPSILON && Math.abs(dy) <= STILL_EPSILON ? 1 : 0;
    },
    onDamageTaken: (ctx) => {
      if (ctx.state.charge !== 1 || ctx.amount <= 0) {
        return;
      }
      ctx.sim.addPlayerHealth(ctx.amount);
    },
  },
};
