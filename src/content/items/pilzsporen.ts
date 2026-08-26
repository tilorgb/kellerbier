import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Pilzsporen — `docs/CONTENT_BIBLE.md` §2's stationary `Pilz` puffs a spore
 * cloud that blurs vision; carried, every shot carries the same spores in
 * concentrated, weaponised form.
 */
export const pilzsporen: ItemDefinition = {
  id: 'pilzsporen',
  name: 'Pilzsporen',
  description: 'Shots poison on hit',
  flavourText: "Technically it's a spore cloud. Best not to think about the technicality too hard.",
  sprite: 'pilzsporen',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'poison');
    },
  },
};
