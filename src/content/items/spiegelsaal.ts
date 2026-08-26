import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Spiegelsaal — Neuschwanstein's mirrored hall. Every shot sees its own
 * reflection and splits in two.
 *
 * The first item in the roster to grant `splitting` (#27) — every other
 * multi-shot item so far (`spezi.ts`, `braumeister-visier.ts`) spawns a
 * second projectile by hand rather than using the tag itself.
 */
export const spiegelsaal: ItemDefinition = {
  id: 'spiegelsaal',
  name: 'Spiegelsaal',
  description: 'Shots split on impact',
  flavourText:
    'Ludwig ordered a thousand candles for this room. Nobody has ever counted the reflections.',
  sprite: 'spiegelsaal',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'splitting');
    },
  },
};
