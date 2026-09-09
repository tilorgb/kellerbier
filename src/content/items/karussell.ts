import type { ItemDefinition } from '../../sim/item/definition.js';

/** How still counts as "still" (pixels/tick), push radius, and push strength while moving. */
const STILL_EPSILON = 0.05;
const PUSH_RADIUS = 40;
const PUSH_STRENGTH = 0.3;

/**
 * Karussell — Floor 7's room-scale rotating hazard (`docs/CONTENT_BIBLE.md`
 * §2), ridden instead of dodged. Moving carries everything nearby along
 * with you; stop, and the ride stops too.
 *
 * The stillness check is `ritterschild.ts`'s exact inverse — that item
 * rewards holding still, this one only works while moving — the same
 * `positionX`/`previousX` delta read `almabtrieb.ts` uses for its own
 * moving-shot bonus, for a different effect.
 */
export const karussell: ItemDefinition = {
  id: 'karussell',
  name: 'Karussell',
  description: 'items.karussell.description',
  flavourText: 'items.karussell.flavourText',
  sprite: 'karussell',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onTick: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const dx = sim.positionX(playerIndex) - sim.previousX(playerIndex);
      const dy = sim.positionY(playerIndex) - sim.previousY(playerIndex);
      if (Math.abs(dx) <= STILL_EPSILON && Math.abs(dy) <= STILL_EPSILON) {
        return;
      }
      sim.pushEnemiesNear(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        PUSH_RADIUS,
        PUSH_STRENGTH,
      );
    },
  },
};
