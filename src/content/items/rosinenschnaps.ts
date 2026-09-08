import type { ItemDefinition } from '../../sim/item/definition.js';

/** The pour. Big, and the reason anybody signs for this. */
const DAMAGE_MULTIPLIER = 1.45;
/** Promille a kill pours down you, whether or not you wanted it. */
const PROMILLE_PER_KILL = 0.1;

/**
 * Rosinenschnaps — the raisins, distilled. A serious damage item whose cost
 * is that you do not decide when you are drinking any more: every kill pours
 * one, and the meter climbs on its own until something knocks it back down.
 *
 * The `rosinen` shape (`docs/GAME_DESIGN.md` §8) pointed at Promille rather
 * than at a stat: the upgrade is flat and large, the cost is legible, stated
 * and immediate, and it is a cost precisely *because* the meter is worth
 * having — a run that is already riding Vollrausch is one good room away
 * from Umgfalln with this held, and that is the decision the item is for.
 *
 * `needsPromille` rather than a tier gate: it works at any tier, but a sober
 * run (#85) has no meter for it to fill, and its description says the word.
 */
export const rosinenschnaps: ItemDefinition = {
  id: 'rosinenschnaps',
  name: 'Rosinenschnaps',
  description: 'Damage +45%. Every kill adds 0.1 Promille',
  flavourText: 'Grandmother made it. Grandmother is not sorry.',
  sprite: 'rosinenschnaps',
  pools: ['shop', 'boss', 'devil'],
  quality: 3,
  promilleRequirement: 'any',
  needsPromille: true,
  tags: ['rosinen'],
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'multiply', value: DAMAGE_MULTIPLIER }],
    onKill: (ctx) => {
      // The drawback, and the one the Klauber turns off: he eats the raisins,
      // so nothing gets poured. Checked here rather than in `modifyStats`
      // because this half of the item is not a stat.
      if (ctx.state.charge <= 0) {
        ctx.sim.addPromille(PROMILLE_PER_KILL);
      }
    },
    onProjectileSpawn: (ctx) => {
      ctx.sim.tintProjectile(ctx.projectile, 'rosine');
    },
  },
};
