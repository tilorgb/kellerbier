import { World } from '../ecs/world.js';
import {
  type CompiledDetonation,
  type CompiledEnemy,
  type CompiledMeleeArc,
  type CompiledState,
  type FiringBehaviour,
  TransitionTrigger,
} from '../enemy/registry.js';
import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { muzzleFlash, ring } from '../particle/effects.js';
import { clamp, vectorLength } from '../math.js';
import { addPush } from './movement.js';
import { NO_SLOT } from '../pool/slot-pool.js';
import { ProjectileTeam } from '../projectile/store.js';
import { ProjectileTag } from '../projectile/tags.js';
import { ParticleKind } from '../particle/store.js';
import { nextWaypoint, straightClear, type Waypoint } from '../room/pathfind.js';

/**
 * What enemies do.
 *
 * The whole system is an interpreter for the data in `src/content/enemies/`.
 * Nothing in here knows what a Kellerassel is; it knows how to run a state
 * machine whose states are built out of thirteen named primitives, and the
 * Kellerassel is one arrangement of them. That is the entire bet of #14 —
 * roughly thirty-five more enemies are coming, and every one of them that
 * needs engine work is a week M6 does not have.
 *
 * ## Everything is derived from one counter
 *
 * The only per-entity behaviour state is which state the body is in and how
 * many ticks it has been in it. Telegraph length, invulnerability, fire rate
 * and burst spacing are all functions of that counter, which means there is no
 * second timer to keep in step with the first, a state cannot renew its own
 * invulnerability by being hit again, and a replay reproduces exactly.
 *
 * ## Order
 *
 * It runs after the player has moved and before `stepBodies` integrates, so an
 * enemy decides against where the player actually is this tick and moves in the
 * same tick it decided. Hits are the one signal that arrives late: `stepImpact`
 * runs after this, so an `onHit` transition fires on the tick *after* the shot
 * landed. One tick at sixty a second is invisible, and the alternative —
 * resolving impact before enemies decide — puts the decision a tick behind the
 * player instead, which is not.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** The body took a hit since it was last looked at. */
export const ENEMY_FLAG_HIT = 1 << 0;
/** The body ran into a wall or a block. Written by `stepBodies`. */
export const ENEMY_FLAG_BLOCKED = 1 << 1;
/**
 * An elite spawn (#156) — rolled once, at spawn (`GameSim.spawnEnemyKind`),
 * and never cleared: unlike `ENEMY_FLAG_HIT`/`ENEMY_FLAG_BLOCKED`, this bit
 * is not part of the per-tick clear below, since it describes the body
 * itself rather than something that happened to it this tick.
 */
export const ENEMY_FLAG_ELITE = 1 << 2;
/**
 * The body is aiming at a spot it locked when its wind-up began, not at where
 * the player is now — see `updateAimLock`. Set on the first tick of any
 * telegraphing state, kept through the attack states that follow it, cleared
 * by the first state that attacks nothing.
 */
export const ENEMY_FLAG_AIM_LOCKED = 1 << 3;
/**
 * The body is riding on the player (#406, `latchOnPlayer`). Like
 * `ENEMY_FLAG_ELITE` it describes the body rather than something that
 * happened this tick, so it survives the per-tick clear — set by
 * `latchToPlayer`, cleared only by a shake (`sim/systems/latch.ts`).
 */
export const ENEMY_FLAG_LATCHED = 1 << 4;
/** The body latched on this tick — what an `onLatched` transition reads. Cleared once read, like `ENEMY_FLAG_HIT`. */
export const ENEMY_FLAG_JUST_LATCHED = 1 << 5;
/** The player shook the body off since it was last looked at — `onShakenOff`. Cleared once read. */
export const ENEMY_FLAG_SHAKEN_OFF = 1 << 6;
/** The flags that are signals rather than conditions: consumed every tick, whether a state listened or not. */
const ENEMY_SIGNAL_FLAGS =
  ENEMY_FLAG_HIT | ENEMY_FLAG_BLOCKED | ENEMY_FLAG_JUST_LATCHED | ENEMY_FLAG_SHAKEN_OFF;

/**
 * Ticks a body may sit in one state before the counter stops climbing.
 *
 * Well inside Int16, and nine minutes of standing still. Clamping rather than
 * wrapping matters: a wrapped counter would make an `after` transition fire
 * again out of nowhere in a room somebody left running.
 */
const MAX_STATE_TICKS = 32000;

/** Fields of the `enemy` component: definition, state, ticks in state, flags. */
export const ENEMY_STRIDE = 4;
/**
 * Fields of the `enemyMotion` component: heading x and y, then the spawn
 * point, then the locked aim target (`ENEMY_FLAG_AIM_LOCKED`), then where the
 * player was last seen, whether that memory is live (`MEMORY_SEEKING`), the
 * waypoint the pathfinder last chose on the way there, and how many ticks the
 * player has been out of sight.
 */
export const ENEMY_MOTION_STRIDE = 12;
/** `enemyMotion` offsets of the last-seen memory (see `walkTowardPlayer`). */
const MOTION_LAST_SEEN_X = 6;
const MOTION_LAST_SEEN_Y = 7;
const MOTION_MEMORY = 8;
const MOTION_WAYPOINT_X = 9;
const MOTION_WAYPOINT_Y = 10;
const MOTION_UNSEEN_TICKS = 11;
/**
 * Ticks after losing sight during which the remembered spot still follows
 * the player. Without it, the spot is wherever the player was on the last
 * visible tick — the corner they just ducked behind — and a player who keeps
 * moving is long gone from there by the time the body arrives, so it gives
 * up. Three quarters of a second is "it saw which way you went", not
 * omniscience.
 */
const MEMORY_GRACE_TICKS = 45;
/** `MOTION_MEMORY`: nothing remembered, or heading for where the player was last seen. */
const MEMORY_NONE = 0;
const MEMORY_SEEKING = 1;
/** How close counts as having reached the last-seen spot (room units). */
const MEMORY_ARRIVE_DISTANCE = 6;
/** Ticks between path searches for a body heading to the last-seen spot. */
const REPATH_TICKS = 12;
/** Reused for every path search — `nextWaypoint` writes into it. */
const waypoint: Waypoint = { x: 0, y: 0 };

export function stepEnemies(sim: GameSim): void {
  const registry = sim.enemies;
  if (registry.count === 0) {
    return;
  }
  // Room-entry warmup (`GameSim.loadRoom`): enemies stay fully inert — no
  // state transitions, no movement, no firing — until it runs out, so the
  // player has a beat to see what just loaded before anything reacts to them.
  if (sim.roomWarmupTicks > 0) {
    return;
  }

  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const required = sim.enemyMask;

  const playerIndex = sim.playerIndex;
  const playerX = sim.positionX(playerIndex);
  const playerY = sim.positionY(playerIndex);

  const enemy = sim.enemy.data;
  const highWater = world.highWater;
  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    if (((masks[index] ?? 0) & required) !== required) {
      continue;
    }
    // Staggered by a hit landing (`GameSim.hitStun`, `systems/impact.ts`):
    // holds still, mid-knockback, unable to decide anything this tick. Local
    // to this one body — every other enemy in the loop still acts normally.
    if ((sim.hitStun.data[index] ?? 0) > 0) {
      continue;
    }

    const base = index * ENEMY_STRIDE;
    const compiled = registry.at(enemy[base] ?? 0);
    let stateIndex = enemy[base + 1] ?? 0;
    let ticks = enemy[base + 2] ?? 0;
    let flags = enemy[base + 3] ?? 0;

    let state = compiled.states[stateIndex];
    if (state === undefined) {
      continue;
    }

    const toPlayerX = playerX - sim.positionX(index);
    const toPlayerY = playerY - sim.positionY(index);
    const distance = vectorLength(toPlayerX, toPlayerY);

    const selfX = sim.positionX(index);
    const selfY = sim.positionY(index);

    // Before the transitions, so `onLatched` fires on the very tick the body
    // grabs on rather than one later (#406).
    if (
      state.latchesOnPlayer &&
      (flags & ENEMY_FLAG_LATCHED) === 0 &&
      touchesPlayer(sim, index, distance)
    ) {
      latchToPlayer(sim, index, toPlayerX, distance);
      flags |= ENEMY_FLAG_LATCHED | ENEMY_FLAG_JUST_LATCHED;
    }

    const next = chooseTransition(
      sim,
      index,
      state,
      ticks,
      flags,
      distance,
      toPlayerX,
      toPlayerY,
      selfX,
      selfY,
    );
    if (next >= 0) {
      const entered = compiled.states[next];
      if (entered !== undefined) {
        stateIndex = next;
        state = entered;
        ticks = 0;
        if (entered.capturesLobTarget) {
          captureLobTarget(sim, index);
        }
        if (entered.detonate !== null) {
          detonateLobbedBomb(sim, index, entered.detonate);
        }
        if (entered.emitCloud !== null) {
          const cloud = entered.emitCloud;
          const defaults = sim.tuning.poisonCloud;
          sim.spawnPoisonCloud(
            selfX,
            selfY,
            cloud.radius,
            cloud.growTicks < 0 ? defaults.defaultGrowTicks : cloud.growTicks,
            cloud.lifetimeTicks < 0 ? defaults.defaultLifetimeTicks : cloud.lifetimeTicks,
          );
        }
        if (entered.grabProp !== null) {
          grabNearestProp(sim, index, entered.grabProp);
        }
        // The audio half of the telegraph ring (#234): fired once, on the
        // tick the state begins, not once per tick spent telegraphing — the
        // ring itself is read continuously (`enemyTelegraphProgress`), but a
        // "rising tone under a wind-up" only makes sense as a cue with a
        // start.
        if (entered.telegraphTicks > 0) {
          sim.events.push(EventKind.AttackWindup, index, NO_SLOT, selfX, selfY, 0, 0, 0);
        }
      }
    }

    // On a state's first tick — entered by a transition just now, or the
    // initial state on the body's first live tick — not only on a transition,
    // so a boss that *spawns* mid-wind-up (Die Zapfhahn-Orgel) locks too.
    if (ticks === 0) {
      flags = updateAimLock(sim, index, state, flags, playerX, playerY);
    }
    let aimX = toPlayerX;
    let aimY = toPlayerY;
    if ((flags & ENEMY_FLAG_AIM_LOCKED) !== 0) {
      const motionBase = index * ENEMY_MOTION_STRIDE;
      aimX = (sim.enemyMotion.data[motionBase + 4] ?? playerX) - selfX;
      aimY = (sim.enemyMotion.data[motionBase + 5] ?? playerY) - selfY;
    }
    const aimDistance = vectorLength(aimX, aimY);
    if (ticks === 0 && state.meleeArc !== null) {
      lockMeleeAim(sim, index, aimX, aimY, aimDistance);
    }

    // Both signals are consumed whether or not this state listened for them.
    // A hit remembered across three states fires the next `onHit` transition
    // for a shot that landed a second ago.
    enemy[base + 1] = stateIndex;
    enemy[base + 3] = flags & ~ENEMY_SIGNAL_FLAGS;

    if (crossesSplitThreshold(sim, index, state)) {
      // Ages the body into its next phase right now rather than waiting for
      // combat to land the killing blow — `forceEnemyDeath` runs the same
      // package a real kill does, so `stepEnemyDeaths` sees an ordinary
      // death in this state and splits it exactly as `state.splits` says.
      sim.forceEnemyDeath(index);
      continue;
    }

    applyMovement(
      sim,
      index,
      state,
      ticks,
      toPlayerX,
      toPlayerY,
      distance,
      aimX,
      aimY,
      aimDistance,
      selfX,
      selfY,
    );
    if (state.firing.length > 0) {
      applyFiring(sim, index, state, ticks, aimX, aimY, aimDistance);
    }
    if (state.meleeArc !== null) {
      applyMeleeArc(sim, index, state.meleeArc, ticks, selfX, selfY);
    }
    if (state.summons.length > 0) {
      queueSummonWaves(sim, index, state, ticks, selfX, selfY);
    }
    if (state.propDrops.length > 0) {
      queuePropDrops(sim, index, state, ticks, selfX, selfY);
    }

    enemy[base + 2] = ticks < MAX_STATE_TICKS ? ticks + 1 : ticks;
  }
}

/**
 * Whether the body at `index` is close enough to the player to grab on
 * (#406): footprints touching, give or take `tuning.latch.latchReach`. The
 * margin matters — `stepContacts` separates the two bodies to exactly
 * touching every tick, so a strict overlap test would almost never be true
 * by the time this one runs.
 */
function touchesPlayer(sim: GameSim, index: number, distance: number): boolean {
  if (sim.playerDead) {
    return false;
  }
  const body = sim.body.data;
  const reach =
    (body[index * 2] ?? 0) + (body[sim.playerIndex * 2] ?? 0) + sim.tuning.latch.latchReach;
  return distance <= reach;
}

/** Spokes in the little spore puff a body latching on throws (#406). */
const LATCH_PUFF_SPOKES = 6;
const LATCH_PUFF_SPEED = 0.6;
const LATCH_PUFF_TICKS = 14;

/**
 * Attaches the body at `index` to the player (#406, `latchOnPlayer`).
 *
 * Where on Alois it sits is decided once, here: left or right on his hat by
 * the side it came from. The offset is stored in the body's `enemyMotion`
 * heading slots — safe, since a latched body's states `pause` and never read
 * them as a heading — and `sim/systems/latch.ts` keeps it there. Drawing it
 * up on the hat rather than on the floor is the renderer's business
 * (`render/entities.ts`).
 *
 * Dropping to no collision layer is the "not shootable while latched"
 * decision `LatchOnPlayerBehaviour`'s doc comment makes: shots, splash and
 * the player's own body all look the layer up, and none of them find it.
 */
function latchToPlayer(sim: GameSim, index: number, toPlayerX: number, distance: number): void {
  const player = sim.playerIndex;
  const playerFootprint = sim.body.data[player * 2] ?? 0;
  const fromX = distance === 0 ? 1 : -toPlayerX / distance;
  // Which side of his hat it rides on: `render/entities.ts` draws a latched
  // body up on Alois's billboard, over the crown, and reads only this x. Kept
  // inside the crown's width so two ticks sit side by side on it.
  const offsetX = fromX * playerFootprint * 0.35;
  const offsetY = 0;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const motion = sim.enemyMotion.data;
  motion[motionBase] = offsetX;
  motion[motionBase + 1] = offsetY;

  sim.velocity.data[index * 2] = 0;
  sim.velocity.data[index * 2 + 1] = 0;
  sim.push.data[index * 2] = 0;
  sim.push.data[index * 2 + 1] = 0;
  sim.collision.data[index * 2] = 0;
  sim.collision.data[index * 2 + 1] = 0;

  const x = sim.positionX(player) + offsetX;
  const y = sim.positionY(player) + offsetY;
  sim.transform.data[index * 4] = x;
  sim.transform.data[index * 4 + 1] = y;

  ring(sim, x, y, LATCH_PUFF_SPOKES, ParticleKind.Spore, LATCH_PUFF_SPEED, LATCH_PUFF_TICKS, 2);
  sim.playItemCue('zecke-latch');
  sim.noteLatch();
}

/**
 * The first transition that matches, or -1.
 *
 * Declaration order decides, so what a state machine does is a function of the
 * text somebody wrote rather than of a priority rule they have to remember.
 */
function chooseTransition(
  sim: GameSim,
  index: number,
  state: CompiledState,
  ticks: number,
  flags: number,
  distance: number,
  toPlayerX: number,
  toPlayerY: number,
  selfX: number,
  selfY: number,
): number {
  // A player behind a rock or a pillar is out of sight, and out of sight
  // reads as out of range: `PlayerWithin` cannot fire, `PlayerBeyond` does.
  // Looked up at most once, and only by a state that asks about the player.
  let sighted = -1;
  for (const transition of state.transitions) {
    switch (transition.trigger) {
      case TransitionTrigger.After:
        if (ticks >= stateDuration(sim, state, transition.value)) {
          return transition.to;
        }
        break;
      case TransitionTrigger.OnHit:
        if ((flags & ENEMY_FLAG_HIT) !== 0) {
          return transition.to;
        }
        break;
      case TransitionTrigger.OnBlocked:
        if ((flags & ENEMY_FLAG_BLOCKED) !== 0) {
          return transition.to;
        }
        break;
      case TransitionTrigger.OnLatched:
        if ((flags & ENEMY_FLAG_JUST_LATCHED) !== 0) {
          return transition.to;
        }
        break;
      case TransitionTrigger.OnShakenOff:
        if ((flags & ENEMY_FLAG_SHAKEN_OFF) !== 0) {
          return transition.to;
        }
        break;
      case TransitionTrigger.PlayerWithin:
        if (distance <= transition.value) {
          if (sighted < 0) {
            sighted = isSighted(sim, index, toPlayerX, toPlayerY) ? 1 : 0;
          }
          if (sighted === 1) {
            return transition.to;
          }
        }
        break;
      case TransitionTrigger.PlayerBeyond:
        if (distance > transition.value) {
          return transition.to;
        }
        if (sighted < 0) {
          sighted = isSighted(sim, index, toPlayerX, toPlayerY) ? 1 : 0;
        }
        // Out of sight is out of range — but not while the body is still on
        // its way to where it last saw the player: it gives up the chase
        // once it has looked there (`walkTowardPlayer`), not the moment the
        // player steps behind a rock.
        if (sighted === 0 && !isSeeking(sim, index)) {
          return transition.to;
        }
        break;
      case TransitionTrigger.PropWithin: {
        // Never fires when the prop is gone — `nearestPropDistance` returns
        // Infinity — which is how the Maibaum-Dieb (#199) tells "reach the
        // maypole" from "there is no maypole".
        if (nearestPropDistance(sim, selfX, selfY, transition.propKind) <= transition.value) {
          return transition.to;
        }
        break;
      }
      case TransitionTrigger.PropBeyond: {
        // Always fires when the prop is gone (Infinity > anything) — the
        // Maibaum-Dieb drops into his disarmed chase the instant the maypole
        // he was walking toward is destroyed (#199).
        if (nearestPropDistance(sim, selfX, selfY, transition.propKind) > transition.value) {
          return transition.to;
        }
        break;
      }
      default:
        break;
    }
  }
  return -1;
}

/**
 * Locks, keeps or releases the body's aim, on the first tick of `state`.
 * Returns the new flags.
 *
 * Player feedback: an attack behind a wind-up has to land where the player
 * was when the wind-up *started*. Aiming at where they are when it ends makes
 * the telegraph useless — stepping aside during it is the one thing it asks
 * of the player, and the attack followed them anyway. So:
 *
 * - a telegraphing state stores the player's position and sets the lock;
 * - an attacking state (`CompiledState.aimsAttack`) keeps whatever lock is
 *   there, so a chain like Bierratte's `telegraph → snipe → dash` shoots and
 *   then dashes at the same locked spot;
 * - any other state releases it, and the body aims at the player again.
 *
 * A locked *point*, not a locked direction: a body that moves during its
 * wind-up still attacks the spot the player was standing on.
 */
function updateAimLock(
  sim: GameSim,
  index: number,
  state: CompiledState,
  flags: number,
  playerX: number,
  playerY: number,
): number {
  if (state.telegraphTicks > 0) {
    const motion = sim.enemyMotion.data;
    const motionBase = index * ENEMY_MOTION_STRIDE;
    motion[motionBase + 4] = playerX;
    motion[motionBase + 5] = playerY;
    return flags | ENEMY_FLAG_AIM_LOCKED;
  }
  if (state.aimsAttack) {
    return flags;
  }
  return flags & ~ENEMY_FLAG_AIM_LOCKED;
}

/**
 * The angle the body at `index` will attack along if it attacked now: toward
 * its locked aim target while `ENEMY_FLAG_AIM_LOCKED` is set, toward the
 * player otherwise. What a Line or Arc telegraph points along, so the warning
 * and the attack after it can never disagree.
 */
export function enemyAimAngle(sim: GameSim, index: number): number {
  const selfX = sim.positionX(index);
  const selfY = sim.positionY(index);
  let targetX = sim.positionX(sim.playerIndex);
  let targetY = sim.positionY(sim.playerIndex);
  if (((sim.enemy.data[index * ENEMY_STRIDE + 3] ?? 0) & ENEMY_FLAG_AIM_LOCKED) !== 0) {
    const motionBase = index * ENEMY_MOTION_STRIDE;
    targetX = sim.enemyMotion.data[motionBase + 4] ?? targetX;
    targetY = sim.enemyMotion.data[motionBase + 5] ?? targetY;
  }
  const dx = targetX - selfX;
  const dy = targetY - selfY;
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}

/**
 * How long a state lasts, after the global telegraph scale.
 *
 * A state that warns the player is stretched along with its warning. Scaling
 * only the ring would make the two disagree — the ring would still be growing
 * when the attack landed, which is worse than no ring at all.
 */
function stateDuration(sim: GameSim, state: CompiledState, ticks: number): number {
  if (state.telegraphTicks <= 0) {
    return ticks;
  }
  return Math.max(1, Math.round(ticks * sim.tuning.enemy.telegraphScale));
}

/**
 * True the tick a body's health falls at or below one of its current state's
 * `splitOnDeath.atHealthBelow` thresholds — Die Große Kellerassel's (#36)
 * phase change. Checked every tick rather than only on a hit, since a status
 * effect's own damage tick (burn, poison) can cross the threshold too.
 */
function crossesSplitThreshold(sim: GameSim, index: number, state: CompiledState): boolean {
  if (state.splits.length === 0) {
    return false;
  }
  const healthBase = index * 2;
  const current = sim.health.data[healthBase] ?? 0;
  const max = sim.health.data[healthBase + 1] ?? 0;
  if (current <= 0 || max <= 0) {
    return false;
  }
  for (const split of state.splits) {
    if (split.atHealthBelow > 0 && current <= split.atHealthBelow * max) {
      return true;
    }
  }
  return false;
}

/** How fast a walker that has lost sight of the player wanders, as a fraction of its walking speed. */
const UNSIGHTED_WANDER_SPEED = 0.5;
/** Ticks between a lost walker's changes of direction. */
const UNSIGHTED_WANDER_TURN_TICKS = 40;

/**
 * A `walkTowardPlayer` body with no line of sight: ambles in a random
 * direction, picking a new one every `UNSIGHTED_WANDER_TURN_TICKS`. Reuses
 * the motion slots `wander` uses — a walking state has no other use for them.
 */
function wanderWithoutSight(sim: GameSim, index: number, ticks: number, speed: number): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const directionless = (motion[motionBase] ?? 0) === 0 && (motion[motionBase + 1] ?? 0) === 0;
  if (directionless || ticks % UNSIGHTED_WANDER_TURN_TICKS === 0) {
    // The enemy stream, for the same reason `wander` uses it.
    const angle = sim.random.enemies.nextFloat() * Math.PI * 2;
    motion[motionBase] = Math.cos(angle);
    motion[motionBase + 1] = Math.sin(angle);
  }
  const velocity = sim.velocity.data;
  velocity[index * 2] = (motion[motionBase] ?? 0) * speed;
  velocity[index * 2 + 1] = (motion[motionBase + 1] ?? 0) * speed;
}

/** Whether the body is still heading for where it last saw the player. */
function isSeeking(sim: GameSim, index: number): boolean {
  return (
    (sim.enemyMotion.data[index * ENEMY_MOTION_STRIDE + MOTION_MEMORY] ?? MEMORY_NONE) ===
    MEMORY_SEEKING
  );
}

/**
 * A walker that has lost sight of the player heads for where it last saw
 * them, routing around rocks and pillars (`room/pathfind.ts`) rather than
 * pressing into them. Returns false — and forgets — once it has arrived, or
 * when there is no way there; the caller then wanders.
 *
 * The path is searched every `REPATH_TICKS` (staggered by slot, so a room of
 * walkers does not all search on the same tick) and whenever the current
 * waypoint is reached; between searches the body walks straight at the
 * waypoint, which `nextWaypoint` only picks when that line is clear.
 */
function seekLastSeen(
  sim: GameSim,
  index: number,
  selfX: number,
  selfY: number,
  speed: number,
): boolean {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  if ((motion[motionBase + MOTION_MEMORY] ?? MEMORY_NONE) !== MEMORY_SEEKING) {
    return false;
  }
  const targetX = motion[motionBase + MOTION_LAST_SEEN_X] ?? selfX;
  const targetY = motion[motionBase + MOTION_LAST_SEEN_Y] ?? selfY;
  if (vectorLength(targetX - selfX, targetY - selfY) <= MEMORY_ARRIVE_DISTANCE) {
    motion[motionBase + MOTION_MEMORY] = MEMORY_NONE;
    return false;
  }
  let wayX = (motion[motionBase + MOTION_WAYPOINT_X] ?? targetX) - selfX;
  let wayY = (motion[motionBase + MOTION_WAYPOINT_Y] ?? targetY) - selfY;
  let wayLength = vectorLength(wayX, wayY);
  const radius = sim.body.data[index * 2] ?? 0;
  if (
    (sim.tick + index) % REPATH_TICKS === 0 ||
    wayLength <= MEMORY_ARRIVE_DISTANCE / 2 ||
    // The waypoint is only ever chosen in straight reach, but the body has
    // moved since (or the waypoint was the target itself): re-plan the
    // moment walking straight at it would snag.
    !straightClear(sim.room, selfX, selfY, selfX + wayX, selfY + wayY, radius)
  ) {
    if (!nextWaypoint(sim.room, selfX, selfY, targetX, targetY, radius, waypoint)) {
      motion[motionBase + MOTION_MEMORY] = MEMORY_NONE;
      return false;
    }
    motion[motionBase + MOTION_WAYPOINT_X] = waypoint.x;
    motion[motionBase + MOTION_WAYPOINT_Y] = waypoint.y;
    wayX = waypoint.x - selfX;
    wayY = waypoint.y - selfY;
    wayLength = vectorLength(wayX, wayY);
  }
  const velocity = sim.velocity.data;
  velocity[index * 2] = wayLength === 0 ? 0 : (wayX / wayLength) * speed;
  velocity[index * 2 + 1] = wayLength === 0 ? 0 : (wayY / wayLength) * speed;
  return true;
}

/** Where the body goes this tick. Exactly one of these runs per state. */
function applyMovement(
  sim: GameSim,
  index: number,
  state: CompiledState,
  ticks: number,
  toPlayerX: number,
  toPlayerY: number,
  distance: number,
  aimX: number,
  aimY: number,
  aimDistance: number,
  selfX: number,
  selfY: number,
): void {
  const behaviour = state.movement;
  const velocity = sim.velocity.data;
  const base = index * 2;
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const scale = sim.tuning.enemy.speedScale;

  switch (behaviour.behaviour) {
    case 'pause': {
      velocity[base] = 0;
      velocity[base + 1] = 0;
      return;
    }
    case 'walkTowardPlayer': {
      const speed = behaviour.speed * scale;
      // No pathfinding: a walker only knows the straight line to the player,
      // so with a rock or a pillar on that line it would just press into it.
      // Out of sight, it loses track of the player instead and wanders —
      // the same rule `isSighted` already applies to reacting and shooting.
      if (!isSighted(sim, index, toPlayerX, toPlayerY)) {
        const unseen = (motion[motionBase + MOTION_UNSEEN_TICKS] ?? 0) + 1;
        motion[motionBase + MOTION_UNSEEN_TICKS] = unseen;
        if (
          unseen <= MEMORY_GRACE_TICKS &&
          (motion[motionBase + MOTION_MEMORY] ?? MEMORY_NONE) === MEMORY_SEEKING
        ) {
          motion[motionBase + MOTION_LAST_SEEN_X] = selfX + toPlayerX;
          motion[motionBase + MOTION_LAST_SEEN_Y] = selfY + toPlayerY;
        }
        if (!seekLastSeen(sim, index, selfX, selfY, speed)) {
          wanderWithoutSight(sim, index, ticks, speed * UNSIGHTED_WANDER_SPEED);
        }
        return;
      }
      // In sight: remember where, for when it is not any more.
      motion[motionBase + MOTION_UNSEEN_TICKS] = 0;
      motion[motionBase + MOTION_LAST_SEEN_X] = selfX + toPlayerX;
      motion[motionBase + MOTION_LAST_SEEN_Y] = selfY + toPlayerY;
      motion[motionBase + MOTION_MEMORY] = MEMORY_SEEKING;
      // Seen, but a rock's corner is in the way of the body itself: route
      // around it rather than pressing into it.
      const radius = sim.body.data[index * 2] ?? 0;
      if (!straightClear(sim.room, selfX, selfY, selfX + toPlayerX, selfY + toPlayerY, radius)) {
        if (seekLastSeen(sim, index, selfX, selfY, speed)) {
          return;
        }
      }
      motion[motionBase + MOTION_WAYPOINT_X] = selfX + toPlayerX;
      motion[motionBase + MOTION_WAYPOINT_Y] = selfY + toPlayerY;
      velocity[base] = distance === 0 ? 0 : (toPlayerX / distance) * speed;
      velocity[base + 1] = distance === 0 ? 0 : (toPlayerY / distance) * speed;
      return;
    }
    case 'approachProp': {
      // Head for the nearest live prop of the named kind; with none left in
      // the room, fall back to exactly `walkTowardPlayer` (#199). The prop
      // index is resolved once at compile time onto the state.
      const speed = behaviour.speed * scale;
      const prop = nearestPropIndex(sim, selfX, selfY, state.approachPropKind);
      let dirX = toPlayerX;
      let dirY = toPlayerY;
      let length = distance;
      if (prop >= 0) {
        dirX = sim.positionX(prop) - selfX;
        dirY = sim.positionY(prop) - selfY;
        length = vectorLength(dirX, dirY);
      }
      velocity[base] = length === 0 ? 0 : (dirX / length) * speed;
      velocity[base + 1] = length === 0 ? 0 : (dirY / length) * speed;
      return;
    }
    case 'fleeFromPlayer': {
      const speed = behaviour.speed * scale;
      velocity[base] = distance === 0 ? 0 : (-toPlayerX / distance) * speed;
      velocity[base + 1] = distance === 0 ? 0 : (-toPlayerY / distance) * speed;
      return;
    }
    case 'rollBounce': {
      // Fixed direction, every tick, no re-aim — a bounce is the *state*
      // changing (via an `onBlocked` transition to the opposite direction's
      // state), not this primitive noticing a wall itself.
      const speed = behaviour.speed * behaviour.direction * scale;
      velocity[base] = behaviour.axis === 'x' ? speed : 0;
      velocity[base + 1] = behaviour.axis === 'y' ? speed : 0;
      return;
    }
    case 'chargeAtPlayer': {
      // Aimed on the tick the state begins and never again. A charge that
      // follows the player is a charge that cannot be dodged, which makes the
      // telegraph before it a lie. Behind a wind-up it runs at the spot the
      // player stood when the wind-up *began* (`updateAimLock`), not where
      // they were when it ended — the telegraph line pointed there the whole
      // time, and a charge that swerves at the last tick reads as a cheat.
      if (ticks === 0) {
        motion[motionBase] = aimDistance === 0 ? 1 : aimX / aimDistance;
        motion[motionBase + 1] = aimDistance === 0 ? 0 : aimY / aimDistance;
      }
      const speed = behaviour.speed * scale;
      velocity[base] = (motion[motionBase] ?? 0) * speed;
      velocity[base + 1] = (motion[motionBase + 1] ?? 0) * speed;
      return;
    }
    case 'wander': {
      const turnEvery = Math.max(1, Math.round(behaviour.turnEveryTicks));
      if (ticks % turnEvery === 0) {
        // The enemy stream, and only the enemy stream. A wander that drew from
        // the shared generator would shift every floor layout in the game.
        const angle = sim.random.enemies.nextFloat() * Math.PI * 2;
        motion[motionBase] = Math.cos(angle);
        motion[motionBase + 1] = Math.sin(angle);
      }
      const speed = behaviour.speed * scale;
      velocity[base] = (motion[motionBase] ?? 0) * speed;
      velocity[base + 1] = (motion[motionBase + 1] ?? 0) * speed;
      return;
    }
    case 'orbitPoint': {
      const speed = behaviour.speed * scale;
      const outX = sim.positionX(index) - (motion[motionBase + 2] ?? 0);
      const outY = sim.positionY(index) - (motion[motionBase + 3] ?? 0);
      const out = vectorLength(outX, outY);
      // Standing exactly on the centre gives no direction to orbit in. Any
      // fixed choice will do, and a fixed one keeps this deterministic.
      const radialX = out === 0 ? 1 : outX / out;
      const radialY = out === 0 ? 0 : outY / out;
      const turn = behaviour.clockwise === true ? -1 : 1;
      const tangentX = -radialY * turn;
      const tangentY = radialX * turn;
      // Radial correction is a fraction of the orbit speed, so a body pushed
      // off its ring returns to it over a second rather than snapping back.
      //
      // `radial` points *away* from the centre, and `correction` is positive
      // when the body is inside the ring — so it is added, not subtracted
      // (#277). Subtracting it, as this did until Der Ladewagen became the
      // first content to use the primitive, inverted the whole correction: a
      // body inside its ring was pulled further in and one outside pushed
      // further out. A body spawned *on* its own orbit centre — which is what
      // an authored `orbitPoint` enemy always is, since the centre is its
      // spawn point — therefore never left it: it oscillated one pixel back
      // and forth forever while its velocity spun a full circle around it.
      const correction = clamp((behaviour.radius - out) * 0.1, -speed, speed);
      velocity[base] = tangentX * speed + radialX * correction;
      velocity[base + 1] = tangentY * speed + radialY * correction;
      return;
    }
    default:
      return;
  }
}

/**
 * `angle` snapped to the nearest of east, south, west, north — for a shooter
 * authored with `aimCardinal` (the Zapfhahn): whichever axis the target is
 * most along is the one it fires down.
 */
export function snapToCardinal(angle: number): number {
  const quarter = Math.PI / 2;
  return Math.round(angle / quarter) * quarter;
}

/**
 * Everything the state puts in the air this tick. `aimX`/`aimY` point at
 * what the body is shooting at — the player, or the spot a wind-up locked
 * (`updateAimLock`).
 */
function applyFiring(
  sim: GameSim,
  index: number,
  state: CompiledState,
  ticks: number,
  aimX: number,
  aimY: number,
  aimDistance: number,
): void {
  const scale = sim.tuning.enemy.fireIntervalScale;
  const freeAim = aimDistance === 0 ? 0 : Math.atan2(aimY, aimX);

  for (const shot of state.firing) {
    const interval = Math.max(1, Math.round(shot.everyTicks * scale));
    const aim = shot.aimCardinal === true ? snapToCardinal(freeAim) : freeAim;

    if (shot.behaviour === 'fireOnBeat') {
      // The offset is scaled with the bar it sits inside (#277): an author
      // writing "a third of a beat behind the tuba" means a third of whatever
      // `fireIntervalScale` has made the beat, or a difficulty knob would
      // silently re-voice the lattice into a different chord. Normalised into
      // `[0, interval)` so an offset of a whole beat, or a negative one, is
      // the downbeat rather than a rhythm that never fires.
      const offset =
        ((Math.round((shot.beatOffset ?? 0) * scale) % interval) + interval) % interval;
      if ((sim.tick + interval - offset) % interval === 0) {
        const shots = Math.max(1, Math.round(shot.shots));
        const step = (Math.PI * 2) / shots;
        for (let ray = 0; ray < shots; ray++) {
          fireOne(sim, index, step * ray, shot);
        }
      }
      continue;
    }

    const phase = ticks % interval;

    if (shot.behaviour === 'fireAtPlayer') {
      if (phase === 0 && isSighted(sim, index, aimX, aimY)) {
        fireOne(sim, index, aim, shot);
      }
      continue;
    }
    if (shot.behaviour === 'fireBurst') {
      const gap = Math.max(1, Math.round(shot.gapTicks));
      if (phase % gap === 0 && phase / gap < shot.shots && isSighted(sim, index, aimX, aimY)) {
        fireOne(sim, index, aim, shot);
      }
      continue;
    }
    if (phase === 0 && isSighted(sim, index, aimX, aimY)) {
      const shots = Math.max(1, Math.round(shot.shots));
      const step = shot.arc / Math.max(1, shots - 1);
      const start = aim - shot.arc / 2;
      for (let ray = 0; ray < shots; ray++) {
        fireOne(sim, index, shots === 1 ? aim : start + step * ray, shot);
      }
    }
  }
}

/**
 * False when a hop trellis (#37), or anything solid that cannot be moved —
 * a rock, a pillar, a wall — sits between the shooter and the player —
 * gates the three aimed firing primitives (`fireAtPlayer`/`fireBurst`/
 * `fireSpread`), not `fireOnBeat`: a sound ring is a room-filling shape, not
 * a shot aimed at where the player is standing.
 *
 * Also gates `chooseTransition`'s `PlayerWithin`/`PlayerBeyond`: a player
 * hidden behind cover is treated as out of range, so nothing reacts to them
 * through a rock either.
 *
 * Firing calls this only on the tick a shot would actually fire (each
 * caller's own `phase === 0` — or, for `fireBurst`, its own gap check —
 * comes first), and a transition only once a distance check has already
 * passed. A room with neither sight blocks nor solid blocks short-circuits
 * the segment test entirely.
 */
function isSighted(sim: GameSim, index: number, toPlayerX: number, toPlayerY: number): boolean {
  if (sim.room.sightBlockCount === 0 && sim.room.blockCount === 0) {
    return true;
  }
  const shooterX = sim.positionX(index);
  const shooterY = sim.positionY(index);
  return !sim.room.blocksSight(shooterX, shooterY, shooterX + toPlayerX, shooterY + toPlayerY);
}

/**
 * Puts one projectile in the air.
 *
 * The muzzle sits outside the body, and falls back to its centre when that
 * would put the shot inside a wall — the same rule the player's own weapon
 * uses, and for the same reason: a turret against a wall that produces no shot
 * at all reads as the game having broken rather than as cover working.
 */
/**
 * `base` doubled (well — `eliteAttackDamageMultiplier`'d) when the body at
 * `index` was rolled an elite (#156), otherwise `base` untouched. The one
 * place an elite's *attack* damage is scaled: `fireOne`, `applyMeleeArc` and
 * `detonateLobbedBomb` all route through here so "an elite always hits
 * double" is one rule, not three that can drift apart. Contact damage is not
 * here — it is scaled once at spawn, on the `contactDamage` component.
 *
 * @hot — called from the frame loop; `isEnemyElite` allocates nothing.
 */
export function eliteAttackDamage(sim: GameSim, index: number, base: number): number {
  return isEnemyElite(sim, index)
    ? Math.round(base * sim.tuning.enemy.eliteAttackDamageMultiplier)
    : base;
}

function fireOne(sim: GameSim, index: number, angle: number, shot: FiringBehaviour): void {
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const radius = shot.radius ?? sim.tuning.shooting.shotRadius;

  const centreX = sim.positionX(index);
  const centreY = sim.positionY(index);
  const reach = (sim.body.data[index * 2] ?? 0) + radius + 1;
  let muzzleX = centreX + directionX * reach;
  let muzzleY = centreY + directionY * reach;
  if (!sim.room.isClear(muzzleX, muzzleY, radius)) {
    muzzleX = centreX;
    muzzleY = centreY;
  }

  const speed = shot.speed * sim.tuning.enemy.projectileSpeedScale;
  const projectile = sim.projectiles.spawn(
    muzzleX,
    muzzleY,
    directionX * speed,
    directionY * speed,
    radius,
    eliteAttackDamage(sim, index, shot.damage),
    Math.max(1, Math.round(shot.lifetimeTicks)),
    ProjectileTeam.Enemy,
    shot.poison === true ? ProjectileTag.Poison : 0,
    // Which sprite this shot is drawn as, if its behaviour named one (#152).

    // Resolved through the roster's interned name table rather than carried as
    // a string, so nothing in the frame loop compares one.
    sim.enemies.artIndexOf(shot.art),
  );
  if (projectile !== NO_SLOT) {
    sim.projectiles.ownerDefinition[projectile] = sim.enemy.data[index * ENEMY_STRIDE] ?? -1;
  }
  // "Something over there just shot" is worth a frame of warning at the edge
  // of vision (#153), and an enemy's muzzle flashing where the player's does
  // not is how a game teaches that enemy shots come from nowhere.
  muzzleFlash(sim, muzzleX, muzzleY);
  // The audio half of the same idea (#234): in a bullet hell you need to
  // hear what fired behind you, not just see it.
  sim.events.push(EventKind.ShotFired, index, NO_SLOT, muzzleX, muzzleY, directionX, directionY, 0);
}

/**
 * Remembers the player's current position in the body's own `enemyMotion`
 * heading fields (#156, Böllerschmeißer) — safe to reuse for an absolute
 * position rather than a direction, since a state that captures a lob
 * target moves with `pause` and `applyMovement`'s `'pause'` case never
 * touches `motion`.
 */
function captureLobTarget(sim: GameSim, index: number): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  motion[motionBase] = sim.positionX(sim.playerIndex);
  motion[motionBase + 1] = sim.positionY(sim.playerIndex);
}

/**
 * The other half of `captureLobTarget`: area damage at the position an
 * earlier state in this same body's life stored, through
 * `GameSim.applySplashDamage` — the same chokepoint the player's own
 * Böllerschmeißer item detonates through. `excludeIndex` is the thrower
 * itself, so a lobbed bomb never catches its own thrower in its blast — it
 * can still catch every *other* enemy standing in the radius, same as a
 * player's own splash would (`applySplashDamage`'s own doc comment).
 *
 * Also runs the blast through `GameSim.triggerExplosion`, same as every
 * other explosion source — a Böller an enemy lobs at a secret wall opens it
 * exactly as one the player throws does.
 */
function detonateLobbedBomb(sim: GameSim, index: number, detonation: CompiledDetonation): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const x = motion[motionBase] ?? sim.positionX(index);
  const y = motion[motionBase + 1] ?? sim.positionY(index);
  sim.applySplashDamage(
    x,
    y,
    detonation.radius,
    eliteAttackDamage(sim, index, detonation.damage),
    index,
  );
  // #243: `applySplashDamage` alone leaves the blast itself invisible — a
  // real hit already flashes on whatever it caught, but there was nothing at
  // the landing spot for a player who dodged, or who was hit from off to one
  // side, to actually see.
  sim.splashBurst(x, y, detonation.radius);
  sim.triggerExplosion(x, y, detonation.radius);
}

/**
 * The nearest live destructible prop of `kind`, as an entity index, or -1.
 *
 * `kind` is a `DESTRUCTIBLE_PROP_KINDS` index resolved at compile time. The
 * scan is one pass over the world per call — the Maibaum-Dieb (#199) is the
 * only body that calls it, and a boss room never holds enough entities for it
 * to register, the same argument `GameSim.bossHealth`'s per-frame scan makes.
 *
 * @hot — no allocation; returns via the module scratch below.
 */
function nearestPropIndex(sim: GameSim, x: number, y: number, kind: number): number {
  if (kind < 0) {
    return -1;
  }
  const states = sim.world.states;
  const masks = sim.world.masks;
  const propBit = sim.propKind.bit;
  const propData = sim.propKind.data;
  let best = -1;
  let bestSq = Infinity;
  for (let i = 0; i < sim.world.highWater; i++) {
    if (states[i] !== World.ALIVE || ((masks[i] ?? 0) & propBit) === 0) {
      continue;
    }
    if ((propData[i] ?? 0) !== kind) {
      continue;
    }
    const dx = sim.positionX(i) - x;
    const dy = sim.positionY(i) - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestSq) {
      bestSq = distSq;
      best = i;
    }
  }
  return best;
}

/** Distance to the nearest live prop of `kind`, or `Infinity` when there is none. */
function nearestPropDistance(sim: GameSim, x: number, y: number, kind: number): number {
  const index = nearestPropIndex(sim, x, y, kind);
  if (index < 0) {
    return Infinity;
  }
  const dx = sim.positionX(index) - x;
  const dy = sim.positionY(index) - y;
  return vectorLength(dx, dy);
}

/**
 * On entering a `grabProp` state: take the nearest prop of the named kind
 * within `reach`. A no-op when none is in range — which is the whole of the
 * Maibaum-Dieb's disarmed branch (#199).
 */
function grabNearestProp(
  sim: GameSim,
  index: number,
  grab: { readonly kind: number; readonly reach: number },
): void {
  const prop = nearestPropIndex(sim, sim.positionX(index), sim.positionY(index), grab.kind);
  if (prop < 0) {
    return;
  }
  const dx = sim.positionX(prop) - sim.positionX(index);
  const dy = sim.positionY(prop) - sim.positionY(index);
  if (vectorLength(dx, dy) <= grab.reach) {
    sim.consumeProp(prop);
  }
}

/**
 * Locks the swing's aim at the player's direction on the tick the `meleeArc`
 * state is entered, in the body's own `enemyMotion` heading fields — the same
 * commitment `chargeAtPlayer` makes, and safe to store there because a
 * `meleeArc` state moves with `pause`.
 */
function lockMeleeAim(
  sim: GameSim,
  index: number,
  toPlayerX: number,
  toPlayerY: number,
  distance: number,
): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  motion[motionBase] = distance === 0 ? 1 : toPlayerX / distance;
  motion[motionBase + 1] = distance === 0 ? 0 : toPlayerY / distance;
}

/**
 * The absolute world angle of the blade `ticks` into the sweep — one edge of
 * the arc at `ticks <= 0`, the other at `ticks >= sweepTicks`, linear between.
 * Shared by the hit check and by the renderer that swings the weapon sprite,
 * so the two can never disagree about where the blade is (#199).
 */
export function meleeBladeAngle(swing: CompiledMeleeArc, aimAngle: number, ticks: number): number {
  const t = clamp(ticks / swing.sweepTicks, 0, 1);
  return aimAngle + swing.direction * (-swing.arc / 2 + swing.arc * t);
}

/** Smallest signed difference `a - b`, wrapped to (-π, π]. */
function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * The swing itself: a blade travelling `swing.arc` over `swing.sweepTicks`.
 *
 * Each tick it threatens only the thin wedge it crossed *this* tick — the
 * player has to actually be where the blade is passing, not merely somewhere
 * inside the arc's footprint. It connects at most once because the blade
 * crosses any bearing once, and the player's contact i-frames (set by
 * `applyContact` off the `Contact` event below) cover the rest of the sweep.
 * Damage, knockback, flash and shake all come from that one event, so a swing
 * reads exactly like every other thing that hits you, plus an extra outward
 * shove for the weight of the weapon (#199).
 */
function applyMeleeArc(
  sim: GameSim,
  index: number,
  swing: CompiledMeleeArc,
  ticks: number,
  selfX: number,
  selfY: number,
): void {
  if (ticks < 1 || ticks > swing.sweepTicks || sim.playerInvulnerableTicks > 0) {
    return;
  }
  const playerIndex = sim.playerIndex;
  const toX = sim.positionX(playerIndex) - selfX;
  const toY = sim.positionY(playerIndex) - selfY;
  const distance = vectorLength(toX, toY);
  if (distance > swing.reach + (sim.body.data[playerIndex * 2] ?? 0)) {
    return;
  }
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const aimAngle = Math.atan2(motion[motionBase + 1] ?? 0, motion[motionBase] ?? 1);
  const from = meleeBladeAngle(swing, aimAngle, ticks - 1);
  const to = meleeBladeAngle(swing, aimAngle, ticks);
  const playerBearing = Math.atan2(toY, toX);
  // Caught if the player's bearing lies in the slice swept this tick, widened
  // a little so a fast sweep still connects with a stationary target.
  const mid = (from + to) / 2;
  const half = Math.abs(to - from) / 2 + 0.1;
  if (Math.abs(angleDelta(playerBearing, mid)) > half) {
    return;
  }
  const nx = distance === 0 ? Math.cos(aimAngle) : toX / distance;
  const ny = distance === 0 ? Math.sin(aimAngle) : toY / distance;
  // The normal points from the swinger to the player — away from what hit
  // them, the convention every impact event uses.
  sim.events.push(
    EventKind.Contact,
    playerIndex,
    index,
    selfX,
    selfY,
    nx,
    ny,
    eliteAttackDamage(sim, index, swing.damage),
  );
  if (swing.knockback > 0) {
    addPush(sim, playerIndex, nx * swing.knockback, ny * swing.knockback);
  }
}

/**
 * What a body leaves behind.
 *
 * Read from the death events rather than called by whatever killed something,
 * so that a split happens the same way whether the body was shot, crushed or
 * removed by a future item — and so that a headless test can assert on it.
 *
 * The split is declared on the *state* the body died in, which is what lets a
 * boss split in its second phase and not in its first.
 */
export function stepEnemyDeaths(sim: GameSim): void {
  deathSim = sim;
  sim.events.forEach(splitFromEvent);
  deathSim = null;
}

let deathSim: GameSim | null = null;

function splitFromEvent(slot: number): void {
  const sim = deathSim;
  if (sim?.events.kind[slot] !== EventKind.Death) {
    return;
  }
  const index = sim.events.subject[slot] ?? 0;
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return;
  }

  const base = index * ENEMY_STRIDE;
  const enemy = sim.enemy.data;
  const compiled = sim.enemies.at(enemy[base] ?? 0);
  const state = compiled.states[enemy[base + 1] ?? 0];
  if (state === undefined || state.splits.length === 0) {
    return;
  }

  const atX = sim.events.x[slot] ?? 0;
  const atY = sim.events.y[slot] ?? 0;
  const random = sim.random.enemies;

  // One cue for the whole split, not one per child spawned below — Der
  // Stier's `PHASE_TWO_SPLIT` and a Fass shattering into `fasssplitter` are
  // both "a body's death produced more of them," and #234 wants that event
  // itself audible rather than silent.
  sim.events.push(EventKind.EnemySplit, index, NO_SLOT, atX, atY, 0, 0, 0);

  for (const split of state.splits) {
    const count = Math.max(0, Math.round(split.count));
    // Read once per split, at the death point: the Maibaum-Dieb's own case
    // (#260) needs to know whether the maypole is still standing at the
    // exact moment Der Stier dies, not later once the child is already
    // walking around — same "no stored flag, just what's true right now"
    // spirit as `approachProp`'s own fallback.
    const healthOverride =
      split.healthWithoutPropKind >= 0 &&
      nearestPropIndex(sim, atX, atY, split.healthWithoutPropKind) < 0
        ? split.healthWithoutPropHealth
        : undefined;
    // One rolled offset for the whole ring, so the children fan out evenly
    // rather than clumping — and so one draw covers any number of them.
    const offset = random.nextFloat() * Math.PI * 2;
    for (let child = 0; child < count; child++) {
      const angle = offset + (child / Math.max(1, count)) * Math.PI * 2;
      const childRadius = sim.enemies.at(split.definition).radius;
      let x = atX + Math.cos(angle) * split.spread;
      let y = atY + Math.sin(angle) * split.spread;
      if (!sim.room.isClear(x, y, childRadius)) {
        // Inside a wall. Dropping it on the corpse is better than not spawning
        // it: the player killed something and something has to come out.
        x = atX;
        y = atY;
      }
      sim.spawnEnemyKind(split.definition, x, y, false, healthOverride);
    }
  }
}

/**
 * Pushes an `EnemySummon` event for every `summon` behaviour whose wave is due
 * this tick — `ticks % everyTicks === 0`, the same "first one on the tick the
 * state begins" rule the firing primitives use. The `maxActive` cap is checked
 * later, in `stepEnemySummons`, off a fresh body count; here we only decide
 * *that* a wave is due, off the tick counter alone, so a replay reproduces it.
 *
 * @hot — runs in the frame loop, allocation-free.
 */
function queueSummonWaves(
  sim: GameSim,
  index: number,
  state: CompiledState,
  ticks: number,
  selfX: number,
  selfY: number,
): void {
  for (const summon of state.summons) {
    if (ticks % summon.everyTicks !== 0) {
      continue;
    }
    sim.events.push(
      EventKind.EnemySummon,
      index,
      summon.definition,
      selfX,
      selfY,
      summon.maxActive,
      summon.spread,
      summon.countPerWave,
    );
  }
}

let summonSim: GameSim | null = null;

/**
 * Spawns the bodies that this tick's `EnemySummon` events asked for — deferred
 * out of `stepEnemies` for the same reason `stepEnemyDeaths` is: `spawnEnemyKind`
 * can grow the world, and a system loop that has cached its component arrays
 * must not have them swapped underneath it. A wave is dropped, not queued,
 * whenever `maxActive` of the child are already alive (`GameSim.roomEnemyCount`
 * is doors-only; this counts the actual bodies).
 */
export function stepEnemySummons(sim: GameSim): void {
  summonSim = sim;
  sim.events.forEach(summonFromEvent);
  summonSim = null;
}

function summonFromEvent(slot: number): void {
  const sim = summonSim;
  if (sim?.events.kind[slot] !== EventKind.EnemySummon) {
    return;
  }
  const definition = sim.events.other[slot] ?? 0;
  const maxActive = Math.round(sim.events.normalX[slot] ?? 0);
  const spread = sim.events.normalY[slot] ?? 0;
  const countPerWave = Math.round(sim.events.value[slot] ?? 0);
  const atX = sim.events.x[slot] ?? 0;
  const atY = sim.events.y[slot] ?? 0;

  let live = 0;
  const states = sim.world.states;
  const masks = sim.world.masks;
  const required = sim.enemyMask;
  for (let i = 0; i < sim.world.highWater; i++) {
    if (states[i] !== World.ALIVE) {
      continue;
    }
    if (((masks[i] ?? 0) & required) !== required) {
      continue;
    }
    if ((sim.enemy.data[i * ENEMY_STRIDE] ?? 0) === definition) {
      live += 1;
    }
  }

  const toSpawn = Math.min(countPerWave, maxActive - live);
  if (toSpawn <= 0) {
    return;
  }

  const childRadius = sim.enemies.at(definition).radius;
  const offset = sim.random.enemies.nextFloat() * Math.PI * 2;
  for (let child = 0; child < toSpawn; child++) {
    const angle = offset + (child / toSpawn) * Math.PI * 2;
    let x = atX + Math.cos(angle) * spread;
    let y = atY + Math.sin(angle) * spread;
    if (!sim.room.isClear(x, y, childRadius)) {
      x = atX;
      y = atY;
    }
    sim.spawnEnemyKind(definition, x, y, false);
  }
}

/**
 * Pushes an `EnemyDropProp` event for every `dropProp` behaviour whose drop is
 * due this tick, at the point *behind* the body along its current heading —
 * the `summon` counterpart, and due on the same "first one on the tick the
 * state begins" rule (#277).
 *
 * The landing point is decided here, where the dropper's velocity is still the
 * one it moved with this tick; the `maxActive` cap and the "is that spot
 * actually free" check both happen later, in `stepEnemyPropDrops`, off a fresh
 * count. A stationary body (`pause`, or one a wall has stopped) has no heading
 * and leaves the bale underfoot, which is the honest reading of "behind" for
 * something that is not going anywhere.
 *
 * @hot — runs in the frame loop, allocation-free.
 */
function queuePropDrops(
  sim: GameSim,
  index: number,
  state: CompiledState,
  ticks: number,
  selfX: number,
  selfY: number,
): void {
  const velocity = sim.velocity.data;
  const vx = velocity[index * 2] ?? 0;
  const vy = velocity[index * 2 + 1] ?? 0;
  const speed = Math.hypot(vx, vy);
  for (const drop of state.propDrops) {
    if (ticks % drop.everyTicks !== 0) {
      continue;
    }
    const atX = speed === 0 ? selfX : selfX - (vx / speed) * drop.behind;
    const atY = speed === 0 ? selfY : selfY - (vy / speed) * drop.behind;
    sim.events.push(
      EventKind.EnemyDropProp,
      index,
      drop.kind,
      atX,
      atY,
      drop.maxActive,
      drop.radius,
      drop.health,
    );
  }
}

let propDropSim: GameSim | null = null;

/**
 * Spawns the props this tick's `EnemyDropProp` events asked for — deferred out
 * of `stepEnemies` for the same reason `stepEnemySummons` is: `spawnTarget`
 * grows the world, and a system loop that has cached its component arrays must
 * not have them swapped underneath it.
 *
 * Four ways a drop is skipped rather than queued: the cap is already met, the
 * spot is not clear of the room's own walls and blocks, another prop is
 * already standing there, or the player is — a bale materialising on top of
 * the player would shove them with no warning and no way to have avoided it,
 * which is the one thing an arena that degrades must never do.
 */
export function stepEnemyPropDrops(sim: GameSim): void {
  propDropSim = sim;
  sim.events.forEach(propDropFromEvent);
  propDropSim = null;
}

function propDropFromEvent(slot: number): void {
  const sim = propDropSim;
  if (sim?.events.kind[slot] !== EventKind.EnemyDropProp) {
    return;
  }
  const kind = sim.events.other[slot] ?? 0;
  const maxActive = Math.round(sim.events.normalX[slot] ?? 0);
  const radius = sim.events.normalY[slot] ?? 0;
  const health = sim.events.value[slot] ?? 0;
  const atX = sim.events.x[slot] ?? 0;
  const atY = sim.events.y[slot] ?? 0;

  if (sim.countProps(kind) >= maxActive) {
    return;
  }
  if (!sim.room.isClear(atX, atY, radius)) {
    return;
  }
  if (sim.propWithin(atX, atY, radius)) {
    return;
  }
  const player = sim.playerIndex;
  const reach = radius + (sim.hurtbox.data[player * 2] ?? 0);
  if (Math.hypot(sim.positionX(player) - atX, sim.positionY(player) - atY) < reach) {
    return;
  }
  // Heavy: a hay bale is cover, and cover a body could shove around the room
  // would stop reading as terrain. `PROP_DROP_MASS` is well above the `mid`
  // class's own 6.
  sim.spawnTarget(atX, atY, radius, kind, health, PROP_DROP_MASS);
}

/** What a dropped prop weighs — see `propDropFromEvent`. */
const PROP_DROP_MASS = 24;

/** Marks a body as having been hit, for the next tick's `onHit` transitions. */
export function markEnemyHit(sim: GameSim, index: number): void {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return;
  }
  const base = index * ENEMY_STRIDE;
  sim.enemy.data[base + 3] = (sim.enemy.data[base + 3] ?? 0) | ENEMY_FLAG_HIT;
}

/** Marks a body as having run into something solid. Called by `stepBodies`. */
export function markEnemyBlocked(sim: GameSim, index: number): void {
  const base = index * ENEMY_STRIDE;
  sim.enemy.data[base + 3] = (sim.enemy.data[base + 3] ?? 0) | ENEMY_FLAG_BLOCKED;
}

/**
 * True while nothing can hurt the body at `index`.
 *
 * Derived from the state counter rather than stored, which is what makes it
 * impossible for a body to renew its own invulnerability: the window is
 * measured from the moment the state began, and being hit again does not
 * restart it unless the data says the state changes.
 */
export function isEnemyInvulnerable(sim: GameSim, index: number): boolean {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return false;
  }
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  if (state === undefined || state.invulnerableTicks <= 0) {
    return false;
  }
  return (sim.enemy.data[base + 2] ?? 0) <= state.invulnerableTicks;
}

/**
 * True for a body `GameSim.spawnEnemyKind` rolled as an elite (#156) —
 * read by the renderer for the tint that is supposed to make one
 * recognisable without a health bar, same as `isEnemyInvulnerable` is read
 * for the curled-shell one.
 */
export function isEnemyElite(sim: GameSim, index: number): boolean {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return false;
  }
  const base = index * ENEMY_STRIDE;
  return ((sim.enemy.data[base + 3] ?? 0) & ENEMY_FLAG_ELITE) !== 0;
}

/**
 * How far through its telegraph the body at `index` is, from 0 to 1.
 *
 * Zero when it is not telegraphing at all. Read by the renderer, which is the
 * only reason a telegraph is worth having — and by the debug overlay, because
 * a warning nobody can see the timing of cannot be tuned.
 */
export function enemyTelegraphProgress(sim: GameSim, index: number): number {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return 0;
  }
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  if (state === undefined || state.telegraphTicks <= 0) {
    return 0;
  }
  const total = Math.max(1, Math.round(state.telegraphTicks * sim.tuning.enemy.telegraphScale));
  const ticks = sim.enemy.data[base + 2] ?? 0;
  if (ticks > total) {
    return 0;
  }
  return clamp(ticks / total, 0, 1);
}

/** Reusable scratch struct for `lobbedBombFlight`, written in place so a render loop's per-frame call never allocates. */
export interface LobbedBombFlight {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  /** 0..1, the same fraction `enemyTelegraphProgress` computes for this state's own ring. */
  progress: number;
}

/**
 * The bomb a body is currently lobbing, if any (#243) — start (its own
 * position, frozen for the whole state, since a `lobTarget`-capturing
 * state's `movement` is always `pause`), end (the spot `lobTarget` stored
 * into `enemyMotion`), and how far through the throw it is. The throw and
 * the telegraph share one duration — both are the same state, read the same
 * ticks-in-state counter — so this reuses `enemyTelegraphProgress` rather
 * than tracking its own clock.
 *
 * Written into `out` and returns `true` only while the body's *current*
 * state is the one that captured a `lobTarget` (`wind`, for the
 * Böllerschmeißer) — `false`, `out` untouched, at every other tick of its
 * life, `boom` included: the bomb has already landed once `detonateLobbedBomb`
 * runs, so there is nothing left in flight to draw.
 *
 * @hot — one call per enemy per frame, from `BombFlightView.sync`.
 */
export function lobbedBombFlight(sim: GameSim, index: number, out: LobbedBombFlight): boolean {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return false;
  }
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  if (state?.capturesLobTarget !== true) {
    return false;
  }
  const progress = enemyTelegraphProgress(sim, index);
  if (progress <= 0) {
    return false;
  }
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const startX = sim.positionX(index);
  const startY = sim.positionY(index);
  out.startX = startX;
  out.startY = startY;
  out.endX = motion[motionBase] ?? startX;
  out.endY = motion[motionBase + 1] ?? startY;
  out.progress = progress;
  return true;
}

/**
 * Which shape a telegraph should draw (#233).
 *
 * Every wind-up used to draw the same ring regardless of what it warned
 * about — a charge, a radial burst and a lobbed bomb all looked identical,
 * which reads fine until the roster has more than one of them in a room at
 * once. The shape is read off what the telegraphing state's own `after`
 * transition leads to (or, for a lob, off the state's *own* captured
 * target) rather than authored a second time per enemy, so a new enemy
 * reusing an existing attack primitive needs no render change.
 */
export const TelegraphShape = {
  /** An untargeted burst, centred on the body — the state ahead fires. */
  Ring: 0,
  /** A charge — the state ahead is `chargeAtPlayer`. Drawn from the body along the aim direction. */
  Line: 1,
  /** A melee swing with a facing — the state ahead swings a `meleeArc`. */
  Arc: 2,
  /** A landing zone away from the body — this state itself captured a `lobTarget` a `detonateLobbedBomb` ahead reads back. */
  Ground: 3,
  /**
   * A poison cloud about to be left on the body (#405) — the state ahead
   * enters with an `emitCloud`. `reach` is the cloud's radius: the marking
   * is the edge the cloud will settle at, because the cloud is far bigger
   * than the body that leaves it.
   */
  Cloud: 4,
} as const;

export type TelegraphShapeId = (typeof TelegraphShape)[keyof typeof TelegraphShape];

/** Reusable scratch struct for `enemyTelegraphShape`, written in place so a render loop's per-frame call never allocates. */
export interface EnemyTelegraphShapeInfo {
  shape: TelegraphShapeId;
  /** 0..1, the same fraction `enemyTelegraphProgress` returns for this state. */
  progress: number;
  /** World-space anchor: the body for Ring/Line/Arc, the captured landing spot for Ground. */
  x: number;
  y: number;
  /** Aim angle in radians, toward the player. Line and Arc only. */
  angle: number;
  /** The swing's full angular width in radians. Arc only. */
  arc: number;
  /** The real extent at progress 1: the swing's reach for Arc, the blast radius for Ground, the cloud's radius for Cloud. Unused for Ring/Line. */
  reach: number;
}

/**
 * The state a telegraphing state's own `after` transition leads to, or
 * `null` when it has none. Read the same way `chooseTransition`'s `After`
 * case does — the first `after` transition in declaration order — so a
 * wind-up and the shape warning about it can never name different attacks.
 */
function stateAfterTelegraph(compiled: CompiledEnemy, state: CompiledState): CompiledState | null {
  for (const transition of state.transitions) {
    if (transition.trigger === TransitionTrigger.After) {
      return compiled.states[transition.to] ?? null;
    }
  }
  return null;
}

/**
 * Writes the shape `index`'s current telegraph should draw into `out` and
 * returns `true` — or leaves `out` untouched and returns `false` while it is
 * not telegraphing at all, the same gate `enemyTelegraphProgress` applies.
 *
 * @hot — one call per telegraphing enemy per frame, from `EntityView.sync`.
 */
export function enemyTelegraphShape(
  sim: GameSim,
  index: number,
  out: EnemyTelegraphShapeInfo,
): boolean {
  const progress = enemyTelegraphProgress(sim, index);
  if (progress <= 0) {
    return false;
  }
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  if (state === undefined) {
    return false;
  }
  out.progress = progress;
  const selfX = sim.positionX(index);
  const selfY = sim.positionY(index);
  const follow = stateAfterTelegraph(compiled, state);

  if (state.capturesLobTarget && follow !== null && follow.detonate !== null) {
    const motion = sim.enemyMotion.data;
    const motionBase = index * ENEMY_MOTION_STRIDE;
    out.shape = TelegraphShape.Ground;
    out.x = motion[motionBase] ?? selfX;
    out.y = motion[motionBase + 1] ?? selfY;
    out.angle = 0;
    out.arc = 0;
    out.reach = follow.detonate.radius;
    return true;
  }

  // Line and Arc point at the spot the wind-up locked (`updateAimLock`), not
  // at the player: the warning holds still while they step out of it.
  if (follow !== null && follow.meleeArc !== null) {
    out.shape = TelegraphShape.Arc;
    out.x = selfX;
    out.y = selfY;
    out.angle = enemyAimAngle(sim, index);
    out.arc = follow.meleeArc.arc;
    out.reach = follow.meleeArc.reach;
    return true;
  }

  if (follow?.movement.behaviour === 'chargeAtPlayer') {
    out.shape = TelegraphShape.Line;
    out.x = selfX;
    out.y = selfY;
    out.angle = enemyAimAngle(sim, index);
    out.arc = 0;
    out.reach = 0;
    return true;
  }

  const cloud = follow?.emitCloud ?? null;
  if (cloud !== null) {
    out.shape = TelegraphShape.Cloud;
    out.x = selfX;
    out.y = selfY;
    out.angle = 0;
    out.arc = 0;
    out.reach = cloud.radius;
    return true;
  }

  out.shape = TelegraphShape.Ring;
  out.x = selfX;
  out.y = selfY;
  out.angle = 0;
  out.arc = 0;
  out.reach = 0;
  return true;
}
