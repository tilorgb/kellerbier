import type { ItemDefinition } from '../../sim/item/definition.js';

/** Damage bonus and the fire-rate penalty that pays for it. */
const DAMAGE_BONUS = 0.3;
const RATE_PENALTY = 0.2;

/**
 * Spatenstich — the ceremonial first tap of the keg, driven in with a
 * spade rather than a hammer. Shots hit harder and punch clean through,
 * at the cost of how fast the next one leaves.
 *
 * A flat, always-on trade-off rather than `masskrugstemmen.ts`'s ramping
 * one — the ceremony happens once, the spade stays in.
 */
export const spatenstich: ItemDefinition = {
  id: 'spatenstich',
  name: 'Spatenstich',
  description: 'Shots gain piercing. Stammwürze +30%, Schluckfrequenz -20%',
  flavourText: 'The mayor gets three tries. The crowd counts every one out loud.',
  sprite: 'spatenstich',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'stammwuerze', op: 'multiply', value: 1 + DAMAGE_BONUS },
      { stat: 'schluckfrequenz', op: 'multiply', value: 1 + RATE_PENALTY },
    ],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'piercing');
    },
  },
};
