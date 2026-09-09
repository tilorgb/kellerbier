import type { ItemDefinition } from '../../sim/item/definition.js';

/** What the split costs each shot on the way in. */
const DAMAGE_MULTIPLIER = 0.75;

/**
 * Apfelstrudel — apple, cinnamon, and the raisins that come with them
 * whether or not anybody voted. Every shot that lands comes apart into
 * fragments; each one lands softer for it.
 *
 * `splitting` (#27) turns a single-target gun into a crowd gun, so this is
 * worth most in exactly the rooms the base gun is worst in — the trade §8
 * asks a `rosinen` item to be, rather than a number that is better or worse
 * in all of them.
 */
export const apfelstrudel: ItemDefinition = {
  id: 'apfelstrudel',
  name: 'Apfelstrudel',
  description: 'items.apfelstrudel.description',
  flavourText: 'items.apfelstrudel.flavourText',
  sprite: 'apfelstrudel',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  tags: ['rosinen'],
  hooks: {
    modifyStats: (state) =>
      state.charge > 0 ? [] : [{ stat: 'damage', op: 'multiply', value: DAMAGE_MULTIPLIER }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'splitting');
      ctx.sim.tintProjectile(ctx.projectile, 'rosine');
    },
  },
};
