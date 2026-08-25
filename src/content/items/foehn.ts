import type { ItemDefinition } from '../../sim/item/definition.js';

/** Radians the wind direction turns per tick, and how hard it pushes every live projectile each tick. */
const ROTATION_RADIANS_PER_TICK = 0.01;
const WIND_STRENGTH = 0.05;
const TWO_PI = Math.PI * 2;

/**
 * Föhn — the alpine headache wind. Blows across every room, pushing every
 * projectile in flight — the player's and every enemy's — in a slowly
 * rotating direction.
 *
 * `state.charge` is repurposed as the wind's current angle, wrapped to
 * `[0, 2π)` — nothing else needs it, this item is never active. `onTick`
 * nudges every live shot's velocity directly through
 * `ctx.sim.projectiles`' public arrays, which is also the entire reason this
 * needs no special-casing anywhere else: `homing`, `bouncing` and `arcing`
 * (#27) all read whatever velocity is already there and steer or reflect
 * from it, never caring what put it there. A shot nudged this tick simply
 * arrives at next tick's `applyProjectileMotionTags` with different velocity
 * to work from, exactly as if the player or an enemy had aimed it there.
 */
export const foehn: ItemDefinition = {
  id: 'foehn',
  name: 'Föhn',
  description: 'A slowly rotating wind pushes every projectile in the room',
  flavourText: 'Half the valley blames the wind for their headache. The other half is lying.',
  sprite: 'foehn',
  pools: ['shop', 'boss', 'secret', 'curse'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onTick: (ctx) => {
      const state = ctx.state;
      state.charge = (state.charge + ROTATION_RADIANS_PER_TICK) % TWO_PI;
      const windX = Math.cos(state.charge) * WIND_STRENGTH;
      const windY = Math.sin(state.charge) * WIND_STRENGTH;
      const projectiles = ctx.sim.projectiles;
      projectiles.forEachLive((slot) => {
        projectiles.velocityX[slot] = (projectiles.velocityX[slot] ?? 0) + windX;
        projectiles.velocityY[slot] = (projectiles.velocityY[slot] ?? 0) + windY;
      });
    },
  },
};
