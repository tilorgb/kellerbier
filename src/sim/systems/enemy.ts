import { World } from '../ecs/world.js';
import type { ChargeAtPlayerBehaviour } from '../enemy/definition.js';
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
import { applyDamageAt } from './impact.js';
import { CollisionLayer, collisionMaskFor } from '../collision/layers.js';
import { NO_SLOT } from '../pool/slot-pool.js';
import { ProjectileTeam } from '../projectile/store.js';
import { ProjectileTag } from '../projectile/tags.js';
import { ParticleKind } from '../particle/store.js';
import { nextWaypoint, straightClear, type Waypoint } from '../room/pathfind.js';
import { CLEAR_IGNORE_PITS } from '../room/geometry.js';
import {
  enemyEatProgress,
  MOTION_WOOD_TARGET,
  MOTION_WOOD_X,
  MOTION_WOOD_Y,
  stepApproachWood,
  WOOD_MOTION_SLOTS,
  WOOD_TARGET_PLANK,
} from './wood.js';

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
 * player has been out of sight. Then (#408) the state's rolled duration, and
 * a swimmer's course, current sample and target sample. Then (#410) the
 * slots `approachWood` keeps its plan in (`sim/systems/wood.ts`).
 */
export const ENEMY_MOTION_STRIDE = 16 + WOOD_MOTION_SLOTS;
/**
 * `enemyMotion` offset of the roll a ranged `after` reads (#408): a fraction
 * in [0, 1) drawn from `random.enemies` on entry to a state that has one.
 */
export const MOTION_DURATION_ROLL = 12;
/** `enemyMotion` offsets of a `swimInZone` body's place on its stream (#408). */
export const MOTION_SWIM_COURSE = 13;
export const MOTION_SWIM_SAMPLE = 14;
export const MOTION_SWIM_TARGET = 15;
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
        const left = state;
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
        enterStateExtras(sim, index, left, entered, selfX, selfY);
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

/** Spokes in the splash a fish throws breaking or leaving the surface (#408). */
const SURFACE_SPLASH_SPOKES = 8;
const SURFACE_SPLASH_SPEED = 0.9;
const SURFACE_SPLASH_TICKS = 16;

/**
 * What entering `entered` from `left` does beyond the entry behaviours (#408):
 * rolls a ranged `after`'s duration, and moves the body above or below the
 * water — off every collision layer while submerged, back on `Obstacle`
 * (every enemy's layer, `GameSim.spawnTarget`) when it surfaces — with a
 * splash either way.
 */
function enterStateExtras(
  sim: GameSim,
  index: number,
  left: CompiledState,
  entered: CompiledState,
  selfX: number,
  selfY: number,
): void {
  if (entered.rollsDuration) {
    sim.enemyMotion.data[index * ENEMY_MOTION_STRIDE + MOTION_DURATION_ROLL] =
      sim.random.enemies.nextFloat();
  }
  if (entered.submerged !== left.submerged) {
    setSubmerged(sim, index, entered.submerged);
    ring(
      sim,
      selfX,
      selfY,
      SURFACE_SPLASH_SPOKES,
      ParticleKind.Splash,
      SURFACE_SPLASH_SPEED,
      SURFACE_SPLASH_TICKS,
      2,
    );
  }
}

/**
 * Puts the body at `index` under the water (no collision layer: nothing
 * finds it) or back above it (#408). A latched body is left alone — it is
 * on no layer for its own reason (`latchToPlayer`).
 */
export function setSubmerged(sim: GameSim, index: number, submerged: boolean): void {
  if (((sim.enemy.data[index * ENEMY_STRIDE + 3] ?? 0) & ENEMY_FLAG_LATCHED) !== 0) {
    return;
  }
  const layer = submerged ? 0 : CollisionLayer.Obstacle;
  sim.collision.data[index * 2] = layer;
  sim.collision.data[index * 2 + 1] = submerged ? 0 : collisionMaskFor(CollisionLayer.Obstacle);
}

/** Whether the body at `index` is in a `submerge` state right now (#408) — the renderer's shadow, and nothing else, reads this. */
export function enemySubmerged(sim: GameSim, index: number): boolean {
  const base = index * ENEMY_STRIDE;
  const state = sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0];
  return state?.submerged === true;
}

/**
 * Settles a fresh water creature (#408) on the nearest sample of its
 * stream's course — wherever it was put down, in the water or not — and
 * remembers which course and sample it is on. Returns false when
 * the room has no stream to put it in — the caller's graceful gap.
 */
export function placeInZone(sim: GameSim, index: number): boolean {
  const courses = sim.room.streamCourses;
  if (courses.length === 0) {
    return false;
  }
  const x = sim.positionX(index);
  const y = sim.positionY(index);
  let bestCourse = 0;
  let bestSample = 0;
  let bestSq = Infinity;
  for (let course = 0; course < courses.length; course++) {
    const points = courses[course]?.points;
    if (points === undefined) {
      continue;
    }
    for (let sample = 0; sample < points.length; sample++) {
      const point = points[sample];
      if (point === undefined) {
        continue;
      }
      const dx = point.x - x;
      const dy = point.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestSq) {
        bestSq = distSq;
        bestCourse = course;
        bestSample = sample;
      }
    }
  }
  const point = courses[bestCourse]?.points[bestSample];
  if (point === undefined) {
    return false;
  }
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  motion[motionBase + MOTION_SWIM_COURSE] = bestCourse;
  motion[motionBase + MOTION_SWIM_SAMPLE] = bestSample;
  motion[motionBase + MOTION_SWIM_TARGET] = bestSample;
  // Always onto the course, not merely into the rects: where a bend is
  // tight the rects reach past the water the renderer draws, and a fish left
  // there swims as a shadow on the bank.
  if (nearestStreamPoint(sim, point.x, point.y)) {
    const transform = sim.transform.data;
    transform[index * 4] = streamPoint[0] ?? point.x;
    transform[index * 4 + 1] = streamPoint[1] ?? point.y;
    transform[index * 4 + 2] = streamPoint[0] ?? point.x;
    transform[index * 4 + 3] = streamPoint[1] ?? point.y;
  }
  return true;
}

/** How far inside a stream rect's edge a projected point lands, so float rounding never puts it on the bank. */
const STREAM_INSET = 0.5;
/** Scratch for `nearestStreamPoint` — written, never allocated. */
const streamPoint = new Float64Array(2);

/**
 * The nearest point to `(x, y)` that the simulation counts as in the water
 * (`RoomGeometry.isInStream`), written into `streamPoint` (#408). Returns
 * false when the room has no stream.
 *
 * Measured against the stream's rects, not its drawn course: the centreline
 * the renderer draws the water along and the tile-wide rects the sim stands
 * on are two approximations of one stream, and where a bend is tight a
 * centreline sample can fall just outside every rect. Projecting into the
 * rects makes the sim's own footing the definition of "in the water".
 */
function nearestStreamPoint(sim: GameSim, x: number, y: number): boolean {
  const room = sim.room;
  const streams = room.streams;
  let bestSq = Infinity;
  for (let stream = 0; stream < room.streamCount; stream++) {
    const base = stream * 4;
    const minX = (streams[base] ?? 0) + STREAM_INSET;
    const minY = (streams[base + 1] ?? 0) + STREAM_INSET;
    const maxX = (streams[base + 2] ?? 0) - STREAM_INSET;
    const maxY = (streams[base + 3] ?? 0) - STREAM_INSET;
    const px = minX > maxX ? (minX + maxX) / 2 : clamp(x, minX, maxX);
    const py = minY > maxY ? (minY + maxY) / 2 : clamp(y, minY, maxY);
    const distSq = (px - x) * (px - x) + (py - y) * (py - y);
    if (distSq < bestSq) {
      bestSq = distSq;
      streamPoint[0] = px;
      streamPoint[1] = py;
    }
  }
  return bestSq < Infinity;
}

/** How close, in room units, counts as having reached a course sample (#408). */
const SWIM_ARRIVE_DISTANCE = 1.5;

/**
 * One tick of `swimInZone` (#408): toward the current sample of the course;
 * on reaching it, one sample on toward the target; on reaching the target, a
 * new target from `random.enemies` anywhere along the course.
 */
function swimAlongCourse(
  sim: GameSim,
  index: number,
  speed: number,
  selfX: number,
  selfY: number,
): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const velocity = sim.velocity.data;
  const points = sim.room.streamCourses[motion[motionBase + MOTION_SWIM_COURSE] ?? 0]?.points;
  if (points === undefined || points.length === 0) {
    velocity[index * 2] = 0;
    velocity[index * 2 + 1] = 0;
    return;
  }
  const last = points.length - 1;
  let sample = clamp(Math.round(motion[motionBase + MOTION_SWIM_SAMPLE] ?? 0), 0, last);
  let target = clamp(Math.round(motion[motionBase + MOTION_SWIM_TARGET] ?? 0), 0, last);
  // Each sample, projected into the water the sim stands on — see
  // `nearestStreamPoint` for why a centreline sample needs it.
  let point = points[sample];
  nearestStreamPoint(sim, point?.x ?? selfX, point?.y ?? selfY);
  let dx = (streamPoint[0] ?? selfX) - selfX;
  let dy = (streamPoint[1] ?? selfY) - selfY;
  if (vectorLength(dx, dy) <= SWIM_ARRIVE_DISTANCE) {
    if (sample === target) {
      target = Math.floor(sim.random.enemies.nextFloat() * points.length);
    }
    if (sample !== target) {
      sample += target > sample ? 1 : -1;
    }
    motion[motionBase + MOTION_SWIM_SAMPLE] = sample;
    motion[motionBase + MOTION_SWIM_TARGET] = target;
    point = points[sample];
    nearestStreamPoint(sim, point?.x ?? selfX, point?.y ?? selfY);
    dx = (streamPoint[0] ?? selfX) - selfX;
    dy = (streamPoint[1] ?? selfY) - selfY;
  }
  const length = vectorLength(dx, dy);
  // Never overshoot the sample: a fast fish on a tight bend would otherwise
  // cut the corner onto the bank.
  const step = Math.min(speed, length);
  velocity[index * 2] = length === 0 ? 0 : (dx / length) * step;
  velocity[index * 2 + 1] = length === 0 ? 0 : (dy / length) * step;
  // Facing reads off the heading slots (`render/animation/state.ts`).
  if (length > 0) {
    motion[motionBase] = dx / length;
    motion[motionBase + 1] = dy / length;
  }
}

/**
 * Keeps every water creature in its water (#408), after everything that
 * moves bodies this tick — a shot's knockback on a surfaced fish, or another
 * body shouldering it, can push it onto the bank — and a straight swim
 * between two samples can clip the corner of a stepped bend. One whose
 * centre has left the stream is put on the nearest point of it.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate.
 */
export function stepZoneClamp(sim: GameSim): void {
  if (sim.room.streamCount === 0) {
    return;
  }
  const states = sim.world.states;
  const masks = sim.world.masks;
  const required = sim.enemyMask;
  const enemy = sim.enemy.data;
  const transform = sim.transform.data;
  for (let index = 0; index < sim.world.highWater; index++) {
    if (states[index] !== World.ALIVE || ((masks[index] ?? 0) & required) !== required) {
      continue;
    }
    if (sim.enemies.at(enemy[index * ENEMY_STRIDE] ?? 0).zone === null) {
      continue;
    }
    const x = transform[index * 4] ?? 0;
    const y = transform[index * 4 + 1] ?? 0;
    if (sim.room.isInStream(x, y)) {
      continue;
    }
    if (nearestStreamPoint(sim, x, y)) {
      transform[index * 4] = streamPoint[0] ?? x;
      transform[index * 4 + 1] = streamPoint[1] ?? y;
    }
  }
}

/** Room units of slack a charge's look-ahead allows before two bodies count as touching (#409). */
const IMPACT_REACH_SLACK = 1;
/** Room units past one step a charge's terrain probe looks (#409) — see `chargeImpact`. */
const IMPACT_TERRAIN_SLACK = 3;

/**
 * A `chargeAtPlayer` with `impact` (#409, the Boar): looks one step ahead
 * along the locked direction and, if something is there, hits it and ends
 * the charge — raising `ENEMY_FLAG_BLOCKED` so the state machine's
 * `onBlocked` fires next tick. Returns whether it hit anything. Bodies are
 * checked before terrain: a player pinned against a wall is hit, not the
 * wall behind them.
 */
function chargeImpact(
  sim: GameSim,
  index: number,
  impact: NonNullable<ChargeAtPlayerBehaviour['impact']>,
  dirX: number,
  dirY: number,
  speed: number,
  selfX: number,
  selfY: number,
): boolean {
  const body = sim.body.data;
  const radius = body[index * 2] ?? 0;
  const nextX = selfX + dirX * speed;
  const nextY = selfY + dirY * speed;

  const hit = firstBodyAhead(sim, index, radius, nextX, nextY);
  if (hit >= 0) {
    const damage = eliteAttackDamage(
      sim,
      index,
      (sim.contactDamage.data[index] ?? 0) * impact.bodyDamageMultiplier,
    );
    const hitX = sim.positionX(hit);
    const hitY = sim.positionY(hit);
    const spared = hit === sim.playerIndex && sim.playerInvulnerableTicks > 0;
    if (damage > 0 && !spared) {
      // The normal points back at the Boar, so `applyDamageAt` throws the
      // victim along the charge — the way it was running.
      applyDamageAt(sim, hit, damage, hitX, hitY, -dirX, -dirY, -1);
    }
    const mass = Math.max(0.01, body[hit * 2 + 1] ?? 1);
    addPush(sim, hit, (dirX * impact.knockback) / mass, (dirY * impact.knockback) / mass);
    raiseBlocked(sim, index);
    return true;
  }

  // Terrain is probed a little past one step: `stepBodies` stops a body
  // against a wall a hair before its footprint reaches it, and a probe of
  // exactly one step let that stop — an ordinary `onBlocked`, nothing
  // smashed — win the race by a tick.
  const probeX = selfX + dirX * (speed + IMPACT_TERRAIN_SLACK);
  const probeY = selfY + dirY * (speed + IMPACT_TERRAIN_SLACK);
  if (sim.room.isClear(probeX, probeY, radius)) {
    return false;
  }
  // Something solid just ahead: the point at the very front of the body.
  const frontX = probeX + dirX * (radius + IMPACT_REACH_SLACK);
  const frontY = probeY + dirY * (radius + IMPACT_REACH_SLACK);
  if (!(impact.breaksBlocks && sim.breakBlockAt(frontX, frontY)) && impact.breaksDoors) {
    sim.smashWallAt(frontX, frontY);
  }
  raiseBlocked(sim, index);
  return true;
}

/** The first body (the player, or another enemy on a collision layer) a body at `(x, y)` would overlap — or -1. */
function firstBodyAhead(sim: GameSim, self: number, radius: number, x: number, y: number): number {
  const body = sim.body.data;
  const player = sim.playerIndex;
  if (!sim.playerDead) {
    const reach = radius + (body[player * 2] ?? 0) + IMPACT_REACH_SLACK;
    const dx = sim.positionX(player) - x;
    const dy = sim.positionY(player) - y;
    if (dx * dx + dy * dy <= reach * reach) {
      return player;
    }
  }
  const states = sim.world.states;
  const masks = sim.world.masks;
  const required = sim.enemyMask;
  for (let other = 0; other < sim.world.highWater; other++) {
    if (other === self || states[other] !== World.ALIVE) {
      continue;
    }
    if (((masks[other] ?? 0) & required) !== required) {
      continue;
    }
    // A submerged fish or a latched tick is not there to be hit.
    if ((sim.collision.data[other * 2] ?? 0) === 0) {
      continue;
    }
    const reach = radius + (body[other * 2] ?? 0) + IMPACT_REACH_SLACK;
    const dx = sim.positionX(other) - x;
    const dy = sim.positionY(other) - y;
    if (dx * dx + dy * dy <= reach * reach) {
      return other;
    }
  }
  return -1;
}

/** Sets `ENEMY_FLAG_BLOCKED` on `index`, read by an `onBlocked` transition next tick. */
function raiseBlocked(sim: GameSim, index: number): void {
  const flagSlot = index * ENEMY_STRIDE + 3;
  sim.enemy.data[flagSlot] = (sim.enemy.data[flagSlot] ?? 0) | ENEMY_FLAG_BLOCKED;
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
      case TransitionTrigger.After: {
        let after = transition.value;
        if (transition.max > transition.value) {
          // A ranged `after` (#408), placed by the roll its state took on entry.
          const roll =
            sim.enemyMotion.data[index * ENEMY_MOTION_STRIDE + MOTION_DURATION_ROLL] ?? 0;
          after += Math.min(
            transition.max - transition.value,
            Math.floor(roll * (transition.max - transition.value + 1)),
          );
        }
        if (ticks >= stateDuration(sim, state, after)) {
          return transition.to;
        }
        break;
      }
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
      case TransitionTrigger.PlayerOnAxis: {
        // The Boar's trigger (#409): the player crossed one of its four axis
        // lines. The cheap test first; sight only once it passes.
        if (
          Math.abs(toPlayerX) > transition.tolerance &&
          Math.abs(toPlayerY) > transition.tolerance
        ) {
          break;
        }
        if (sighted < 0) {
          sighted = isSighted(sim, index, toPlayerX, toPlayerY) ? 1 : 0;
        }
        if (sighted === 1) {
          return transition.to;
        }
        break;
      }
      case TransitionTrigger.PlayerDiagonalAdjacent: {
        // A pawn's capture square (#407): the player's offset, folded into
        // one quadrant, within `tolerance` of (step, step). Never mid-hop, so
        // the wind-up only ever starts from a standstill.
        if (state.movement.behaviour === 'hopCardinal' && !isResting(state.movement, ticks)) {
          break;
        }
        const offX = Math.abs(toPlayerX) - transition.value;
        const offY = Math.abs(toPlayerY) - transition.value;
        if (offX * offX + offY * offY > transition.tolerance * transition.tolerance) {
          break;
        }
        if (sighted < 0) {
          sighted = isSighted(sim, index, toPlayerX, toPlayerY) ? 1 : 0;
        }
        if (sighted === 1) {
          return transition.to;
        }
        break;
      }
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
        if (behaviour.snap === undefined) {
          motion[motionBase] = aimDistance === 0 ? 1 : aimX / aimDistance;
          motion[motionBase + 1] = aimDistance === 0 ? 0 : aimY / aimDistance;
        } else {
          // Snapped to the four axes or the four diagonals (#407, #409) —
          // the same snap `enemyTelegraphShape` gives the warning line.
          const free = aimDistance === 0 ? 0 : Math.atan2(aimY, aimX);
          const snapped =
            behaviour.snap === 'diagonal' ? snapToDiagonal(free) : snapToCardinal(free);
          motion[motionBase] = Math.cos(snapped);
          motion[motionBase + 1] = Math.sin(snapped);
        }
      }
      let speed = behaviour.speed * scale;
      if (behaviour.maxDistance !== undefined) {
        // A leap, not a run (#407): this tick covers only what is left of
        // `maxDistance`, then nothing for the rest of the state.
        speed = clamp(behaviour.maxDistance - ticks * speed, 0, speed);
      }
      if (
        behaviour.impact !== undefined &&
        speed > 0 &&
        chargeImpact(
          sim,
          index,
          behaviour.impact,
          motion[motionBase] ?? 0,
          motion[motionBase + 1] ?? 0,
          speed,
          selfX,
          selfY,
        )
      ) {
        speed = 0;
      }
      velocity[base] = (motion[motionBase] ?? 0) * speed;
      velocity[base + 1] = (motion[motionBase + 1] ?? 0) * speed;
      return;
    }
    case 'swimInZone': {
      swimAlongCourse(sim, index, behaviour.speed * scale, selfX, selfY);
      return;
    }
    case 'approachWood': {
      stepApproachWood(sim, index, behaviour, behaviour.speed * scale, motionBase, selfX, selfY);
      return;
    }
    case 'hopCardinal': {
      const hopTicks = Math.max(1, Math.round(behaviour.hopTicks));
      const cycle = hopTicks + Math.max(0, Math.round(behaviour.restTicks));
      const phase = ticks % cycle;
      const distanceScaled = behaviour.hopDistance * scale;
      if (phase === 0) {
        chooseHopDirection(sim, index, selfX, selfY, distanceScaled);
      }
      if (phase >= hopTicks) {
        velocity[base] = 0;
        velocity[base + 1] = 0;
        return;
      }
      // A sine-eased hop that sums to exactly `hopDistance` over `hopTicks`:
      // Σ sin(π(i+½)/n) over i < n is 1 / sin(π/2n).
      const speed =
        distanceScaled *
        Math.sin((Math.PI * (phase + 0.5)) / hopTicks) *
        Math.sin(Math.PI / (2 * hopTicks));
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
 * `angle` snapped to the nearest of the four diagonals — the Kaninchen's
 * pawn capture (#407): whichever diagonal the target is most along.
 */
export function snapToDiagonal(angle: number): number {
  const quarter = Math.PI / 2;
  return Math.round((angle - quarter / 2) / quarter) * quarter + quarter / 2;
}

/** The four axes in turn, as x then y — `chooseHopDirection` walks them from a random start. */
const HOP_DIRECTIONS = new Int8Array([1, 0, 0, 1, -1, 0, 0, -1]);

/**
 * Picks this hop's axis (#407): a random one of the four from the enemy
 * stream, passing over any whose landing spot (or the midpoint on the way)
 * is inside a wall or an obstacle for the next in turn. With none clear the
 * heading is zeroed and the body rests through the cycle.
 */
function chooseHopDirection(
  sim: GameSim,
  index: number,
  selfX: number,
  selfY: number,
  distance: number,
): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const radius = sim.body.data[index * 2] ?? 0;
  const start = Math.floor(sim.random.enemies.nextFloat() * 4);
  for (let step = 0; step < 4; step++) {
    const slot = ((start + step) % 4) * 2;
    const dirX = HOP_DIRECTIONS[slot] ?? 0;
    const dirY = HOP_DIRECTIONS[slot + 1] ?? 0;
    if (
      sim.room.isClear(selfX + dirX * distance, selfY + dirY * distance, radius) &&
      sim.room.isClear(selfX + (dirX * distance) / 2, selfY + (dirY * distance) / 2, radius)
    ) {
      motion[motionBase] = dirX;
      motion[motionBase + 1] = dirY;
      return;
    }
  }
  motion[motionBase] = 0;
  motion[motionBase + 1] = 0;
}

/** Whether a `hopCardinal` body is between hops at `ticks` into its state. */
function isResting(
  hop: { readonly hopTicks: number; readonly restTicks: number },
  ticks: number,
): boolean {
  const hopTicks = Math.max(1, Math.round(hop.hopTicks));
  const cycle = hopTicks + Math.max(0, Math.round(hop.restTicks));
  return ticks % cycle >= hopTicks;
}

/**
 * How far through its current hop a `hopCardinal` body is, 0 to 1 — 0 while
 * resting, and for every other movement. Read by the renderer for the hop's
 * bob (#407); derived from the state counter like everything else here.
 */
export function enemyHopProgress(sim: GameSim, index: number): number {
  const base = index * ENEMY_STRIDE;
  const state = sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0];
  if (state?.movement.behaviour !== 'hopCardinal') {
    return 0;
  }
  const hop = state.movement;
  const hopTicks = Math.max(1, Math.round(hop.hopTicks));
  const cycle = hopTicks + Math.max(0, Math.round(hop.restTicks));
  const phase = (sim.enemy.data[base + 2] ?? 0) % cycle;
  if (phase >= hopTicks) {
    return 0;
  }
  const motionBase = index * ENEMY_MOTION_STRIDE;
  if (
    (sim.enemyMotion.data[motionBase] ?? 0) === 0 &&
    (sim.enemyMotion.data[motionBase + 1] ?? 0) === 0
  ) {
    return 0;
  }
  return (phase + 0.5) / hopTicks;
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

    if (shot.behaviour === 'fireRing') {
      // `fireOnBeat`'s ring on the state's own clock (#408): it aims at
      // nothing, so like the beat ring it is not gated on sight.
      if (phase === 0) {
        const shots = Math.max(1, Math.round(shot.shots));
        const step = (Math.PI * 2) / shots;
        const offset = shot.angleOffset ?? 0;
        for (let ray = 0; ray < shots; ray++) {
          fireOne(sim, index, offset + step * ray, shot);
        }
      }
      continue;
    }

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
  if (!sim.room.isClear(muzzleX, muzzleY, radius, CLEAR_IGNORE_PITS)) {
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

/** Reusable scratch struct for `enemyEatMark`, written in place so a render loop never allocates. */
export interface EnemyEatMarkInfo {
  /** 0..1 through eating the plank. */
  progress: number;
  /** The plank's centre. */
  x: number;
  y: number;
}

/**
 * The floor plank the body at `index` is eating (#410's telegraph): written to
 * `out`, true while it is part-way through one. The renderer darkens the
 * plank by `progress`, so the one about to give way is the one going dark
 * under the swarm. A wooden block being eaten shows its splinters only — it
 * stands over its own floor, where a mark could not be seen.
 */
export function enemyEatMark(sim: GameSim, index: number, out: EnemyEatMarkInfo): boolean {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return false;
  }
  const base = index * ENEMY_STRIDE;
  const state = sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0];
  const movement = state?.movement;
  if (movement?.behaviour !== 'approachWood') {
    return false;
  }
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const motion = sim.enemyMotion.data;
  if ((motion[motionBase + MOTION_WOOD_TARGET] ?? 0) !== WOOD_TARGET_PLANK) {
    return false;
  }
  const progress = enemyEatProgress(sim, motionBase, movement.eatTicks);
  if (progress <= 0) {
    return false;
  }
  out.progress = progress;
  out.x = motion[motionBase + MOTION_WOOD_X] ?? 0;
  out.y = motion[motionBase + MOTION_WOOD_Y] ?? 0;
  return true;
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
    const snap = follow.movement.snap;
    const aim = enemyAimAngle(sim, index);
    out.shape = TelegraphShape.Line;
    out.x = selfX;
    out.y = selfY;
    out.angle =
      snap === 'diagonal' ? snapToDiagonal(aim) : snap === 'cardinal' ? snapToCardinal(aim) : aim;
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
