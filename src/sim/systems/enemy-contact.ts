import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';

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
 * Deliberately not `contact.ts`'s own `moveClear` (a wall-aware move with a
 * corner-slide fallback and a "whatever a wall refuses, the other body owes
 * instead" redistribution) — that shape is worth it for the player, who has
 * to feel exactly right against a wall of enemies, but between two enemies
 * it is a lot of extra cross-function-call arithmetic to spend on a body
 * nobody is looking that closely at. A blocked half-step here just tries
 * again next tick, the same pair still being overlapped — which it will be,
 * since nothing here removed the reason they overlapped in the first place.
 *
 * Deliberately not `sim.broadphase.query`/`queryBox` either, unlike every
 * other broadphase caller in `systems/`. Those take the query centre and
 * radius as pixel doubles and convert them to a cell range internally — free
 * once a tick for `contact.ts`'s single player query, but called once per
 * enemy here (up to 200 at the frame-time benchmark's stress population)
 * that conversion is 200 extra crossings of a call boundary V8 does not
 * inline, each one boxing the doubles handed across it — the "boxing a
 * double at an un-inlined call boundary" cost the frame-time benchmark's own
 * doc comments already call out as a residual, accepted-once-a-tick cost.
 * Multiplied by a couple hundred it measurably was not residual, and neither
 * was a plain O(enemies²) loop that skips the broadphase altogether — tried
 * first, and cheaper on heap, but the extra comparisons it does against a
 * clustered population (the benchmark's own "200 enemies chasing the same
 * point") were enough to push the simulation-tick metric over its own
 * tolerance band. `queryCells` is `queryBox`'s cell-range form: this module
 * computes the column/row bounds itself, entirely in local doubles that
 * never leave this function, and hands the broadphase only integers — cheap
 * to pass regardless of inlining, since a small integer is a V8 Smi, not a
 * heap-allocated box. The dedup and candidate-gathering stay exactly what
 * `queryBox` already does; only the box-to-cell conversion moved to the
 * caller, since the caller is the one paying to repeat it.
 *
 * Runs after `stepContacts` so it reuses the broadphase already built this
 * tick; nothing between them moves anything.
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
  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const mask = sim.enemyMask;
  const highWater = world.highWater;
  const body = sim.body.data;
  const transform = sim.transform.data;
  const hash = sim.broadphase;
  const cellSize = hash.cellSize;
  const lastColumn = hash.columns - 1;
  const lastRow = hash.rows - 1;

  activeSim = sim;

  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    if (((masks[index] ?? 0) & mask) !== mask) {
      continue;
    }

    const base = index * 4;
    const x = transform[base] ?? 0;
    const y = transform[base + 1] ?? 0;
    const radius = body[index * 2] ?? 0;

    currentSlot[0] = index;
    current[CURRENT_X] = x;
    current[CURRENT_Y] = y;
    current[CURRENT_RADIUS] = radius;
    current[CURRENT_MASS] = Math.max(0.01, body[index * 2 + 1] ?? 1);

    // The same clamped floor-division `columnOf`/`rowOf` do inside
    // `SpatialHash`, duplicated here rather than called: this is the whole
    // reason `queryCells` exists — see the doc comment above.
    let minColumn = Math.floor((x - radius) / cellSize);
    if (minColumn < 0) {
      minColumn = 0;
    } else if (minColumn > lastColumn) {
      minColumn = lastColumn;
    }
    let maxColumn = Math.floor((x + radius) / cellSize);
    if (maxColumn < 0) {
      maxColumn = 0;
    } else if (maxColumn > lastColumn) {
      maxColumn = lastColumn;
    }
    let minRow = Math.floor((y - radius) / cellSize);
    if (minRow < 0) {
      minRow = 0;
    } else if (minRow > lastRow) {
      minRow = lastRow;
    }
    let maxRow = Math.floor((y + radius) / cellSize);
    if (maxRow < 0) {
      maxRow = 0;
    } else if (maxRow > lastRow) {
      maxRow = lastRow;
    }

    hash.queryCells(minColumn, maxColumn, minRow, maxRow, resolveAgainstCurrent);
  }

  activeSim = null;
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
  const transform = sim.transform.data;
  const radius = current[CURRENT_RADIUS] ?? 0;
  const otherRadius = body[other * 2] ?? 0;
  const x = current[CURRENT_X] ?? 0;
  const y = current[CURRENT_Y] ?? 0;
  const otherBase = other * 4;
  const otherX = transform[otherBase] ?? 0;
  const otherY = transform[otherBase + 1] ?? 0;

  const deltaX = x - otherX;
  const deltaY = y - otherY;
  const reach = radius + otherRadius;
  // Squared, so the overlap test itself never calls into `Math.sqrt` — only
  // an actual overlap (rare against 200 bodies spread over a real room, the
  // common case at the benchmark's stress population too) pays for one.
  const distanceSquared = deltaX * deltaX + deltaY * deltaY;
  if (distanceSquared >= reach * reach) {
    return;
  }

  const distance = Math.sqrt(distanceSquared);
  let awayX: number;
  let awayY: number;
  if (distance === 0) {
    // Exactly concentric — the fresh-split case. Any direction will do; a
    // fixed one keeps this deterministic.
    awayX = 1;
    awayY = 0;
  } else {
    awayX = deltaX / distance;
    awayY = deltaY / distance;
  }
  const overlap = reach - distance;

  // Split by mass: the lighter body gives way, same as the player's own.
  const mass = current[CURRENT_MASS] ?? 0.01;
  const otherMass = Math.max(0.01, body[other * 2 + 1] ?? 1);
  const share = otherMass / (mass + otherMass);

  const wantedX = x + awayX * overlap * share;
  const wantedY = y + awayY * overlap * share;
  if (sim.room.isClear(wantedX, wantedY, radius)) {
    const base = index * 4;
    transform[base] = wantedX;
    transform[base + 1] = wantedY;
    current[CURRENT_X] = wantedX;
    current[CURRENT_Y] = wantedY;
  }

  const otherShare = 1 - share;
  const otherWantedX = otherX - awayX * overlap * otherShare;
  const otherWantedY = otherY - awayY * overlap * otherShare;
  if (sim.room.isClear(otherWantedX, otherWantedY, otherRadius)) {
    transform[otherBase] = otherWantedX;
    transform[otherBase + 1] = otherWantedY;
  }
}
