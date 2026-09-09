import type { ItemDefinition } from '../../sim/item/definition.js';

/** What the ring costs in launch speed while the drawback is live. */
const SHOT_SPEED_MULTIPLIER = 0.75;

/**
 * Gugelhupf — the ring cake, raisins baked through it. Shots go out and come
 * back round, cutting the same line twice; they leave the barrel slower for
 * the loop.
 *
 * `returning` (#27) is the tag doing the work — the item is one line of tag
 * composition and one stat cost, which is exactly the "an item is data plus
 * hooks" shape §8 asks for. What makes it a build rather than a stat stick
 * is that the return leg rewards standing your ground: a player who backs
 * away from the fight never collects the second hit.
 */
export const gugelhupf: ItemDefinition = {
  id: 'gugelhupf',
  name: 'Gugelhupf',
  description: 'items.gugelhupf.description',
  flavourText: 'items.gugelhupf.flavourText',
  sprite: 'gugelhupf',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  tags: ['rosinen'],
  hooks: {
    modifyStats: (state) =>
      state.charge > 0 ? [] : [{ stat: 'shotSpeed', op: 'multiply', value: SHOT_SPEED_MULTIPLIER }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'returning');
      ctx.sim.tintProjectile(ctx.projectile, 'rosine');
    },
  },
};
