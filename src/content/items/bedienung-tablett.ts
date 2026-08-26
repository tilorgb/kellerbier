import type { ItemDefinition } from '../../sim/item/definition.js';

/** Base interval between throws, the fastest it can shrink to, ticks shaved off per floor, and damage relative to Stammwürze. */
const BASE_INTERVAL_TICKS = 100;
const MIN_INTERVAL_TICKS = 40;
const INTERVAL_STEP_PER_FLOOR = 8;
const DAMAGE_SCALE = 0.5;

/**
 * Bedienung-Tablett — a tray of Maß, thrown one at a time by Floor 7's
 * `Bedienung` (`docs/CONTENT_BIBLE.md` §2), "faster as she empties." A
 * familiar that throws faster the deeper the run goes, mirroring the
 * enemy's own escalation rather than a random roll.
 *
 * `state.timer` holds the current interval directly rather than a fixed
 * constant — recomputed at `onFloorStart` alongside `wildschuetz.ts`'s
 * plain fixed-interval shape, the first familiar whose throw rate itself
 * changes over a run.
 */
export const bedienungTablett: ItemDefinition = {
  id: 'bedienung-tablett',
  name: 'Bedienung-Tablett',
  description: 'Familiar throws a Maß at intervals that shorten every floor',
  flavourText: 'She has not spilled one yet. She has also not slowed down once.',
  sprite: 'bedienung-tablett',
  pools: ['shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.timer = Math.max(
        MIN_INTERVAL_TICKS,
        BASE_INTERVAL_TICKS - ctx.sim.currentFloor * INTERVAL_STEP_PER_FLOOR,
      );
    },
    onFloorStart: (ctx) => {
      ctx.state.timer = Math.max(
        MIN_INTERVAL_TICKS,
        BASE_INTERVAL_TICKS - ctx.floor * INTERVAL_STEP_PER_FLOOR,
      );
    },
    onTick: (ctx) => {
      const state = ctx.state;
      state.timer -= 1;
      if (state.timer > 0) {
        return;
      }
      const sim = ctx.sim;
      const interval = Math.max(
        MIN_INTERVAL_TICKS,
        BASE_INTERVAL_TICKS - sim.currentFloor * INTERVAL_STEP_PER_FLOOR,
      );
      state.timer = interval;
      const playerIndex = sim.playerIndex;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.spawnItemProjectile(sim.positionX(playerIndex), sim.positionY(playerIndex), 0, -1, {
        damage,
      });
    },
  },
};
