import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Löwenbrunn — one of `docs/CONTENT_BIBLE.md` §0's invented parody brands,
 * not used by any item yet. A doppelbock is a strong, dark, heavy lager;
 * the trade-off is exactly that weight: more damage, denser shots that
 * punch through, paid for with a slower pour.
 */
export const loewenbrunnDoppelbock: ItemDefinition = {
  id: 'loewenbrunn-doppelbock',
  name: 'Löwenbrunn Doppelbock',
  description: 'Damage +50%, Fire Rate -25%, shots pierce',
  flavourText: 'Brewed twice. Regretted once, the next morning.',
  sprite: 'loewenbrunn-doppelbock',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'damage', op: 'multiply', value: 1.5 },
      { stat: 'fireRate', op: 'multiply', value: 4 / 3 },
    ],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'piercing');
    },
  },
};
