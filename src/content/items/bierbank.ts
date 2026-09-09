import type { ItemDefinition } from '../../sim/item/definition.js';

/** Pixels the second shot sits beside the aimed one — two boards of the same bench, close enough to land on one body, far enough apart to read as two. */
const BOARD_GAP = 7;
const DAMAGE_MULTIPLIER = 0.8;

/**
 * Bierbank — the long bench every tent runs on. Every shot fires as a pair,
 * side by side and perfectly parallel, like two boards of the same plank.
 *
 * The companion is spawned in `onShoot` (before the aimed shot exists — the
 * same reasoning `spezi.ts` gives) at the muzzle shifted sideways along the
 * aim's perpendicular, flying the exact same direction rather than
 * diverging: Spezi's pair *spreads*, a bench does not. `modifyStats` takes a
 * fifth off both so the pair is a clear net gain (1.6x) without being a free
 * doubling, and the second board is tinted `holz` so a player can tell which
 * of the two the bench is adding.
 */
export const bierbank: ItemDefinition = {
  id: 'bierbank',
  name: 'Bierbank',
  description: 'items.bierbank.description',
  flavourText: 'items.bierbank.flavourText',
  sprite: 'bierbank',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'multiply', value: DAMAGE_MULTIPLIER }],
    onShoot: (ctx) => {
      const sim = ctx.sim;
      const tuning = sim.tuning.shooting;
      const playerIndex = sim.playerIndex;
      // The perpendicular of the aim: the aimed shot's own muzzle is the
      // "first board", this one sits one gap to its right.
      const sideX = -ctx.directionY;
      const sideY = ctx.directionX;
      const originX =
        sim.positionX(playerIndex) + ctx.directionX * tuning.muzzleOffset + sideX * BOARD_GAP;
      const originY =
        sim.positionY(playerIndex) + ctx.directionY * tuning.muzzleOffset + sideY * BOARD_GAP;
      const slot = sim.spawnItemProjectile(originX, originY, ctx.directionX, ctx.directionY);
      if (slot >= 0) {
        sim.tintProjectile(slot, 'holz');
      }
    },
  },
};
