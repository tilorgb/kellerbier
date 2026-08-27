import { World } from '../ecs/world.js';
import type { EnemyBehaviour } from '../enemy/definition.js';
import { type CompiledState, type FiringBehaviour, TransitionTrigger } from '../enemy/registry.js';
import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { clamp, vectorLength } from '../math.js';
import { ProjectileTeam } from '../projectile/store.js';

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
 * Ticks a body may sit in one state before the counter stops climbing.
 *
 * Well inside Int16, and nine minutes of standing still. Clamping rather than
 * wrapping matters: a wrapped counter would make an `after` transition fire
 * again out of nowhere in a room somebody left running.
 */
const MAX_STATE_TICKS = 32000;

/** Fields of the `enemy` component: definition, state, ticks in state, flags. */
export const ENEMY_STRIDE = 4;
/** Fields of the `enemyMotion` component: heading x and y, then the spawn point. */
export const ENEMY_MOTION_STRIDE = 4;

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

    const base = index * ENEMY_STRIDE;
    const compiled = registry.at(enemy[base] ?? 0);
    let stateIndex = enemy[base + 1] ?? 0;
    let ticks = enemy[base + 2] ?? 0;
    const flags = enemy[base + 3] ?? 0;

    let state = compiled.states[stateIndex];
    if (state === undefined) {
      continue;
    }

    const toPlayerX = playerX - sim.positionX(index);
    const toPlayerY = playerY - sim.positionY(index);
    const distance = vectorLength(toPlayerX, toPlayerY);

    const next = chooseTransition(sim, state, ticks, flags, distance);
    if (next >= 0) {
      const entered = compiled.states[next];
      if (entered !== undefined) {
        stateIndex = next;
        state = entered;
        ticks = 0;
      }
    }

    // Both signals are consumed whether or not this state listened for them.
    // A hit remembered across three states fires the next `onHit` transition
    // for a shot that landed a second ago.
    enemy[base + 1] = stateIndex;
    enemy[base + 3] = flags & ~(ENEMY_FLAG_HIT | ENEMY_FLAG_BLOCKED);

    applyMovement(sim, index, state.movement, ticks, toPlayerX, toPlayerY, distance);
    if (state.firing.length > 0) {
      applyFiring(sim, index, state, ticks, toPlayerX, toPlayerY, distance);
    }

    enemy[base + 2] = ticks < MAX_STATE_TICKS ? ticks + 1 : ticks;
  }
}

/**
 * The first transition that matches, or -1.
 *
 * Declaration order decides, so what a state machine does is a function of the
 * text somebody wrote rather than of a priority rule they have to remember.
 */
function chooseTransition(
  sim: GameSim,
  state: CompiledState,
  ticks: number,
  flags: number,
  distance: number,
): number {
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
      case TransitionTrigger.PlayerWithin:
        if (distance <= transition.value) {
          return transition.to;
        }
        break;
      case TransitionTrigger.PlayerBeyond:
        if (distance > transition.value) {
          return transition.to;
        }
        break;
      default:
        break;
    }
  }
  return -1;
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

/** Where the body goes this tick. Exactly one of these runs per state. */
function applyMovement(
  sim: GameSim,
  index: number,
  behaviour: EnemyBehaviour,
  ticks: number,
  toPlayerX: number,
  toPlayerY: number,
  distance: number,
): void {
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
      velocity[base] = distance === 0 ? 0 : (toPlayerX / distance) * speed;
      velocity[base + 1] = distance === 0 ? 0 : (toPlayerY / distance) * speed;
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
      // telegraph before it a lie.
      if (ticks === 0) {
        motion[motionBase] = distance === 0 ? 1 : toPlayerX / distance;
        motion[motionBase + 1] = distance === 0 ? 0 : toPlayerY / distance;
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
      const correction = clamp((behaviour.radius - out) * 0.1, -speed, speed);
      velocity[base] = tangentX * speed - radialX * correction;
      velocity[base + 1] = tangentY * speed - radialY * correction;
      return;
    }
    default:
      return;
  }
}

/** Everything the state puts in the air this tick. */
function applyFiring(
  sim: GameSim,
  index: number,
  state: CompiledState,
  ticks: number,
  toPlayerX: number,
  toPlayerY: number,
  distance: number,
): void {
  const scale = sim.tuning.enemy.fireIntervalScale;
  const aim = distance === 0 ? 0 : Math.atan2(toPlayerY, toPlayerX);

  for (const shot of state.firing) {
    const interval = Math.max(1, Math.round(shot.everyTicks * scale));
    const phase = ticks % interval;

    if (shot.behaviour === 'fireAtPlayer') {
      if (phase === 0) {
        fireOne(sim, index, aim, shot);
      }
      continue;
    }
    if (shot.behaviour === 'fireBurst') {
      const gap = Math.max(1, Math.round(shot.gapTicks));
      if (phase % gap === 0 && phase / gap < shot.shots) {
        fireOne(sim, index, aim, shot);
      }
      continue;
    }
    if (phase === 0) {
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
 * Puts one projectile in the air.
 *
 * The muzzle sits outside the body, and falls back to its centre when that
 * would put the shot inside a wall — the same rule the player's own weapon
 * uses, and for the same reason: a turret against a wall that produces no shot
 * at all reads as the game having broken rather than as cover working.
 */
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
  sim.projectiles.spawn(
    muzzleX,
    muzzleY,
    directionX * speed,
    directionY * speed,
    radius,
    shot.damage,
    Math.max(1, Math.round(shot.lifetimeTicks)),
    ProjectileTeam.Enemy,
  );
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

  for (const split of state.splits) {
    const count = Math.max(0, Math.round(split.count));
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
      sim.spawnEnemyKind(split.definition, x, y);
    }
  }
}

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
