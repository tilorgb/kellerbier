import type { ItemDefinition } from '../../sim/item/definition.js';

/** Kills needed to crank one burst, how many shots the burst fires, and their damage scale off Stammwürze. */
const KILLS_PER_BURST = 4;
const BURST_SHOT_COUNT = 8;
const BURST_DAMAGE_SCALE = 0.6;

/**
 * Kirchweih-Ratsch'n — a wooden ratchet rattle, the kind cranked at a
 * parish fair. Every few kills you crank it without noticing, and it lets
 * go in every direction at once.
 *
 * `state.charge` counts kills toward the next crank; at the threshold it
 * resets and `spawnItemProjectile` fans `BURST_SHOT_COUNT` shots evenly
 * around a full circle from the player's own position — a reactive
 * synergy engine in the same family as Fassldauben's staves, triggered by
 * a kill streak rather than a bomb.
 */
export const kirchweihRatschn: ItemDefinition = {
  id: 'kirchweih-ratschn',
  name: "Kirchweih-Ratsch'n",
  description: `Every ${String(KILLS_PER_BURST)} kills, fires a ring of shots outward`,
  flavourText: 'Deafening at arm’s length. Somehow still not the loudest thing at the fair.',
  sprite: 'kirchweih-ratschn',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onKill: (ctx) => {
      const state = ctx.state;
      state.charge += 1;
      if (state.charge < KILLS_PER_BURST) {
        return;
      }
      state.charge = 0;
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const playerX = sim.positionX(playerIndex);
      const playerY = sim.positionY(playerIndex);
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * BURST_DAMAGE_SCALE));
      for (let i = 0; i < BURST_SHOT_COUNT; i++) {
        const angle = (i / BURST_SHOT_COUNT) * Math.PI * 2;
        sim.spawnItemProjectile(playerX, playerY, Math.cos(angle), Math.sin(angle), { damage });
      }
    },
  },
};
