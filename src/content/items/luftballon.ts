import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Luftballon — a festival-prize balloon, filled with helium the shots do
 * not need but morale does. Shots return to you after travelling their full
 * range.
 */
export const luftballon: ItemDefinition = {
  id: 'luftballon',
  name: 'Luftballon',
  description: 'Shots return to you after traveling their full range',
  flavourText: 'Filled with helium. The shots do not need it, but morale does.',
  sprite: 'luftballon',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'returning');
      // A red balloon on a string: `returning` has no sprite of its own
      // (`PLAYER_TAG_SPRITE_ORDER`), and a shot that turns around unannounced
      // reads as a bug before it reads as an item.
      ctx.sim.tintProjectile(ctx.projectile, 'ballon');
    },
  },
};
