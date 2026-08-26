import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks between shots (60/s), and the shot's damage relative to Stammwürze. */
const SHOT_INTERVAL_TICKS = 90;
const DAMAGE_SCALE = 0.6;

/**
 * Wildschütz — a poacher, tagging along uninvited. The first competent
 * familiar: no homing, no spray — he fires exactly where you are walking,
 * a beat behind you, and trusts his aim.
 *
 * Direction comes from the same `positionX`/`positionY` vs. `previousX`/
 * `previousY` delta `schuhplattler.ts` already reads off the fixed-timestep
 * loop, not a second stored-direction field — `ItemRuntimeState` only has
 * three scratch numbers and `timer` is already spent on the reload clock.
 * Standing still when the shot is due fires straight down rather than firing
 * nowhere, the same "direction barely matters, something has to leave the
 * barrel" reasoning `ludwigs-schwan.ts` uses for its feather.
 */
export const wildschuetz: ItemDefinition = {
  id: 'wildschuetz',
  name: 'Wildschütz',
  description: 'Familiar fires an aimed shot in your direction of travel every few seconds',
  flavourText: 'Every Revier has one. Nobody has ever caught him.',
  sprite: 'wildschuetz',
  pools: ['shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.timer = SHOT_INTERVAL_TICKS;
    },
    onTick: (ctx) => {
      const state = ctx.state;
      state.timer -= 1;
      if (state.timer > 0) {
        return;
      }
      state.timer = SHOT_INTERVAL_TICKS;
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const dx = sim.positionX(playerIndex) - sim.previousX(playerIndex);
      const dy = sim.positionY(playerIndex) - sim.previousY(playerIndex);
      const directionX = dx === 0 && dy === 0 ? 0 : dx;
      const directionY = dx === 0 && dy === 0 ? 1 : dy;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      const slot = sim.spawnItemProjectile(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        directionX,
        directionY,
        { damage },
      );
      if (slot >= 0) {
        sim.addProjectileTag(slot, 'piercing');
      }
    },
  },
};
