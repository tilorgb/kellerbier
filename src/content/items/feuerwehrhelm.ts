import type { ItemDefinition } from '../../sim/item/definition.js';

/** How hard a hit shoves its target — a little over a Braumeister-Hammer's kill shockwave, applied on every hit rather than every kill. */
const HOSE_PUSH_STRENGTH = 1.1;
/** Radius around the impact point the shove reaches — the body that was hit, and not much else. */
const HOSE_PUSH_RADIUS = 10;
const SHOT_SPEED_MULTIPLIER = 1.25;

/**
 * Feuerwehrhelm — the volunteer fire brigade's helmet, and with it the
 * hose. Shots are water under pressure: faster, and whatever they hit is
 * shoved back along the stream. Hold the trigger on a crowd and it walks
 * away from you; a charger never quite arrives.
 *
 * `onHit` pushes through `pushEnemiesNear` centred on the impact point, so
 * the shove points from where the shot landed through the body — which is
 * the shot's own direction to within the hit normal — using the same `push`
 * component a hit's ordinary knockback already rides
 * (`GameSim.pushEnemiesNear`'s doc). Tinted `wasser` so the stream reads as
 * water, not beer. Was "Move Speed +10%, Shot Speed +10%": two numbers and
 * nothing to feel.
 */
export const feuerwehrhelm: ItemDefinition = {
  id: 'feuerwehrhelm',
  name: 'Feuerwehrhelm',
  description: 'Shots are hose water: every hit shoves its target back. Shot Speed +25%',
  flavourText: 'Rated to withstand heat, impact, and at least one Böllerschmeißer.',
  sprite: 'feuerwehrhelm',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'shotSpeed', op: 'multiply', value: SHOT_SPEED_MULTIPLIER }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.tintProjectile(ctx.projectile, 'wasser');
    },
    onHit: (ctx) => {
      ctx.sim.pushEnemiesNear(ctx.hitX, ctx.hitY, HOSE_PUSH_RADIUS, HOSE_PUSH_STRENGTH);
    },
  },
};
