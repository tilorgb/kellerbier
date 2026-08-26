import type { ItemDefinition } from '../../sim/item/definition.js';

/** How still counts as "still" (pixels/tick), how long you have to hold it, the shockwave's radius, and its damage scale off Stammwürze. */
const STILL_EPSILON = 0.05;
const STILL_TICKS = 45;
const SHOCKWAVE_RADIUS = 48;
const DAMAGE_SCALE = 1.5;

/**
 * Schuhplattler — the slap dance, thigh-slapping and stomping. You have to
 * plant your feet to do it: stand still for three-quarters of a second and
 * release a damaging shockwave.
 *
 * "Standing still" is read directly off the position the fixed-timestep
 * loop already tracks — `positionX`/`positionY` against `previousX`/
 * `previousY` (the same pair render interpolation uses) — rather than a new
 * player-velocity accessor; friction (#9) asymptotes toward zero rather
 * than reaching it exactly, so this compares against a small epsilon
 * instead of requiring the two positions to match bit for bit.
 * `state.timer` counts consecutive still ticks and resets the instant the
 * player moves, so the charge only ever completes from a genuine stand,
 * never a slow drift.
 */
export const schuhplattler: ItemDefinition = {
  id: 'schuhplattler',
  name: 'Schuhplattler',
  description: 'Stand still for a moment to release a damaging shockwave',
  flavourText: 'The physics of it are unclear. The enthusiasm is not.',
  sprite: 'schuhplattler',
  pools: ['shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
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
      if (state.timer < STILL_TICKS) {
        return;
      }
      state.timer = 0;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.applySplashDamage(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        SHOCKWAVE_RADIUS,
        damage,
        playerIndex,
      );
    },
  },
};
