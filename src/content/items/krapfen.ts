import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Krapfen — Berliner, Pfannkuchen, Küchle: the same jam doughnut, whatever
 * the region calls it. Every squeeze fires four shots at full damage, one
 * along the aim and one at each quarter turn from it.
 *
 * The three extras go through `spawnItemProjectile`, so they run the same
 * item-hook and tag pipeline as the aimed shot and pick up every other held
 * item's changes. `onShoot` is not re-entered for them.
 */
export const krapfen: ItemDefinition = {
  id: 'krapfen',
  name: 'Krapfen',
  description: 'items.krapfen.description',
  flavourText: 'items.krapfen.flavourText',
  sprite: 'krapfen',
  pools: ['treasure', 'shop'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onShoot: (ctx) => {
      const sim = ctx.sim;
      const tuning = sim.tuning.shooting;
      const playerIndex = sim.playerIndex;
      const x = sim.positionX(playerIndex);
      const y = sim.positionY(playerIndex);
      // Rotating (dx, dy) by 90°, 180° and 270°.
      const turns: readonly (readonly [number, number])[] = [
        [-ctx.directionY, ctx.directionX],
        [-ctx.directionX, -ctx.directionY],
        [ctx.directionY, -ctx.directionX],
      ];
      for (const [dirX, dirY] of turns) {
        sim.spawnItemProjectile(
          x + dirX * tuning.muzzleOffset,
          y + dirY * tuning.muzzleOffset,
          dirX,
          dirY,
        );
      }
    },
  },
};
