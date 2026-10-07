import { CollisionLayer } from '../collision/layers.js';
import type { Entity } from '../ecs/entity.js';
import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';
import { vectorLength } from '../math.js';
import { nextWaypoint, straightClear, type Waypoint } from '../room/pathfind.js';
import { ENEMY_FLAG_LATCHED, ENEMY_STRIDE } from './enemy.js';
import { addPush } from './movement.js';

/**
 * Der Ordner, the bouncer familiar (`content/items/der-ordner.ts`): a body
 * of his own that keeps near Alois without being glued to him — he trails a
 * little behind, slower than Alois walks, and finds his own way round
 * whatever is in the way (the room's pathfinder, as an enemy uses it). Only
 * once he is back near Alois does he look out: a mob within *his own*
 * `guardRadius` (measured from where he stands, not from Alois) gets strode
 * at and shoved away — that one, mass-scaled, no damage. Then he catches his
 * breath for `cooldownTicks`, long enough that a slow mob he shoved can
 * still walk back in before the next.
 *
 * Not an ECS body on purpose: nothing collides with him, nothing can hurt
 * him, shots pass through him, and he never counts toward a room's clear.
 * He is one slot of state on `GameSim.ordner`, stepped by the item while it
 * is held and drawn by `render/ordner-view.ts` while `ORDNER_ACTIVE` is set.
 * Deterministic: only sim state goes in, no random draw at all.
 *
 * It replaced an invisible aura that shoved every body within 40 units away
 * every tick: the shove stacked faster than it decayed, out-pushed the walk
 * speed of everything on Floor 3, and made holding the item invulnerability.
 *
 * @hot — runs in the frame loop while the item is held. Nothing in here may
 * allocate.
 */

/** `GameSim.ordner` fields. */
export const ORDNER_ACTIVE = 0;
export const ORDNER_X = 1;
export const ORDNER_Y = 2;
export const ORDNER_PREV_X = 3;
export const ORDNER_PREV_Y = 4;
/** 0 walking with Alois, 1 striding at `ORDNER_TARGET`. */
export const ORDNER_MODE = 5;
/** The entity being strode at, or -1. */
export const ORDNER_TARGET = 6;
export const ORDNER_COOLDOWN = 7;
/** Ticks left of the shove pose — the renderer's to read. */
export const ORDNER_SHOVE_POSE = 8;
/** -1 facing left (as authored), 1 right. */
export const ORDNER_FACING = 9;
export const ORDNER_MODE_TICKS = 10;
/** Set by a room load: put him back beside Alois next step, wherever the doors put him. */
export const ORDNER_SNAP = 11;
/** Which way he is turned, for the renderer's strip: `ORDNER_SIDE`, `ORDNER_SOUTH` or `ORDNER_NORTH`. */
export const ORDNER_DIRECTION = 12;
/** The point he is walking to on a path round something, when the straight line is blocked. */
export const ORDNER_WAY_X = 13;
export const ORDNER_WAY_Y = 14;
export const ORDNER_STRIDE = 15;

export const ORDNER_SIDE = 0;
export const ORDNER_SOUTH = 1;
export const ORDNER_NORTH = 2;

const MODE_FOLLOW = 0;
const MODE_STRIDE = 1;

/** His footprint: what he walks around blocks with, and stands on. */
export const ORDNER_RADIUS = 3;
/** Room units within which he counts as arrived where he was walking. */
const ARRIVE = 1.5;
/** Ticks between path searches while the straight line is blocked. */
const REPATH_TICKS = 12;
/** Scratch for `nextWaypoint` — written, never allocated. */
const waypoint: Waypoint = { x: 0, y: 0 };

/** Puts him beside the player and turns him on — the item's pickup. */
export function summonOrdner(sim: GameSim): void {
  const state = sim.ordner;
  state[ORDNER_ACTIVE] = 1;
  state[ORDNER_SNAP] = 1;
  state[ORDNER_MODE] = MODE_FOLLOW;
  state[ORDNER_TARGET] = -1;
  state[ORDNER_COOLDOWN] = 0;
  state[ORDNER_SHOVE_POSE] = 0;
  state[ORDNER_FACING] = -1;
  state[ORDNER_DIRECTION] = ORDNER_SOUTH;
}

/** One tick of the bouncer. Called by the item's `onTick` while it is held. */
export function stepOrdner(sim: GameSim): void {
  const state = sim.ordner;
  const tuning = sim.tuning.ordner;
  const player = sim.playerIndex;
  const playerX = sim.positionX(player);
  const playerY = sim.positionY(player);
  if ((state[ORDNER_ACTIVE] ?? 0) === 0) {
    summonOrdner(sim);
  }
  if ((state[ORDNER_SNAP] ?? 0) !== 0) {
    state[ORDNER_SNAP] = 0;
    placeBeside(sim, playerX, playerY, -1);
    state[ORDNER_MODE] = MODE_FOLLOW;
    state[ORDNER_TARGET] = -1;
  }
  const x = state[ORDNER_X] ?? playerX;
  const y = state[ORDNER_Y] ?? playerY;
  state[ORDNER_PREV_X] = x;
  state[ORDNER_PREV_Y] = y;
  state[ORDNER_COOLDOWN] = Math.max(0, (state[ORDNER_COOLDOWN] ?? 0) - 1);
  state[ORDNER_SHOVE_POSE] = Math.max(0, (state[ORDNER_SHOVE_POSE] ?? 0) - 1);
  state[ORDNER_MODE_TICKS] = (state[ORDNER_MODE_TICKS] ?? 0) + 1;

  const fromAlois = vectorLength(x - playerX, y - playerY);

  // On guard only once he is back near Alois — and then for what is near
  // *him*: a mob close to Alois but out of his own reach is not his yet.
  if (
    (state[ORDNER_MODE] ?? MODE_FOLLOW) === MODE_FOLLOW &&
    state[ORDNER_COOLDOWN] === 0 &&
    fromAlois <= tuning.nearAloisDistance
  ) {
    const target = nearestIntruder(sim, x, y, tuning.guardRadius);
    if (target >= 0) {
      state[ORDNER_MODE] = MODE_STRIDE;
      state[ORDNER_TARGET] = sim.world.entityAt(target);
      state[ORDNER_MODE_TICKS] = 0;
    }
  }

  if ((state[ORDNER_MODE] ?? MODE_FOLLOW) === MODE_STRIDE) {
    const target = liveTarget(sim, state[ORDNER_TARGET] ?? -1);
    if (
      target < 0 ||
      state[ORDNER_MODE_TICKS] > tuning.giveUpTicks ||
      // Never chased so far that Alois is left on his own.
      fromAlois > tuning.leashDistance
    ) {
      state[ORDNER_MODE] = MODE_FOLLOW;
      state[ORDNER_TARGET] = -1;
    } else {
      const targetX = sim.positionX(target);
      const targetY = sim.positionY(target);
      const reach = ORDNER_RADIUS + (sim.body.data[target * 2] ?? 0) + 1;
      if (vectorLength(targetX - x, targetY - y) <= reach) {
        shove(sim, target, x, y);
      } else {
        seek(sim, targetX, targetY, tuning.strideSpeed);
      }
      return;
    }
  }

  // Trailing Alois: walks once he has got far enough ahead, a little slower
  // than Alois does — so he lags rather than sticks — and stops a short way
  // off rather than on top of him. Left far behind (a long sprint), he
  // hurries at his stride to catch up.
  if (fromAlois > tuning.comfortDistance) {
    const speed = fromAlois > tuning.leashDistance ? tuning.strideSpeed : tuning.walkSpeed;
    seek(sim, playerX, playerY, Math.min(speed, fromAlois - tuning.comfortDistance + ARRIVE));
  }
}

/** Shoves `target` straight away from him, ends the stride, starts the cooldown. */
function shove(sim: GameSim, target: number, x: number, y: number): void {
  const state = sim.ordner;
  const tuning = sim.tuning.ordner;
  let dirX = sim.positionX(target) - x;
  let dirY = sim.positionY(target) - y;
  const length = vectorLength(dirX, dirY);
  dirX = length === 0 ? (state[ORDNER_FACING] ?? -1) : dirX / length;
  dirY = length === 0 ? 0 : dirY / length;
  const mass = Math.max(0.01, sim.body.data[target * 2 + 1] ?? 1);
  addPush(sim, target, (dirX * tuning.shoveStrength) / mass, (dirY * tuning.shoveStrength) / mass);
  turnTo(state, dirX, dirY);
  state[ORDNER_SHOVE_POSE] = tuning.shovePoseTicks;
  state[ORDNER_COOLDOWN] = tuning.cooldownTicks;
  state[ORDNER_MODE] = MODE_FOLLOW;
  state[ORDNER_TARGET] = -1;
}

/**
 * The nearest mob within `radius` of `(px, py)` — where he stands — that can be shoved: alive,
 * on a collision layer (not riding on Alois, not under the water), and one
 * that seals the room — a shopkeeper is left alone. -1 when there is none.
 */
function nearestIntruder(sim: GameSim, px: number, py: number, radius: number): number {
  const states = sim.world.states;
  const masks = sim.world.masks;
  const required = sim.enemyMask;
  const collision = sim.collision.data;
  const enemy = sim.enemy.data;
  let best = -1;
  let bestSq = radius * radius;
  for (let index = 0; index < sim.world.highWater; index++) {
    if (states[index] !== World.ALIVE || ((masks[index] ?? 0) & required) !== required) {
      continue;
    }
    if (((collision[index * 2] ?? 0) & (CollisionLayer.Enemy | CollisionLayer.Obstacle)) === 0) {
      continue;
    }
    if (((enemy[index * ENEMY_STRIDE + 3] ?? 0) & ENEMY_FLAG_LATCHED) !== 0) {
      continue;
    }
    if (!sim.enemies.at(enemy[index * ENEMY_STRIDE] ?? 0).locksRoom) {
      continue;
    }
    const dx = sim.positionX(index) - px;
    const dy = sim.positionY(index) - py;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestSq) {
      bestSq = distSq;
      best = index;
    }
  }
  return best;
}

/** The slot of `entity` if it is still a live, shovable body, else -1. */
function liveTarget(sim: GameSim, stored: number): number {
  // Stored as a plain number in a typed array; it was an `Entity` going in.
  const entity = stored as Entity;
  if (stored < 0 || !sim.world.isAlive(entity)) {
    return -1;
  }
  const index = sim.world.indexOf(entity);
  if (
    ((sim.collision.data[index * 2] ?? 0) & (CollisionLayer.Enemy | CollisionLayer.Obstacle)) ===
    0
  ) {
    return -1;
  }
  return index;
}

/**
 * Steps him toward `(tx, ty)` at `speed`: straight there while the way is
 * clear, otherwise toward a waypoint the room's pathfinder found round
 * whatever is in the way (searched again every `REPATH_TICKS`, or on
 * reaching it) — the same `nextWaypoint` a walking enemy uses.
 */
function seek(sim: GameSim, tx: number, ty: number, speed: number): void {
  const state = sim.ordner;
  const x = state[ORDNER_X] ?? 0;
  const y = state[ORDNER_Y] ?? 0;
  const room = sim.room;
  if (straightClear(room, x, y, tx, ty, ORDNER_RADIUS)) {
    walkToward(sim, tx, ty, speed);
    return;
  }
  let wayX = state[ORDNER_WAY_X] ?? tx;
  let wayY = state[ORDNER_WAY_Y] ?? ty;
  if (
    sim.tick % REPATH_TICKS === 0 ||
    vectorLength(wayX - x, wayY - y) <= ARRIVE ||
    !straightClear(room, x, y, wayX, wayY, ORDNER_RADIUS)
  ) {
    if (!nextWaypoint(room, x, y, tx, ty, ORDNER_RADIUS, waypoint)) {
      // Walled off: press on toward it and let the slide do what it can.
      walkToward(sim, tx, ty, speed);
      return;
    }
    wayX = waypoint.x;
    wayY = waypoint.y;
    state[ORDNER_WAY_X] = wayX;
    state[ORDNER_WAY_Y] = wayY;
  }
  walkToward(sim, wayX, wayY, speed);
}

/** Steps him toward `(tx, ty)` at `speed`, sliding along blocks rather than through them. */
function walkToward(sim: GameSim, tx: number, ty: number, speed: number): void {
  const state = sim.ordner;
  const x = state[ORDNER_X] ?? 0;
  const y = state[ORDNER_Y] ?? 0;
  const dx = tx - x;
  const dy = ty - y;
  const length = vectorLength(dx, dy);
  if (length <= ARRIVE) {
    return;
  }
  const step = Math.min(speed, length);
  const nx = x + (dx / length) * step;
  const ny = y + (dy / length) * step;
  const room = sim.room;
  if (room.isClear(nx, ny, ORDNER_RADIUS)) {
    state[ORDNER_X] = nx;
    state[ORDNER_Y] = ny;
  } else if (room.isClear(nx, y, ORDNER_RADIUS)) {
    state[ORDNER_X] = nx;
  } else if (room.isClear(x, ny, ORDNER_RADIUS)) {
    state[ORDNER_Y] = ny;
  }
  turnTo(state, dx, dy);
}

/**
 * Turns him toward `(dx, dy)`: side-on when it is mostly sideways (facing
 * left or right), else toward the camera or away — the same split Alois's
 * own strips make.
 */
function turnTo(state: Float64Array, dx: number, dy: number): void {
  if (Math.abs(dx) > 0.05) {
    state[ORDNER_FACING] = dx < 0 ? -1 : 1;
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) > 0.05) {
      state[ORDNER_DIRECTION] = ORDNER_SIDE;
    }
  } else {
    state[ORDNER_DIRECTION] = dy > 0 ? ORDNER_SOUTH : ORDNER_NORTH;
  }
}

/** Stands him `comfortDistance` to one side of the player, or on the player if that is in a wall. */
function placeBeside(sim: GameSim, px: number, py: number, side: number): void {
  const state = sim.ordner;
  const offset = sim.tuning.ordner.comfortDistance;
  let x = px + side * offset;
  if (!sim.room.isClear(x, py, ORDNER_RADIUS)) {
    x = px - side * offset;
  }
  if (!sim.room.isClear(x, py, ORDNER_RADIUS)) {
    x = px;
  }
  state[ORDNER_X] = x;
  state[ORDNER_Y] = py;
  state[ORDNER_PREV_X] = x;
  state[ORDNER_PREV_Y] = py;
}
