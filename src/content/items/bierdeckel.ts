import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Bierdeckel — a beer coaster, thrown flat. Flies out, turns, and comes back
 * through whatever is in the way a second time.
 *
 * A one-tag item: `returning` (#27) already is "fly out, then turn back
 * toward the muzzle," which is exactly a boomerang. Nothing else to add —
 * the tag composition rules in `sim/projectile/tags.ts` are what let this
 * combine with anything else granted at the same time without either item
 * knowing the other exists.
 */
export const bierdeckel: ItemDefinition = {
  id: 'bierdeckel',
  name: 'Bierdeckel',
  description: 'Shots return to you, damaging on the way back',
  flavourText: 'Also doubles as a coaster, if you can bear to put it down.',
  sprite: 'bierdeckel',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'returning');
    },
  },
};
