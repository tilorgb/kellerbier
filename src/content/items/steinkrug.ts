import type { ItemDefinition } from '../../sim/item/definition.js';

/** Splash radius around a landed hit, and the fraction of the hit's own damage it deals again to whatever else is standing in it. */
const SPLASH_RADIUS = 18;
const SPLASH_DAMAGE_SCALE = 0.5;

/**
 * Steinkrug — shots become thrown stone mugs. They sail straight over
 * obstacles and shatter into a splash of shards on whatever they land on.
 *
 * `spectral` (#27) is "ignores terrain," the closest existing tag to "arcs
 * over obstacles" — this is a deliberate reading of the seed text rather
 * than a new tag; #29's own doc notes it. `onHit` fires the splash through
 * `ctx.sim.applySplashDamage`, excluding the target already hit directly so
 * the mug's own hit is never counted twice.
 */
export const steinkrug: ItemDefinition = {
  id: 'steinkrug',
  name: 'Steinkrug',
  description: 'Shots fly over obstacles and splash on impact',
  flavourText: 'Not aerodynamic. Not meant to be.',
  sprite: 'steinkrug',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'spectral');
    },
    onHit: (ctx) => {
      ctx.sim.applySplashDamage(
        ctx.hitX,
        ctx.hitY,
        SPLASH_RADIUS,
        Math.max(1, Math.round(ctx.damage * SPLASH_DAMAGE_SCALE)),
        ctx.target,
      );
    },
  },
};
