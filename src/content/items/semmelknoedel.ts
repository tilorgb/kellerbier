import type { ItemDefinition } from '../../sim/item/definition.js';

/** What a dumpling hits for, and what carrying one costs in launch speed. */
const DAMAGE_MULTIPLIER = 2;
const SHOT_SPEED_MULTIPLIER = 0.6;

/**
 * Semmelknödel — bread dumplings, with the raisins somebody's aunt insists
 * belong in them. Shots become dumplings: twice the damage, and they lob
 * across the room slowly enough to walk beside.
 *
 * The cost is Shot Speed and not Range, deliberately. The first draft paid
 * in reach (`arcing`, Range -40%) and softlocked 24 of 30 fuzz seeds
 * (`tests/fuzz/heavy/synergy.test.ts`): a shot that curves away and dies
 * short cannot finish a room against anything that keeps its distance. A
 * slow shot still arrives — it just has to be *led*, which is the skill this
 * item is actually asking for and reads as weight rather than as a gun that
 * stopped working.
 */
export const semmelknoedel: ItemDefinition = {
  id: 'semmelknoedel',
  name: 'Semmelknödel',
  description: 'items.semmelknoedel.description',
  flavourText: 'items.semmelknoedel.flavourText',
  sprite: 'semmelknoedel',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  tags: ['rosinen'],
  hooks: {
    modifyStats: (state) =>
      state.charge > 0
        ? [{ stat: 'damage', op: 'multiply', value: DAMAGE_MULTIPLIER }]
        : [
            { stat: 'damage', op: 'multiply', value: DAMAGE_MULTIPLIER },
            { stat: 'shotSpeed', op: 'multiply', value: SHOT_SPEED_MULTIPLIER },
          ],
    onProjectileSpawn: (ctx) => {
      ctx.sim.tintProjectile(ctx.projectile, 'rosine');
    },
  },
};
