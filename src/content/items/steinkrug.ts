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
 *
 * **A splash does not splash.** Splash damage lands through the same
 * `applyDamageAt` a shot does, so it fires `onHit` again — on the body the
 * shards reached, excluding only *that* body, which put the first one back
 * in range. Two enemies standing together traded shards until one died: an
 * instant kill on any pair, and on a pair sturdy enough to outlast 64
 * exchanges (a boss and its add) the dispatcher's own depth guard threw and
 * took the run down. `splashing` makes the shards plain damage: one mug,
 * one splash.
 *
 * **The shards do not hit the thrower.** The splash is centred on the enemy
 * and excludes that enemy, which left Alois inside it whenever the enemy had
 * closed to melee range — every shot at something next to him cost him
 * health. Alone, the item ended every simulated run on floor 1
 * (`docs/BALANCE_METHODOLOGY.md` §7). Each of the game's other splash items
 * spares the player; this one now does too.
 */

/** Set while a Steinkrug splash is being applied, so the hits it lands do not each splash in turn. */
const splashing = new Uint8Array(1);
export const steinkrug: ItemDefinition = {
  id: 'steinkrug',
  name: 'Steinkrug',
  description: 'items.steinkrug.description',
  flavourText: 'items.steinkrug.flavourText',
  sprite: 'steinkrug',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'spectral');
    },
    onHit: (ctx) => {
      if (splashing[0] === 1) {
        return;
      }
      splashing[0] = 1;
      try {
        ctx.sim.applySplashDamage(
          ctx.hitX,
          ctx.hitY,
          SPLASH_RADIUS,
          Math.max(1, Math.round(ctx.damage * SPLASH_DAMAGE_SCALE)),
          ctx.target,
          true,
        );
      } finally {
        splashing[0] = 0;
      }
      // The mug shattering (#243's `splashBurst`), at the size the shards
      // actually reach — a splash a player cannot see is a splash they
      // cannot aim for.
      ctx.sim.splashBurst(ctx.hitX, ctx.hitY, SPLASH_RADIUS);
    },
  },
};
