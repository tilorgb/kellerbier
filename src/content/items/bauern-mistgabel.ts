import type { ItemDefinition } from '../../sim/item/definition.js';

/** Radians either outer prong sits off the aimed one — wide enough to read as a fork, narrow enough that all three land on one mid-size body at reach. */
const PRONG_SPREAD_RADIANS = 0.42;
/** Ticks a prong lives: with `PRONG_SPEED_SCALE` this is roughly one and a half body-lengths past the muzzle, and not a pixel more. */
const PRONG_LIFETIME_TICKS = 7;
const PRONG_SPEED_SCALE = 1.5;
const PRONG_RADIUS_SCALE = 1.6;
const PRONG_DAMAGE_SCALE = 2.2;

/**
 * Bauern-Mistgabel — the farmer's pitchfork. The Schlauch stops being a gun:
 * every squeeze is a short, wide jab of three steel prongs that pierce
 * through whatever is in reach and stop dead a body-length out. Twice the
 * damage per prong, no range to speak of — the whole run becomes a question
 * of getting close and getting out again.
 *
 * Two hooks do it. `onShoot` adds the two outer prongs through
 * `spawnItemProjectile` (the same pipeline `spezi.ts` uses for its second
 * shot), and `onProjectileSpawn` turns *every* player shot — the aimed one,
 * the two prongs, and anything another item adds — into a prong: lifetime
 * cut to a stab, velocity and radius up so the stab is fast and wide,
 * `piercing` so one jab runs through a crowd, `stahl` so the shot reads as
 * steel rather than beer. Writing `lifetime`/`velocityX` directly on
 * `ProjectileStore` is the same surface `mass.ts` uses for `radius`; there
 * is no stat for a shot's reach that would not also drag Range with it.
 *
 * A melee-range Schlauch is the single biggest change to how a room is
 * played the roster has, which is why it is quality 2 and out of the
 * treasure pool's "first item" slot.
 */
export const bauernMistgabel: ItemDefinition = {
  id: 'bauern-mistgabel',
  name: 'Bauern-Mistgabel',
  description: 'Shots become a short pitchfork jab: three piercing prongs, 2x damage, no range',
  flavourText: 'Telegraphs the whole thing from a mile off. Still works every single time.',
  sprite: 'bauern-mistgabel',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onShoot: (ctx) => {
      const sim = ctx.sim;
      const tuning = sim.tuning.shooting;
      const playerIndex = sim.playerIndex;
      const baseAngle = Math.atan2(ctx.directionY, ctx.directionX);
      for (const side of [-1, 1]) {
        const angle = baseAngle + side * PRONG_SPREAD_RADIANS;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        sim.spawnItemProjectile(
          sim.positionX(playerIndex) + dirX * tuning.muzzleOffset,
          sim.positionY(playerIndex) + dirY * tuning.muzzleOffset,
          dirX,
          dirY,
        );
      }
    },
    onProjectileSpawn: (ctx) => {
      const sim = ctx.sim;
      const projectiles = sim.projectiles;
      const slot = ctx.projectile;
      projectiles.lifetime[slot] = PRONG_LIFETIME_TICKS;
      projectiles.velocityX[slot] = (projectiles.velocityX[slot] ?? 0) * PRONG_SPEED_SCALE;
      projectiles.velocityY[slot] = (projectiles.velocityY[slot] ?? 0) * PRONG_SPEED_SCALE;
      projectiles.radius[slot] = (projectiles.radius[slot] ?? 0) * PRONG_RADIUS_SCALE;
      projectiles.damage[slot] = Math.max(
        1,
        Math.round((projectiles.damage[slot] ?? 0) * PRONG_DAMAGE_SCALE),
      );
      sim.addProjectileTag(slot, 'piercing');
      sim.tintProjectile(slot, 'stahl');
    },
  },
};
