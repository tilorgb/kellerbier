import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Radi — a radish, spiral-cut into one long ribbon. Shots curve in a slow
 * helix rather than flying straight, and carry further for it.
 *
 * `arcing` (#27) is a constant per-tick rotation of velocity — a curling
 * flight path, which is what a helix reads as at this scale. `modifyStats`
 * adds the "awful at close range, superb at long" half: more `reichweite`
 * (range) is what lets the curve actually resolve into something useful
 * before the shot runs out of road.
 */
export const radi: ItemDefinition = {
  id: 'radi',
  name: 'Radi',
  description: 'Shots curve in a wide spiral. Range +30%',
  flavourText: 'Cut thin enough to read a newspaper through. Nobody knows why that helps.',
  sprite: 'radi',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'reichweite', op: 'multiply', value: 1.3 }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'arcing');
    },
  },
};
