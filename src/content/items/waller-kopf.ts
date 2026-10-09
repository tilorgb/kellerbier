import type { ItemDefinition } from '../../sim/item/definition.js';

/** How far the gaze reaches, in room units (Alois is 14 across). */
export const WALLER_RANGE = 80;
/** Half the cone's opening angle, in radians: 30°, a 60° cone. */
export const WALLER_HALF_ANGLE = Math.PI / 6;
/** Two seconds of fright, refreshed every tick a mob stands in the cone. */
export const WALLER_SCARE_TICKS = 120;

/**
 * Waller-Kopf — the head of a catfish, worn instead of Alois's own. The
 * terror of the river: anything it looks at from close enough runs away and
 * forgets to attack (`STATUS_SCARED`).
 *
 * "Looks at" is the direction Alois last *walked* (`GameSim.walkDirectionX`),
 * never the way he shoots — turning the gaze costs moving, which is what
 * makes it a tool to position with rather than a free aura. The cone is drawn
 * on the floor (`render/waller-cone-view.ts`) so the player can see exactly
 * who it will catch. Bosses are never scared.
 */
export const wallerKopf: ItemDefinition = {
  id: 'waller-kopf',
  name: 'Waller-Kopf',
  description: 'items.waller-kopf.description',
  flavourText: 'items.waller-kopf.flavourText',
  sprite: 'waller-kopf',
  hat: 'hat-waller',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onTick: (ctx) => {
      const sim = ctx.sim;
      if (sim.playerDead) {
        return;
      }
      const playerIndex = sim.playerIndex;
      sim.scareEnemiesInCone(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        sim.walkDirectionX,
        sim.walkDirectionY,
        WALLER_RANGE,
        Math.cos(WALLER_HALF_ANGLE),
        WALLER_SCARE_TICKS,
      );
    },
  },
};
