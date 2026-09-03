import { World } from '../ecs/world.js';
import {
  type CompiledDetonation,
  type CompiledMeleeArc,
  type CompiledState,
  type FiringBehaviour,
  TransitionTrigger,
} from '../enemy/registry.js';
import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { muzzleFlash } from '../particle/effects.js';
import { clamp, vectorLength } from '../math.js';
import { addPush } from './movement.js';
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
 * An elite spawn (#156) — rolled once, at spawn (`GameSim.spawnEnemyKind`),
 * and never cleared: unlike `ENEMY_FLAG_HIT`/`ENEMY_FLAG_BLOCKED`, this bit
 * is not part of the per-tick clear below, since it describes the body
 * itself rather than something that happened to it this tick.
 */
export const ENEMY_FLAG_ELITE = 1 << 2;

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
    const flags = enemy[base + 3] ?? 0;

    let state = compiled.states[stateIndex];
    if (state === undefined) {
      continue;
    }

    const toPlayerX = playerX - sim.positionX(index);
    const toPlayerY = playerY - sim.positionY(index);
    const distance = vectorLength(toPlayerX, toPlayerY);

    const selfX = sim.positionX(index);
    const selfY = sim.positionY(index);

    const next = chooseTransition(sim, state, ticks, flags, distance, selfX, selfY);
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
        if (entered.grabProp !== null) {
          grabNearestProp(sim, index, entered.grabProp);
        }
        if (entered.meleeArc !== null) {
          lockMeleeAim(sim, index, toPlayerX, toPlayerY, distance);
        }
      }
    }

    // Both signals are consumed whether or not this state listened for them.
    // A hit remembered across three states fires the next `onHit` transition
    // for a shot that landed a second ago.
    enemy[base + 1] = stateIndex;
    enemy[base + 3] = flags & ~(ENEMY_FLAG_HIT | ENEMY_FLAG_BLOCKED);

    if (crossesSplitThreshold(sim, index, state)) {
      // Ages the body into its next phase right now rather than waiting for
      // combat to land the killing blow — `forceEnemyDeath` runs the same
      // package a real kill does, so `stepEnemyDeaths` sees an ordinary
      // death in this state and splits it exactly as `state.splits` says.
      sim.forceEnemyDeath(index);
      continue;
    }

    applyMovement(sim, index, state, ticks, toPlayerX, toPlayerY, distance, selfX, selfY);
    if (state.firing.length > 0) {
      applyFiring(sim, index, state, ticks, toPlayerX, toPlayerY, distance);
    }
    if (state.meleeArc !== null) {
      applyMeleeArc(sim, index, state.meleeArc, ticks, selfX, selfY);
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
  selfX: number,
  selfY: number,
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

/** Where the body goes this tick. Exactly one of these runs per state. */
function applyMovement(
  sim: GameSim,
  index: number,
  state: CompiledState,
  ticks: number,
  toPlayerX: number,
  toPlayerY: number,
  distance: number,
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

    if (shot.behaviour === 'fireOnBeat') {
      if (sim.tick % interval === 0) {
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
      if (phase === 0 && isSighted(sim, index, toPlayerX, toPlayerY)) {
        fireOne(sim, index, aim, shot);
      }
      continue;
    }
    if (shot.behaviour === 'fireBurst') {
      const gap = Math.max(1, Math.round(shot.gapTicks));
      if (
        phase % gap === 0 &&
        phase / gap < shot.shots &&
        isSighted(sim, index, toPlayerX, toPlayerY)
      ) {
        fireOne(sim, index, aim, shot);
      }
      continue;
    }
    if (phase === 0 && isSighted(sim, index, toPlayerX, toPlayerY)) {
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
 * False when a hop trellis (#37) sits between the shooter and the player —
 * gates the three aimed firing primitives (`fireAtPlayer`/`fireBurst`/
 * `fireSpread`), not `fireOnBeat`: a sound ring is a room-filling shape, not
 * a shot aimed at where the player is standing.
 *
 * Called only on the tick a shot would actually fire (each caller's own
 * `phase === 0` — or, for `fireBurst`, its own gap check — comes first), not
 * once per enemy per tick: an aimed enemy fires far less often than it
 * thinks about firing, and there is no reason to pay for a sight check on
 * every one of the ticks in between. `sightBlockCount === 0` short-circuits
 * the segment test itself on every floor that has none (every floor but
 * Dorf & Acker, today), so this costs nothing where it doesn't apply.
 */
function isSighted(sim: GameSim, index: number, toPlayerX: number, toPlayerY: number): boolean {
  if (sim.room.sightBlockCount === 0) {
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
    0,
    // Which sprite this shot is drawn as, if its behaviour named one (#152).

    // Resolved through the roster's interned name table rather than carried as
    // a string, so nothing in the frame loop compares one.
    sim.enemies.artIndexOf(shot.art),
  );
  // "Something over there just shot" is worth a frame of warning at the edge
  // of vision (#153), and an enemy's muzzle flashing where the player's does
  // not is how a game teaches that enemy shots come from nowhere.
  muzzleFlash(sim, muzzleX, muzzleY);
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
 * itself, so a lobbed bomb never catches its own thrower in its blast.
 */
function detonateLobbedBomb(sim: GameSim, index: number, detonation: CompiledDetonation): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const x = motion[motionBase] ?? sim.positionX(index);
  const y = motion[motionBase + 1] ?? sim.positionY(index);
  sim.applySplashDamage(x, y, detonation.radius, detonation.damage, index);
  // #243: `applySplashDamage` alone leaves the blast itself invisible — a
  // real hit already flashes on whatever it caught, but there was nothing at
  // the landing spot for a player who dodged, or who was hit from off to one
  // side, to actually see.
  sim.splashBurst(x, y, detonation.radius);
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
  sim.events.push(EventKind.Contact, playerIndex, index, selfX, selfY, nx, ny, swing.damage);
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
