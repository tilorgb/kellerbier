import { CollisionLayer, collisionMaskFor } from '../collision/layers.js';
import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';
import type { InputFrame } from '../input/frame.js';
import { vectorLength } from '../math.js';
import { ring } from '../particle/effects.js';
import { ParticleKind } from '../particle/store.js';
import { addPush } from './movement.js';
import { applyPoison } from './status-effects.js';
import {
  ENEMY_FLAG_LATCHED,
  ENEMY_FLAG_SHAKEN_OFF,
  ENEMY_MOTION_STRIDE,
  ENEMY_STRIDE,
} from './enemy.js';

/**
 * Bodies riding on the player, and the player shaking them off (#406, the
 * Zecke — `latchOnPlayer` in `sim/enemy/definition.ts`).
 *
 * `systems/enemy.ts` does the latching, on touch, because that is where a
 * state's behaviours run. Everything after that is here, once a tick, after
 * every system that moves the player or pushes bodies around has had its say:
 *
 * - **Shake detection.** The game has no dash (`systems/movement.ts`), so
 *   changing direction is the one way to throw a tick — *any* change of
 *   direction, not only a flip back: a turning meter. Every tick, the angle
 *   the movement input turned through since the last direction it pointed in
 *   (the last *non-zero* one, so letting go between two key presses, or a
 *   stick passing through its dead zone, does not hide the turn) is added to
 *   it, and the meter drains by half every `shakeHalfLifeTicks`. Reaching
 *   `shakeTurnDegrees` throws off **every** latched body at once.
 *   A left-right wiggle fills it in three flips; running circles (W, D, S, A,
 *   or a stick swirled round) fills it in about two laps; ordinary
 *   steering, a quarter turn now and then, drains away long before. (It used
 *   to count only turns sharper than 120°, which a circle never makes — so
 *   the one wiggle players reach for first did nothing.)
 *   Read from the raw `InputFrame`, never from velocity: a replay's input log
 *   alone reproduces it, and a player pinned against a wall can still shake.
 * - **Riding.** Each latched body is put back on the player at the offset it
 *   latched with, and the player's poison is refreshed.
 *
 * If a dash is ever added, it should shake ticks off too: call `shakeOff`
 * from wherever the dash starts.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** `GameSim.latchHeading` slots: the last non-zero movement direction, as a unit vector. */
export const SHAKE_HEADING_X = 0;
export const SHAKE_HEADING_Y = 1;

const FLICK_SPOKES = 5;
const FLICK_SPEED = 1.1;
const FLICK_TICKS = 12;

export function stepLatches(sim: GameSim, input: Readonly<InputFrame>): void {
  const latched = countLatched(sim);
  sim.latchState[0] = latched;
  const turned = readTurn(sim, input);
  const meter = sim.latchTurn;
  if (latched === 0) {
    // Nothing to shake: turning from before a tick latched never counts
    // toward throwing it, or a player who happened to be zig-zagging would
    // shed it the instant it landed.
    meter[0] = 0;
    return;
  }
  const tuning = sim.tuning.latch;
  const drain = 0.5 ** (1 / Math.max(1, tuning.shakeHalfLifeTicks));
  meter[0] = (meter[0] ?? 0) * drain + turned;
  if (meter[0] >= tuning.shakeTurnDegrees) {
    shakeOff(sim);
    return;
  }
  ride(sim);
}

/**
 * Throws every latched body off the player: back onto its collision layer,
 * dropped on the floor a little way out on the side it rode on, flicked
 * outward, and flagged so its `onShakenOff` transition fires next tick.
 */
export function shakeOff(sim: GameSim): void {
  const player = sim.playerIndex;
  const playerX = sim.positionX(player);
  const playerY = sim.positionY(player);
  const body = sim.body.data;
  const playerFootprint = body[player * 2] ?? 0;
  const tuning = sim.tuning.latch;
  const states = sim.world.states;
  const masks = sim.world.masks;
  const required = sim.enemyMask;
  const enemy = sim.enemy.data;
  const motion = sim.enemyMotion.data;
  const transform = sim.transform.data;
  const collision = sim.collision.data;
  const obstacleMask = collisionMaskFor(CollisionLayer.Obstacle);
  let thrown = 0;
  for (let index = 0; index < sim.world.highWater; index++) {
    if (states[index] !== World.ALIVE || ((masks[index] ?? 0) & required) !== required) {
      continue;
    }
    const flagSlot = index * ENEMY_STRIDE + 3;
    const flags = enemy[flagSlot] ?? 0;
    if ((flags & ENEMY_FLAG_LATCHED) === 0) {
      continue;
    }
    enemy[flagSlot] = (flags & ~ENEMY_FLAG_LATCHED) | ENEMY_FLAG_SHAKEN_OFF;
    // Every enemy is an `Obstacle` (`GameSim.spawnTarget`), which is what a
    // latched body was before `latchToPlayer` took it off every layer.
    collision[index * 2] = CollisionLayer.Obstacle;
    collision[index * 2 + 1] = obstacleMask;

    const motionBase = index * ENEMY_MOTION_STRIDE;
    let outX = motion[motionBase] ?? 0;
    let outY = motion[motionBase + 1] ?? 0;
    const length = vectorLength(outX, outY);
    outX = length === 0 ? 1 : outX / length;
    outY = length === 0 ? 0 : outY / length;
    const footprint = body[index * 2] ?? 0;
    const reach = playerFootprint + footprint + tuning.flingDistance;
    const landX = playerX + outX * reach;
    const landY = playerY + outY * reach;
    if (sim.room.isClear(landX, landY, footprint)) {
      transform[index * 4] = landX;
      transform[index * 4 + 1] = landY;
    }
    addPush(sim, index, outX * tuning.flingPush, outY * tuning.flingPush);
    ring(
      sim,
      transform[index * 4] ?? landX,
      transform[index * 4 + 1] ?? landY,
      FLICK_SPOKES,
      ParticleKind.Dust,
      FLICK_SPEED,
      FLICK_TICKS,
      2,
    );
    thrown += 1;
  }
  sim.latchTurn[0] = 0;
  sim.latchState[0] = 0;
  if (thrown > 0) {
    sim.playItemCue('zecke-shake-off');
  }
}

/** How many enemies are riding on the player right now. */
function countLatched(sim: GameSim): number {
  const states = sim.world.states;
  const masks = sim.world.masks;
  const required = sim.enemyMask;
  const enemy = sim.enemy.data;
  let count = 0;
  for (let index = 0; index < sim.world.highWater; index++) {
    if (states[index] !== World.ALIVE || ((masks[index] ?? 0) & required) !== required) {
      continue;
    }
    if (((enemy[index * ENEMY_STRIDE + 3] ?? 0) & ENEMY_FLAG_LATCHED) !== 0) {
      count += 1;
    }
  }
  return count;
}

/** Puts every latched body back on the player and keeps the poison going. */
function ride(sim: GameSim): void {
  const player = sim.playerIndex;
  const playerX = sim.positionX(player);
  const playerY = sim.positionY(player);
  const states = sim.world.states;
  const masks = sim.world.masks;
  const required = sim.enemyMask;
  const enemy = sim.enemy.data;
  const motion = sim.enemyMotion.data;
  const transform = sim.transform.data;
  const velocity = sim.velocity.data;
  for (let index = 0; index < sim.world.highWater; index++) {
    if (states[index] !== World.ALIVE || ((masks[index] ?? 0) & required) !== required) {
      continue;
    }
    if (((enemy[index * ENEMY_STRIDE + 3] ?? 0) & ENEMY_FLAG_LATCHED) === 0) {
      continue;
    }
    const motionBase = index * ENEMY_MOTION_STRIDE;
    transform[index * 4] = playerX + (motion[motionBase] ?? 0);
    transform[index * 4 + 1] = playerY + (motion[motionBase + 1] ?? 0);
    velocity[index * 2] = 0;
    velocity[index * 2 + 1] = 0;
  }
  if (!sim.playerDead) {
    applyPoison(sim, player);
  }
}

/**
 * Degrees the movement input turned this tick, from the last direction it
 * pointed in — 0 with nothing held, and on the first direction ever held.
 */
function readTurn(sim: GameSim, input: Readonly<InputFrame>): number {
  const moveX = input.moveX;
  const moveY = input.moveY;
  if (moveX === 0 && moveY === 0) {
    return 0;
  }
  const length = vectorLength(moveX, moveY);
  const unitX = moveX / length;
  const unitY = moveY / length;
  const heading = sim.latchHeading;
  const headingX = heading[SHAKE_HEADING_X] ?? 0;
  const headingY = heading[SHAKE_HEADING_Y] ?? 0;
  heading[SHAKE_HEADING_X] = unitX;
  heading[SHAKE_HEADING_Y] = unitY;
  if (headingX === 0 && headingY === 0) {
    return 0;
  }
  const cos = Math.max(-1, Math.min(1, unitX * headingX + unitY * headingY));
  return (Math.acos(cos) * 180) / Math.PI;
}
