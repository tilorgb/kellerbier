import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Hirschgeweih — `docs/CONTENT_BIBLE.md` §2's `Hirsch` charges in an arc
 * rather than a line. Shots inherit the same curve.
 */
export const hirschgeweih: ItemDefinition = {
  id: 'hirschgeweih',
  name: 'Hirschgeweih',
  description: 'Shots arc, curving gently as they travel',
  flavourText: 'Antlers this size, aerodynamics were never part of the plan.',
  sprite: 'hirschgeweih',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'arcing');
    },
  },
};
