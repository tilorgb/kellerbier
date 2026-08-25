import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';
import { applyDamageAt } from './impact.js';

/**
 * Burning, freezing and poison — the three `ProjectileTag`s (#27) that act on
 * whatever a shot hit rather than on the shot itself.
 *
 * A body's status durations live in `GameSim.statusEffect`, a plain
 * Structure-of-Arrays field indexed by slot the same way `flash`/`spawnBounce`
 * are — not gated by the ECS component mask, because nothing here needs to
 * query "everything currently burning," only to read three numbers for a slot
 * a hit already named. `sim/projectile/behavior.ts`'s `resolveProjectileHit`
 * is what sets a duration, on a hit; this file is what counts it down and
 * spends it, once a tick, for every body in the world.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Slots within one entity's `statusEffect` row. */
export const STATUS_BURN = 0;
export const STATUS_POISON = 1;
export const STATUS_FREEZE = 2;
export const STATUS_EFFECT_STRIDE = 3;

/** Advances every body's burn/poison/freeze by one tick. */
export function stepStatusEffects(sim: GameSim): void {
  const status = sim.statusEffect.data;
  const velocity = sim.velocity.data;
  const world = sim.world;
  const states = world.states;
  const highWater = world.highWater;
  const tuning = sim.tuning.projectileTags;
  const burnInterval = Math.max(1, Math.round(tuning.burnTickInterval));
  const poisonInterval = Math.max(1, Math.round(tuning.poisonTickInterval));

  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    const base = index * STATUS_EFFECT_STRIDE;

    const freeze = status[base + STATUS_FREEZE] ?? 0;
    if (freeze > 0) {
      velocity[index * 2] = (velocity[index * 2] ?? 0) * tuning.freezeSlowFactor;
      velocity[index * 2 + 1] = (velocity[index * 2 + 1] ?? 0) * tuning.freezeSlowFactor;
      status[base + STATUS_FREEZE] = freeze - 1;
    }

    const burn = status[base + STATUS_BURN] ?? 0;
    if (burn > 0) {
      status[base + STATUS_BURN] = burn - 1;
      if (burn % burnInterval === 0) {
        applyStatusDamage(sim, index, tuning.burnDamagePerTick);
      }
    }

    const poison = status[base + STATUS_POISON] ?? 0;
    if (poison > 0) {
      status[base + STATUS_POISON] = poison - 1;
      if (poison % poisonInterval === 0) {
        applyStatusDamage(sim, index, tuning.poisonDamagePerTick);
      }
    }
  }
}

/**
 * One tick of status damage, through the same `applyDamageAt` a shot lands
 * through — so a burning enemy flashes, staggers and drops loot exactly the
 * way a hit one does, rather than this file duplicating that package.
 *
 * Guarded on current health rather than only on `killed`: burning and poison
 * can both come due on the same tick, and without this a body already put to
 * zero by the first would take a second `applyDamageAt` — flash, hitstop,
 * knockback and all — and a second `Death`/kill dispatch, from the second.
 * `cause` is -1: a status tick has no projectile behind it to attribute to.
 */
function applyStatusDamage(sim: GameSim, index: number, amount: number): void {
  if (amount <= 0 || (sim.health.data[index * 2] ?? 0) <= 0) {
    return;
  }
  applyDamageAt(sim, index, amount, sim.positionX(index), sim.positionY(index), 0, 0, -1);
}
