import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Kegelbahn — a bowling alley. Every frame a spare, never once a strike:
 * shots that keep going by caroming off whatever they hit first.
 */
export const kegelbahn: ItemDefinition = {
  id: 'kegelbahn',
  name: 'Kegelbahn',
  description: 'Shots bounce off walls',
  flavourText: 'Every frame a spare. Never once, in living memory, a strike.',
  sprite: 'kegelbahn',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'bouncing');
    },
  },
};
