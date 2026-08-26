import type { ItemDefinition } from '../../sim/item/definition.js';

/** How still counts as "still" (pixels/tick), ticks between heals while still, and the heal itself. */
const STILL_EPSILON = 0.05;
const HEAL_INTERVAL_TICKS = 90;
const HEAL_AMOUNT = 1;

/**
 * Almhüttn-Jodler — the yodel from the Almhütte, the peaceful rest room
 * with no enemies in it (`docs/GAME_DESIGN.md`'s secret areas). Stand
 * still for a moment, anywhere, and you get a small piece of that room
 * back.
 *
 * Stillness is read the same way `schuhplattler.ts` reads it — position
 * against the previous tick's — but this pays out a small heal on a
 * timer instead of charging a shockwave, and resets the timer (not a
 * charge count) the instant the player moves. `sober`-gated: the Almhütte
 * is the one place in the game explicitly *not* about the drink.
 */
export const almhuettnJodler: ItemDefinition = {
  id: 'almhuettn-jodler',
  name: 'Almhüttn-Jodler',
  description: 'Standing still slowly heals you',
  flavourText: 'Somebody up there has been yodelling since before anyone can remember arriving.',
  sprite: 'almhuettn-jodler',
  pools: ['treasure', 'secret'],
  quality: 1,
  promilleRequirement: 'sober',
  hooks: {
    onTick: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const dx = sim.positionX(playerIndex) - sim.previousX(playerIndex);
      const dy = sim.positionY(playerIndex) - sim.previousY(playerIndex);
      const state = ctx.state;
      if (Math.abs(dx) > STILL_EPSILON || Math.abs(dy) > STILL_EPSILON) {
        state.timer = 0;
        return;
      }
      state.timer += 1;
      if (state.timer < HEAL_INTERVAL_TICKS) {
        return;
      }
      state.timer = 0;
      sim.addPlayerHealth(HEAL_AMOUNT);
    },
  },
};
