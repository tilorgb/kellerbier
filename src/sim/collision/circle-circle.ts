/**
 * Circle against circle, still and moving.
 *
 * Everything that collides in this game is a circle. There is no rotation, no
 * polygon clipping and no general-purpose physics — see docs/TECH_STACK.md §2.
 */

/** True when two circles overlap. */
export function circlesOverlap(
  aX: number,
  aY: number,
  aRadius: number,
  bX: number,
  bY: number,
  bRadius: number,
): boolean {
  const dx = aX - bX;
  const dy = aY - bY;
  const reach = aRadius + bRadius;
  return dx * dx + dy * dy < reach * reach;
}

/** Returned by `sweptCircleHit` when the swept circle never touches the target. */
export const NO_HIT = -1;

/**
 * When, along a straight move, a moving circle first touches a still one.
 *
 * Returns a fraction of the move in [0, 1], or `NO_HIT`. A projectile crossing
 * an enemy in a single tick is not an edge case in a bullet hell — it is the
 * normal case for anything fast — and testing only the endpoint is how a shot
 * passes cleanly through the thing it was aimed at.
 *
 * The maths is the standard quadratic: the distance between the two centres,
 * as a function of time along the move, first equals the sum of the radii at
 * the smaller root.
 */
export function sweptCircleHit(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
  targetX: number,
  targetY: number,
  targetRadius: number,
): number {
  const reach = radius + targetRadius;

  // Already touching at the start of the move.
  const startX = fromX - targetX;
  const startY = fromY - targetY;
  const startDistanceSquared = startX * startX + startY * startY;
  if (startDistanceSquared <= reach * reach) {
    return 0;
  }

  const moveX = toX - fromX;
  const moveY = toY - fromY;
  const a = moveX * moveX + moveY * moveY;
  if (a === 0) {
    return NO_HIT;
  }

  const b = 2 * (startX * moveX + startY * moveY);
  const c = startDistanceSquared - reach * reach;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return NO_HIT;
  }

  const time = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (time < 0 || time > 1) {
    return NO_HIT;
  }
  return time;
}
