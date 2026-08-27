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
 * Deliberately not `sim.broadphase` at all, unlike every other broadphase
 * caller in `systems/` — the frame-time benchmark's stress scene (200
 * enemies, all `walkTowardPlayer`, converging and staying clustered
 * indefinitely) ruled out every shape that reused it:
 *
 * - `query`/`queryBox` once per enemy: up to 200 calls a tick into it, each
 *   one crossing a call boundary V8 does not inline. Regressed the
 *   benchmark's "Simulation heap" metric.
 * - `queryCells` (a cell-range form added for this, taking already-computed
 *   integer bounds instead of pixel doubles): same regression, to the same
 *   kilobyte. Whatever the actual cost is, it is not the pixel doubles —
 *   passing only integers across the boundary didn't move the number at all.
 * - A plain `O(enemies²)` loop with no broadphase involved: fixed the heap
 *   metric, but at the benchmark's clustered population it does measurably
 *   more comparisons than a grid would, which pushed "Simulation tick" past
 *   its own tolerance band instead.
 *
 * What actually passes both: a grid, but this module's own, built fresh each
 * tick over enemies only and never touching `sim.broadphase` — a counting
 * sort into `cellStart`/`bucketed`, the same technique `SpatialHash.build`
 * uses, scoped down to however many enemies are actually alive. Candidate
 * pairs are then found by walking every grid cell against itself and its four
 * "forward" neighbours (right, below-left, below, below-right) — the
 * standard half-neighbourhood sweep that visits every unordered cell pair
 * exactly once — and resolved by calling `resolvePair` directly, by its own
 * name, from the two fixed call sites below. Not indirectly through a stored
 * callback parameter the way `SpatialHash.query`'s `visit` argument works:
 * that indirection, not the argument types crossing it, looks to be the
 * actual cost the two `query`/`queryCells` attempts above both paid.
 *
 * A single grid cell not overlapping a body whose collider exceeds it is the
 * usual worry with this technique, and does not apply here: bodies are
 * bucketed by centre point alone rather than by every cell their radius
 * touches, which is only correct because the grid's cell size is already
 * chosen to be at least as large as the largest possible overlap reach
 * (`MAX_COLLIDER_RADIUS`, twice, is exactly `DEFAULT_CELL_SIZE` —
 * `spatial-hash.ts`'s own doc comment on why the cell size is what it is).
 * Two overlapping bodies can therefore never be more than one cell apart in
 * either axis, which is exactly what the self-plus-forward-four sweep covers.
 *
 * Runs after `stepContacts`; nothing between them moves anything, so reading
 * `transform` fresh for each pair — rather than caching a body's position
 * across the several pairs it might be checked against this tick — still
 * sees every earlier correction this tick already applied to it.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/. The one exception is the
 * counting-sort scratch below, which only reallocates when the ECS world's
 * own capacity grows — the same rare, already-permitted event `World.grow`
 * itself is.
 */

/** Cell assigned this tick to each entity index, valid only for live enemies. */
let cellOf = new Int32Array(0);
/** Enemy entity indices, grouped by cell — what `cellStart` indexes into. */
let bucketed = new Int32Array(0);

/** Cell start offsets into `bucketed`, prefix-summed from per-cell counts. */
let cellStart = new Int32Array(1);
/** Fill cursor per cell while scattering into `bucketed`. */
let cellCursor = new Int32Array(1);

/**
 * Capacities `cellOf`/`bucketed` and `cellStart`/`cellCursor` were last sized
 * for. Plain module `let number`s would box on every store here, same as
 * anywhere else in a `@hot` file — kept in a typed slot instead, even though
 * a write only ever happens on the rare tick capacity actually grows.
 */
const SLOT_CAPACITY = 0;
const GRID_CELL_CAPACITY = 1;
const CAPACITY_SLOTS = 2;
const capacity = new Int32Array(CAPACITY_SLOTS);
capacity[GRID_CELL_CAPACITY] = 1;

function ensureCapacity(slotsNeeded: number, cellCount: number): void {
  if (slotsNeeded > (capacity[SLOT_CAPACITY] ?? 0)) {
    capacity[SLOT_CAPACITY] = slotsNeeded;
    cellOf = new Int32Array(slotsNeeded);
    bucketed = new Int32Array(slotsNeeded);
  }
  const cellsNeeded = cellCount + 1;
  if (cellsNeeded > (capacity[GRID_CELL_CAPACITY] ?? 0)) {
    capacity[GRID_CELL_CAPACITY] = cellsNeeded;
    cellStart = new Int32Array(cellsNeeded);
    cellCursor = new Int32Array(cellsNeeded);
  }
}

export function stepEnemyContacts(sim: GameSim): void {
  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const mask = sim.enemyMask;
  const highWater = world.highWater;
  const transform = sim.transform.data;
  const hash = sim.broadphase;
  const cellSize = hash.cellSize;
  const columns = hash.columns;
  const rows = hash.rows;
  const lastColumn = columns - 1;
  const lastRow = rows - 1;
  const cellCount = columns * rows;

  ensureCapacity(world.capacity, cellCount);

  for (let cell = 0; cell <= cellCount; cell++) {
    cellStart[cell] = 0;
  }

  let enemyCount = 0;
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

    let column = Math.floor(x / cellSize);
    if (column < 0) {
      column = 0;
    } else if (column > lastColumn) {
      column = lastColumn;
    }
    let row = Math.floor(y / cellSize);
    if (row < 0) {
      row = 0;
    } else if (row > lastRow) {
      row = lastRow;
    }

    const cell = row * columns + column;
    cellOf[index] = cell;
    cellStart[cell + 1] = (cellStart[cell + 1] ?? 0) + 1;
    enemyCount += 1;
  }

  // Nothing can overlap with fewer than two enemies on the floor.
  if (enemyCount < 2) {
    return;
  }

  for (let cell = 1; cell <= cellCount; cell++) {
    cellStart[cell] = (cellStart[cell] ?? 0) + (cellStart[cell - 1] ?? 0);
  }
  for (let cell = 0; cell <= cellCount; cell++) {
    cellCursor[cell] = cellStart[cell] ?? 0;
  }

  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    if (((masks[index] ?? 0) & mask) !== mask) {
      continue;
    }
    const cell = cellOf[index] ?? 0;
    const cursor = cellCursor[cell] ?? 0;
    bucketed[cursor] = index;
    cellCursor[cell] = cursor + 1;
  }

  for (let row = 0; row < rows; row++) {
    const rowBase = row * columns;
    for (let column = 0; column < columns; column++) {
      const cell = rowBase + column;
      const start = cellStart[cell] ?? 0;
      const end = cellStart[cell + 1] ?? 0;
      if (start === end) {
        continue;
      }

      for (let i = start; i < end; i++) {
        const a = bucketed[i] ?? 0;
        for (let j = i + 1; j < end; j++) {
          resolvePair(sim, a, bucketed[j] ?? 0);
        }
      }

      if (column + 1 < columns) {
        resolveAgainstCell(sim, start, end, cell + 1);
      }
      if (row + 1 < rows) {
        if (column > 0) {
          resolveAgainstCell(sim, start, end, cell + columns - 1);
        }
        resolveAgainstCell(sim, start, end, cell + columns);
        if (column + 1 < columns) {
          resolveAgainstCell(sim, start, end, cell + columns + 1);
        }
      }
    }
  }
}

/** Resolves every body in `[start, end)` of `bucketed` against `otherCell`. */
function resolveAgainstCell(sim: GameSim, start: number, end: number, otherCell: number): void {
  const otherStart = cellStart[otherCell] ?? 0;
  const otherEnd = cellStart[otherCell + 1] ?? 0;
  for (let i = start; i < end; i++) {
    const a = bucketed[i] ?? 0;
    for (let j = otherStart; j < otherEnd; j++) {
      resolvePair(sim, a, bucketed[j] ?? 0);
    }
  }
}

/**
 * Separates one pair of enemies if they overlap, sharing the correction by
 * mass. Called directly by name from the two fixed sites above — not through
 * a stored callback — so the call is trivial for V8 to devirtualise.
 */
function resolvePair(sim: GameSim, a: number, b: number): void {
  const body = sim.body.data;
  const transform = sim.transform.data;

  const baseA = a * 4;
  const baseB = b * 4;
  const xA = transform[baseA] ?? 0;
  const yA = transform[baseA + 1] ?? 0;
  const xB = transform[baseB] ?? 0;
  const yB = transform[baseB + 1] ?? 0;
  const radiusA = body[a * 2] ?? 0;
  const radiusB = body[b * 2] ?? 0;

  const deltaX = xA - xB;
  const deltaY = yA - yB;
  const reach = radiusA + radiusB;
  // Squared, so the overlap test itself never calls into `Math.sqrt` — only
  // an actual overlap, rare against a real room even at this population,
  // pays for one.
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
  const massA = Math.max(0.01, body[a * 2 + 1] ?? 1);
  const massB = Math.max(0.01, body[b * 2 + 1] ?? 1);
  const share = massB / (massA + massB);

  const wantedXA = xA + awayX * overlap * share;
  const wantedYA = yA + awayY * overlap * share;
  if (sim.room.isClear(wantedXA, wantedYA, radiusA)) {
    transform[baseA] = wantedXA;
    transform[baseA + 1] = wantedYA;
  }

  const otherShare = 1 - share;
  const wantedXB = xB - awayX * overlap * otherShare;
  const wantedYB = yB - awayY * overlap * otherShare;
  if (sim.room.isClear(wantedXB, wantedYB, radiusB)) {
    transform[baseB] = wantedXB;
    transform[baseB + 1] = wantedYB;
  }
}
