import type { ItemDefinition } from '../../sim/item/definition.js';

/** Push radius and per-tick push strength — small, because it stacks every tick an enemy is inside it. */
const PUSH_RADIUS = 40;
const PUSH_STRENGTH = 0.35;

/**
 * Der Ordner — a bouncer familiar. Does no damage; shoves anything that gets
 * close back out of the player's space, every tick, for as long as it is
 * held.
 */
export const derOrdner: ItemDefinition = {
  id: 'der-ordner',
  name: 'Der Ordner',
  description: 'Familiar that shoves enemies away from you',
  flavourText: 'Arms crossed. Opinions closed.',
  sprite: 'der-ordner',
  pools: ['treasure', 'shop', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onTick: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      sim.pushEnemiesNear(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        PUSH_RADIUS,
        PUSH_STRENGTH,
      );
    },
  },
};
