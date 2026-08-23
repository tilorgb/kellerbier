/**
 * Circle against axis-aligned box.
 *
 * The only shape pair the game has, and deliberately so: every collider in
 * Kellerbier is a circle and every wall is a box. No rotation, no polygons, no
 * general-purpose physics — see docs/TECH_STACK.md §2.
 *
 * Every function here takes and returns numbers. Nothing allocates.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/**
 * How far past touching a resolved body is placed.
 *
 * Resolution puts the circle exactly tangent to the box, and exactly tangent is
 * the one answer floating point cannot represent: the square root comes back a
 * few bits short and every overlap test that uses a strict `<` then reports the
 * body as still inside the wall. A thousandth of a pixel is invisible, is far
 * larger than the error, and makes "resolved" mean resolved.
 */
export const SEPARATION_EPSILON = 0.001;

/** True when the circle and the box overlap at all. */
export function circleOverlapsAabb(
  centreX: number,
  centreY: number,
  radius: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const nearestX = centreX < minX ? minX : centreX > maxX ? maxX : centreX;
  const nearestY = centreY < minY ? minY : centreY > maxY ? maxY : centreY;
  const dx = centreX - nearestX;
  const dy = centreY - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * The circle centre's X, pushed just clear of the box along X only.
 *
 * Resolving one axis at a time is what makes a body *slide* along a wall
 * instead of stopping dead against it, and sliding is worth a surprising amount
 * of perceived quality.
 *
 * The push distance is not simply the radius. When the centre is level with the
 * box the contact is a flat face and the answer is the radius; past the box's
 * corner the contact is the corner itself, and the horizontal clearance needed
 * is the shorter `sqrt(r² - dy²)`. Using the radius in both cases pushes the
 * body out of a corner far too early and the wall feels like it has invisible
 * rounded padding.
 */
export function resolveCircleAabbX(
  centreX: number,
  centreY: number,
  radius: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  movingRight: boolean,
): number {
  const dy = centreY < minY ? minY - centreY : centreY > maxY ? centreY - maxY : 0;
  if (dy >= radius) {
    return centreX;
  }
  const clearance = Math.sqrt(radius * radius - dy * dy) + SEPARATION_EPSILON;
  return movingRight ? minX - clearance : maxX + clearance;
}

/** The Y counterpart of `resolveCircleAabbX`. */
export function resolveCircleAabbY(
  centreX: number,
  centreY: number,
  radius: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  movingDown: boolean,
): number {
  const dx = centreX < minX ? minX - centreX : centreX > maxX ? centreX - maxX : 0;
  if (dx >= radius) {
    return centreY;
  }
  const clearance = Math.sqrt(radius * radius - dx * dx) + SEPARATION_EPSILON;
  return movingDown ? minY - clearance : maxY + clearance;
}
