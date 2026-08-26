import type { ItemDefinition } from '../../sim/item/definition.js';

/** The extra burst's radius, and its damage relative to Stammwürze. */
const BURST_RADIUS = 30;
const DAMAGE_SCALE = 0.3;

/**
 * Kirchweih-Krapfen — a deep-fried fair pastry. Every hit deals a small
 * burst of extra damage around it, the blast radius doing double duty as
 * the item's own warning label.
 */
export const kirchweihKrapfen: ItemDefinition = {
  id: 'kirchweih-krapfen',
  name: 'Kirchweih-Krapfen',
  description: 'Every hit deals a small burst of extra damage around it',
  flavourText: 'Deep-fried. The blast radius is, functionally, the warning label.',
  sprite: 'kirchweih-krapfen',
  pools: ['shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onHit: (ctx) => {
      const sim = ctx.sim;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.applySplashDamage(ctx.hitX, ctx.hitY, BURST_RADIUS, damage, ctx.target);
    },
  },
};
