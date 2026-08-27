import { circlesOverlap } from '../collision/circle-circle.js';
import type { GameSim } from '../game/sim.js';
import { vectorLength } from '../math.js';
import { moveClear } from './contact.js';

/**
 * Enemies against each other.
 *
 * `contact.ts` already separates the player from a body they overlap; this is
 * the same idea between two enemies, which otherwise stand on top of each
 * other freely — most visibly the instant a boss splits (`splitFromEvent`,
 * `systems/enemy.ts`), where the children spawn in a ring around the death
 * point but nothing has ever stopped them drifting back onto one another
 * since. Separation is shared out by mass, same as the player's own: a Mini
 * gets shouldered out of a Mid's way, not the other way round.
 *
 * Runs after `stepContacts` so it reuses the broadphase `stepCollision`
 * already built this tick — nothing between them moves anything.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

let activeSim: GameSim | null = null;

/**
 * The enemy currently being resolved against its neighbours — the same
 * boxing-avoidance reason `contact.ts`'s `player` scratch exists.
 */
const CURRENT_X = 0;
const CURRENT_Y = 1;
const CURRENT_RADIUS = 2;
const CURRENT_MASS = 3;
const CURRENT_SLOTS = 4;
const current = new Float64Array(CURRENT_SLOTS);
const currentSlot = new Int32Array(1);

export function stepEnemyContacts(sim: GameSim): void {
  activeSim = sim;
  sim.world.forEach(sim.enemyMask, resolveNeighboursOf);
  activeSim = null;
}

function resolveNeighboursOf(index: number): void {
  const sim = activeSim;
  if (sim === null) {
    return;
  }
  const body = sim.body.data;
  currentSlot[0] = index;
  current[CURRENT_X] = sim.positionX(index);
  current[CURRENT_Y] = sim.positionY(index);
  current[CURRENT_RADIUS] = body[index * 2] ?? 0;
  current[CURRENT_MASS] = Math.max(0.01, body[index * 2 + 1] ?? 1);

  sim.broadphase.query(
    current[CURRENT_X],
    current[CURRENT_Y],
    current[CURRENT_RADIUS],
    resolveAgainstCurrent,
  );
}

function resolveAgainstCurrent(other: number): void {
  const sim = activeSim;
  const index = currentSlot[0] ?? 0;
  // Every unordered pair is resolved exactly once: whichever of the pair has
  // the lower slot index is the one that resolves it, when it is `index` and
  // the other is still ahead of it in `other`. The higher-indexed one, later
  // walked as its own `index`, then finds this one behind it and skips.
  if (sim === null || other <= index) {
    return;
  }
  // Not a collision-layer check: every body `spawnTarget` creates — a real
  // enemy included — is tagged `CollisionLayer.Obstacle` (`CollisionLayer.Enemy`
  // is reserved but nothing sets it), so an actual enemy is identified by the
  // same `enemyMask` component pair the outer walk already used, not by layer.
  const otherMask = sim.world.masks[other] ?? 0;
  if ((otherMask & sim.enemyMask) !== sim.enemyMask) {
    return;
  }

  const body = sim.body.data;
  const radius = current[CURRENT_RADIUS] ?? 0;
  const otherRadius = body[other * 2] ?? 0;
  const x = current[CURRENT_X] ?? 0;
  const y = current[CURRENT_Y] ?? 0;
  const otherX = sim.positionX(other);
  const otherY = sim.positionY(other);
  if (!circlesOverlap(x, y, radius, otherX, otherY, otherRadius)) {
    return;
  }

  const reach = radius + otherRadius;
  let awayX = x - otherX;
  let awayY = y - otherY;
  const distance = vectorLength(awayX, awayY);
  if (distance === 0) {
    // Exactly concentric — the fresh-split case. Any direction will do; a
    // fixed one keeps this deterministic.
    awayX = 1;
    awayY = 0;
  } else {
    awayX /= distance;
    awayY /= distance;
  }
  const overlap = reach - distance;

  const mass = current[CURRENT_MASS] ?? 0.01;
  const otherMass = Math.max(0.01, body[other * 2 + 1] ?? 1);
  const share = otherMass / (mass + otherMass);

  const wanted = overlap * share;
  let owed = wanted - moveClear(sim, index, radius, x, y, awayX, awayY, wanted);
  current[CURRENT_X] = sim.positionX(index);
  current[CURRENT_Y] = sim.positionY(index);

  // Whatever a wall would not let this one take, the other owes instead.
  const otherWanted = overlap - wanted + owed;
  owed =
    otherWanted - moveClear(sim, other, otherRadius, otherX, otherY, -awayX, -awayY, otherWanted);

  // And if it is against a wall too, back to this one, same as `contact.ts`.
  if (owed > 0) {
    moveClear(sim, index, radius, current[CURRENT_X], current[CURRENT_Y], awayX, awayY, owed);
    current[CURRENT_X] = sim.positionX(index);
    current[CURRENT_Y] = sim.positionY(index);
  }
}
