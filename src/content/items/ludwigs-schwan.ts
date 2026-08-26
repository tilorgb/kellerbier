import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks between feathers (60/s), the fired shot's damage relative to Stammwürze, and the Biermarken owed per floor. */
const FEATHER_INTERVAL_TICKS = 75;
const FEATHER_DAMAGE_SCALE = 0.5;
const COST_PER_FLOOR = 3;

/**
 * Ludwigs Schwan — an elegant swan familiar, forever a beat behind Ludwig
 * II's own boat. Fires a homing feather every couple of seconds; you pay for
 * its upkeep every floor.
 *
 * The feather's launch direction barely matters — `homing` (#27) steers it
 * toward the nearest target within a tick or two — so it fires straight up
 * from the player, the same "direction is a formality" reasoning
 * `spawnItemProjectile`'s own doc leans on for Fassldauben's staves.
 *
 * The `homing` tag is applied directly to the returned slot rather than
 * through `onProjectileSpawn` — that hook fires for *every* projectile
 * spawn, including the player's own main-gun shots (`russn.ts` uses it for
 * exactly that, to make the whole gun home), and this feather has no
 * business making the player's ordinary shots home in too. Cost uses
 * `spendBiermarken`'s existing "fails silently if you can't pay" behaviour
 * (`neuschwanstein-bauplan.ts`'s precedent) rather than bricking a poor run
 * over an elegant bird's upkeep.
 */
export const ludwigsSchwan: ItemDefinition = {
  id: 'ludwigs-schwan',
  name: 'Ludwigs Schwan',
  description:
    'Familiar fires a homing feather every couple of seconds. Costs Biermarken per floor',
  flavourText: 'Paddles in perfect circles. Sends you the bill.',
  sprite: 'ludwigs-schwan',
  pools: ['treasure', 'shop', 'secret'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.timer = FEATHER_INTERVAL_TICKS;
    },
    onTick: (ctx) => {
      const state = ctx.state;
      state.timer -= 1;
      if (state.timer > 0) {
        return;
      }
      state.timer = FEATHER_INTERVAL_TICKS;
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * FEATHER_DAMAGE_SCALE));
      const slot = sim.spawnItemProjectile(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        0,
        -1,
        { damage },
      );
      if (slot >= 0) {
        sim.addProjectileTag(slot, 'homing');
      }
    },
    onFloorStart: (ctx) => {
      ctx.sim.spendBiermarken(COST_PER_FLOOR);
    },
  },
};
