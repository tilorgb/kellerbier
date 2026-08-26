import type { ItemDefinition } from '../../sim/item/definition.js';

/** Fear-pulse radius and push strength on a kill, and the damage this costs. */
const FEAR_RADIUS = 88;
const FEAR_STRENGTH = 2.2;
const DAMAGE_PENALTY = 0.1;

/**
 * Perchtenrute — a birch switch, the kind the winter spirits carry.
 * Every kill sends a ripple of fear through whatever else is nearby; it
 * is a worse weapon for it.
 *
 * `Percht` is already a Floor 3 enemy (`docs/CONTENT_BIBLE.md` §2) — this
 * is the item carrying the same folklore figure's own tool, the
 * `lebkuchenherz.ts` precedent for a shared name meaning two different
 * things on purpose. `curse`-pooled: the drawback is real, not cosmetic.
 */
export const perchtenrute: ItemDefinition = {
  id: 'perchtenrute',
  name: 'Perchtenrute',
  description: 'Kills scatter nearby enemies. Stammwürze -10%',
  flavourText: 'It does not want your blood. It wants you to leave.',
  sprite: 'perchtenrute',
  pools: ['boss', 'secret', 'curse'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: 1 - DAMAGE_PENALTY }],
    onKill: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      sim.pushEnemiesNear(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        FEAR_RADIUS,
        FEAR_STRENGTH,
      );
    },
  },
};
