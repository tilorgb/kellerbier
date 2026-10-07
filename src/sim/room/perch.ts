import {
  BLOCK_STRIDE,
  CLEAR_IGNORE_DESTRUCTIBLE,
  CLEAR_IGNORE_PITS,
  type RoomGeometry,
} from './geometry.js';

/**
 * Where on a room's wall a flying body perches (#411, the Specht).
 *
 * The nearest point to `(x, y)` a body of `radius` can sit at with its edge
 * against a wall — one of the room's four outer walls, or the face of a block
 * that is wall rather than furniture (`blockOverflyable === 0`: an `L` or
 * `T` room's unclaimed cells, which are the inside corners of its walls).
 * Furniture, water and pits are no obstacle to a flyer, so they never rule a
 * point out (`CLEAR_IGNORE_DESTRUCTIBLE | CLEAR_IGNORE_PITS` — "destructible"
 * and "overflyable" are the same rectangles).
 *
 * Writes the point and the direction facing into the room to `out`
 * (`x, y, normalX, normalY`) and returns true; false when no wall point fits,
 * which an ordinary room never produces.
 *
 * @hot — called from the frame loop when a perching body's state begins.
 * Nothing in here may allocate; see the `no-hot-allocation` rule.
 */
export function nearestWallPoint(
  room: RoomGeometry,
  x: number,
  y: number,
  radius: number,
  out: Float64Array,
): boolean {
  const inset = radius + PERCH_GAP;
  let bestSq = Infinity;
  const clampedX = Math.min(Math.max(x, room.minX + inset), room.maxX - inset);
  const clampedY = Math.min(Math.max(y, room.minY + inset), room.maxY - inset);
  bestSq = consider(room, x, y, radius, room.minX + inset, clampedY, 1, 0, bestSq, out);
  bestSq = consider(room, x, y, radius, room.maxX - inset, clampedY, -1, 0, bestSq, out);
  bestSq = consider(room, x, y, radius, clampedX, room.minY + inset, 0, 1, bestSq, out);
  bestSq = consider(room, x, y, radius, clampedX, room.maxY - inset, 0, -1, bestSq, out);
  const blocks = room.blocks;
  for (let block = 0; block < room.blockCount; block++) {
    if (room.blockOverflyable[block] === 1) {
      continue;
    }
    const base = block * BLOCK_STRIDE;
    const minX = blocks[base] ?? 0;
    const minY = blocks[base + 1] ?? 0;
    const maxX = blocks[base + 2] ?? 0;
    const maxY = blocks[base + 3] ?? 0;
    const alongX = Math.min(Math.max(x, minX), maxX);
    const alongY = Math.min(Math.max(y, minY), maxY);
    bestSq = consider(room, x, y, radius, minX - inset, alongY, -1, 0, bestSq, out);
    bestSq = consider(room, x, y, radius, maxX + inset, alongY, 1, 0, bestSq, out);
    bestSq = consider(room, x, y, radius, alongX, minY - inset, 0, -1, bestSq, out);
    bestSq = consider(room, x, y, radius, alongX, maxY + inset, 0, 1, bestSq, out);
  }
  return bestSq < Infinity;
}

/** Room units between a perched body's edge and its wall: touching, give or take a float. */
const PERCH_GAP = 5;

/** Keeps the candidate in `out` when it is clear for a flyer and nearer than `bestSq`. */
function consider(
  room: RoomGeometry,
  fromX: number,
  fromY: number,
  radius: number,
  x: number,
  y: number,
  normalX: number,
  normalY: number,
  bestSq: number,
  out: Float64Array,
): number {
  const dx = x - fromX;
  const dy = y - fromY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= bestSq) {
    return bestSq;
  }
  if (!room.isClear(x, y, radius, CLEAR_IGNORE_DESTRUCTIBLE | CLEAR_IGNORE_PITS)) {
    return bestSq;
  }
  out[0] = x;
  out[1] = y;
  out[2] = normalX;
  out[3] = normalY;
  return distSq;
}
