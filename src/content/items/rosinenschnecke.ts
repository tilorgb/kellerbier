import type { ItemDefinition } from '../../sim/item/definition.js';

/** What the curl costs in raw hit, while the drawback is live. */
const DAMAGE_MULTIPLIER = 0.8;

/**
 * Rosinenschnecke — the raisin swirl, wound tight. Shots leave the barrel
 * already curling and bend after whatever is nearest.
 *
 * The first draft of this item made shots `orbiting` — they wound around the
 * muzzle instead of flying off, at Range -55%, which reads beautifully and
 * softlocked 25 of 30 fuzz seeds (`tests/fuzz/heavy/synergy.test.ts`): a
 * build with no reach at all cannot finish a room against anything that
 * keeps its distance, and a boss room it cannot finish is a run that ends
 * there. `homing` is the same idea kept playable — the shot still curls, it
 * just curls toward something — and the cost moves to Damage, which cannot
 * make a fight unwinnable however low it goes.
 */
export const rosinenschnecke: ItemDefinition = {
  id: 'rosinenschnecke',
  name: 'Rosinenschnecke',
  description: 'items.rosinenschnecke.description',
  flavourText: 'items.rosinenschnecke.flavourText',
  sprite: 'rosinenschnecke',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  tags: ['rosinen'],
  hooks: {
    modifyStats: (state) =>
      state.charge > 0 ? [] : [{ stat: 'damage', op: 'multiply', value: DAMAGE_MULTIPLIER }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'homing');
      ctx.sim.tintProjectile(ctx.projectile, 'rosine');
    },
  },
};
