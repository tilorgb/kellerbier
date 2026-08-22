/**
 * Circle against axis-aligned box.
 *
 * The only shape pair the game has, and deliberately so: every collider in
 * Kellerbier is a circle and every wall is a box. No rotation, no polygons, no
 * general-purpose physics — see docs/TECH_STACK.md §2.
 *
 * Every function here takes and returns numbers. Nothing allocates.
 */

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
  const clearance = Math.sqrt(radius * radius - dy * dy);
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
  const clearance = Math.sqrt(radius * radius - dx * dx);
  return movingDown ? minY - clearance : maxY + clearance;
}
