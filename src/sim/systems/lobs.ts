import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';
import { StatId } from '../stats/definition.js';

/**
 * Lobbed shots (the Leberkas-Semmel): something thrown in a high arc at an
 * enemy that lands after a flight and bursts.
 *
 * Not a `ProjectileStore` projectile on purpose. A projectile is a flat shot
 * that hits what it touches on the way; a lob flies over everything, hits
 * nothing until it comes down, and lands where its target is *now*. So it is
 * its own tiny store: a handful of slots, fixed capacity, never grown, which
 * `render/lob-view.ts` draws as a hopping Semmel.
 *
 * Flight is a straight line with a parabola of height over it. The landing
 * point follows the target while it lives, so a lob thrown at a walking enemy
 * comes down on the enemy and not behind it.
 *
 * @hot — called from the frame loop. Nothing in here may allocate.
 */

export const LOB_CAPACITY = 8;
/** Ticks in the air: a bit over half a second. */
export const LOB_FLIGHT_TICKS = 34;
/** The highest point of the arc, in room units. */
export const LOB_ARC_HEIGHT = 26;

/** Direct hit: radius of the landing blast and its damage as a multiple of the player's Damage. */
export const LOB_DIRECT_RADIUS = 16;
export const LOB_DIRECT_DAMAGE = 3;
/** The four diagonal blasts: how far from the landing point they go off, their radius and damage multiple. */
export const LOB_DIAGONAL_OFFSET = 22;
export const LOB_DIAGONAL_RADIUS = 16;
export const LOB_DIAGONAL_DAMAGE = 1.5;

export class LobStore {
  readonly live = new Uint8Array(LOB_CAPACITY);
  readonly startX = new Float32Array(LOB_CAPACITY);
  readonly startY = new Float32Array(LOB_CAPACITY);
  readonly targetX = new Float32Array(LOB_CAPACITY);
  readonly targetY = new Float32Array(LOB_CAPACITY);
  /** Entity index of the enemy the lob follows, or -1 once it is gone. */
  readonly target = new Int32Array(LOB_CAPACITY).fill(-1);
  readonly age = new Int16Array(LOB_CAPACITY);
  readonly damage = new Float32Array(LOB_CAPACITY);

  clear(): void {
    this.live.fill(0);
  }
}

/** The nearest living enemy body to a point, or -1. */
export function nearestEnemyTo(sim: GameSim, x: number, y: number): number {
  const world = sim.world;
  const required = sim.enemyMask;
  const highWater = world.highWater;
  let best = -1;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  for (let index = 0; index < highWater; index++) {
    if (world.states[index] !== World.ALIVE) {
      continue;
    }
    if (((world.masks[index] ?? 0) & required) !== required) {
      continue;
    }
    // Off every collision layer is hidden, submerged or latched: not a target.
    if ((sim.collision.data[index * 2] ?? 0) === 0 || sim.isBomb(index)) {
      continue;
    }
    if ((sim.health.data[index * 2] ?? 0) <= 0) {
      continue;
    }
    const dx = sim.positionX(index) - x;
    const dy = sim.positionY(index) - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = index;
    }
  }
  return best;
}

/**
 * Throws a lob from `(fromX, fromY)` at the nearest enemy. Returns false when
 * there is none, or every slot is busy.
 */
export function launchLob(sim: GameSim, fromX: number, fromY: number): boolean {
  const target = nearestEnemyTo(sim, fromX, fromY);
  if (target < 0) {
    return false;
  }
  const lobs = sim.lobs;
  for (let slot = 0; slot < LOB_CAPACITY; slot++) {
    if (lobs.live[slot] === 1) {
      continue;
    }
    lobs.live[slot] = 1;
    lobs.startX[slot] = fromX;
    lobs.startY[slot] = fromY;
    lobs.targetX[slot] = sim.positionX(target);
    lobs.targetY[slot] = sim.positionY(target);
    lobs.target[slot] = target;
    lobs.age[slot] = 0;
    lobs.damage[slot] = sim.stats.value(StatId.Damage);
    return true;
  }
  return false;
}

/** Ages every lob a tick and lands the ones that have come down. */
export function stepLobs(sim: GameSim): void {
  const lobs = sim.lobs;
  for (let slot = 0; slot < LOB_CAPACITY; slot++) {
    if (lobs.live[slot] !== 1) {
      continue;
    }
    const target = lobs.target[slot] ?? -1;
    if (target >= 0) {
      if (
        sim.world.states[target] === World.ALIVE &&
        ((sim.world.masks[target] ?? 0) & sim.enemyMask) === sim.enemyMask &&
        (sim.health.data[target * 2] ?? 0) > 0
      ) {
        lobs.targetX[slot] = sim.positionX(target);
        lobs.targetY[slot] = sim.positionY(target);
      } else {
        lobs.target[slot] = -1;
      }
    }
    const age = (lobs.age[slot] ?? 0) + 1;
    lobs.age[slot] = age;
    if (age >= LOB_FLIGHT_TICKS) {
      land(sim, slot);
      lobs.live[slot] = 0;
    }
  }
}

/** Where a lob is, and how high, this tick — `t` is 0 at the throw and 1 at the landing. */
export function lobProgress(sim: GameSim, slot: number, alpha: number): number {
  return Math.min(1, ((sim.lobs.age[slot] ?? 0) + alpha) / LOB_FLIGHT_TICKS);
}

const DIAGONALS: readonly (readonly [number, number])[] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

function land(sim: GameSim, slot: number): void {
  const lobs = sim.lobs;
  const x = lobs.targetX[slot] ?? 0;
  const y = lobs.targetY[slot] ?? 0;
  const damage = lobs.damage[slot] ?? 1;
  sim.applySplashDamage(x, y, LOB_DIRECT_RADIUS, damage * LOB_DIRECT_DAMAGE, -1, true);
  sim.splashBurst(x, y, LOB_DIRECT_RADIUS * 1.6);
  for (const [sx, sy] of DIAGONALS) {
    const bx = x + sx * LOB_DIAGONAL_OFFSET;
    const by = y + sy * LOB_DIAGONAL_OFFSET;
    sim.applySplashDamage(bx, by, LOB_DIAGONAL_RADIUS, damage * LOB_DIAGONAL_DAMAGE, -1, true);
    sim.splashBurst(bx, by, LOB_DIAGONAL_RADIUS);
  }
}
