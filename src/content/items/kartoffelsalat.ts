import type { ItemDefinition } from '../../sim/item/definition.js';

const RANGE_MULTIPLIER = 1.15;

/**
 * Kartoffelsalat — every family has the one correct recipe, and they cannot
 * all be right. Shots split on impact (#27's `splitting`): whatever they
 * hit, two smaller chunks fly on past it, so a shot into the front of a
 * crowd keeps going into the back of it.
 *
 * `splitting` was the one tag in `sim/projectile/tags.ts` no item in the
 * roster granted; the item that used to sit here was "Range and Move Speed
 * up, Shot Speed down" — three numbers and nothing to see. The chunks
 * inherit the parent's `kartoffel` tint (`sim/projectile/behavior.ts`'s
 * `spawnSplitChildren`) so the whole spray reads as one salad.
 */
export const kartoffelsalat: ItemDefinition = {
  id: 'kartoffelsalat',
  name: 'Kartoffelsalat',
  description: 'items.kartoffelsalat.description',
  flavourText: 'items.kartoffelsalat.flavourText',
  sprite: 'kartoffelsalat',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'range', op: 'multiply', value: RANGE_MULTIPLIER }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'splitting');
      ctx.sim.tintProjectile(ctx.projectile, 'kartoffel');
    },
  },
};
