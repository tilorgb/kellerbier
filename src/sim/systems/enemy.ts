import { World } from '../ecs/world.js';
import type { ChargeAtPlayerBehaviour, ShoalBehaviour } from '../enemy/definition.js';
import {
  type CompiledDetonation,
  type CompiledEnemy,
  type CompiledFireBeam,
  type CompiledFireSweep,
  type CompiledMeleeArc,
  type CompiledState,
  type CompiledVolleyBurst,
  type FiringBehaviour,
  TransitionTrigger,
} from '../enemy/registry.js';
import { EventKind } from '../events/queue.js';
import { LOG_MASS, propKindIndex } from '../game/prop-kinds.js';
import type { GameSim } from '../game/sim.js';
import { boulderDebris, drumChips, muzzleFlash, ring } from '../particle/effects.js';
import { clamp, vectorLength } from '../math.js';
import { addPush } from './movement.js';
import { dazeAllowsAdvance, isDazed } from './status-effects.js';
import { applyDamageAt } from './impact.js';
import { CollisionLayer, collisionMaskFor } from '../collision/layers.js';
import { NO_SLOT } from '../pool/slot-pool.js';
import { ProjectileTeam } from '../projectile/store.js';
import { ProjectileTag } from '../projectile/tags.js';
import { finalizeProjectileTags } from '../projectile/behavior.js';
import { applyFreeze } from './status-effects.js';
import { ParticleKind } from '../particle/store.js';
import { nextWaypoint, straightClear, type Waypoint } from '../room/pathfind.js';
import { CLEAR_IGNORE_DESTRUCTIBLE, CLEAR_IGNORE_PITS } from '../room/geometry.js';
import { nearestWallPoint } from '../room/perch.js';
import { slotAngle, slotInGap } from '../enemy/rotating-ring.js';
import {
  captureLine,
  captureVolley,
  chooseWeighted,
  glideToPoint,
  LineEnd,
  readLine,
  rideAlongLine,
  SCRIPTED_MOTION_SLOTS,
  stepRide,
  volleyCount,
  volleyPoint,
} from './scripted-moves.js';
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
/** A target-seeking movement reached its target (#411) — `onArrived`. Cleared once read. */
export const ENEMY_FLAG_ARRIVED = 1 << 7;
/** The flags that are signals rather than conditions: consumed every tick, whether a state listened or not. */
const ENEMY_SIGNAL_FLAGS =
  ENEMY_FLAG_HIT |
  ENEMY_FLAG_BLOCKED |
  ENEMY_FLAG_JUST_LATCHED |
  ENEMY_FLAG_SHAKEN_OFF |
  ENEMY_FLAG_ARRIVED;

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
 * slots `approachWood` keeps its plan in (`sim/systems/wood.ts`), after
 * them a `hopTowardPlayer` body's own hop clock, then (#411) a percher's wall
 * point and the way it faces there, then a `flyLoops` body's loop.
 */
export const ENEMY_MOTION_STRIDE = 16 + WOOD_MOTION_SLOTS + 3 + 4 + 6 + SCRIPTED_MOTION_SLOTS + 1;
/** A `slalom` body's base heading, in radians (#40) — the last slot of the row. */
const MOTION_SLALOM_BASE = ENEMY_MOTION_STRIDE - 1;
/**
 * Where `scripted-moves.ts`'s slots start in a body's row (#412, #413): the
 * boss moves' own ride clock, captured line, weighted-choice memory and
 * volley points, after a percher's.
 */
const MOTION_SCRIPTED = 16 + WOOD_MOTION_SLOTS + 3 + 4 + 6;
/**
 * `enemyMotion` offsets of a `returnToPerch` body's perch (#411): the wall
 * point it is flying to, and the direction into the room it faces there.
 */
const MOTION_PERCH_X = 16 + WOOD_MOTION_SLOTS + 3;
const MOTION_PERCH_Y = MOTION_PERCH_X + 1;
const MOTION_PERCH_NORMAL_X = MOTION_PERCH_X + 2;
const MOTION_PERCH_NORMAL_Y = MOTION_PERCH_X + 3;
/**
 * `enemyMotion` offsets of a `flyLoops` body's loop: the point it loops about,
 * the way that point is drifting, the angle round the loop, and which way
 * round (+1 or -1).
 */
const MOTION_LOOP_X = MOTION_PERCH_X + 4;
const MOTION_LOOP_Y = MOTION_LOOP_X + 1;
const MOTION_LOOP_DRIFT_X = MOTION_LOOP_X + 2;
const MOTION_LOOP_DRIFT_Y = MOTION_LOOP_X + 3;
const MOTION_LOOP_ANGLE = MOTION_LOOP_X + 4;
const MOTION_LOOP_SPIN = MOTION_LOOP_X + 5;
/**
 * `enemyMotion` offset of the roll a ranged `after` reads (#408): a fraction
 * in [0, 1) drawn from `random.enemies` on entry to a state that has one.
 */
export const MOTION_DURATION_ROLL = 12;
/** `enemyMotion` offsets of a `swimInZone` body's place on its stream (#408). */
export const MOTION_SWIM_COURSE = 13;
export const MOTION_SWIM_SAMPLE = 14;
export const MOTION_SWIM_TARGET = 15;
/**
 * `enemyMotion` offsets of a `hopTowardPlayer` body's hop clock (the Zecke):
 * the state tick its current hop began, the state tick its next one begins,
 * and how many hops it has made in this state. Its own rather than the
 * state's `ticks % cycle`, because every rest is rolled — a room of ticks
 * hopping in lockstep read as one hivemind. After `approachWood`'s slots, so
 * the two never share one (`ENEMY_MOTION_STRIDE` counts all three).
 */
const MOTION_HOP_START = 16 + WOOD_MOTION_SLOTS;
const MOTION_HOP_NEXT = MOTION_HOP_START + 1;
const MOTION_HOP_COUNT = MOTION_HOP_START + 2;
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
        if (entered.capturesLine) {
          captureLine(sim, index, index * ENEMY_MOTION_STRIDE + MOTION_SCRIPTED, selfX, selfY);
        }
        if (entered.volley !== null) {
          captureVolley(sim, index * ENEMY_MOTION_STRIDE + MOTION_SCRIPTED, entered.volley);
        }
        if (entered.volleyBurst !== null) {
          detonateVolley(sim, index, entered.volleyBurst);
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
        if (entered.rollLog !== null) {
          rollNearestLog(sim, index, entered.rollLog, selfX, selfY, playerX);
        }
        if (entered.becomeProp !== null) {
          const prop = entered.becomeProp;
          const radius = prop.radius > 0 ? prop.radius : (sim.hurtbox.data[index * 2] ?? 6);
          sim.events.push(
            EventKind.EnemyBecomeProp,
            index,
            prop.kind,
            selfX,
            selfY,
            0,
            radius,
            prop.health,
          );
        }
        // The audio half of the telegraph ring (#234): fired once, on the
        // tick the state begins, not once per tick spent telegraphing — the
        // ring itself is read continuously (`enemyTelegraphProgress`), but a
        // "rising tone under a wind-up" only makes sense as a cue with a
        // start.
        if (entered.telegraphTicks > 0) {
          // `value` 1 marks the wind-up of a laser (#40), which has its own charging sound.
          const follow = stateAfterTelegraph(compiled, entered);
          const beamAhead = follow !== null && follow.fireBeam !== null;
          sim.events.push(
            EventKind.AttackWindup,
            index,
            NO_SLOT,
            selfX,
            selfY,
            0,
            0,
            beamAhead ? 1 : 0,
          );
        }
      }
    }

    // On a state's first tick — entered by a transition just now, or the
    // initial state on the body's first live tick — not only on a transition,
    // so a boss that *spawns* mid-wind-up (Die Zapfhahn-Orgel) locks too.
    if (ticks === 0) {
      flags = updateAimLock(sim, index, state, flags, playerX, playerY);
      if (state.phaseShiftShake > 0) {
        // A boss changing phase (#437): the sting, and the camera shudders.
        sim.events.push(EventKind.EnemySplit, index, NO_SLOT, selfX, selfY, 0, 0, 0);
        sim.addShake(0, 1, state.phaseShiftShake);
      }
    }
    if (state.telegraphTicks > 0) {
      // A wind-up ahead of a dive to a point (#411) keeps its aim on the
      // player for its whole length, so the dive goes where they stood as it
      // began — and the warning line, which reads the same lock, follows
      // them until then rather than pointing at where they used to be.
      if (divesToPoint(compiled, state)) {
        const motionBase = index * ENEMY_MOTION_STRIDE;
        sim.enemyMotion.data[motionBase + 4] = playerX;
        sim.enemyMotion.data[motionBase + 5] = playerY;
      }
      // Chips only off the wall it sits on: a drumroll in the air (the
      // Specht winding up over the floor) has no wood to hammer.
      if (
        compiled.telegraphDrum &&
        ticks % DRUM_CHIP_EVERY_TICKS === 0 &&
        onPerch(sim, index, selfX, selfY)
      ) {
        drumChips(sim, selfX, selfY);
      }
    }
    let aimX = toPlayerX;
    let aimY = toPlayerY;
    if ((flags & ENEMY_FLAG_AIM_LOCKED) !== 0) {
      const motionBase = index * ENEMY_MOTION_STRIDE;
      aimX = (sim.enemyMotion.data[motionBase + 4] ?? playerX) - selfX;
      aimY = (sim.enemyMotion.data[motionBase + 5] ?? playerY) - selfY;
    }
    const aimDistance = vectorLength(aimX, aimY);
    if (
      ticks === 0 &&
      (state.meleeArc !== null || state.fireSweep !== null || state.fireBeam !== null)
    ) {
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
    if (state.fireSweep !== null) {
      applyFireSweep(sim, index, state.fireSweep, ticks, selfX, selfY);
    }
    if (state.fireBeam !== null) {
      applyFireBeam(sim, index, state.fireBeam, ticks, selfX, selfY);
    }
    if (state.summons.length > 0) {
      queueSummonWaves(sim, index, state, ticks, selfX, selfY);
    }
    if (state.propDrops.length > 0) {
      queuePropDrops(sim, index, state, ticks, selfX, selfY);
    }

    // A dazed body's state counter crawls (`dazeAllowsAdvance`): telegraphs,
    // rests and bursts all stretch, which is what "shoots slower" is.
    const dazeHolds = isDazed(sim, index) && !dazeAllowsAdvance(sim, index);
    enemy[base + 2] = ticks < MAX_STATE_TICKS && !dazeHolds ? ticks + 1 : ticks;
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
  // Off the arena (#412): the same removal from every collision layer, no splash.
  if (entered.hidden !== left.hidden && !entered.submerged && !left.submerged) {
    setSubmerged(sim, index, entered.hidden);
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
  // Under the ground (#40, the Murmeltier): the same removal from every
  // collision layer a dive takes, and a puff of snow where it goes under or
  // comes up.
  if (entered.burrowed !== left.burrowed && !entered.submerged && !left.submerged) {
    setSubmerged(sim, index, entered.burrowed);
    ring(
      sim,
      selfX,
      selfY,
      SURFACE_SPLASH_SPOKES,
      ParticleKind.Snow,
      SURFACE_SPLASH_SPEED,
      SURFACE_SPLASH_TICKS,
      2,
    );
  }
}

/** Whether the body at `index` is in a `burrow` state right now (#40) — the renderer's mound, and the bodies pass, read this. */
export function enemyBurrowed(sim: GameSim, index: number): boolean {
  const base = index * ENEMY_STRIDE;
  const state = sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0];
  return state?.burrowed === true;
}

/**
 * Whether the enemy body at `index` crosses the room's furniture, water and
 * pits this tick (`moveBody`'s `overfly`): a `flying` body always (#411), a
 * burrowed one (#40, under it all), and a charge that `climbsBlocks` (#40,
 * the Steinbock) for as long as the charge lasts.
 */
export function enemyOverflies(sim: GameSim, index: number): boolean {
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  if (compiled.flying) {
    return true;
  }
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  if (state === undefined) {
    return false;
  }
  return (
    state.burrowed ||
    (state.movement.behaviour === 'chargeAtPlayer' && state.movement.climbsBlocks === true)
  );
}

/** How hard two touching shoal-mates push apart, against a cohesion and pull of about 1 each. */
const SHOAL_SEPARATION = 3;

/**
 * One tick of `shoal` (#40): the heading turns toward the shoal's centre, the
 * player and away from a too-close shoal-mate, keeps `inertia` of itself,
 * and the body moves along it at `speed`. The heading lives in the motion
 * row's heading slots, which is what the body's art turns to face.
 */
function shoalStep(
  sim: GameSim,
  index: number,
  behaviour: ShoalBehaviour,
  selfX: number,
  selfY: number,
  toPlayerX: number,
  toPlayerY: number,
  distance: number,
  scale: number,
): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const kind = sim.enemy.data[index * ENEMY_STRIDE] ?? 0;
  const states = sim.world.states;
  const masks = sim.world.masks;
  const required = sim.enemyMask;
  const enemy = sim.enemy.data;
  let sumX = 0;
  let sumY = 0;
  let mates = 0;
  let awayX = 0;
  let awayY = 0;
  const spacing = behaviour.spacing;
  for (let other = 0; other < sim.world.highWater; other++) {
    if (other === index || states[other] !== World.ALIVE) {
      continue;
    }
    if (((masks[other] ?? 0) & required) !== required) {
      continue;
    }
    if ((enemy[other * ENEMY_STRIDE] ?? -1) !== kind) {
      continue;
    }
    const otherX = sim.positionX(other);
    const otherY = sim.positionY(other);
    sumX += otherX;
    sumY += otherY;
    mates += 1;
    const dx = selfX - otherX;
    const dy = selfY - otherY;
    const apart = vectorLength(dx, dy);
    if (apart > 0 && apart < spacing) {
      // The closer, the harder the push: `SHOAL_SEPARATION` at touching,
      // none at `spacing` — weighted above the pulls, or a tight shoal's
      // cohesion simply wins and the bells stack.
      const weight = ((spacing - apart) / spacing) * SHOAL_SEPARATION;
      awayX += (dx / apart) * weight;
      awayY += (dy / apart) * weight;
    }
  }
  let wantX = 0;
  let wantY = 0;
  if (mates > 0) {
    const centreX = sumX / mates - selfX;
    const centreY = sumY / mates - selfY;
    const toCentre = vectorLength(centreX, centreY);
    if (toCentre > 0) {
      wantX += (centreX / toCentre) * behaviour.cohesion;
      wantY += (centreY / toCentre) * behaviour.cohesion;
    }
  }
  if (distance > 0) {
    wantX += (toPlayerX / distance) * behaviour.pull;
    wantY += (toPlayerY / distance) * behaviour.pull;
  }
  wantX += awayX;
  wantY += awayY;
  const wantLength = vectorLength(wantX, wantY);
  let headingX = motion[motionBase] ?? 0;
  let headingY = motion[motionBase + 1] ?? 0;
  if (wantLength > 0) {
    const keep = behaviour.inertia;
    headingX = headingX * keep + (wantX / wantLength) * (1 - keep);
    headingY = headingY * keep + (wantY / wantLength) * (1 - keep);
  }
  const headingLength = vectorLength(headingX, headingY);
  if (headingLength === 0) {
    // Nothing pulls and nothing was going: face the player and start.
    headingX = distance === 0 ? 1 : toPlayerX / distance;
    headingY = distance === 0 ? 0 : toPlayerY / distance;
  } else {
    headingX /= headingLength;
    headingY /= headingLength;
  }
  motion[motionBase] = headingX;
  motion[motionBase + 1] = headingY;
  const speed = behaviour.speed * scale;
  sim.velocity.data[index * 2] = headingX * speed;
  sim.velocity.data[index * 2 + 1] = headingY * speed;
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
 * Whether the body at `index` is a flyer up in the air (#411) — a `flying`
 * enemy in any state that does not `land`. Up there it passes over every
 * body on the ground: nothing shoves it and it shoves nothing (`contact.ts`,
 * `enemy-contact.ts`), so a dive reaches its point even with the player
 * standing on it. Shots still hit it — the Specht can be shot off its perch.
 */
export function enemyAirborne(sim: GameSim, index: number): boolean {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return false;
  }
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  return compiled.flying && compiled.states[sim.enemy.data[base + 1] ?? 0]?.grounded !== true;
}

/** Whether the body at `index` is in a state that `land`s (#411) — down on the floor. */
export function enemyGrounded(sim: GameSim, index: number): boolean {
  const base = index * ENEMY_STRIDE;
  const state = sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0];
  return state?.grounded === true;
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
 * `onBlocked` fires next tick. Returns how far the body still moves this
 * tick — `speed` when it hit nothing, 0 when it hit a body, and the run up
 * to contact when it hit terrain. Bodies are checked before terrain: a player
 * pinned against a wall is hit, not the wall behind them.
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
  climbs = false,
): number {
  // A climbing charge (#40) asks the air's question of the terrain: cover is
  // not in its way, only a wall is.
  const clearFlags = climbs ? AIR_CLEAR : 0;
  const body = sim.body.data;
  const radius = body[index * 2] ?? 0;
  const nextX = selfX + dirX * speed;
  const nextY = selfY + dirY * speed;

  const hit = firstBodyAhead(sim, index, radius, nextX, nextY, impact.playerOnly === true);
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
    if (impact.continues === true) {
      return speed;
    }
    raiseBlocked(sim, index);
    return 0;
  }

  // Terrain is probed a little past one step: `stepBodies` stops a body
  // against a wall a hair before its footprint reaches it, and a probe of
  // exactly one step let that stop — an ordinary `onBlocked`, nothing
  // smashed — win the race by a tick.
  const reach = speed + IMPACT_TERRAIN_SLACK;
  if (sim.room.isClear(selfX + dirX * reach, selfY + dirY * reach, radius, clearFlags)) {
    return speed;
  }
  // Something solid within reach: run the rest of the way up to it at full
  // speed, so the hit lands with the body against what it hit rather than a
  // few units short of it — the charge never visibly brakes before impact.
  const free = clearRun(sim, selfX, selfY, dirX, dirY, radius, reach, clearFlags);
  // The front edge, at contact: tried across the body's width, centre first,
  // so a glancing hit on a block's corner still smashes it — one point on
  // the centre line missed every block that only overlapped one flank.
  const contactX = selfX + dirX * (free + radius + IMPACT_REACH_SLACK);
  const contactY = selfY + dirY * (free + radius + IMPACT_REACH_SLACK);
  let smashed = false;
  if (impact.breaksBlocks) {
    for (let i = 0; i < IMPACT_EDGE_OFFSETS.length && !smashed; i++) {
      const across = (IMPACT_EDGE_OFFSETS[i] ?? 0) * radius;
      // Perpendicular to the charge: (-dirY, dirX).
      smashed = sim.smashBlockCellAt(contactX - dirY * across, contactY + dirX * across);
    }
  }
  if (!smashed && impact.breaksDoors) {
    sim.smashWallAt(contactX, contactY);
  }
  raiseBlocked(sim, index);
  return Math.min(speed, free);
}

/**
 * Where across its front edge, as a fraction of its radius from the centre
 * line, a charge looks for the block it hit — nearest the centre first, so
 * of two cells it straddles the one it hit squarer breaks.
 */
const IMPACT_EDGE_OFFSETS = [0, 0.5, -0.5, 0.95, -0.95] as const;

/**
 * How far a body of `radius` at `(x, y)` can go along `(dirX, dirY)` before
 * terrain stops it, up to `limit` — bisected on `RoomGeometry.isClear`,
 * which is only ever asked on the tick a charge is about to hit something.
 */
function clearRun(
  sim: GameSim,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  radius: number,
  limit: number,
  clearFlags = 0,
): number {
  let low = 0;
  let high = limit;
  for (let step = 0; step < 10; step++) {
    const mid = (low + high) / 2;
    if (sim.room.isClear(x + dirX * mid, y + dirY * mid, radius, clearFlags)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
}

/** The first body (the player, or another enemy on a collision layer) a body at `(x, y)` would overlap — or -1. */
function firstBodyAhead(
  sim: GameSim,
  self: number,
  radius: number,
  x: number,
  y: number,
  playerOnly = false,
): number {
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
  if (playerOnly) {
    return -1;
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

/** Room units from a target that count as having reached it (#411's `onArrived`). */
const ARRIVE_DISTANCE = 0.5;

/** Sets `ENEMY_FLAG_ARRIVED` on `index`, read by an `onArrived` transition next tick (#411). */
function raiseArrived(sim: GameSim, index: number): void {
  const flagSlot = index * ENEMY_STRIDE + 3;
  sim.enemy.data[flagSlot] = (sim.enemy.data[flagSlot] ?? 0) | ENEMY_FLAG_ARRIVED;
}

/**
 * A dive reaching its point with a `landing` (#411): everything within the
 * landing circle takes the hit, and the spot throws dust and chips so a dodged
 * landing is still seen to land.
 */
function land(
  sim: GameSim,
  index: number,
  landing: { readonly radius: number; readonly damage: number },
  x: number,
  y: number,
): void {
  sim.applySplashDamage(x, y, landing.radius, eliteAttackDamage(sim, index, landing.damage), index);
  boulderDebris(sim, x, y);
}

/** Ticks between two puffs of wood chips while a `telegraphLook: 'drum'` body drums (#411). */
const DRUM_CHIP_EVERY_TICKS = 6;

/** Where `nearestWallPoint` writes a perch — module scratch, not a returned object. */
const perchScratch = new Float64Array(4);

/**
 * One tick of `returnToPerch` (#411): on the state's first tick, pick the
 * nearest wall point from here; every tick, fly straight at it, landing on it
 * exactly, and raise `onArrived` once there — facing into the room.
 */
function flyToPerch(
  sim: GameSim,
  index: number,
  speed: number,
  ticks: number,
  selfX: number,
  selfY: number,
): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const velocity = sim.velocity.data;
  if (ticks === 0) {
    choosePerch(sim, index, selfX, selfY);
  }
  const dx = (motion[motionBase + MOTION_PERCH_X] ?? selfX) - selfX;
  const dy = (motion[motionBase + MOTION_PERCH_Y] ?? selfY) - selfY;
  const length = vectorLength(dx, dy);
  if (length <= ARRIVE_DISTANCE) {
    // On the perch exactly, not wherever the last step happened to stop.
    velocity[index * 2] = dx;
    velocity[index * 2 + 1] = dy;
    motion[motionBase] = motion[motionBase + MOTION_PERCH_NORMAL_X] ?? 1;
    motion[motionBase + 1] = motion[motionBase + MOTION_PERCH_NORMAL_Y] ?? 0;
    raiseArrived(sim, index);
    return;
  }
  const step = Math.min(speed, length);
  velocity[index * 2] = (dx / length) * step;
  velocity[index * 2 + 1] = (dy / length) * step;
  motion[motionBase] = dx / length;
  motion[motionBase + 1] = dy / length;
}

/**
 * Picks the wall point nearest `(selfX, selfY)` as the body's perch (#411) —
 * where it stands is the perch when no wall point fits, which an ordinary
 * room never produces. Also what puts a percher on the wall at spawn.
 */
export function choosePerch(sim: GameSim, index: number, selfX: number, selfY: number): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const radius = sim.body.data[index * 2] ?? 0;
  if (nearestWallPoint(sim.room, selfX, selfY, radius, perchScratch)) {
    motion[motionBase + MOTION_PERCH_X] = perchScratch[0] ?? selfX;
    motion[motionBase + MOTION_PERCH_Y] = perchScratch[1] ?? selfY;
    motion[motionBase + MOTION_PERCH_NORMAL_X] = perchScratch[2] ?? 1;
    motion[motionBase + MOTION_PERCH_NORMAL_Y] = perchScratch[3] ?? 0;
  } else {
    motion[motionBase + MOTION_PERCH_X] = selfX;
    motion[motionBase + MOTION_PERCH_Y] = selfY;
    motion[motionBase + MOTION_PERCH_NORMAL_X] = 1;
    motion[motionBase + MOTION_PERCH_NORMAL_Y] = 0;
  }
}

/**
 * Puts a percher on its perch at once (#411) — the spawn half of
 * `returnToPerch`: no flight in from the middle of the room, it is simply on
 * the wall when the room appears, facing in.
 */
export function placeOnPerch(sim: GameSim, index: number): void {
  const selfX = sim.positionX(index);
  const selfY = sim.positionY(index);
  choosePerch(sim, index, selfX, selfY);
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const transform = sim.transform.data;
  const x = motion[motionBase + MOTION_PERCH_X] ?? selfX;
  const y = motion[motionBase + MOTION_PERCH_Y] ?? selfY;
  transform[index * 4] = x;
  transform[index * 4 + 1] = y;
  transform[index * 4 + 2] = x;
  transform[index * 4 + 3] = y;
  motion[motionBase] = motion[motionBase + MOTION_PERCH_NORMAL_X] ?? 1;
  motion[motionBase + 1] = motion[motionBase + MOTION_PERCH_NORMAL_Y] ?? 0;
}

/** Whether a percher at `(selfX, selfY)` is sitting on its perch point. */
function onPerch(sim: GameSim, index: number, selfX: number, selfY: number): boolean {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  return (
    vectorLength(
      (motion[motionBase + MOTION_PERCH_X] ?? Infinity) - selfX,
      (motion[motionBase + MOTION_PERCH_Y] ?? Infinity) - selfY,
    ) <= ARRIVE_DISTANCE
  );
}

/** Ticks between two re-rolls of a `flyLoops` body's drift. */
const LOOP_DRIFT_TURN_TICKS = 90;
/** Times a `flyLoops` loop swells and shrinks per turn: the waves in it. */
const LOOP_WAVES = 3;
/** How much faster than its loop speed a `flyLoops` body may fly to catch its loop up. */
const LOOP_CATCH_UP = 1.8;
/** Room units of clear air kept between a `flyLoops` loop and a wall. */
const LOOP_WALL_MARGIN = 6;
/** What a flyer's air is clear of: walls and the grid cells a shape never claimed, nothing else. */
const AIR_CLEAR = CLEAR_IGNORE_DESTRUCTIBLE | CLEAR_IGNORE_PITS;

/**
 * One tick of `flyLoops`: the point it loops about drifts, and the body flies
 * at its place on the loop — round it at `speed`, the radius waving by
 * `wobble`. See `FlyLoopsBehaviour`.
 */
function flyLoops(
  sim: GameSim,
  index: number,
  behaviour: {
    readonly speed: number;
    readonly radius: number;
    readonly wobble: number;
    readonly drift: number;
  },
  scale: number,
  ticks: number,
  selfX: number,
  selfY: number,
): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const velocity = sim.velocity.data;
  const room = sim.room;
  const speed = behaviour.speed * scale;
  const radius = behaviour.radius;
  const bodyRadius = sim.body.data[index * 2] ?? 0;
  // The whole loop, with the body on it and a margin, must fit in the air.
  const reach = radius + behaviour.wobble + bodyRadius + LOOP_WALL_MARGIN;

  if (ticks === 0) {
    const angle = motion[motionBase + MOTION_LOOP_ANGLE] ?? 0;
    let centreX = selfX - Math.cos(angle) * radius;
    let centreY = selfY - Math.sin(angle) * radius;
    if (!room.isClear(centreX, centreY, reach, AIR_CLEAR)) {
      // Off a wall (or a loop that no longer fits): start the loop into the
      // room, the way the perch faces, with the body on its near side.
      const inX = motion[motionBase + MOTION_PERCH_NORMAL_X] ?? 0;
      const inY = motion[motionBase + MOTION_PERCH_NORMAL_Y] ?? 0;
      const inLength = vectorLength(inX, inY);
      const normalX = inLength === 0 ? 0 : inX / inLength;
      const normalY = inLength === 0 ? 1 : inY / inLength;
      centreX = selfX + normalX * reach;
      centreY = selfY + normalY * reach;
      motion[motionBase + MOTION_LOOP_ANGLE] = Math.atan2(-normalY, -normalX);
      motion[motionBase + MOTION_LOOP_SPIN] = sim.random.enemies.nextFloat() < 0.5 ? -1 : 1;
    }
    motion[motionBase + MOTION_LOOP_X] = centreX;
    motion[motionBase + MOTION_LOOP_Y] = centreY;
    if ((motion[motionBase + MOTION_LOOP_SPIN] ?? 0) === 0) {
      motion[motionBase + MOTION_LOOP_SPIN] = 1;
    }
  }

  // The drift: a direction re-rolled now and then, turned back off walls.
  if (ticks % LOOP_DRIFT_TURN_TICKS === 0) {
    const heading = sim.random.enemies.nextFloat() * Math.PI * 2;
    motion[motionBase + MOTION_LOOP_DRIFT_X] = Math.cos(heading);
    motion[motionBase + MOTION_LOOP_DRIFT_Y] = Math.sin(heading);
  }
  const centreX = motion[motionBase + MOTION_LOOP_X] ?? selfX;
  const centreY = motion[motionBase + MOTION_LOOP_Y] ?? selfY;
  const driftX = (motion[motionBase + MOTION_LOOP_DRIFT_X] ?? 0) * behaviour.drift * scale;
  const driftY = (motion[motionBase + MOTION_LOOP_DRIFT_Y] ?? 0) * behaviour.drift * scale;
  if (room.isClear(centreX + driftX, centreY + driftY, reach, AIR_CLEAR)) {
    motion[motionBase + MOTION_LOOP_X] = centreX + driftX;
    motion[motionBase + MOTION_LOOP_Y] = centreY + driftY;
  } else {
    motion[motionBase + MOTION_LOOP_DRIFT_X] = -(motion[motionBase + MOTION_LOOP_DRIFT_X] ?? 0);
    motion[motionBase + MOTION_LOOP_DRIFT_Y] = -(motion[motionBase + MOTION_LOOP_DRIFT_Y] ?? 0);
  }

  const spin = motion[motionBase + MOTION_LOOP_SPIN] ?? 1;
  const angle = (motion[motionBase + MOTION_LOOP_ANGLE] ?? 0) + (spin * speed) / radius;
  motion[motionBase + MOTION_LOOP_ANGLE] = angle;
  const waved = radius + behaviour.wobble * Math.sin(angle * LOOP_WAVES);
  const goalX = (motion[motionBase + MOTION_LOOP_X] ?? selfX) + Math.cos(angle) * waved;
  const goalY = (motion[motionBase + MOTION_LOOP_Y] ?? selfY) + Math.sin(angle) * waved;
  const dx = goalX - selfX;
  const dy = goalY - selfY;
  const length = vectorLength(dx, dy);
  const step = Math.min(length, speed * LOOP_CATCH_UP);
  velocity[index * 2] = length === 0 ? 0 : (dx / length) * step;
  velocity[index * 2 + 1] = length === 0 ? 0 : (dy / length) * step;
  if (length > 0) {
    motion[motionBase] = dx / length;
    motion[motionBase + 1] = dy / length;
  }
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
          // A `toOneOf` (#412) rolls which state it goes to only now, so the
          // draw happens once per transition taken, never per tick waited.
          return transition.choices === undefined
            ? transition.to
            : chooseWeighted(sim, index * ENEMY_MOTION_STRIDE + MOTION_SCRIPTED, transition);
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
      case TransitionTrigger.OnArrived:
        if ((flags & ENEMY_FLAG_ARRIVED) !== 0) {
          return transition.to;
        }
        break;
      case TransitionTrigger.HealthBelow: {
        // A phase change on a health threshold (#437): the body itself
        // carries on — position, bar, elite roll — only its state moves.
        const current = sim.health.data[index * 2] ?? 0;
        const max = sim.health.data[index * 2 + 1] ?? 1;
        if (current <= transition.value * max) {
          return transition.to;
        }
        break;
      }
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
      case TransitionTrigger.PlayerCrossesRow: {
        // The player went from one side of the body's horizontal line to the
        // other since last tick (#40, the Summit cross). Standing exactly on
        // the line counts as one side.
        const playerIndex = sim.playerIndex;
        const before = sim.previousY(playerIndex) > sim.positionY(index);
        const after = sim.positionY(playerIndex) > sim.positionY(index);
        if (before !== after) {
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
      const prop = state.approachesPlayerRow
        ? propNearestToRow(sim, sim.positionY(sim.playerIndex), state.approachPropKind)
        : nearestPropIndex(sim, selfX, selfY, state.approachPropKind);
      let dirX = toPlayerX;
      let dirY = toPlayerY;
      let length = distance;
      if (prop >= 0) {
        // With a standoff (#467) the goal is a point in front of the prop, on
        // the side facing the middle of the room, so a line of logs is
        // approached from its open side rather than along it.
        const propX = sim.positionX(prop);
        const toward = propX < (sim.room.minX + sim.room.maxX) / 2 ? 1 : -1;
        dirX = propX + toward * state.approachStandoff - selfX;
        dirY = sim.positionY(prop) - selfY;
        length = vectorLength(dirX, dirY);
        // Arrived: hold still rather than jitter about the point.
        if (state.approachStandoff > 0 && length < 1.5) {
          length = 0;
        }
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
      if (behaviour.fixedLane === true) {
        // The lane is the row it started the state on (#467); held every tick,
        // so nothing that shoves it can move it off.
        const lane = ticks === 0 ? selfY : (motion[motionBase + 1] ?? selfY);
        motion[motionBase + 1] = lane;
        sim.transform.data[index * 4 + 1] = lane;
        sim.transform.data[index * 4 + 3] = lane;
      }
      const signed = behaviour.speed * behaviour.direction * scale;
      let rolled = signed;
      if (behaviour.impact !== undefined) {
        // A pushed log hits like a Boar's dash (#467) and ends the roll on it.
        const dirX = behaviour.axis === 'x' ? behaviour.direction : 0;
        const dirY = behaviour.axis === 'y' ? behaviour.direction : 0;
        rolled =
          behaviour.direction *
          chargeImpact(sim, index, behaviour.impact, dirX, dirY, Math.abs(signed), selfX, selfY);
      }
      velocity[base] = behaviour.axis === 'x' ? rolled : 0;
      velocity[base + 1] = behaviour.axis === 'y' ? rolled : 0;
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
      if (behaviour.untilTargetPoint === true) {
        // A dive to a point (#411): the point it was aimed at, fixed on the
        // first tick. What is left of the way is measured along the locked
        // direction, so it never turns back once it is past.
        if (ticks === 0) {
          motion[motionBase + 4] = selfX + aimX;
          motion[motionBase + 5] = selfY + aimY;
        }
        const left =
          ((motion[motionBase + 4] ?? selfX) - selfX) * (motion[motionBase] ?? 0) +
          ((motion[motionBase + 5] ?? selfY) - selfY) * (motion[motionBase + 1] ?? 0);
        if (left <= ARRIVE_DISTANCE) {
          speed = 0;
          raiseArrived(sim, index);
          // Arrival is read next tick, which leaves the state: this runs once.
          if (behaviour.landing !== undefined) {
            land(sim, index, behaviour.landing, selfX, selfY);
          }
        } else {
          speed = Math.min(speed, left);
        }
      }
      if (behaviour.maxDistance !== undefined) {
        // A leap, not a run (#407): this tick covers only what is left of
        // `maxDistance`, then nothing for the rest of the state.
        speed = clamp(behaviour.maxDistance - ticks * speed, 0, speed);
      }
      if (behaviour.impact !== undefined && speed > 0) {
        speed = chargeImpact(
          sim,
          index,
          behaviour.impact,
          motion[motionBase] ?? 0,
          motion[motionBase + 1] ?? 0,
          speed,
          selfX,
          selfY,
          behaviour.climbsBlocks === true,
        );
      }
      velocity[base] = (motion[motionBase] ?? 0) * speed;
      velocity[base + 1] = (motion[motionBase + 1] ?? 0) * speed;
      return;
    }
    case 'swimInZone': {
      swimAlongCourse(sim, index, behaviour.speed * scale, selfX, selfY);
      return;
    }
    case 'ride': {
      stepRide(
        sim,
        index,
        motionBase,
        motionBase + MOTION_SCRIPTED,
        behaviour,
        ticks,
        scale,
        selfX,
        selfY,
      );
      return;
    }
    case 'rideToLineStart':
    case 'rideLine': {
      // `rideToLineStart` heads for the start end; `rideLine` forward for the
      // far end and back for the start — the same line, the same ride.
      const end =
        behaviour.behaviour === 'rideLine' && behaviour.direction === 1
          ? LineEnd.Far
          : LineEnd.Start;
      if (
        rideAlongLine(
          sim,
          index,
          motionBase,
          motionBase + MOTION_SCRIPTED,
          end,
          behaviour.speed * scale,
          selfX,
          selfY,
        )
      ) {
        raiseArrived(sim, index);
      }
      return;
    }
    case 'glideToPoint': {
      const room = sim.room;
      if (
        glideToPoint(
          sim,
          index,
          (room.minX + room.maxX) / 2,
          (room.minY + room.maxY) / 2,
          ticks,
          behaviour.ticks,
          selfX,
          selfY,
        )
      ) {
        raiseArrived(sim, index);
      }
      return;
    }
    case 'returnToPerch': {
      flyToPerch(sim, index, behaviour.speed * scale, ticks, selfX, selfY);
      return;
    }
    case 'flyLoops': {
      flyLoops(sim, index, behaviour, scale, ticks, selfX, selfY);
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
      const speed = hopSpeed(distanceScaled, phase, hopTicks);
      velocity[base] = (motion[motionBase] ?? 0) * speed;
      velocity[base + 1] = (motion[motionBase + 1] ?? 0) * speed;
      return;
    }
    case 'hopTowardPlayer': {
      const hopTicks = Math.max(1, Math.round(behaviour.hopTicks));
      const distanceScaled = behaviour.hopDistance * scale;
      if (ticks === 0) {
        // A fresh state (spawned, or back from being shaken off): a fresh
        // run of hops, after a rolled wait — so ticks that arrive together
        // do not take off together.
        motion[motionBase + MOTION_HOP_COUNT] = 0;
        motion[motionBase + MOTION_HOP_START] = -hopTicks;
        motion[motionBase + MOTION_HOP_NEXT] = rollHopRest(sim, behaviour);
        motion[motionBase] = 0;
        motion[motionBase + 1] = 0;
      }
      // `>=`, not `===`: a tick this primitive did not run on (a stun, a
      // freeze) must not strand the clock past its next hop forever.
      if (ticks >= (motion[motionBase + MOTION_HOP_NEXT] ?? 0)) {
        // Two in, one back (with `backEvery: 3`), counted from the state's
        // own first hop.
        const hop = motion[motionBase + MOTION_HOP_COUNT] ?? 0;
        const every = Math.max(2, Math.round(behaviour.backEvery));
        const sign = hop % every === every - 1 ? -1 : 1;
        // Wobbled off the straight line, so it creeps rather than homes in.
        const wobble =
          (sim.random.enemies.nextFloat() * 2 - 1) * ((behaviour.aimJitterDegrees * Math.PI) / 180);
        const cos = Math.cos(wobble);
        const sin = Math.sin(wobble);
        const aimX = sign * toPlayerX;
        const aimY = sign * toPlayerY;
        chooseAimedHop(
          sim,
          index,
          selfX,
          selfY,
          aimX * cos - aimY * sin,
          aimX * sin + aimY * cos,
          distanceScaled,
        );
        motion[motionBase + MOTION_HOP_COUNT] = hop + 1;
        motion[motionBase + MOTION_HOP_START] = ticks;
        motion[motionBase + MOTION_HOP_NEXT] = ticks + hopTicks + rollHopRest(sim, behaviour);
      }
      const phase = ticks - (motion[motionBase + MOTION_HOP_START] ?? 0);
      const speed = phase >= 0 ? hopSpeed(distanceScaled, phase, hopTicks) : 0;
      velocity[base] = (motion[motionBase] ?? 0) * speed;
      velocity[base + 1] = (motion[motionBase + 1] ?? 0) * speed;
      return;
    }
    case 'shoal': {
      shoalStep(sim, index, behaviour, selfX, selfY, toPlayerX, toPlayerY, distance, scale);
      return;
    }
    case 'slalom': {
      // The base heading is re-rolled every leg toward the middle of the room
      // (so a skier crosses it), the actual heading swings round it on a sine.
      const leg = Math.max(1, Math.round(behaviour.legTicks));
      if (ticks % leg === 0) {
        const room = sim.room;
        const toMiddle = Math.atan2(
          (room.minY + room.maxY) / 2 - selfY,
          (room.minX + room.maxX) / 2 - selfX,
        );
        const rolled = toMiddle + (sim.random.enemies.nextFloat() - 0.5) * Math.PI * 0.9;
        motion[motionBase + MOTION_SLALOM_BASE] = rolled;
      }
      const slalomBase = motion[motionBase + MOTION_SLALOM_BASE] ?? 0;
      const period = Math.max(2, Math.round(behaviour.periodTicks));
      const heading = slalomBase + Math.sin((ticks / period) * Math.PI * 2) * behaviour.swing;
      motion[motionBase] = Math.cos(heading);
      motion[motionBase + 1] = Math.sin(heading);
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

/**
 * This tick's speed along a hop `phase` ticks into its cycle — 0 once the
 * hop is over and the body rests. A sine ease that sums to exactly
 * `distance` over `hopTicks`: Σ sin(π(i+½)/n) over i < n is 1 / sin(π/2n).
 */
function hopSpeed(distance: number, phase: number, hopTicks: number): number {
  if (phase >= hopTicks) {
    return 0;
  }
  return (
    distance * Math.sin((Math.PI * (phase + 0.5)) / hopTicks) * Math.sin(Math.PI / (2 * hopTicks))
  );
}

/**
 * One `hopTowardPlayer` rest: `restTicks` give or take `restJitter` of it,
 * rolled from `random.enemies` — and never less than a tick, so every hop
 * visibly lands before the next; two run together read as one long glide.
 */
function rollHopRest(
  sim: GameSim,
  hop: { readonly restTicks: number; readonly restJitter: number },
): number {
  const swing = (sim.random.enemies.nextFloat() * 2 - 1) * hop.restJitter;
  return Math.max(1, Math.round(hop.restTicks * (1 + swing)));
}

/** Turns tried, in order, when a `hopTowardPlayer` landing is blocked: straight, then 45° and 90° either side. */
const AIMED_HOP_TURNS = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2] as const;

/**
 * A `hopTowardPlayer` hop's direction (the Zecke): along `(aimX, aimY)` —
 * at the player, or away from them — or the first of `AIMED_HOP_TURNS` off
 * it whose landing and midpoint are clear, written to the heading slots. With
 * none clear, or nothing to aim at, the heading is zeroed and the body rests
 * the cycle out. Deterministic: no random draw.
 */
function chooseAimedHop(
  sim: GameSim,
  index: number,
  selfX: number,
  selfY: number,
  aimX: number,
  aimY: number,
  distance: number,
): void {
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const radius = sim.body.data[index * 2] ?? 0;
  const length = vectorLength(aimX, aimY);
  if (length > 0) {
    const aim = Math.atan2(aimY, aimX);
    for (const turn of AIMED_HOP_TURNS) {
      const dirX = Math.cos(aim + turn);
      const dirY = Math.sin(aim + turn);
      if (
        sim.room.isClear(selfX + dirX * distance, selfY + dirY * distance, radius) &&
        sim.room.isClear(selfX + (dirX * distance) / 2, selfY + (dirY * distance) / 2, radius)
      ) {
        motion[motionBase] = dirX;
        motion[motionBase + 1] = dirY;
        return;
      }
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
 * How far through its current hop a `hopCardinal` or `hopTowardPlayer` body
 * is, 0 to 1 — 0 while resting, and for every other movement. Read by the
 * renderer for the hop's bob (#407); derived from the state counter like
 * everything else here.
 */
export function enemyHopProgress(sim: GameSim, index: number): number {
  const base = index * ENEMY_STRIDE;
  const state = sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0];
  if (
    state === undefined ||
    (state.movement.behaviour !== 'hopCardinal' && state.movement.behaviour !== 'hopTowardPlayer')
  ) {
    return 0;
  }
  const hop = state.movement;
  const hopTicks = Math.max(1, Math.round(hop.hopTicks));
  const counter = sim.enemy.data[base + 2] ?? 0;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  // A `hopTowardPlayer` body keeps its own hop clock (its rests are rolled);
  // a `hopCardinal` one hops on the state counter's fixed beat.
  const phase =
    hop.behaviour === 'hopTowardPlayer'
      ? counter - (sim.enemyMotion.data[motionBase + MOTION_HOP_START] ?? 0)
      : counter % (hopTicks + Math.max(0, Math.round(hop.restTicks)));
  if (phase < 0 || phase >= hopTicks) {
    return 0;
  }
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
  const scale =
    sim.tuning.enemy.fireIntervalScale *
    // A marked player (#40) is fired at faster by everything in the room.
    (sim.playerMarked > 0 ? sim.tuning.enemy.markedFireIntervalScale : 1);
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

    if (shot.behaviour === 'fireRotatingRing') {
      // The Waldradl's ring (#413): a pure function of the volley number, so
      // the same pattern in every fight — no draw from any RNG stream. The
      // volley number counts from the state's entry, scaled with the interval.
      if (phase === 0) {
        const volley = Math.floor(ticks / interval);
        for (let slot = 0; slot < shot.shots; slot++) {
          if (!slotInGap(shot.shots, slot, shot.gaps)) {
            fireOne(sim, index, slotAngle(shot, slot, volley), shot);
          }
        }
      }
      continue;
    }

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
        if (shot.landAtTarget === true) {
          // Cut the flight to the distance to the aim, so the shot ends — and, with
          // `burst`, splashes — exactly where the player stood when it locked.
          const speed = Math.max(0.01, shot.speed * sim.tuning.enemy.projectileSpeedScale);
          const reach = Math.max(0, aimDistance - (sim.body.data[index * 2] ?? 0));
          fireOne(
            sim,
            index,
            aim,
            shot,
            Math.min(shot.lifetimeTicks, Math.max(1, Math.round(reach / speed))),
          );
        } else {
          fireOne(sim, index, aim, shot);
        }
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
    // A fan thrown off the side of the way the body was moving is aimed at
    // nothing, so it is not gated on sight (#40, the Skier's drift-stop).
    if (phase === 0 && (shot.aimSide !== undefined || isSighted(sim, index, aimX, aimY))) {
      const centre = shot.aimSide === undefined ? aim : sideAim(sim, index, shot.aimSide);
      const shots = Math.max(1, Math.round(shot.shots));
      const step = shot.arc / Math.max(1, shots - 1);
      const start = centre - shot.arc / 2;
      for (let ray = 0; ray < shots; ray++) {
        fireOne(sim, index, shots === 1 ? centre : start + step * ray, shot);
      }
    }
  }
}

/**
 * A quarter turn off the way `index` was last moving (its heading in
 * `enemyMotion`): the left or the right, or — for `'random'` — whichever the
 * enemy stream says (#40, the Skier). A body that has never moved faces east.
 */
function sideAim(sim: GameSim, index: number, side: 'left' | 'right' | 'random'): number {
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const heading = Math.atan2(
    sim.enemyMotion.data[motionBase + 1] ?? 0,
    sim.enemyMotion.data[motionBase] ?? 1,
  );
  const turn =
    side === 'random' ? (sim.random.enemies.nextFloat() < 0.5 ? -1 : 1) : side === 'left' ? -1 : 1;
  return heading + (turn * Math.PI) / 2;
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
  // Marked by a flare (#40): the whole room knows where the player is, cover
  // or no cover, for as long as the mark burns.
  if (sim.playerMarked > 0) {
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

function fireOne(
  sim: GameSim,
  index: number,
  angle: number,
  shot: FiringBehaviour,
  lifetimeTicks: number = shot.lifetimeTicks,
): void {
  fireFrom(
    sim,
    index,
    sim.positionX(index),
    sim.positionY(index),
    sim.body.data[index * 2] ?? 0,
    angle,
    shot,
    lifetimeTicks,
  );
}

/** What a projectile needs authored: every firing behaviour's, and a `detonateVolley` burst's. */
interface ShotSpec {
  readonly speed: number;
  readonly damage: number;
  readonly lifetimeTicks: number;
  readonly radius?: number | undefined;
  readonly art?: string | undefined;
  readonly poison?: boolean | undefined;
  readonly bounce?: boolean | undefined;
  readonly mark?: boolean | undefined;
  readonly freeze?: boolean | undefined;
  readonly burst?: boolean | undefined;
}

/**
 * `fireOne` from any point: a shot of `index`'s leaving `(centreX, centreY)`
 * along `angle`, its muzzle `bodyReach` plus its own radius out — the body's
 * edge for a body firing, nothing for a burst out of a point on the floor
 * (#412). Falls back to the centre when the muzzle would be inside a wall.
 */
function fireFrom(
  sim: GameSim,
  index: number,
  centreX: number,
  centreY: number,
  bodyReach: number,
  angle: number,
  shot: ShotSpec,
  lifetimeTicks: number = shot.lifetimeTicks,
): void {
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const radius = shot.radius ?? sim.tuning.shooting.shotRadius;

  const reach = bodyReach + radius + 1;
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
    Math.max(1, Math.round(lifetimeTicks)),
    ProjectileTeam.Enemy,
    (shot.poison === true ? ProjectileTag.Poison : 0) |
      (shot.bounce === true ? ProjectileTag.Bouncing : 0) |
      (shot.mark === true ? ProjectileTag.Marking : 0) |
      (shot.freeze === true ? ProjectileTag.Freezing : 0) |
      (shot.burst === true ? ProjectileTag.Bursting : 0),
    // Which sprite this shot is drawn as, if its behaviour named one (#152).

    // Resolved through the roster's interned name table rather than carried as
    // a string, so nothing in the frame loop compares one.
    sim.enemies.artIndexOf(shot.art),
  );
  if (projectile !== NO_SLOT) {
    sim.projectiles.ownerDefinition[projectile] = sim.enemy.data[index * ENEMY_STRIDE] ?? -1;
    // An enemy shot's tags are final the moment it leaves (no item hook adds
    // to them), so its bounce budget is derived here (#40, the Sennerin's
    // wheel) — the same call the player's shot makes once its hooks are done.
    finalizeProjectileTags(sim, projectile);
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

/** Spokes in the puff a wrapper throws up as it lands (#412). */
const WRAPPER_PUFF_SPOKES = 8;
const WRAPPER_PUFF_SPEED = 0.7;
const WRAPPER_PUFF_TICKS = 16;

/**
 * `detonateVolley` (#412): at every landing point the body's last `lobVolley`
 * captured, a poison cloud and a ring of shots out of it — the wrapper bursting.
 *
 * Deliberately **not** `detonateLobbedBomb`: no `applySplashDamage`, and above
 * all no `triggerExplosion`. A wrapper is litter, not a bomb; if it opened
 * secret walls the Waldradler's volley would be a free key to every hidden
 * door in a boss room that has none. The cloud and the ring are all of it.
 */
function detonateVolley(sim: GameSim, index: number, detonation: CompiledVolleyBurst): void {
  const block = index * ENEMY_MOTION_STRIDE + MOTION_SCRIPTED;
  const defaults = sim.tuning.poisonCloud;
  const cloud = detonation.cloud;
  const burst = detonation.burst;
  const count = volleyCount(sim, block);
  const step = (Math.PI * 2) / burst.shots;
  for (let point = 0; point < count; point++) {
    const x = volleyPoint(sim, block, point, 0);
    const y = volleyPoint(sim, block, point, 1);
    sim.spawnPoisonCloud(
      x,
      y,
      cloud.radius,
      cloud.growTicks < 0 ? defaults.defaultGrowTicks : cloud.growTicks,
      cloud.lifetimeTicks < 0 ? defaults.defaultLifetimeTicks : cloud.lifetimeTicks,
    );
    for (let shot = 0; shot < burst.shots; shot++) {
      fireFrom(sim, index, x, y, 0, step * shot, burst);
    }
    ring(
      sim,
      x,
      y,
      WRAPPER_PUFF_SPOKES,
      ParticleKind.Spore,
      WRAPPER_PUFF_SPEED,
      WRAPPER_PUFF_TICKS,
      2,
    );
  }
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

/**
 * The live prop of `kind` whose row (y) is closest to `y`, or -1 (#467).
 *
 * Bieber's pick of log: the one whose roll lies along the player's row. With
 * a `reach`, only props inside it of (`aroundX`, `aroundY`) are considered. Ties go to
 * the lower entity index, so the choice is stable across ticks and a replay
 * reproduces it.
 */
function propNearestToRow(
  sim: GameSim,
  y: number,
  kind: number,
  aroundX = 0,
  aroundY = 0,
  reach = Infinity,
): number {
  if (kind < 0) {
    return -1;
  }
  const states = sim.world.states;
  const masks = sim.world.masks;
  const propBit = sim.propKind.bit;
  const propData = sim.propKind.data;
  let best = -1;
  let bestGap = Infinity;
  for (let i = 0; i < sim.world.highWater; i++) {
    if (states[i] !== World.ALIVE || ((masks[i] ?? 0) & propBit) === 0) {
      continue;
    }
    if ((propData[i] ?? 0) !== kind) {
      continue;
    }
    if (
      reach !== Infinity &&
      vectorLength(sim.positionX(i) - aroundX, sim.positionY(i) - aroundY) > reach
    ) {
      continue;
    }
    const gap = Math.abs(sim.positionY(i) - y);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
}

/**
 * On entering a `rollLog` state: take the prop within `reach` of the body that
 * lies nearest the player's row and spawn the rolling body in its place, going
 * whichever way the player is (#467). The spawn is queued as an ordinary
 * `summon` event, so the world never grows inside this loop.
 */
function rollNearestLog(
  sim: GameSim,
  index: number,
  roll: {
    readonly kind: number;
    readonly reach: number;
    readonly east: number;
    readonly west: number;
  },
  selfX: number,
  selfY: number,
  playerX: number,
): void {
  const prop = propNearestToRow(
    sim,
    sim.positionY(sim.playerIndex),
    roll.kind,
    selfX,
    selfY,
    roll.reach,
  );
  if (prop < 0) {
    return;
  }
  const propX = sim.positionX(prop);
  const propY = sim.positionY(prop);
  sim.consumeProp(prop);
  sim.events.push(
    EventKind.EnemySummon,
    index,
    playerX >= propX ? roll.east : roll.west,
    propX,
    propY,
    ROLL_LOG_MAX_ACTIVE,
    0,
    1,
  );
}

/** A log rolls only while fewer than this many are already rolling: the fight never stacks them. */
const ROLL_LOG_MAX_ACTIVE = 2;

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
export function meleeBladeAngle(
  swing: Pick<CompiledMeleeArc, 'arc' | 'sweepTicks' | 'direction'>,
  aimAngle: number,
  ticks: number,
): number {
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
  if (state === undefined || (state.splits.length === 0 && state.deathPickups.length === 0)) {
    return;
  }

  const atX = sim.events.x[slot] ?? 0;
  const atY = sim.events.y[slot] ?? 0;
  const random = sim.random.enemies;

  // What the body leaves lying where it fell (#412, the Waldradler's Maß):
  // once per death, because a death event is.
  for (const pickup of state.deathPickups) {
    sim.dropPickupAt(pickup, atX, atY);
  }
  if (state.splits.length === 0) {
    return;
  }

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
  if (sim?.events.kind[slot] === EventKind.EnemyBecomeProp) {
    becomePropFromEvent(sim, slot);
    return;
  }
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

/**
 * A body turning into a prop where it stands (#467): the body goes first, so
 * its own circle is not in the way of the prop that replaces it, then the prop
 * is spawned where it stood. There is deliberately no "is that spot clear"
 * check: the body came to rest there under the room's own collision, so the
 * spot was legal a tick ago, and a check that disagreed with that by a
 * rounding error would make the log vanish instead of settle. A body that is
 * already gone (killed this tick) is left alone.
 */
function becomePropFromEvent(sim: GameSim, slot: number): void {
  const index = sim.events.subject[slot] ?? -1;
  if (index < 0 || sim.world.states[index] !== World.ALIVE) {
    return;
  }
  const kind = sim.events.other[slot] ?? 0;
  const radius = sim.events.normalY[slot] ?? 0;
  const health = sim.events.value[slot] ?? 0;
  const atX = sim.events.x[slot] ?? 0;
  const atY = sim.events.y[slot] ?? 0;
  sim.world.destroy(sim.world.entityAt(index));
  sim.spawnTarget(atX, atY, radius, kind, health, kind === LOG_KIND ? LOG_MASS : PROP_DROP_MASS);
}

/** The `log` prop kind's index (#467), resolved once. */
/** Longest a beam is traced, in room units: longer than any room is wide. */
const BEAM_MAX_LENGTH = 800;
/** Spacing of the terrain probe along a beam, in room units — finer than any wall is thick. */
const BEAM_PROBE_STEP = 3;

/** A beam's lit line or lines, written in place by `enemyBeam` so a render loop's per-frame call never allocates. */
export interface EnemyBeamInfo {
  /** 1 or 2 segments (a `row` beam is two, one each way). */
  count: number;
  /** Segment `i` runs `(ax[i], ay[i])` to `(bx[i], by[i])`: the body's centre out to where terrain stops it. */
  ax: [number, number];
  ay: [number, number];
  bx: [number, number];
  by: [number, number];
  /** Half the beam's thickness, room units. */
  halfWidth: number;
  /** The beam's damage — what tells a big laser from a small one. */
  damage: number;
  /** 0..1 through the lit window (0 on the first lit tick). */
  progress: number;
}

/** Traces one beam ray from `(fromX, fromY)` along `angle` until terrain stops it, writing segment `slot`. */
function traceBeamRay(
  sim: GameSim,
  out: EnemyBeamInfo,
  slot: 0 | 1,
  fromX: number,
  fromY: number,
  angle: number,
): void {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let reached = 0;
  for (let distance = BEAM_PROBE_STEP; distance <= BEAM_MAX_LENGTH; distance += BEAM_PROBE_STEP) {
    if (!sim.room.isClear(fromX + dirX * distance, fromY + dirY * distance, 1, CLEAR_IGNORE_PITS)) {
      break;
    }
    reached = distance;
  }
  out.ax[slot] = fromX;
  out.ay[slot] = fromY;
  out.bx[slot] = fromX + dirX * reached;
  out.by[slot] = fromY + dirY * reached;
}

/**
 * Where a beam of `beam` lies for a body at `(selfX, selfY)` whose locked aim
 * is `aimAngle`: the one place its geometry is worked out, so the hit test and
 * the renderer's drawing of it can never disagree about where it is.
 */
function beamGeometry(
  sim: GameSim,
  beam: CompiledFireBeam,
  aimAngle: number,
  selfX: number,
  selfY: number,
  out: EnemyBeamInfo,
): void {
  out.halfWidth = beam.halfWidth;
  out.damage = beam.damage;
  if (beam.mode === 'row') {
    out.count = 2;
    traceBeamRay(sim, out, 0, selfX, selfY, 0);
    traceBeamRay(sim, out, 1, selfX, selfY, Math.PI);
    return;
  }
  out.count = 1;
  traceBeamRay(
    sim,
    out,
    0,
    selfX,
    selfY,
    beam.mode === 'axis' ? snapToCardinal(aimAngle) : aimAngle,
  );
}

/**
 * The lit beam of `index`'s current state, written into `out`, or `false` while
 * it is not lit — the ticks after the state is entered, the same ticks the hit
 * test reads.
 *
 * @hot — one call per beam-bearing enemy per frame, from the renderer.
 */
export function enemyBeam(sim: GameSim, index: number, out: EnemyBeamInfo): boolean {
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  const beam = state?.fireBeam ?? null;
  if (beam === null) {
    return false;
  }
  const ticks = sim.enemy.data[base + 2] ?? 0;
  if (ticks < 1 || ticks > beam.beamTicks) {
    return false;
  }
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const aimAngle = Math.atan2(
    sim.enemyMotion.data[motionBase + 1] ?? 0,
    sim.enemyMotion.data[motionBase] ?? 1,
  );
  beamGeometry(sim, beam, aimAngle, sim.positionX(index), sim.positionY(index), out);
  out.progress = (ticks - 1) / beam.beamTicks;
  return true;
}

/**
 * How far through its sweep `index` is, 0 to 1 — or `-1` while it is in no
 * `fireSweep` state. What a sprite's `attack` clip is indexed by (#437).
 */
export function enemySweepProgress(sim: GameSim, index: number): number {
  const base = index * ENEMY_STRIDE;
  const state = sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0];
  const sweep = state?.fireSweep ?? null;
  if (sweep === null) {
    return -1;
  }
  return clamp((sim.enemy.data[base + 2] ?? 0) / sweep.sweepTicks, 0, 0.9999);
}

/**
 * Which way the sweep `index` is making — or winding up to make — turns: `-1`
 * anticlockwise, `1` clockwise (`fireSweep.direction`), `0` when its state is
 * neither a sweep nor the wind-up before one. The renderer turns a body with
 * `facing: 'fixed'` to the stance of its next swing off this (#437): The First
 * Human has one view, and his arms swing from one pose to the other.
 */
export function enemySweepDirection(sim: GameSim, index: number): -1 | 0 | 1 {
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  if (state === undefined) {
    return 0;
  }
  if (state.fireSweep !== null) {
    return state.fireSweep.direction;
  }
  const follow = state.telegraphTicks > 0 ? stateAfterTelegraph(compiled, state) : null;
  return follow?.fireSweep?.direction ?? 0;
}

/**
 * The line `index`'s wind-up is warning of — the beam of the state its
 * telegraph leads to, at the aim it has locked (or is tracking), written into
 * `out`. `false` when the state ahead has no beam.
 *
 * @hot — one call per winding-up beam-bearer per frame, from the renderer.
 */
export function enemyBeamTelegraph(sim: GameSim, index: number, out: EnemyBeamInfo): boolean {
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  const follow = state === undefined ? null : stateAfterTelegraph(compiled, state);
  const beam = follow?.fireBeam ?? null;
  if (beam === null) {
    return false;
  }
  beamGeometry(
    sim,
    beam,
    enemyAimAngle(sim, index),
    sim.positionX(index),
    sim.positionY(index),
    out,
  );
  out.progress = enemyTelegraphProgress(sim, index);
  return true;
}

/** Shortest distance from `(px, py)` to the segment `a`–`b`. */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  const t =
    lengthSquared === 0 ? 0 : clamp(((px - ax) * abx + (py - ay) * aby) / lengthSquared, 0, 1);
  return vectorLength(px - (ax + abx * t), py - (ay + aby * t));
}

const beamScratch: EnemyBeamInfo = {
  count: 0,
  ax: [0, 0],
  ay: [0, 0],
  bx: [0, 0],
  by: [0, 0],
  halfWidth: 0,
  damage: 0,
  progress: 0,
};

/**
 * A laser (#40, `fireBeam`): while the beam is lit, a player whose body touches
 * the line takes `beam.damage` through the same `Contact` event a melee swing
 * lands (flash, shake, knockback and contact i-frames all follow from it — which
 * is also what makes the hit once per beam), and is frozen if the beam freezes.
 */
function applyFireBeam(
  sim: GameSim,
  index: number,
  beam: CompiledFireBeam,
  ticks: number,
  selfX: number,
  selfY: number,
): void {
  if (ticks === 1) {
    // The beam lighting is a shot leaving the barrel (#234), and `value` carries its
    // damage, which tells a big laser's sound from a small one's.
    sim.events.push(EventKind.ShotFired, index, NO_SLOT, selfX, selfY, 0, 0, beam.damage);
  }
  if (ticks < 1 || ticks > beam.beamTicks || sim.playerInvulnerableTicks > 0) {
    return;
  }
  if (!enemyBeam(sim, index, beamScratch)) {
    return;
  }
  const playerIndex = sim.playerIndex;
  const playerX = sim.positionX(playerIndex);
  const playerY = sim.positionY(playerIndex);
  const reach = beam.halfWidth + (sim.body.data[playerIndex * 2] ?? 0);
  for (let segment = 0; segment < beamScratch.count; segment++) {
    const ax = beamScratch.ax[segment] ?? 0;
    const ay = beamScratch.ay[segment] ?? 0;
    const bx = beamScratch.bx[segment] ?? 0;
    const by = beamScratch.by[segment] ?? 0;
    if (distanceToSegment(playerX, playerY, ax, ay, bx, by) > reach) {
      continue;
    }
    // The normal points from the beam to the player — away from what hit them.
    const alongX = bx - ax;
    const alongY = by - ay;
    const along = vectorLength(alongX, alongY) || 1;
    const side = (playerX - ax) * (alongY / along) - (playerY - ay) * (alongX / along);
    const nx = side >= 0 ? alongY / along : -alongY / along;
    const ny = side >= 0 ? -alongX / along : alongX / along;
    sim.events.push(
      EventKind.Contact,
      playerIndex,
      index,
      selfX,
      selfY,
      nx,
      ny,
      eliteAttackDamage(sim, index, beam.damage),
    );
    if (beam.freeze) {
      applyFreeze(sim, playerIndex, sim.tuning.projectileTags.playerFreezeDurationTicks);
    }
    return;
  }
}

/**
 * The ranged swing (#437, `fireSweep`): the arm runs the same arc the blade
 * does, and every `shotEveryTicks` from the swing's first tick a shot leaves
 * along the arm's bearing right now. Deterministic — the aim was locked on
 * entry (`lockMeleeAim`), the bearing is a pure function of ticks — and never
 * re-aimed, so the ground the arm has already passed is safe for the rest of
 * the swing. Not gated on sight: a committed swing goes where it was aimed,
 * and the arena's boulders are what the shots run into.
 */
function applyFireSweep(
  sim: GameSim,
  index: number,
  sweep: CompiledFireSweep,
  ticks: number,
  selfX: number,
  selfY: number,
): void {
  if (ticks > sweep.sweepTicks || ticks % sweep.shotEveryTicks !== 0) {
    return;
  }
  const motion = sim.enemyMotion.data;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const aimAngle = Math.atan2(motion[motionBase + 1] ?? 0, motion[motionBase] ?? 1);
  fireFrom(
    sim,
    index,
    selfX,
    selfY,
    sim.body.data[index * 2] ?? 0,
    meleeBladeAngle(sweep, aimAngle, ticks),
    sweep,
  );
}

const LOG_KIND = propKindIndex('log');

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

/** Room units over which a diving flyer comes down to the floor before its point (#411). */
const DIVE_DESCENT = 24;
/** How high, as a fraction of flying height, a climbing charge (#40) is drawn while over a block. */
const CLIMB_LIFT = 0.55;

/**
 * How far up in the air the body at `index` is drawn, `0` (on the floor) to
 * `1` (flying height) — always `0` for a body that does not fly (#411). A
 * flyer is up except in a state that `land`s, and a dive to a point brings
 * it down over its last `DIVE_DESCENT` room units, so the beak meets the
 * plank as the dive ends rather than the body dropping out of the air.
 */
export function enemyFlightHeight(sim: GameSim, index: number): number {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return 0;
  }
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  if (!compiled.flying) {
    // A climbing charge (#40, the Steinbock) is lifted while its body is over
    // a block, so going over a rock reads as a bound rather than a clip.
    const movement = state?.movement;
    if (
      movement?.behaviour === 'chargeAtPlayer' &&
      movement.climbsBlocks === true &&
      !sim.room.isClear(sim.positionX(index), sim.positionY(index), 0.5, CLEAR_IGNORE_PITS)
    ) {
      return CLIMB_LIFT;
    }
    return 0;
  }
  if (state === undefined || state.grounded) {
    return 0;
  }
  const movement = state.movement;
  if (movement.behaviour !== 'chargeAtPlayer' || movement.untilTargetPoint !== true) {
    return 1;
  }
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const motion = sim.enemyMotion.data;
  const left =
    ((motion[motionBase + 4] ?? 0) - sim.positionX(index)) * (motion[motionBase] ?? 0) +
    ((motion[motionBase + 5] ?? 0) - sim.positionY(index)) * (motion[motionBase + 1] ?? 0);
  return clamp(left / DIVE_DESCENT, 0, 1);
}

/** What a flying body is doing in the air, for the renderer to pick its art by. */
export const FlightPose = {
  /** Not in the air at all, or sitting on its perch: drawn as authored. */
  None: 0,
  /** On the wing; `heading` is the way it is going. */
  Flying: 1,
  /** Diving at its point (`chargeAtPlayer` with `untilTargetPoint`); `heading` is the dive's. */
  Diving: 2,
} as const;
export type FlightPoseValue = (typeof FlightPose)[keyof typeof FlightPose];

/** Where `enemyFlightPose` writes the way a flier faces — x, y; read, never kept. */
export const flightHeading = new Float64Array(2);

/**
 * What the flying body at `index` is doing in the air (#411, the Specht's
 * flight art), with the way it faces written to `flightHeading`: its heading
 * on the wing, or — hanging still in the air, drumming — the way to the player.
 */
export function enemyFlightPose(sim: GameSim, index: number): FlightPoseValue {
  if (!enemyAirborne(sim, index)) {
    return FlightPose.None;
  }
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const selfX = sim.positionX(index);
  const selfY = sim.positionY(index);
  if (compiled.perches && onPerch(sim, index, selfX, selfY)) {
    return FlightPose.None;
  }
  const movement = compiled.states[sim.enemy.data[base + 1] ?? 0]?.movement;
  const motionBase = index * ENEMY_MOTION_STRIDE;
  const motion = sim.enemyMotion.data;
  if (movement?.behaviour === 'chargeAtPlayer' && movement.untilTargetPoint === true) {
    flightHeading[0] = motion[motionBase] ?? 0;
    flightHeading[1] = motion[motionBase + 1] ?? 0;
    return FlightPose.Diving;
  }
  if (movement?.behaviour === 'pause') {
    // Hanging in the air, drumming: turned to the one it is about to dive at.
    flightHeading[0] = sim.positionX(sim.playerIndex) - selfX;
    flightHeading[1] = sim.positionY(sim.playerIndex) - selfY;
  } else {
    // `flyLoops` and `returnToPerch` keep their heading in the heading slots.
    flightHeading[0] = motion[motionBase] ?? 0;
    flightHeading[1] = motion[motionBase + 1] ?? 0;
  }
  return FlightPose.Flying;
}

/** Whether the body at `index` is off the arena (#412, `leaveArena`): the renderer does not draw it. */
export function enemyHidden(sim: GameSim, index: number): boolean {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return false;
  }
  const base = index * ENEMY_STRIDE;
  const state = sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0];
  return state?.hidden === true;
}

/** Reusable scratch struct for `enemyRampLine`, written in place so a render loop never allocates. */
export interface EnemyRampLineInfo {
  /** The ramp the body starts its pass from, and the one it jumps off. */
  startX: number;
  startY: number;
  farX: number;
  farY: number;
  /** 0..1, how far up the ramps are: rising over the capture state's telegraph, then up. */
  rise: number;
}

const rampScratch = new Float64Array(4);

/**
 * The ramps a body's captured line stands (#412): written to `out` and true
 * while the body's current state belongs to its line (`CompiledState.usesLine`)
 * — rising through the telegraph of the state that captured it, up for every
 * state that rides it. The renderer eases them down once this goes false.
 *
 * @hot — one call per enemy per frame, from `RampView.sync`.
 */
export function enemyRampLine(sim: GameSim, index: number, out: EnemyRampLineInfo): boolean {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return false;
  }
  const base = index * ENEMY_STRIDE;
  const state = sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0];
  if (state?.usesLine !== true) {
    return false;
  }
  readLine(sim, index * ENEMY_MOTION_STRIDE + MOTION_SCRIPTED, rampScratch);
  out.startX = rampScratch[0] ?? 0;
  out.startY = rampScratch[1] ?? 0;
  out.farX = rampScratch[2] ?? 0;
  out.farY = rampScratch[3] ?? 0;
  out.rise = state.capturesLine
    ? state.telegraphTicks > 0
      ? clamp(enemyTelegraphProgress(sim, index), 0, 1)
      : 1
    : 1;
  return true;
}

/** Wrapper `point` of the volley the body is lobbing (#412), for the renderer. */
export interface LobbedVolleyFlight {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  /** 0..1, through the throw — the same fraction `enemyTelegraphProgress` computes for this state. */
  progress: number;
  /** The cloud it will leave: the radius its floor marker is drawn at. */
  radius: number;
}

/**
 * How many wrappers the body at `index` has in the air right now — the points
 * its current `lobVolley` state captured, while the state's telegraph runs — or
 * zero (#412). `lobbedVolleyFlight` then describes each.
 */
export function lobbedVolleyCount(sim: GameSim, index: number): number {
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return 0;
  }
  const base = index * ENEMY_STRIDE;
  const state = sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0];
  if (state?.volley === null || state?.volley === undefined) {
    return 0;
  }
  if (enemyTelegraphProgress(sim, index) <= 0) {
    return 0;
  }
  return volleyCount(sim, index * ENEMY_MOTION_STRIDE + MOTION_SCRIPTED);
}

/** Writes wrapper `point`'s flight to `out`; call only below `lobbedVolleyCount`. */
export function lobbedVolleyFlight(
  sim: GameSim,
  index: number,
  point: number,
  out: LobbedVolleyFlight,
): void {
  const block = index * ENEMY_MOTION_STRIDE + MOTION_SCRIPTED;
  out.startX = sim.positionX(index);
  out.startY = sim.positionY(index);
  out.endX = volleyPoint(sim, block, point, 0);
  out.endY = volleyPoint(sim, block, point, 1);
  out.progress = enemyTelegraphProgress(sim, index);
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  out.radius =
    state === undefined
      ? 0
      : (stateAfterTelegraph(compiled, state)?.volleyBurst?.cloud.radius ?? 0);
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
  /** The line a laser is about to light (#40): read the geometry back with `enemyBeamTelegraph`. */
  Beam: 5,
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
/** The `landing` of a dive-to-a-point state (#411), or `null` for any other state. */
function landingOf(
  state: CompiledState | null,
): { readonly radius: number; readonly damage: number } | null {
  const movement = state?.movement;
  return movement?.behaviour === 'chargeAtPlayer' && movement.untilTargetPoint === true
    ? (movement.landing ?? null)
    : null;
}

/** Whether the state after `state`'s wind-up is a `chargeAtPlayer` with `untilTargetPoint` (#411). */
function divesToPoint(compiled: CompiledEnemy, state: CompiledState): boolean {
  const movement = stateAfterTelegraph(compiled, state)?.movement;
  return movement?.behaviour === 'chargeAtPlayer' && movement.untilTargetPoint === true;
}

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
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  const state = compiled.states[sim.enemy.data[base + 1] ?? 0];
  if (state === undefined) {
    return false;
  }
  // A dive with a landing (#411) is warned as its landing circle — where it
  // will hit, not which way it will fly — over the wind-up, tracking the
  // player, and then held on the spot through the dive itself.
  const landing = progress > 0 ? landingOf(stateAfterTelegraph(compiled, state)) : landingOf(state);
  if (landing !== null) {
    const motionBase = index * ENEMY_MOTION_STRIDE;
    out.shape = TelegraphShape.Ground;
    out.progress = progress > 0 ? progress : 1;
    out.x = sim.enemyMotion.data[motionBase + 4] ?? 0;
    out.y = sim.enemyMotion.data[motionBase + 5] ?? 0;
    out.angle = 0;
    out.arc = 0;
    out.reach = landing.radius;
    return true;
  }
  if (progress <= 0) {
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
  // A laser (#40) warns with the line it is about to light.
  if (follow !== null && follow.fireBeam !== null) {
    out.shape = TelegraphShape.Beam;
    out.x = selfX;
    out.y = selfY;
    out.angle = enemyAimAngle(sim, index);
    out.arc = 0;
    out.reach = 0;
    return true;
  }
  // A ranged sweep (#437) warns with the same arc: the fan the shots will
  // fill, drawn out to its authored `telegraphReach`.
  if (follow !== null && follow.fireSweep !== null) {
    out.shape = TelegraphShape.Arc;
    out.x = selfX;
    out.y = selfY;
    out.angle = enemyAimAngle(sim, index);
    out.arc = follow.fireSweep.arc;
    out.reach = follow.fireSweep.telegraphReach;
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
