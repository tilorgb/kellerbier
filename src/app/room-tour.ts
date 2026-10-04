import type { RoomDoor } from '../sim/room/floor-plan.js';

/**
 * The dev-only `N` key's route through a floor: which doors to try, in order.
 *
 * It was "an unvisited door first, else the first visited one" — which is not
 * a walk of the floor. At a dead end the first visited door leads back to the
 * room it came from, and from there the first visited door leads straight
 * back to the dead end: the tour bounced between two rooms for good and never
 * reached the rest of the floor, the boss room included.
 *
 * This is the depth-first walk the old comment described. `trail` is the
 * path of rooms the tour came in through; with nothing new to open, it goes
 * back the way it came, which is what eventually brings it to the next
 * unexplored branch.
 *
 * Returns candidates rather than one door because a door in the floor plan
 * is not always walkable — a secret room's approach is a wall until it is
 * bombed — and the caller tries them in order.
 */
export interface TourStep {
  readonly door: RoomDoor;
  /** What crossing this door does to the trail: go deeper, or step back out. */
  readonly kind: 'explore' | 'backtrack' | 'wander';
}

export function tourCandidates(
  doors: readonly RoomDoor[],
  visited: ReadonlySet<string>,
  trail: readonly string[],
): TourStep[] {
  const cameFrom = trail[trail.length - 1];
  const steps: TourStep[] = [];
  for (const door of doors) {
    if (!visited.has(door.neighborRoomId)) {
      steps.push({ door, kind: 'explore' });
    }
  }
  for (const door of doors) {
    if (door.neighborRoomId === cameFrom) {
      steps.push({ door, kind: 'backtrack' });
    }
  }
  // Only reached with no trail to follow — the player walked somewhere by
  // hand between presses, or the whole floor has been seen. Anything beats
  // standing still.
  for (const door of doors) {
    if (visited.has(door.neighborRoomId) && door.neighborRoomId !== cameFrom) {
      steps.push({ door, kind: 'wander' });
    }
  }
  return steps;
}

/** The trail after taking `step` out of `roomId`. */
export function trailAfter(trail: readonly string[], roomId: string, step: TourStep): string[] {
  switch (step.kind) {
    case 'explore':
      return [...trail, roomId];
    case 'backtrack':
      return trail.slice(0, -1);
    default:
      // Off the path: whatever the trail said no longer leads back here.
      return [];
  }
}
