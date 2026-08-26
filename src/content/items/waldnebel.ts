import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Waldnebel — the Bavarian Forest's own fog, thick enough that a shot fired
 * into it stops being entirely a physical object.
 *
 * The roster's first item to grant `spectral` (#27) — nothing before it in
 * the roster has needed a shot to ignore walls outright.
 */
export const waldnebel: ItemDefinition = {
  id: 'waldnebel',
  name: 'Waldnebel',
  description: 'Shots pass through walls',
  flavourText: 'You can still see the room. The room, this once, cannot see you.',
  sprite: 'waldnebel',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'spectral');
    },
  },
};
