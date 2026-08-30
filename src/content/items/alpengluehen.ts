import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Promille at and above which the player themself starts burning too — the
 * Vollrausch tier boundary from `docs/GAME_DESIGN.md` §5
 * (`sim/game/promille.ts`'s `VOLLRAUSCH_AT`, a value and so repeated here
 * rather than imported). Refreshed every tick the condition holds, so the
 * burn simply stops renewing — and ticks out on its own — the moment
 * Promille drops back below it.
 */
const HIGH_PROMILLE_THRESHOLD = 3.0;
const SELF_BURN_TICKS = 30;

/**
 * Alpenglühen — the pink light the last sun throws on the peaks. Shots gain
 * `burning`; deep enough into a Rausch, the glow is on the player too.
 */
export const alpengluehen: ItemDefinition = {
  id: 'alpengluehen',
  name: 'Alpenglühen',
  description: 'Shots gain burning. At high Promille, so do you',
  flavourText: 'Beautiful from a distance. You are not at a distance.',
  sprite: 'alpengluehen',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  // No tier gate — but it is Promille machinery all the same (its self-burn half only triggers at high Promille),
  // so a sober run never offers it (#85).
  needsPromille: true,
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'burning');
    },
    onTick: (ctx) => {
      const sim = ctx.sim;
      if (sim.promille < HIGH_PROMILLE_THRESHOLD) {
        return;
      }
      sim.applyStatusEffect(sim.playerIndex, 'burn', SELF_BURN_TICKS);
    },
  },
};
