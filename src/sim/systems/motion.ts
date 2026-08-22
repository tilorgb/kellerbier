import {
  circleOverlapsAabb,
  resolveCircleAabbX,
  resolveCircleAabbY,
} from '../collision/circle-aabb.js';
import { BLOCK_STRIDE, type RoomGeometry } from '../room/geometry.js';

/**
 * Moving a circular body through a room.
 *
 * Shared by the player, and by every enemy once they arrive: anything that
 * walks obeys the same wall rules, so there is one implementation of them.
 */

/** Bits returned by `moveBody`, saying which axes ran into something. */
export const BLOCKED_X = 1;
export const BLOCKED_Y = 2;

/**
 * Moves a body by a delta and returns which axes were blocked.
 *
 * Each axis is applied and resolved before the next one moves. Resolving both
 * together and backing the whole step out is what makes a body stick to a wall
 * it is running into diagonally; one axis at a time slides along it.
 *
 * Writes `x` and `y` in place. Allocates nothing.
 */
export function moveBody(
  room: RoomGeometry,
  transform: Float32Array,
  index: number,
  deltaX: number,
  deltaY: number,
  radius: number,
): number {
  const base = index * 4;
  const startX = transform[base] ?? 0;
  const startY = transform[base + 1] ?? 0;

  let blocked = 0;

  const wantedX = startX + deltaX;
  const resolvedX = resolveAxisX(room, wantedX, startY, radius, deltaX);
  if (resolvedX !== wantedX) {
    blocked |= BLOCKED_X;
  }

  const wantedY = startY + deltaY;
  const resolvedY = resolveAxisY(room, resolvedX, wantedY, radius, deltaY);
  if (resolvedY !== wantedY) {
    blocked |= BLOCKED_Y;
  }

  transform[base] = resolvedX;
  transform[base + 1] = resolvedY;
  return blocked;
}

/** The X a body may occupy, given the direction it is trying to move. */
export function resolveAxisX(
  room: RoomGeometry,
  centreX: number,
  centreY: number,
  radius: number,
  deltaX: number,
): number {
  if (deltaX === 0) {
    return centreX;
  }

  let resolved = centreX;
  if (resolved - radius < room.minX) {
    resolved = room.minX + radius;
  } else if (resolved + radius > room.maxX) {
    resolved = room.maxX - radius;
  }

  const movingRight = deltaX > 0;
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
export function resolveAxisY(
  room: RoomGeometry,
  centreX: number,
  centreY: number,
  radius: number,
  deltaY: number,
): number {
  if (deltaY === 0) {
    return centreY;
  }

  let resolved = centreY;
  if (resolved - radius < room.minY) {
    resolved = room.minY + radius;
  } else if (resolved + radius > room.maxY) {
    resolved = room.maxY - radius;
  }

  const movingDown = deltaY > 0;
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
 * The extent of a solid found at a probe point, reported through module-level
 * scratch rather than a returned object — this runs inside the frame loop, and
 * the frame loop does not allocate.
 */
let edgeMin = 0;
let edgeMax = 0;

/** True when a block spans `probeX` and overlaps the body's vertical extent. */
export function findBlockingEdgeY(
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
export function findBlockingEdgeX(
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

/** The lower bound of the edge found by the last successful `findBlockingEdge*`. */
export function blockingEdgeMin(): number {
  return edgeMin;
}

/** The upper bound of the edge found by the last successful `findBlockingEdge*`. */
export function blockingEdgeMax(): number {
  return edgeMax;
}
