import {
  circleOverlapsAabb,
  resolveCircleAabbX,
  resolveCircleAabbY,
} from '../collision/circle-aabb.js';
import type { GameSim } from '../game/sim.js';
import { type InputFrame, axisToUnit } from '../input/frame.js';
import { BLOCK_STRIDE, type RoomGeometry } from '../room/geometry.js';
import { type MovementTuning, accelerationOf, decelerationOf } from '../tuning.js';

/**
 * Player movement: acceleration toward a target velocity, friction when input
 * stops, and wall contact that slides.
 *
 * Momentum is the point. Instant velocity changes make dodging a toggle;
 * accelerating into a direction and sliding out of it makes it a commitment,
 * and that difference is most of why the genre feels the way it does. Every
 * constant behind it lives in `tuning.ts` and can be moved while the game runs.
 */
export function stepPlayerMovement(sim: GameSim, input: Readonly<InputFrame>): void {
  const index = sim.playerIndex;
  const tuning = sim.tuning.movement;

  const transform = sim.transform.data;
  const velocity = sim.velocity.data;
  const body = sim.body.data;

  const transformBase = index * 4;
  const velocityBase = index * 2;

  const x = transform[transformBase] ?? 0;
  const y = transform[transformBase + 1] ?? 0;
  const radius = body[index * 2] ?? 0;

  // The previous position is what the renderer interpolates from. It is written
  // before anything moves, every tick, so a frame drawn mid-tick is drawn
  // between two states that really happened.
  transform[transformBase + 2] = x;
  transform[transformBase + 3] = y;

  const inputX = axisToUnit(input.moveX);
  const inputY = axisToUnit(input.moveY);

  let velocityX = velocity[velocityBase] ?? 0;
  let velocityY = velocity[velocityBase + 1] ?? 0;

  velocityX = approachAxis(velocityX, inputX * tuning.maxSpeed, inputX !== 0, tuning);
  velocityY = approachAxis(velocityY, inputY * tuning.maxSpeed, inputY !== 0, tuning);

  // The sampler already scales a diagonal stick or key pair to unit length, so
  // this only trims the overshoot that the turn boost can produce mid-turn.
  const speed = Math.hypot(velocityX, velocityY);
  if (speed > tuning.maxSpeed) {
    const scale = tuning.maxSpeed / speed;
    velocityX *= scale;
    velocityY *= scale;
  }

  // Axis at a time, each one resolved against the room before the next moves.
  // Resolving both at once and backing the whole step out is what produces the
  // classic "sticks to the wall when running into it diagonally" feel.
  let nextX = x + velocityX;
  const clearedX = resolveAxisX(sim.room, nextX, y, radius, velocityX);
  if (clearedX !== nextX) {
    nextX = clearedX;
    velocityX = 0;
  }

  let nextY = y + velocityY;
  const clearedY = resolveAxisY(sim.room, nextX, nextY, radius, velocityY);
  if (clearedY !== nextY) {
    nextY = clearedY;
    velocityY = 0;
  }

  // Corner forgiveness runs after resolution, on the axis that was *not*
  // blocked: a player held against a wall by a few pixels of corner overlap is
  // nudged clear rather than left grinding against it.
  if (velocityX === 0 && inputX !== 0 && inputY === 0) {
    nextY = nudgeAroundCornerY(sim.room, nextX + Math.sign(inputX) * radius, nextY, radius, tuning);
  } else if (velocityY === 0 && inputY !== 0 && inputX === 0) {
    nextX = nudgeAroundCornerX(sim.room, nextX, nextY + Math.sign(inputY) * radius, radius, tuning);
  }

  transform[transformBase] = nextX;
  transform[transformBase + 1] = nextY;
  velocity[velocityBase] = velocityX;
  velocity[velocityBase + 1] = velocityY;
}

/**
 * Moves one velocity component toward its target.
 *
 * Accelerates while a direction is held and decelerates when it is not, both at
 * rates derived from the durations in the tuning. Reversing gets the turn boost,
 * because the tick count spent bleeding off the old direction is the part of
 * momentum that reads as sluggish rather than weighty.
 */
function approachAxis(
  current: number,
  target: number,
  held: boolean,
  tuning: Readonly<MovementTuning>,
): number {
  let rate = held ? accelerationOf(tuning) : decelerationOf(tuning);
  if (held && current * target < 0) {
    rate *= tuning.turnBoost;
  }

  const delta = target - current;
  if (Math.abs(delta) <= rate) {
    return target;
  }
  return current + Math.sign(delta) * rate;
}

/** The X the body may occupy, given where it is trying to go. */
function resolveAxisX(
  room: RoomGeometry,
  centreX: number,
  centreY: number,
  radius: number,
  velocityX: number,
): number {
  if (velocityX === 0) {
    return centreX;
  }

  let resolved = centreX;
  if (resolved - radius < room.minX) {
    resolved = room.minX + radius;
  } else if (resolved + radius > room.maxX) {
    resolved = room.maxX - radius;
  }

  const movingRight = velocityX > 0;
  const blocks = room.blocks;
  for (let block = 0; block < room.blockCount; block++) {
    const base = block * BLOCK_STRIDE;
    const minX = blocks[base] ?? 0;
    const minY = blocks[base + 1] ?? 0;
    const maxX = blocks[base + 2] ?? 0;
    const maxY = blocks[base + 3] ?? 0;
    if (!circleOverlapsAabb(resolved, centreY, radius, minX, minY, maxX, maxY)) {
      continue;
    }
    resolved = resolveCircleAabbX(resolved, centreY, radius, minX, minY, maxX, maxY, movingRight);
  }
  return resolved;
}

/** The Y counterpart of `resolveAxisX`. */
function resolveAxisY(
  room: RoomGeometry,
  centreX: number,
  centreY: number,
  radius: number,
  velocityY: number,
): number {
  if (velocityY === 0) {
    return centreY;
  }

  let resolved = centreY;
  if (resolved - radius < room.minY) {
    resolved = room.minY + radius;
  } else if (resolved + radius > room.maxY) {
    resolved = room.maxY - radius;
  }

  const movingDown = velocityY > 0;
  const blocks = room.blocks;
  for (let block = 0; block < room.blockCount; block++) {
    const base = block * BLOCK_STRIDE;
    const minX = blocks[base] ?? 0;
    const minY = blocks[base + 1] ?? 0;
    const maxX = blocks[base + 2] ?? 0;
    const maxY = blocks[base + 3] ?? 0;
    if (!circleOverlapsAabb(centreX, resolved, radius, minX, minY, maxX, maxY)) {
      continue;
    }
    resolved = resolveCircleAabbY(centreX, resolved, radius, minX, minY, maxX, maxY, movingDown);
  }
  return resolved;
}

/**
 * Nudges the body along Y when a corner it nearly cleared is all that blocks it.
 *
 * `probeX` is the leading edge of the body in the direction it is trying to go.
 * If a blocking edge is within the forgiveness distance of that edge, the body
 * is moved toward clearing it — which is the difference between a doorway that
 * feels precise and one that feels like it is fighting you.
 */
function nudgeAroundCornerY(
  room: RoomGeometry,
  probeX: number,
  centreY: number,
  radius: number,
  tuning: Readonly<MovementTuning>,
): number {
  if (!findBlockingEdgeY(room, probeX, centreY, radius)) {
    return centreY;
  }
  const overlapAbove = centreY + radius - edgeMin;
  const overlapBelow = edgeMax - (centreY - radius);
  if (overlapAbove > 0 && overlapAbove <= tuning.cornerForgiveness) {
    return centreY - Math.min(tuning.cornerNudgeSpeed, overlapAbove);
  }
  if (overlapBelow > 0 && overlapBelow <= tuning.cornerForgiveness) {
    return centreY + Math.min(tuning.cornerNudgeSpeed, overlapBelow);
  }
  return centreY;
}

/** The X counterpart of `nudgeAroundCornerY`. */
function nudgeAroundCornerX(
  room: RoomGeometry,
  centreX: number,
  probeY: number,
  radius: number,
  tuning: Readonly<MovementTuning>,
): number {
  if (!findBlockingEdgeX(room, centreX, probeY, radius)) {
    return centreX;
  }
  const overlapLeft = centreX + radius - edgeMin;
  const overlapRight = edgeMax - (centreX - radius);
  if (overlapLeft > 0 && overlapLeft <= tuning.cornerForgiveness) {
    return centreX - Math.min(tuning.cornerNudgeSpeed, overlapLeft);
  }
  if (overlapRight > 0 && overlapRight <= tuning.cornerForgiveness) {
    return centreX + Math.min(tuning.cornerNudgeSpeed, overlapRight);
  }
  return centreX;
}

/**
 * The extent of whatever solid sits at a probe point.
 *
 * Reported through module-level scratch rather than a returned object, because
 * this runs inside the frame loop and the frame loop does not allocate.
 */
let edgeMin = 0;
let edgeMax = 0;

/** True when a block spans `probeX` and overlaps the body's vertical extent. */
function findBlockingEdgeY(
  room: RoomGeometry,
  probeX: number,
  centreY: number,
  radius: number,
): boolean {
  const blocks = room.blocks;
  for (let block = 0; block < room.blockCount; block++) {
    const base = block * BLOCK_STRIDE;
    const minX = blocks[base] ?? 0;
    const maxX = blocks[base + 2] ?? 0;
    if (probeX < minX || probeX > maxX) {
      continue;
    }
    const minY = blocks[base + 1] ?? 0;
    const maxY = blocks[base + 3] ?? 0;
    if (centreY + radius <= minY || centreY - radius >= maxY) {
      continue;
    }
    edgeMin = minY;
    edgeMax = maxY;
    return true;
  }
  return false;
}

/** The X counterpart of `findBlockingEdgeY`. */
function findBlockingEdgeX(
  room: RoomGeometry,
  centreX: number,
  probeY: number,
  radius: number,
): boolean {
  const blocks = room.blocks;
  for (let block = 0; block < room.blockCount; block++) {
    const base = block * BLOCK_STRIDE;
    const minY = blocks[base + 1] ?? 0;
    const maxY = blocks[base + 3] ?? 0;
    if (probeY < minY || probeY > maxY) {
      continue;
    }
    const minX = blocks[base] ?? 0;
    const maxX = blocks[base + 2] ?? 0;
    if (centreX + radius <= minX || centreX - radius >= maxX) {
      continue;
    }
    edgeMin = minX;
    edgeMax = maxX;
    return true;
  }
  return false;
}
