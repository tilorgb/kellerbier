/**
 * Keeps enemies that never move from spawning on top of each other.
 *
 * A room template places a group's bodies 8 units apart, and two groups can
 * be authored side by side. For a walker that is a starting formation it
 * walks out of; for a body that never leaves its spot — a Fliegenpilz, a
 * Zapfhahn, a Gartenzwerg, a Snow cannon — it is permanent: two mushrooms'
 * spore clouds over one patch of floor, or a pair of turrets firing as one.
 *
 * `spreadStationarySpawns` moves each stationary spawn that lands within
 * `STATIONARY_SPAWN_SPACING` of a stationary spawn already placed to the
 * nearest clear point that keeps that distance from all of them. Rings
 * around the authored point are searched outward, so a body moves as little
 * as it has to and stays in the part of the room its author chose.
 * Deterministic and draws no random numbers, so a seed replays the same.
 * When nothing in reach fits (a tiny room), the authored point is kept.
 */

/** Minimum distance between two stationary enemies, in room units (three tiles). */
export const STATIONARY_SPAWN_SPACING = 48;
/** How far from its authored point a stationary spawn may be moved. */
const MAX_SHIFT = 112;
const RING_STEP = 8;
const RING_ANGLES = 16;
/** Clearance probed around a candidate point — about a normal body's footprint. */
const BODY_RADIUS = 8;

export interface SpawnPoint {
  readonly x: number;
  readonly y: number;
  readonly enemyId: string;
}

export function spreadStationarySpawns<T extends SpawnPoint>(
  spawns: readonly T[],
  isStationary: (enemyId: string) => boolean,
  canStand: (x: number, y: number, radius: number) => boolean,
  spacing = STATIONARY_SPAWN_SPACING,
): T[] {
  const placed: { x: number; y: number }[] = [];
  const farEnough = (x: number, y: number): boolean =>
    placed.every((other) => (other.x - x) ** 2 + (other.y - y) ** 2 >= spacing * spacing);
  return spawns.map((spawn) => {
    if (!isStationary(spawn.enemyId)) {
      return spawn;
    }
    if (farEnough(spawn.x, spawn.y)) {
      placed.push({ x: spawn.x, y: spawn.y });
      return spawn;
    }
    for (let radius = RING_STEP; radius <= MAX_SHIFT; radius += RING_STEP) {
      for (let step = 0; step < RING_ANGLES; step++) {
        const angle = (step / RING_ANGLES) * Math.PI * 2;
        const x = Math.round(spawn.x + Math.cos(angle) * radius);
        const y = Math.round(spawn.y + Math.sin(angle) * radius);
        if (farEnough(x, y) && canStand(x, y, BODY_RADIUS)) {
          placed.push({ x, y });
          return { ...spawn, x, y };
        }
      }
    }
    placed.push({ x: spawn.x, y: spawn.y });
    return spawn;
  });
}
