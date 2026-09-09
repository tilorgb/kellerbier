import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Bierdeckel — a beer mat flicked across the tent. Shots ricochet off the
 * walls (#27's `bouncing`) instead of splashing on them, so a shot fired at
 * nothing comes back off the far wall at an angle, and a narrow room turns
 * into a pinball table.
 *
 * Luftballon (`luftballon.ts`) used to share this item's exact effect
 * (`returning`) under a different name, which is the one thing a roster
 * cannot afford twice; the balloon keeps the string-comes-back idea, the
 * mat is the thing you flick and watch bounce. Tinted `pappe` — cardboard —
 * so the ricocheting shot is visibly not beer.
 */
export const bierdeckel: ItemDefinition = {
  id: 'bierdeckel',
  name: 'Bierdeckel',
  description: 'items.bierdeckel.description',
  flavourText: 'items.bierdeckel.flavourText',
  sprite: 'bierdeckel',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'bouncing');
      ctx.sim.tintProjectile(ctx.projectile, 'pappe');
    },
  },
};
