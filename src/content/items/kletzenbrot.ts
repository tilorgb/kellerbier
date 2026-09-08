import type { ItemDefinition } from '../../sim/item/definition.js';

/** What the dried fruit costs in raw hit, while the drawback is live. */
const DAMAGE_MULTIPLIER = 0.85;

/**
 * Kletzenbrot — the dark winter fruit loaf: pears, figs and raisins, dense
 * enough to keep for a month. Shots carry the ferment: everything they touch
 * keeps taking damage after the hit, and each hit itself lands softer.
 *
 * `poison` (#27) over time against a smaller hit now is a real trade rather
 * than a stat swap — it is worth more the tougher the target is and worth
 * less against a room of trash, which is what makes it a decision at the
 * pedestal instead of an arithmetic comparison.
 */
export const kletzenbrot: ItemDefinition = {
  id: 'kletzenbrot',
  name: 'Kletzenbrot',
  description: 'Shots poison what they hit. Damage -15%',
  flavourText: 'Keeps for a month. Tastes like it has.',
  sprite: 'kletzenbrot',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  tags: ['rosinen'],
  hooks: {
    modifyStats: (state) =>
      state.charge > 0 ? [] : [{ stat: 'damage', op: 'multiply', value: DAMAGE_MULTIPLIER }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'poison');
    },
  },
};
