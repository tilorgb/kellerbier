import type { RoomGeometry } from './geometry.js';

/**
 * Grid pathfinding through a room's solid blocks, for an enemy heading to
 * where it last saw the player.
 *
 * A breadth-first search over a `PATH_CELL`-unit grid laid over the room's
 * bounds. A cell is walkable when a circle of the body's own radius fits at
 * its centre (`RoomGeometry.isClear`), so the path already keeps a body clear
 * of every rock, pillar and void — the same test collision itself uses. Cells
 * are tested lazily, the first time the search reaches them, and only once per
 * search.
 *
 * Rooms are small (a single screen is 30x18 cells, a 2x2 room 60x36), so a
 * full search is a few thousand cells at most, and a caller only searches
 * every handful of ticks, not every tick.
 *
 * @hot — called from the frame loop. Every buffer is allocated once, here,
 * at module load; nothing in a search allocates. See the `no-hot-allocation`
 * rule in tools/eslint/.
 */

/** Grid cell size in room units. Half a floor tile. */
export const PATH_CELL = 8;

/** Largest grid this searches. A room past it is not searched (the caller falls back). */
const MAX_CELLS = 1 << 15;

/** Path cells the waypoint may look ahead along the path, when smoothing it. */
const MAX_LOOKAHEAD = 12;

/** Which search last touched a cell — a fresh search needs no clearing pass. */
const visitedIn = new Uint32Array(MAX_CELLS);
/** 0 unknown, 1 walkable, 2 blocked — valid when `visitedIn` matches. */
const walkable = new Uint8Array(MAX_CELLS);
const testedIn = new Uint32Array(MAX_CELLS);
const cameFrom = new Int32Array(MAX_CELLS);
const queue = new Int32Array(MAX_CELLS);
/** The current search's stamp, in a typed array so the hot loop never boxes it. */
const searchStamp = new Uint32Array(1);

/** Where to head next: the result of `nextWaypoint`. */
export interface Waypoint {
  x: number;
  y: number;
}

/**
 * The next point a body of `radius` at `(fromX, fromY)` should walk straight
 * to on its way to `(toX, toY)`, written to `out`. Returns false when there is
 * no way there (the target is walled off, or the room is too big to search).
 *
 * The waypoint is the farthest point along the found path that the body can
 * still reach in a straight line, so a body does not zig-zag cell to cell
 * across open floor.
 */
export function nextWaypoint(
  room: RoomGeometry,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
  out: Waypoint,
): boolean {
  const columns = Math.ceil((room.maxX - room.minX) / PATH_CELL);
  const rows = Math.ceil((room.maxY - room.minY) / PATH_CELL);
  if (columns <= 0 || rows <= 0 || columns * rows > MAX_CELLS) {
    return false;
  }
  const start = cellAt(room, columns, rows, fromX, fromY);
  const goal = cellAt(room, columns, rows, toX, toY);
  if (start === goal) {
    out.x = toX;
    out.y = toY;
    return true;
  }

  searchStamp[0] = (searchStamp[0] ?? 0) + 1;
  if (searchStamp[0] === 0) {
    // Wrapped after four billion searches: start the stamps over.
    visitedIn.fill(0);
    testedIn.fill(0);
    searchStamp[0] = 1;
  }
  const search = searchStamp[0];
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  visitedIn[start] = search;
  cameFrom[start] = -1;

  let found = false;
  while (head < tail) {
    const cell = queue[head++] ?? 0;
    if (cell === goal) {
      found = true;
      break;
    }
    const column = cell % columns;
    const row = (cell - column) / columns;
    // Four neighbours: a diagonal step past a rock corner would clip it.
    for (let direction = 0; direction < 4; direction++) {
      const nextColumn = column + (direction === 0 ? 1 : direction === 1 ? -1 : 0);
      const nextRow = row + (direction === 2 ? 1 : direction === 3 ? -1 : 0);
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= columns || nextRow >= rows) {
        continue;
      }
      const next = nextRow * columns + nextColumn;
      if (visitedIn[next] === search) {
        continue;
      }
      // The goal is always enterable: the player may be standing right up
      // against a rock, where a body as wide as this one would not fit.
      if (next !== goal && !isWalkable(room, columns, next, radius)) {
        continue;
      }
      visitedIn[next] = search;
      cameFrom[next] = cell;
      queue[tail++] = next;
    }
  }
  if (!found) {
    return false;
  }

  // In straight reach already: no need to follow the grid at all.
  if (straightClear(room, fromX, fromY, toX, toY, radius)) {
    out.x = toX;
    out.y = toY;
    return true;
  }
  // Walk back from the goal. The search is done with `queue`, so the whole
  // path is written into it, goal first, the cell next to the start last.
  let length = 0;
  for (let cell = goal; cell !== -1 && cell !== start; cell = cameFrom[cell] ?? -1) {
    queue[length] = cell;
    length += 1;
  }
  // Out from the start: the farthest of the next `MAX_LOOKAHEAD` cells still
  // in straight reach. The first cell always is (it is a neighbour).
  let chosen = queue[length - 1] ?? goal;
  const last = Math.max(0, length - 1 - MAX_LOOKAHEAD);
  for (let index = length - 2; index >= last; index--) {
    const cell = queue[index] ?? goal;
    if (
      !straightClear(
        room,
        fromX,
        fromY,
        cellCentreX(room, columns, cell),
        cellCentreY(room, columns, cell),
        radius,
      )
    ) {
      break;
    }
    chosen = cell;
  }
  out.x = cellCentreX(room, columns, chosen);
  out.y = cellCentreY(room, columns, chosen);
  return true;
}

function cellAt(room: RoomGeometry, columns: number, rows: number, x: number, y: number): number {
  const column = Math.min(columns - 1, Math.max(0, Math.floor((x - room.minX) / PATH_CELL)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((y - room.minY) / PATH_CELL)));
  return row * columns + column;
}

function cellCentreX(room: RoomGeometry, columns: number, cell: number): number {
  return room.minX + ((cell % columns) + 0.5) * PATH_CELL;
}

function cellCentreY(room: RoomGeometry, columns: number, cell: number): number {
  return room.minY + (Math.floor(cell / columns) + 0.5) * PATH_CELL;
}

function isWalkable(room: RoomGeometry, columns: number, cell: number, radius: number): boolean {
  const search = searchStamp[0] ?? 0;
  if (testedIn[cell] !== search) {
    testedIn[cell] = search;
    walkable[cell] = room.isClear(
      cellCentreX(room, columns, cell),
      cellCentreY(room, columns, cell),
      radius,
    )
      ? 1
      : 2;
  }
  return walkable[cell] === 1;
}

/**
 * Whether a body of `radius` fits all along the straight line, sampled every
 * half cell. A clear line of *sight* (centre to centre) is not enough to walk
 * it: a body as wide as this one can still snag on a corner the line passes.
 */
export function straightClear(
  room: RoomGeometry,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.ceil(Math.hypot(dx, dy) / (PATH_CELL / 2));
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    if (!room.isClear(x0 + dx * t, y0 + dy * t, radius)) {
      return false;
    }
  }
  return true;
}
