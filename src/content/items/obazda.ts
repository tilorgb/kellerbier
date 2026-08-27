import type { ItemDefinition } from '../../sim/item/definition.js';

/** Radius of the cheese around the player, and how long each tick's freeze grants — refreshed every tick the aura is held. */
const AURA_RADIUS = 32;
const SLOW_TICKS = 12;

/**
 * Obazda — a cheese spread, thick and clinging. Floor 1's slick-puddle
 * hazard (#35) is a room-authored rectangle, not something a body leaves
 * behind as it walks — there is still no system for a *trail* that grows and
 * fades wherever the player has been, which is what the seed text describes.
 * So this ships as a continuous slowing aura around the player instead of a
 * trail left in their wake — the honest version of the seed text the engine
 * can actually run today, not a faked one.
 */
export const obazda: ItemDefinition = {
  id: 'obazda',
  name: 'Obazda',
  description: 'Slows enemies near you',
  flavourText: 'Technically a dip. Structurally closer to mortar.',
  sprite: 'obazda',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onTick: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      sim.slowEnemiesNear(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        AURA_RADIUS,
        SLOW_TICKS,
      );
    },
  },
};
