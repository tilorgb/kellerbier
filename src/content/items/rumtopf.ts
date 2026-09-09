import type { ItemDefinition } from '../../sim/item/definition.js';

/** The pour, and it is the biggest flat multiplier in the roster — see the doc comment. */
const DAMAGE_MULTIPLIER = 1.8;

/**
 * Rumtopf — the crock in the cellar: a summer's fruit under rum, raisins
 * last, lid on since June. Enormous damage, and it does absolutely nothing
 * until you are in Vollrausch or deeper.
 *
 * `promilleRequirement: 'rausch'` *is* the drawback, and it is a `rosinen`
 * item's shape read strictly (`docs/GAME_DESIGN.md` §8): the upgrade is
 * large, the cost is legible, stated and immediate, and it is paid in the
 * one currency #311 made expensive — you have to hold a tier that wobbles
 * your aim and sits one Maß from falling over. Taking this is a decision to
 * play the whole rest of the run drunk.
 *
 * Devil and secret only. A treasure-room roll on floor 1 would hand a
 * first-time player an item that reads as broken, since the meter is not
 * even unlocked until that floor's boss (#236).
 */
export const rumtopf: ItemDefinition = {
  id: 'rumtopf',
  name: 'Rumtopf',
  description: 'items.rumtopf.description',
  flavourText: 'items.rumtopf.flavourText',
  sprite: 'rumtopf',
  pools: ['devil', 'secret'],
  quality: 3,
  promilleRequirement: 'rausch',
  tags: ['rosinen'],
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'multiply', value: DAMAGE_MULTIPLIER }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.tintProjectile(ctx.projectile, 'rosine');
    },
  },
};
