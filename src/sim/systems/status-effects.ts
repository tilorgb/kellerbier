import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';
import { ParticleKind, type ParticleKindId } from '../particle/store.js';
import { ring } from '../particle/effects.js';
import { applyDamageAt } from './impact.js';
import { emitStatusParticles } from './status-particles.js';

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
/**
 * A slow that is not a freeze (#54): the body keeps moving at
 * `slowSpeedFactor` of its speed instead of `freezeSlowFactor`'s near-stop.
 * Its own slot rather than a strength on `freeze`, so the two can run side
 * by side and the stronger one simply wins while both are active.
 */
export const STATUS_SLOW = 3;
/**
 * Ticks left before a body that has just thawed can be frozen again (the
 * freeze's cooldown): counted down alongside the freeze itself, started when
 * one ends. Its own slot because it must outlive the freeze it follows.
 */
export const STATUS_FREEZE_COOLDOWN = 4;
/**
 * Dazed by the Hendlgeruch's smell: ticks left. A body in the cloud moves at
 * `DAZE_SPEED_FACTOR` of its speed and its attack state counter advances at
 * `DAZE_STATE_ADVANCE` of the normal rate (see `stepEnemies`) — slower to
 * move, slower to shoot. Its own slot so it reads (and renders) differently
 * from frost's slow.
 */
export const STATUS_DAZE = 5;
export const STATUS_EFFECT_STRIDE = 6;

/** Velocity multiplier per tick while dazed; a stun-resistant body (boss) gets the milder one. */
export const DAZE_SPEED_FACTOR = 0.6;
export const DAZE_SPEED_FACTOR_RESISTANT = 0.8;
/** Of every `DAZE_STATE_PERIOD` ticks a dazed body's state counter advances on this many: 3/5 = 60% fire rate. */
export const DAZE_STATE_PERIOD = 5;
export const DAZE_STATE_ADVANCE = 3;
export const DAZE_STATE_ADVANCE_RESISTANT = 4;

/** Whether the body in `index` is dazed. */
export function isDazed(sim: GameSim, index: number): boolean {
  return (sim.statusEffect.data[index * STATUS_EFFECT_STRIDE + STATUS_DAZE] ?? 0) > 0;
}

/** Whether a dazed body's state counter advances this tick (a deterministic 3-in-5 pattern, staggered per body). */
export function dazeAllowsAdvance(sim: GameSim, index: number): boolean {
  const advance = sim.isStunResistant(index) ? DAZE_STATE_ADVANCE_RESISTANT : DAZE_STATE_ADVANCE;
  return (sim.tick + index) % DAZE_STATE_PERIOD < advance;
}

/** Advances every body's burn/poison/freeze/slow by one tick. */
export function stepStatusEffects(sim: GameSim): void {
  const status = sim.statusEffect.data;
  const velocity = sim.velocity.data;
  const world = sim.world;
  const states = world.states;
  const highWater = world.highWater;
  const tuning = sim.tuning.projectileTags;
  const burnInterval = Math.max(1, Math.round(tuning.burnTickInterval));
  const poisonInterval = Math.max(1, Math.round(tuning.poisonTickInterval));
  const playerPoisonInterval = Math.max(1, Math.round(tuning.playerPoisonTickInterval));
  const playerIndex = sim.playerIndex;

  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    const base = index * STATUS_EFFECT_STRIDE;

    const freeze = status[base + STATUS_FREEZE] ?? 0;
    if (freeze > 0) {
      // A boss or mini-boss is only ever slowed by a freeze, never all but
      // stopped: a body that has to keep attacking cannot be locked.
      const factor = sim.isStunResistant(index) ? tuning.slowSpeedFactor : tuning.freezeSlowFactor;
      velocity[index * 2] = (velocity[index * 2] ?? 0) * factor;
      velocity[index * 2 + 1] = (velocity[index * 2 + 1] ?? 0) * factor;
      status[base + STATUS_FREEZE] = freeze - 1;
      if (freeze === 1) {
        // Thawed: the cooldown starts now, so a stream of freezing hits is a
        // freeze and a breather, not a lock.
        status[base + STATUS_FREEZE_COOLDOWN] = Math.max(0, Math.round(tuning.freezeCooldownTicks));
      }
    } else {
      const cooldown = status[base + STATUS_FREEZE_COOLDOWN] ?? 0;
      if (cooldown > 0) {
        status[base + STATUS_FREEZE_COOLDOWN] = cooldown - 1;
      }
    }

    const slow = status[base + STATUS_SLOW] ?? 0;
    if (slow > 0) {
      // Under a freeze the body is already all but stopped; the slow just runs down.
      if (freeze <= 0) {
        velocity[index * 2] = (velocity[index * 2] ?? 0) * tuning.slowSpeedFactor;
        velocity[index * 2 + 1] = (velocity[index * 2 + 1] ?? 0) * tuning.slowSpeedFactor;
      }
      status[base + STATUS_SLOW] = slow - 1;
    }

    const daze = status[base + STATUS_DAZE] ?? 0;
    if (daze > 0) {
      const factor = sim.isStunResistant(index) ? DAZE_SPEED_FACTOR_RESISTANT : DAZE_SPEED_FACTOR;
      velocity[index * 2] = (velocity[index * 2] ?? 0) * factor;
      velocity[index * 2 + 1] = (velocity[index * 2 + 1] ?? 0) * factor;
      status[base + STATUS_DAZE] = daze - 1;
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
      // The player has a block of their own (#401): enemy poison on them is
      // balanced separately from the player's poison-shot items on enemies.
      //
      // The player's tick keys off the global tick, not off the time left, for
      // one reason: a cloud refreshes the duration to full every tick the
      // player stands in it, and "time left is a multiple of the interval"
      // would then be true on every one of them — a tick of damage per tick.
      // Any `duration` consecutive ticks still hold exactly
      // `duration / interval` multiples, so a full poisoning still costs
      // 3 half-Maß, and a refresh can neither skip nor repeat a tick.
      const isPlayer = index === playerIndex;
      const due = isPlayer ? sim.tick % playerPoisonInterval === 0 : poison % poisonInterval === 0;
      if (due) {
        // Spore, not Foam (#248): the issue's own complaint was that a
        // poison tick reads identically to ordinary contact/projectile
        // damage. A green puff distinct from foam/sparks is what makes the
        // tick itself, not just the ambient poisoned state, legible in the
        // moment it lands.
        applyStatusDamage(
          sim,
          index,
          isPlayer ? tuning.playerPoisonDamagePerTick : tuning.poisonDamagePerTick,
          ParticleKind.Spore,
        );
      }
    }

    emitStatusParticles(
      sim,
      index,
      (status[base + STATUS_BURN] ?? 0) > 0,
      (status[base + STATUS_FREEZE] ?? 0) > 0,
      (status[base + STATUS_POISON] ?? 0) > 0,
      (status[base + STATUS_SLOW] ?? 0) > 0,
      (status[base + STATUS_DAZE] ?? 0) > 0,
    );
  }
}

/**
 * Sets (or refreshes) poison on `target` — the one place the duration is
 * chosen, so a shot, a cloud and an item all agree (#401). Refreshes rather
 * than stacks: `Math.max` against what is left, never a sum, so a rapid
 * shooter or a cloud re-applying every tick cannot build an unbounded
 * poisoning. The player's duration comes from `playerPoisonDurationTicks`,
 * everyone else's from `poisonDurationTicks`.
 */
export function applyPoison(sim: GameSim, target: number): void {
  const tuning = sim.tuning.projectileTags;
  const ticks =
    target === sim.playerIndex ? tuning.playerPoisonDurationTicks : tuning.poisonDurationTicks;
  const slot = target * STATUS_EFFECT_STRIDE + STATUS_POISON;
  sim.statusEffect.data[slot] = Math.max(sim.statusEffect.data[slot] ?? 0, Math.round(ticks));
}

/**
 * Freezes `target` for `ticks` — the one place a freeze starts, so a shot and an
 * item agree. A body already frozen is *not* extended and one that has just
 * thawed is immune for `freezeCooldownTicks`: freezing is a window the player
 * earns, not a state a rapid shooter (or an aura that re-applies every tick)
 * can hold a body in for good. Returns whether a freeze began.
 */
export function applyFreeze(sim: GameSim, target: number, ticks: number): boolean {
  if (ticks <= 0) {
    return false;
  }
  const base = target * STATUS_EFFECT_STRIDE;
  const data = sim.statusEffect.data;
  if ((data[base + STATUS_FREEZE] ?? 0) > 0 || (data[base + STATUS_FREEZE_COOLDOWN] ?? 0) > 0) {
    return false;
  }
  data[base + STATUS_FREEZE] = Math.round(ticks);
  return true;
}

const CLEANSE_SPOKES = 8;
const CLEANSE_SPEED = 0.8;
const CLEANSE_TICKS = 20;

/**
 * Clears the player's poison — what drinking a Maß does (#401). Cues the
 * cleanse (a green puff, a sound) only if there was poison to remove, so a
 * Maß drunk while healthy stays exactly as quiet as it was.
 */
export function cleansePoison(sim: GameSim): void {
  const slot = sim.playerIndex * STATUS_EFFECT_STRIDE + STATUS_POISON;
  if ((sim.statusEffect.data[slot] ?? 0) <= 0) {
    return;
  }
  sim.statusEffect.data[slot] = 0;
  // The tint snapping off is the visual half (`player-view.ts` reads the slot);
  // a green puff and a cue are the rest.
  const x = sim.positionX(sim.playerIndex);
  const y = sim.positionY(sim.playerIndex);
  ring(sim, x, y, CLEANSE_SPOKES, ParticleKind.Spore, CLEANSE_SPEED, CLEANSE_TICKS, 2);
  sim.playItemCue('poison-cleanse');
}

/**
 * One tick of status damage, through the same `applyDamageAt` a shot lands
 * through — so a burning enemy flashes, staggers and drops loot exactly the
 * way a hit one does, rather than this file duplicating that package.
 *
 * Guarded on current health rather than only on `killed`: burning and poison
 * can both come due on the same tick, and without this a body already put to
 * zero by the first would take a second `applyDamageAt` — flash, stagger,
 * knockback and all — and a second `Death`/kill dispatch, from the second.
 * `cause` is -1: a status tick has no projectile behind it to attribute to.
 * `effect` is the non-kill hit particle (Foam by default, from
 * `applyDamageAt`'s own default) — burn ticks leave it at Foam; a poison
 * tick's caller passes Spore instead, so the two read as different sources
 * of "unexplained" damage rather than one.
 */
function applyStatusDamage(
  sim: GameSim,
  index: number,
  amount: number,
  effect?: ParticleKindId,
): void {
  if (amount <= 0 || (sim.health.data[index * 2] ?? 0) <= 0) {
    return;
  }
  // `grantInvulnerability` false: a status tick is not a hit. It lands even
  // inside a real hit's i-frames (it never goes through `applyHit`'s check),
  // and it must not *start* i-frames either, or a poisoned player would be
  // immune to the next real hit — every second, for the whole poisoning.
  applyDamageAt(
    sim,
    index,
    amount,
    sim.positionX(index),
    sim.positionY(index),
    0,
    0,
    -1,
    effect,
    false,
  );
}
