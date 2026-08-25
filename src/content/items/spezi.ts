import type { ItemDefinition } from '../../sim/item/definition.js';

/** Radians the second shot diverges from the aimed one, either side would read the same — picked to be visible without reading as a miss. */
const SPREAD_RADIANS = 0.12;

/**
 * Spezi — cola and orange soda, half a glass each. Every shot is joined by a
 * second one a few degrees off its line.
 *
 * `onShoot` fires before `sim/systems/shooting.ts`'s `fire` spawns the shot
 * it dispatched from, so the item's own extra shot is spawned here rather
 * than in `onProjectileSpawn` — the primary shot does not exist yet to
 * duplicate. `ctx.sim.spawnItemProjectile` runs the companion through the
 * exact same tag/hook pipeline the primary shot gets, so anything else held
 * (Russ'n's homing, say) applies to both.
 */
export const spezi: ItemDefinition = {
  id: 'spezi',
  name: 'Spezi',
  description: 'Fires a second, diverging shot',
  flavourText: 'Nobody agrees on the ratio. Everybody has an opinion.',
  sprite: 'spezi',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  tags: ['impure'],
  hooks: {
    onShoot: (ctx) => {
      const sim = ctx.sim;
      const tuning = sim.tuning.shooting;
      const baseAngle = Math.atan2(ctx.directionY, ctx.directionX);
      const angle = baseAngle + SPREAD_RADIANS;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const playerIndex = sim.playerIndex;
      const originX = sim.positionX(playerIndex) + dirX * tuning.muzzleOffset;
      const originY = sim.positionY(playerIndex) + dirY * tuning.muzzleOffset;
      sim.spawnItemProjectile(originX, originY, dirX, dirY);
    },
  },
};
