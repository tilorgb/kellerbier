/**
 * Fully procedural room content (#random-rooms).
 *
 * The floor generator (`sim/room/floor-plan.ts`) lays out the room *graph* —
 * which slots exist, which are special, where the doors are. This module fills
 * in the *interior* of an ordinary `normal` slot of any shape (`1x1` through
 * `T`): given a floor, a floor tag and the slot's real doors, it returns a
 * `RoomTemplate` object of the same shape a `.json` file would, so it flows
 * through the unchanged `validateRoomTemplate` / `compileRoomTemplate` path
 * with nothing downstream aware it wasn't authored.
 *
 * What is *not* generated:
 * - The floor's **start room** — hand-authored, because that is where the
 *   player's `direction === null` spawn happens and there must be no procedural
 *   layout to get stuck in.
 * - Boss / treasure / shop / secret / supersecret rooms.
 * - Any `normal` slot that `app/main.ts` rolls as a **sprinkle** of a
 *   hand-authored room instead (`RoomGenTuning.authoredRoomChance`) — the route
 *   for a one-off room design to pop up on a floor.
 *
 * How a generated room reads:
 * - Layout: obstacle coverage is aimed at a tuned band (`RoomGenTuning`), scaled
 *   by how many single-screen cells the room spans — a moderate amount of cover
 *   in most rooms, a near-empty or cluttered one only occasionally. The mob
 *   fight is the challenge, not the walk. The room centre is *not* special-cased.
 * - Rule 1: never trap the player. The player only ever enters a generated room
 *   through a door, landing in the never-solid wall-margin ring; `carveDoorMouths`
 *   clears the one tile inside each door, a BFS from a mouth proves every other
 *   door is reachable, and `fillUnreachedPockets` seals any pocket the BFS could
 *   not reach so the whole walkable area is one region. Failing that, fall back
 *   to an empty room and warn once (`docs/DECISIONS.md` #19).
 * - A multi-cell room (`1x2`/`2x2`/`L`/`T`) is generated as one continuous grid
 *   spanning the shape's bounding box — the seams between glued sub-rooms carry
 *   no wall — then sliced back into per-sub-room `RoomSubLayout`s for
 *   `compileRoomTemplate`. `L`/`T` drop their corner cells; those become solid
 *   and are excluded from everything.
 * - Enemies: a per-floor-tag weighted roster spent against a threat budget that
 *   scales with fractional depth (distance from start over distance to the
 *   boss door) and room size.
 * - Hazards (Floor 1 puddles, Floor 2 trellises) and decorative / destructible
 *   props (barrels, crates) are scattered as scenery, never on a route the
 *   player needs.
 *
 * Not simulation state — this runs at floor-generation time, off a seed derived
 * from the run seed (`roomGenSeed`), so two playthroughs of the same seed get
 * the same rooms and a replay stays exact.
 */

import {
  DIRECTION_OFFSET,
  DOOR_DIRECTIONS,
  ROOM_COLUMNS,
  ROOM_ROWS,
  ROOM_TILE_UNITS,
  type DoorDirection,
  type MultiCellRoomShape,
  type MultiCellRoomTemplate,
  type RoomDecorativeProp,
  type RoomEnemySpawn,
  type RoomHazard,
  type RoomObstacle,
  type RoomPickupSpawn,
  type RoomSpawnGroup,
  type RoomSubLayout,
  type SingleCellRoomTemplate,
} from '../../content/rooms/definition.js';
import { MAX_ROOM_BLOCKS } from './geometry.js';
import { splitmix32, type Rng } from '../rng/rng.js';
import { DEFAULT_ROOM_GEN_TUNING, type RoomGenTuning } from '../tuning.js';

export { DEFAULT_ROOM_GEN_TUNING };
export type { RoomGenTuning };

/** The bits every generator path needs that are not layout-shape specific. */
export interface RoomGenContext {
  /** The floor-plan room id, only used to key the derived seed and name the template. */
  readonly roomId: string;
  readonly floor: number;
  /** `FloorConfig.floorTag` — picks the enemy roster and hazard/prop kinds. */
  readonly floorTag: string;
  /** Room-graph distance from start, for the enemy threat budget. */
  readonly distanceFromStart: number;
  /**
   * Room-graph distance from start to this floor's boss door — the same
   * quantity `distanceFromStart` is measured against, always `>=
   * distanceFromStart` (`docs/DECISIONS.md`-adjacent invariant:
   * `validateFloorPlan` requires the boss room to sit at the floor's own
   * maximum distance). `placeEnemies` divides by this to turn
   * `distanceFromStart` into a *fractional* depth (0 at the start room, 1 at
   * the boss door) — #272: an absolute per-door ramp saturates against
   * `maxEnemies` well before a long floor's back half, so the room right
   * before the boss stays equally nasty and a short or a long floor spend
   * the same curve, just stretched over more or fewer doors.
   */
  readonly bossDistance: number;
  readonly rng: Rng;
}

export interface RoomGenSpec extends RoomGenContext {
  /** The walls that genuinely border a neighbour on the floor grid. */
  readonly doors: readonly DoorDirection[];
}

export interface MultiCellRoomGenSpec extends RoomGenContext {
  readonly shape: MultiCellRoomShape;
  /** The room's real single-screen cells, 0-indexed local (from `buildPlacement`). */
  readonly cells: readonly { readonly col: number; readonly row: number }[];
  /** Which `(cell, wall)` pairs are real doors — `cellIndex` into `cells` (from `buildPlacement`). */
  readonly doors: readonly { readonly cellIndex: number; readonly direction: DoorDirection }[];
}

interface RosterEntry {
  readonly id: string;
  readonly weight: number;
  /** Rough threat cost spent from the budget when this body is placed. */
  readonly cost: number;
  /**
   * Does this body's own movement close distance on the player during normal
   * play (a `walkTowardPlayer`/`chargeAtPlayer` state), as opposed to sitting
   * still (`pause`), bouncing a fixed axis ignoring the player (`rollBounce`),
   * or only ever firing from where it stands? #230: a locked room with no
   * pursuer in its roster is target practice, not a fight — `placeEnemies`
   * guarantees at least one whenever a room has enemies at all.
   */
  readonly pursues: boolean;
  /**
   * A cheap body priced and weighted for numbers, not for surviving alone —
   * placed as a cluster of this many for one budget draw (#230's "a Bierratte
   * at cost 1 and 1 HP is not an encounter at any count under about four").
   * Omitted (or 1) places a single body as before.
   */
  readonly groupSize?: number;
}

/**
 * Per-floor-tag enemy rosters. Boss-only bodies and spawned children (segments,
 * spores, splitters) are left out; they are not room-roster enemies. A floor
 * tag with no roster generates enemy-free rooms and warns once.
 */
const ROSTERS: Readonly<Record<string, readonly RosterEntry[]>> = {
  cellar: [
    { id: 'bierratte', weight: 3, cost: 1, pursues: true, groupSize: 3 },
    { id: 'kellerassel', weight: 3, cost: 2, pursues: true },
    { id: 'zapfhahn', weight: 2, cost: 2, pursues: false },
    { id: 'schimmelfleck', weight: 2, cost: 3, pursues: false },
    { id: 'rollfass', weight: 1, cost: 3, pursues: false },
  ],
  rural: [
    { id: 'gockel', weight: 2, cost: 1, pursues: true, groupSize: 3 },
    { id: 'bierratte', weight: 2, cost: 1, pursues: true, groupSize: 3 },
    { id: 'bauer', weight: 3, cost: 2, pursues: true },
    { id: 'gartenzwerg', weight: 2, cost: 2, pursues: false },
    { id: 'kuh', weight: 2, cost: 3, pursues: true },
    { id: 'blaskapellist', weight: 1, cost: 3, pursues: false },
    { id: 'boellerschmeisser', weight: 1, cost: 3, pursues: false },
    { id: 'traktor', weight: 1, cost: 4, pursues: true },
  ],
};

/**
 * Decorative-prop kinds per floor tag, drawn with repeats for weighting. Every
 * name here has art (`render/floor-art.ts`'s `PROP_TILE_NAMES` / the floor
 * tileset's `destructibles`) — `barrel` becomes a real destructible target, the
 * crates and bales are scenery. An unknown tag falls back to plain barrels.
 */
const PROP_KINDS: Readonly<Record<string, readonly string[]>> = {
  cellar: ['barrel', 'barrel', 'barrel', 'crate-opa', 'crate-neu'],
  rural: ['barrel', 'barrel', 'crate-stack', 'hay-bale', 'fence-post'],
};
const FALLBACK_PROP_KINDS: readonly string[] = ['barrel'];

/**
 * The floor-flavour hazard a generated room may carry, per floor tag — Floor
 * 1's slick puddle (#35), Floor 2's hop-trellis that blocks a shot but not a
 * step (#37). Both are the only two hazard types with sim behaviour today
 * (`sim/room/template.ts`), and both are walk-through, so neither can wall off
 * a route. A tag with no entry gets no generated hazard.
 */
const HAZARD_BY_TAG: Readonly<Record<string, string>> = {
  cellar: 'puddle',
  rural: 'trellis',
};

/**
 * Every prop / hazard type the generator can place, deduped — the seam
 * `tests/content/sprite-coverage.test.ts` reads so a generated room's scenery
 * is held to the same "has art" bar as an authored one.
 */
export const GENERATED_SCENERY_TYPES: readonly string[] = [
  ...new Set([
    ...Object.values(PROP_KINDS).flat(),
    ...FALLBACK_PROP_KINDS,
    ...Object.values(HAZARD_BY_TAG),
  ]),
];

const warnedGaps = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (!import.meta.env.DEV || warnedGaps.has(key)) {
    return;
  }
  warnedGaps.add(key);
  console.warn(message);
}

/**
 * A stable per-room seed: run seed folded with the floor, the room id and a
 * `salt` (bumped by the dev "regenerate this room" key so mashing it walks
 * through fresh layouts without changing the run seed).
 */
export function roomGenSeed(runSeed: number, floor: number, roomId: string, salt: number): number {
  let hash = splitmix32((runSeed ^ 0x9e3779b9) >>> 0);
  hash = splitmix32((hash ^ Math.imul(floor + 1, 0x85ebca6b)) >>> 0);
  for (let index = 0; index < roomId.length; index++) {
    hash = splitmix32((hash ^ roomId.charCodeAt(index)) >>> 0);
  }
  hash = splitmix32((hash ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0);
  return hash >>> 0;
}

// -------------------------------------------------------------------------- //
// The tile grid
// -------------------------------------------------------------------------- //

/**
 * The working tile grid — one continuous field spanning the room's whole
 * bounding box, `gridCols * ROOM_COLUMNS` by `gridRows * ROOM_ROWS`. For a
 * `1x1` room that is exactly the 15×9 screen; for a `2x2` it is 30×18, etc.
 *
 * `voidMask` marks the sub-cells the shape's footprint drops (`L`'s corner,
 * `T`'s four) — those tiles are permanently outside the room: never walkable,
 * never touched, always blocking a BFS.
 */
interface RoomGrid {
  readonly cols: number;
  readonly rows: number;
  readonly solid: boolean[];
  readonly voidMask: boolean[];
}

function tileIndex(grid: RoomGrid, col: number, row: number): number {
  return row * grid.cols + col;
}

/** A tile a body / BFS treats as wall: a real obstacle, or a dropped-cell void. */
function blocked(grid: RoomGrid, col: number, row: number): boolean {
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) {
    return true;
  }
  const index = tileIndex(grid, col, row);
  return grid.solid[index] === true || grid.voidMask[index] === true;
}

/**
 * A tile the generator owns: obstacles and spawns go here, everything else is
 * left alone. It is one tile in from *each single-screen cell's* own edge — so
 * every sub-cell keeps its wall-margin ring, and the two rings that meet at a
 * glued seam form a guaranteed-open two-tile lane between the sub-rooms (which
 * is what "no wall between glued sub-rooms" means for a generated room). Voids
 * are never interior.
 */
function inInterior(grid: RoomGrid, col: number, row: number): boolean {
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) {
    return false;
  }
  const localCol = col % ROOM_COLUMNS;
  const localRow = row % ROOM_ROWS;
  if (localCol < 1 || localCol > ROOM_COLUMNS - 2 || localRow < 1 || localRow > ROOM_ROWS - 2) {
    return false;
  }
  return grid.voidMask[tileIndex(grid, col, row)] !== true;
}

function setSolid(grid: RoomGrid, col: number, row: number, value: boolean): void {
  if (inInterior(grid, col, row)) {
    grid.solid[tileIndex(grid, col, row)] = value;
  }
}

function makeGrid(gridCols: number, gridRows: number, voidCells: readonly Cell[]): RoomGrid {
  const cols = gridCols * ROOM_COLUMNS;
  const rows = gridRows * ROOM_ROWS;
  const voidMask = new Array<boolean>(cols * rows).fill(false);
  for (const cell of voidCells) {
    for (let r = cell.row * ROOM_ROWS; r < (cell.row + 1) * ROOM_ROWS; r++) {
      for (let c = cell.col * ROOM_COLUMNS; c < (cell.col + 1) * ROOM_COLUMNS; c++) {
        voidMask[r * cols + c] = true;
      }
    }
  }
  return { cols, rows, solid: new Array<boolean>(cols * rows).fill(false), voidMask };
}

interface Cell {
  readonly col: number;
  readonly row: number;
}

/** The centre of one single-screen cell's own door, in that cell's local 15×9 grid. */
const DOOR_INNER_COL = (ROOM_COLUMNS - 1) / 2; // 7
const DOOR_INNER_ROW = (ROOM_ROWS - 1) / 2; // 4

/** Where a body stands the instant it walks through `(cellCol,cellRow)`'s `direction` door — in whole-grid tiles. */
function doorMouth(cellCol: number, cellRow: number, direction: DoorDirection): Cell {
  const offset = DIRECTION_OFFSET[direction];
  return {
    col: cellCol * ROOM_COLUMNS + DOOR_INNER_COL + offset.x * (DOOR_INNER_COL - 1),
    row: cellRow * ROOM_ROWS + DOOR_INNER_ROW + offset.y * (DOOR_INNER_ROW - 1),
  };
}

// -------------------------------------------------------------------------- //
// Layout
// -------------------------------------------------------------------------- //

type SymmetryMode = 'none' | 'mirrorX' | 'mirrorY' | 'rot180' | 'quad';

const SYMMETRY_WEIGHTS: readonly { readonly value: SymmetryMode; readonly weight: number }[] = [
  { value: 'none', weight: 3 },
  { value: 'mirrorX', weight: 4 },
  { value: 'mirrorY', weight: 2 },
  { value: 'rot180', weight: 2 },
  { value: 'quad', weight: 2 },
];

/** Obstacle stamps, each a list of `[rowOffset, colOffset]` cells from an anchor. */
const PIECES = [
  [[0, 0]],
  [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 0],
    [1, 0],
    [1, 1],
  ],
] as const;

function applySymmetry(grid: RoomGrid, col: number, row: number, symmetry: SymmetryMode): void {
  const mirrorCol = grid.cols - 1 - col;
  const mirrorRow = grid.rows - 1 - row;
  switch (symmetry) {
    case 'none':
      break;
    case 'mirrorX':
      setSolid(grid, mirrorCol, row, true);
      break;
    case 'mirrorY':
      setSolid(grid, col, mirrorRow, true);
      break;
    case 'rot180':
      setSolid(grid, mirrorCol, mirrorRow, true);
      break;
    case 'quad':
      setSolid(grid, mirrorCol, row, true);
      setSolid(grid, col, mirrorRow, true);
      setSolid(grid, mirrorCol, mirrorRow, true);
      break;
  }
}

function fundamentalMax(grid: RoomGrid, symmetry: SymmetryMode): Cell {
  return {
    col:
      symmetry === 'mirrorX' || symmetry === 'quad'
        ? Math.floor((grid.cols - 1) / 2)
        : grid.cols - 2,
    row:
      symmetry === 'mirrorY' || symmetry === 'quad'
        ? Math.floor((grid.rows - 1) / 2)
        : grid.rows - 2,
  };
}

/** Sprinkles `count` small free-standing obstacle clumps — cover to fight around, not a maze. */
function stampScatter(grid: RoomGrid, rng: Rng, symmetry: SymmetryMode, count: number): void {
  const max = fundamentalMax(grid, symmetry);
  for (let piece = 0; piece < count; piece++) {
    const shape = rng.pick(PIECES);
    const anchorCol = rng.nextInt(1, max.col + 1);
    const anchorRow = rng.nextInt(1, max.row + 1);
    for (const [rowOffset, colOffset] of shape) {
      setSolid(grid, anchorCol + colOffset, anchorRow + rowOffset, true);
      applySymmetry(grid, anchorCol + colOffset, anchorRow + rowOffset, symmetry);
    }
  }
}

/**
 * Lays `count` short solid wall segments (3–5 tiles) — a real bit of cover a
 * player has to round the end of, not a divider that splits the room.
 */
function stampCoverWalls(grid: RoomGrid, rng: Rng, symmetry: SymmetryMode, count: number): void {
  const max = fundamentalMax(grid, symmetry);
  for (let wall = 0; wall < count; wall++) {
    const vertical = rng.chance(0.5);
    const length = rng.nextInt(3, 6);
    const anchorCol = rng.nextInt(1, max.col + 1);
    const anchorRow = rng.nextInt(1, max.row + 1);
    for (let step = 0; step < length; step++) {
      const col = vertical ? anchorCol : anchorCol + step;
      const row = vertical ? anchorRow + step : anchorRow;
      setSolid(grid, col, row, true);
      applySymmetry(grid, col, row, symmetry);
    }
  }
}

function countInteriorSolid(grid: RoomGrid): number {
  let count = 0;
  for (let row = 1; row < grid.rows - 1; row++) {
    for (let col = 1; col < grid.cols - 1; col++) {
      if (grid.solid[tileIndex(grid, col, row)] === true) {
        count += 1;
      }
    }
  }
  return count;
}

/** Clears the one tile immediately inside each door mouth. */
function carveDoorMouths(grid: RoomGrid, mouths: readonly Cell[]): void {
  for (const mouth of mouths) {
    setSolid(grid, mouth.col, mouth.row, false);
  }
}

const UNREACHED = -1;

/** `Int16Array` read that satisfies `noUncheckedIndexedAccess` — an out-of-range index reads as unreached. */
function distAt(distance: Int16Array, index: number): number {
  return distance[index] ?? UNREACHED;
}

/** 4-connected BFS step-distance from `start` over open (non-blocked) tiles — `UNREACHED` for the rest. */
function bfsDistances(grid: RoomGrid, start: Cell): Int16Array {
  const distance = new Int16Array(grid.cols * grid.rows).fill(UNREACHED);
  if (blocked(grid, start.col, start.row)) {
    return distance;
  }
  const startIndex = tileIndex(grid, start.col, start.row);
  distance[startIndex] = 0;
  const queue: number[] = [startIndex];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head] ?? 0;
    head += 1;
    const col = current % grid.cols;
    const row = Math.floor(current / grid.cols);
    const nextDistance = distAt(distance, current) + 1;
    for (const direction of DOOR_DIRECTIONS) {
      const offset = DIRECTION_OFFSET[direction];
      const nextCol = col + offset.x;
      const nextRow = row + offset.y;
      if (blocked(grid, nextCol, nextRow)) {
        continue;
      }
      const nextIndex = tileIndex(grid, nextCol, nextRow);
      if (distAt(distance, nextIndex) !== UNREACHED) {
        continue;
      }
      distance[nextIndex] = nextDistance;
      queue.push(nextIndex);
    }
  }
  return distance;
}

function everyMouthReachable(
  grid: RoomGrid,
  distance: Int16Array,
  mouths: readonly Cell[],
): boolean {
  return mouths.every((mouth) => distAt(distance, tileIndex(grid, mouth.col, mouth.row)) >= 0);
}

/**
 * Rule 1: never leave a dead pocket. Any open interior tile the door-mouth BFS
 * did not reach is walled off from the rest of the room — fill it solid so the
 * whole walkable area is one region, reachable from every door.
 */
function fillUnreachedPockets(grid: RoomGrid, distanceFromDoor: Int16Array): void {
  for (let row = 1; row < grid.rows - 1; row++) {
    for (let col = 1; col < grid.cols - 1; col++) {
      const index = tileIndex(grid, col, row);
      if (
        inInterior(grid, col, row) &&
        grid.solid[index] !== true &&
        distAt(distanceFromDoor, index) < 0
      ) {
        grid.solid[index] = true;
      }
    }
  }
}

/**
 * Covers the solid tiles of one single-screen cell with as few axis-aligned
 * rects as a greedy pass manages — grow each unclaimed tile right, then down —
 * returned in that cell's own local coordinates. Keeps a room half-full of
 * obstacles well under `MAX_ROOM_BLOCKS`.
 */
function sliceObstacles(grid: RoomGrid, cellCol: number, cellRow: number): RoomObstacle[] {
  const baseCol = cellCol * ROOM_COLUMNS;
  const baseRow = cellRow * ROOM_ROWS;
  const claimed = new Set<number>();
  const free = (lc: number, lr: number): boolean => {
    if (lc < 1 || lc > ROOM_COLUMNS - 2 || lr < 1 || lr > ROOM_ROWS - 2) {
      return false;
    }
    const key = lr * ROOM_COLUMNS + lc;
    return grid.solid[tileIndex(grid, baseCol + lc, baseRow + lr)] === true && !claimed.has(key);
  };
  const rowRunFree = (lc: number, width: number, lr: number): boolean => {
    for (let c = lc; c < lc + width; c++) {
      if (!free(c, lr)) {
        return false;
      }
    }
    return true;
  };

  const obstacles: RoomObstacle[] = [];
  for (let lr = 1; lr <= ROOM_ROWS - 2; lr++) {
    for (let lc = 1; lc <= ROOM_COLUMNS - 2; lc++) {
      if (!free(lc, lr)) {
        continue;
      }
      let width = 1;
      while (free(lc + width, lr)) {
        width += 1;
      }
      let height = 1;
      while (lr + height <= ROOM_ROWS - 2 && rowRunFree(lc, width, lr + height)) {
        height += 1;
      }
      for (let r = lr; r < lr + height; r++) {
        for (let c = lc; c < lc + width; c++) {
          claimed.add(r * ROOM_COLUMNS + c);
        }
      }
      obstacles.push({
        x: lc * ROOM_TILE_UNITS,
        y: lr * ROOM_TILE_UNITS,
        width: width * ROOM_TILE_UNITS,
        height: height * ROOM_TILE_UNITS,
      });
    }
  }
  return obstacles;
}

/** The `.`/`#` grid for one single-screen cell (cosmetic — `compileRoomTemplate` reads `obstacles`). */
function sliceTileGrid(grid: RoomGrid, cellCol: number, cellRow: number): string[] {
  const baseCol = cellCol * ROOM_COLUMNS;
  const baseRow = cellRow * ROOM_ROWS;
  const rows: string[] = [];
  for (let lr = 0; lr < ROOM_ROWS; lr++) {
    let line = '';
    for (let lc = 0; lc < ROOM_COLUMNS; lc++) {
      const isRing = lr === 0 || lr === ROOM_ROWS - 1 || lc === 0 || lc === ROOM_COLUMNS - 1;
      const solid = grid.solid[tileIndex(grid, baseCol + lc, baseRow + lr)] === true;
      line += isRing || solid ? '#' : '.';
    }
    rows.push(line);
  }
  return rows;
}

/** How far `value` sits outside `[low, high]` — `0` when it is inside. */
function bandMiss(value: number, low: number, high: number): number {
  if (value < low) {
    return low - value;
  }
  if (value > high) {
    return value - high;
  }
  return 0;
}

/** The obstacle-coverage band this room aims for, in tiles, scaled by how many cells it spans. */
function coverageBand(
  rng: Rng,
  params: RoomGenTuning,
  cellCount: number,
): { targetLow: number; targetHigh: number } {
  if (rng.chance(params.sparseChance)) {
    return { targetLow: 0, targetHigh: params.sparseMaxTiles * cellCount };
  }
  if (rng.chance(params.busyChance)) {
    return {
      targetLow: params.minCoverTiles * cellCount,
      targetHigh: params.busyMaxCoverTiles * cellCount,
    };
  }
  return {
    targetLow: params.minCoverTiles * cellCount,
    targetHigh: params.maxCoverTiles * cellCount,
  };
}

interface Layout {
  readonly grid: RoomGrid;
  readonly distance: Int16Array;
}

/**
 * Stamps obstacles into `grid` over `layoutRetries` attempts and keeps the one
 * whose coverage lands closest to the tuned band while every door stays
 * reachable and no pocket is left. `grid` is expected to arrive with only its
 * `voidMask` set.
 */
function layoutGrid(
  rng: Rng,
  params: RoomGenTuning,
  gridCols: number,
  gridRows: number,
  voidCells: readonly Cell[],
  mouths: readonly Cell[],
  cellCount: number,
): { readonly layout: Layout; readonly found: boolean } {
  const symmetry = voidCells.length > 0 ? 'none' : rng.weightedPick(SYMMETRY_WEIGHTS);
  const seedMouth = mouths[0] ?? { col: DOOR_INNER_COL, row: DOOR_INNER_ROW };
  const { targetLow, targetHigh } = coverageBand(rng, params, cellCount);

  const empty = makeGrid(gridCols, gridRows, voidCells);
  let best: Layout = { grid: empty, distance: bfsDistances(empty, seedMouth) };
  let bestMiss = Number.POSITIVE_INFINITY;
  let found = false;

  for (let attempt = 0; attempt < params.layoutRetries; attempt++) {
    const candidate = makeGrid(gridCols, gridRows, voidCells);
    stampCoverWalls(candidate, rng, symmetry, rng.nextInt(0, params.maxCoverWalls * cellCount + 1));
    stampScatter(candidate, rng, symmetry, rng.nextInt(0, params.maxScatter * cellCount + 1));
    carveDoorMouths(candidate, mouths);

    const candidateDistance = bfsDistances(candidate, seedMouth);
    if (!everyMouthReachable(candidate, candidateDistance, mouths)) {
      continue;
    }
    fillUnreachedPockets(candidate, candidateDistance);
    // Every void cell and every obstacle rect is one `RoomGeometry` block, all
    // in the same compiled room — the whole 64-block budget, not per sub-cell.
    if (totalRects(candidate, gridCols, gridRows, voidCells) + voidCells.length > MAX_ROOM_BLOCKS) {
      continue;
    }

    const miss = bandMiss(countInteriorSolid(candidate), targetLow, targetHigh);
    if (miss < bestMiss) {
      bestMiss = miss;
      best = { grid: candidate, distance: candidateDistance };
      found = true;
    }
    if (miss === 0) {
      break;
    }
  }
  return { layout: best, found };
}

function totalRects(
  grid: RoomGrid,
  gridCols: number,
  gridRows: number,
  voidCells: readonly Cell[],
): number {
  const voidKeys = new Set(voidCells.map((cell) => `${String(cell.col)},${String(cell.row)}`));
  let total = 0;
  for (let cr = 0; cr < gridRows; cr++) {
    for (let cc = 0; cc < gridCols; cc++) {
      if (!voidKeys.has(`${String(cc)},${String(cr)}`)) {
        total += sliceObstacles(grid, cc, cr).length;
      }
    }
  }
  return total;
}

// -------------------------------------------------------------------------- //
// Content — enemies, pickups, hazards, props
// -------------------------------------------------------------------------- //

interface PlacedTile {
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
}

/**
 * A body spawned on this tile — enemy, pickup, prop — is a collider up to
 * `TARGET_RADIUS` (10px) wide. If any *orthogonal* neighbour is a wall the
 * collider overlaps it and the body is shoved out the first time it is touched
 * (barrels visibly "teleport"). A blocked *diagonal* neighbour is fine (the
 * corner is ~11px away) — that is a body placed against cover, not clipping it.
 */
function colliderFits(grid: RoomGrid, col: number, row: number): boolean {
  return DOOR_DIRECTIONS.every((direction) => {
    const offset = DIRECTION_OFFSET[direction];
    return !blocked(grid, col + offset.x, row + offset.y);
  });
}

function tileAgainstCover(grid: RoomGrid, col: number, row: number): boolean {
  return (
    blocked(grid, col - 1, row - 1) ||
    blocked(grid, col + 1, row - 1) ||
    blocked(grid, col - 1, row + 1) ||
    blocked(grid, col + 1, row + 1)
  );
}

/**
 * Every interior tile that is open, reachable, has room for a body's collider,
 * and is at least `doorGap` from every door mouth.
 */
function openTiles(
  grid: RoomGrid,
  distance: Int16Array,
  mouths: readonly Cell[],
  doorGap: number,
): PlacedTile[] {
  const tiles: PlacedTile[] = [];
  for (let row = 1; row < grid.rows - 1; row++) {
    for (let col = 1; col < grid.cols - 1; col++) {
      if (!inInterior(grid, col, row)) {
        continue;
      }
      const index = tileIndex(grid, col, row);
      if (
        grid.solid[index] === true ||
        distAt(distance, index) < 0 ||
        !colliderFits(grid, col, row)
      ) {
        continue;
      }
      if (
        mouths.some(
          (mouth) => Math.abs(mouth.col - col) <= doorGap && Math.abs(mouth.row - row) <= doorGap,
        )
      ) {
        continue;
      }
      tiles.push({
        col,
        row,
        x: col * ROOM_TILE_UNITS + ROOM_TILE_UNITS / 2,
        y: row * ROOM_TILE_UNITS + ROOM_TILE_UNITS / 2,
      });
    }
  }
  return tiles;
}

interface PlacedEnemy {
  readonly tile: PlacedTile;
  readonly enemyId: string;
  readonly cost: number;
  readonly pursues: boolean;
  /** Bodies spawned together at `tile` from this one placement — see `RosterEntry.groupSize`. */
  readonly groupSize: number;
}

/**
 * #230: a locked room (`GameSim.doorsLocked` — any room with a live enemy)
 * whose whole roster stands still or ignores the player is not a fight. If
 * the budget draw above happened to land only on non-pursuing bodies, swap
 * the cheapest one for the roster's cheapest pursuer — a static enemy is
 * still a fine *addition* to a room that already has something chasing the
 * player, just never the whole room. A room the draw left empty is not
 * touched: it never locks its doors, so there is nothing to guarantee here.
 */
function ensurePursuerPresent(
  ctx: RoomGenContext,
  roster: readonly RosterEntry[],
  placed: PlacedEnemy[],
): void {
  if (placed.length === 0 || placed.some((enemy) => enemy.pursues)) {
    return;
  }
  const pursuers = roster.filter((entry) => entry.pursues);
  if (pursuers.length === 0) {
    warnOnce(
      `no-pursuer:${ctx.floorTag}`,
      `generate-room: floor tag "${ctx.floorTag}" has no pursuing roster entry — every locked room ` +
        `stays passive. Add one to ROSTERS in sim/room/generate-room.ts.`,
    );
    return;
  }
  const pursuer = pursuers.reduce((min, entry) => (entry.cost < min.cost ? entry : min));
  let cheapestIndex = 0;
  for (let index = 1; index < placed.length; index++) {
    if ((placed[index]?.cost ?? Infinity) < (placed[cheapestIndex]?.cost ?? Infinity)) {
      cheapestIndex = index;
    }
  }
  const target = placed[cheapestIndex];
  if (target === undefined) {
    return;
  }
  placed[cheapestIndex] = {
    ...target,
    enemyId: pursuer.id,
    cost: pursuer.cost,
    pursues: true,
    groupSize: pursuer.groupSize ?? 1,
  };
}

function placeEnemies(
  ctx: RoomGenContext,
  candidates: readonly PlacedTile[],
  cellCount: number,
  params: RoomGenTuning,
): PlacedEnemy[] {
  const roster = ROSTERS[ctx.floorTag];
  if (roster === undefined || roster.length === 0) {
    warnOnce(
      `roster:${ctx.floorTag}`,
      `generate-room: no enemy roster for floor tag "${ctx.floorTag}" — generating empty rooms. ` +
        `Add one to ROSTERS in sim/room/generate-room.ts.`,
    );
    return [];
  }
  const shuffled = ctx.rng.shuffle(candidates.slice());
  // Fractional depth (0 at the start room, 1 at the boss door) rather than a
  // raw door count — see `RoomGenContext.bossDistance`'s doc comment for why.
  const fractionalDepth = ctx.bossDistance > 0 ? ctx.distanceFromStart / ctx.bossDistance : 0;
  const budget =
    (params.threatBase +
      params.threatPerDistance * fractionalDepth +
      params.threatPerFloor * Math.max(0, ctx.floor - 1)) *
    cellCount;
  const maxEnemies = params.maxEnemies * cellCount;
  const cheapest = roster.reduce((min, entry) => Math.min(min, entry.cost), Infinity);

  const placed: PlacedEnemy[] = [];
  let spent = 0;
  let bodyCount = 0;
  for (const tile of shuffled) {
    if (bodyCount >= maxEnemies || budget - spent < cheapest) {
      break;
    }
    if (
      placed.some(
        (other) => Math.abs(other.tile.col - tile.col) + Math.abs(other.tile.row - tile.row) < 2,
      )
    ) {
      continue;
    }
    const affordable = roster.filter((entry) => entry.cost <= budget - spent + 0.5);
    if (affordable.length === 0) {
      continue;
    }
    const choice = ctx.rng.weightedPick(
      affordable.map((entry) => ({ value: entry, weight: entry.weight })),
    );
    const groupSize = choice.groupSize ?? 1;
    placed.push({
      tile,
      enemyId: choice.id,
      cost: choice.cost,
      pursues: choice.pursues,
      groupSize,
    });
    spent += choice.cost;
    bodyCount += groupSize;
  }
  ensurePursuerPresent(ctx, roster, placed);
  return placed;
}

function pickPickup(
  candidates: readonly PlacedTile[],
  enemies: readonly PlacedEnemy[],
): PlacedTile | null {
  for (const tile of candidates) {
    if (
      enemies.some(
        (enemy) => Math.abs(enemy.tile.x - tile.x) < 24 && Math.abs(enemy.tile.y - tile.y) < 24,
      )
    ) {
      continue;
    }
    return tile;
  }
  return null;
}

/** Maybe one 2×2-tile hazard patch per ~4 cells — walk-through, so no route check. */
function placeHazards(
  ctx: RoomGenContext,
  grid: RoomGrid,
  distance: Int16Array,
  mouths: readonly Cell[],
  cellCount: number,
  params: RoomGenTuning,
): { readonly col: number; readonly row: number; readonly type: string }[] {
  const type = HAZARD_BY_TAG[ctx.floorTag];
  if (type === undefined) {
    return [];
  }
  const wanted = 1 + Math.floor((cellCount - 1) / 2);
  const patches: { col: number; row: number; type: string }[] = [];
  for (let attempt = 0; attempt < wanted; attempt++) {
    if (!ctx.rng.chance(params.hazardChance)) {
      continue;
    }
    const spots: Cell[] = [];
    for (let row = 1; row < grid.rows - 2; row++) {
      for (let col = 1; col < grid.cols - 2; col++) {
        // All four tiles must be interior (which keeps the 2×2 inside one
        // single-screen cell), open and reachable.
        let clear = true;
        for (let dr = 0; dr < 2 && clear; dr++) {
          for (let dc = 0; dc < 2 && clear; dc++) {
            if (!inInterior(grid, col + dc, row + dr)) {
              clear = false;
              continue;
            }
            const index = tileIndex(grid, col + dc, row + dr);
            if (grid.solid[index] === true || distAt(distance, index) < 0) {
              clear = false;
            }
          }
        }
        if (!clear) {
          continue;
        }
        if (
          mouths.some(
            (mouth) => Math.abs(mouth.col - col) <= 2 && Math.abs(mouth.row - row) <= 2,
          ) ||
          patches.some((patch) => Math.abs(patch.col - col) < 3 && Math.abs(patch.row - row) < 3)
        ) {
          continue;
        }
        spots.push({ col, row });
      }
    }
    if (spots.length > 0) {
      const spot = ctx.rng.pick(spots);
      patches.push({ col: spot.col, row: spot.row, type });
    }
  }
  return patches;
}

/** Min px between a prop's tile centre and an enemy / pickup — the prop is a 10px body. */
const PROP_CLEARANCE = 20;

interface PlacedProp {
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly type: string;
}

/**
 * Scatters props as scenery — a barrel by a pillar, a crate in a corner. Each
 * sits on an `openTiles` candidate (already collider-safe), well away from
 * doors / enemies / the pickup / other props, biased toward tiles that sit
 * against cover. A prop that would seal a route off is rejected: its tile is
 * checked as if solid and every door must still connect.
 */
function placeProps(
  ctx: RoomGenContext,
  grid: RoomGrid,
  candidates: readonly PlacedTile[],
  enemies: readonly PlacedEnemy[],
  pickup: PlacedTile | null,
  mouths: readonly Cell[],
  cellCount: number,
  params: RoomGenTuning,
): PlacedProp[] {
  const target = ctx.rng.nextInt(0, params.maxProps * cellCount + 1);
  if (target <= 0) {
    return [];
  }
  const kinds = PROP_KINDS[ctx.floorTag] ?? FALLBACK_PROP_KINDS;
  const seedMouth = mouths[0] ?? { col: DOOR_INNER_COL, row: DOOR_INNER_ROW };

  const usable = candidates.filter((tile) => {
    if (
      enemies.some(
        (enemy) =>
          Math.abs(enemy.tile.x - tile.x) < PROP_CLEARANCE &&
          Math.abs(enemy.tile.y - tile.y) < PROP_CLEARANCE,
      )
    ) {
      return false;
    }
    if (
      pickup !== null &&
      Math.abs(pickup.x - tile.x) < PROP_CLEARANCE &&
      Math.abs(pickup.y - tile.y) < PROP_CLEARANCE
    ) {
      return false;
    }
    return true;
  });
  const withCover = usable.map((tile) => ({
    tile,
    againstCover: tileAgainstCover(grid, tile.col, tile.row),
  }));
  ctx.rng.shuffle(withCover);
  withCover.sort((a, b) => Number(b.againstCover) - Number(a.againstCover));

  const props: PlacedProp[] = [];
  const scratch: RoomGrid = { ...grid, solid: grid.solid.slice() };
  for (const { tile } of withCover) {
    if (props.length >= target) {
      break;
    }
    if (
      props.some(
        (other) => Math.abs(other.col - tile.col) <= 1 && Math.abs(other.row - tile.row) <= 1,
      )
    ) {
      continue;
    }
    const index = tileIndex(scratch, tile.col, tile.row);
    scratch.solid[index] = true;
    if (!everyMouthReachable(scratch, bfsDistances(scratch, seedMouth), mouths)) {
      scratch.solid[index] = false;
      continue;
    }
    props.push({ col: tile.col, row: tile.row, x: tile.x, y: tile.y, type: ctx.rng.pick(kinds) });
  }
  return props;
}

// -------------------------------------------------------------------------- //
// Assembly
// -------------------------------------------------------------------------- //

function difficultyTierFor(ctx: RoomGenContext): number {
  return Math.min(
    5,
    Math.max(1, 1 + Math.floor(ctx.distanceFromStart / 2) + Math.max(0, ctx.floor - 1)),
  );
}

/** One single-screen cell's slice of the generated content, in that cell's local coords. */
function subLayoutFor(
  grid: RoomGrid,
  cell: Cell,
  enemies: readonly PlacedEnemy[],
  pickup: PlacedTile | null,
  hazards: readonly { readonly col: number; readonly row: number; readonly type: string }[],
  props: readonly PlacedProp[],
): RoomSubLayout {
  const minCol = cell.col * ROOM_COLUMNS;
  const maxCol = minCol + ROOM_COLUMNS;
  const minRow = cell.row * ROOM_ROWS;
  const maxRow = minRow + ROOM_ROWS;
  const inThisCell = (col: number, row: number): boolean =>
    col >= minCol && col < maxCol && row >= minRow && row < maxRow;
  const localX = (col: number): number => (col - minCol) * ROOM_TILE_UNITS + ROOM_TILE_UNITS / 2;
  const localY = (row: number): number => (row - minRow) * ROOM_TILE_UNITS + ROOM_TILE_UNITS / 2;

  const spawnGroups: RoomSpawnGroup[] = [];
  const enemySpawns: RoomEnemySpawn[] = [];
  enemies.forEach((enemy, index) => {
    if (!inThisCell(enemy.tile.col, enemy.tile.row)) {
      return;
    }
    const groupId = `gen-${String(cell.col)}-${String(cell.row)}-${String(index)}`;
    spawnGroups.push({
      id: groupId,
      count: enemy.groupSize,
      choices: [{ enemyId: enemy.enemyId, minFloor: 1, maxFloor: 7 }],
    });
    enemySpawns.push({ x: localX(enemy.tile.col), y: localY(enemy.tile.row), group: groupId });
  });

  const pickupSpawns: RoomPickupSpawn[] =
    pickup !== null && inThisCell(pickup.col, pickup.row)
      ? [{ x: localX(pickup.col), y: localY(pickup.row), type: 'mass-half' }]
      : [];

  const hazardRects: RoomHazard[] = hazards
    .filter((hazard) => inThisCell(hazard.col, hazard.row))
    .map((hazard) => ({
      x: (hazard.col - minCol) * ROOM_TILE_UNITS,
      y: (hazard.row - minRow) * ROOM_TILE_UNITS,
      width: 2 * ROOM_TILE_UNITS,
      height: 2 * ROOM_TILE_UNITS,
      type: hazard.type,
    }));

  const decorativeProps: RoomDecorativeProp[] = props
    .filter((prop) => inThisCell(prop.col, prop.row))
    .map((prop) => ({ x: localX(prop.col), y: localY(prop.row), type: prop.type }));

  return {
    tileGrid: sliceTileGrid(grid, cell.col, cell.row),
    obstacles: sliceObstacles(grid, cell.col, cell.row),
    enemySpawns,
    spawnGroups,
    pickupSpawns,
    hazards: hazardRects,
    decorativeProps,
  };
}

/**
 * Builds one procedural `1x1` room — the return value is the same object shape a
 * `.json` template file would parse to.
 */
export function generateRoom(
  spec: RoomGenSpec,
  params: RoomGenTuning = DEFAULT_ROOM_GEN_TUNING,
): SingleCellRoomTemplate {
  const mouths = spec.doors.map((direction) => doorMouth(0, 0, direction));
  const { layout, found } = layoutGrid(spec.rng, params, 1, 1, [], mouths, 1);
  if (!found) {
    warnFallback(spec);
  }

  const candidates = openTiles(layout.grid, layout.distance, mouths, 2);
  const enemies = placeEnemies(spec, candidates, 1, params);
  const pickup = spec.rng.chance(params.pickupChance)
    ? pickPickup(spec.rng.shuffle(candidates.slice()), enemies)
    : null;
  const hazards = placeHazards(spec, layout.grid, layout.distance, mouths, 1, params);
  const props = placeProps(spec, layout.grid, candidates, enemies, pickup, mouths, 1, params);

  const sub = subLayoutFor(layout.grid, { col: 0, row: 0 }, enemies, pickup, hazards, props);
  return {
    id: `gen-${spec.floorTag}-${spec.roomId}`,
    ...sub,
    metadata: {
      floorTags: [spec.floorTag],
      shape: '1x1',
      doors: {
        north: spec.doors.includes('north'),
        east: spec.doors.includes('east'),
        south: spec.doors.includes('south'),
        west: spec.doors.includes('west'),
      },
      difficultyTier: difficultyTierFor(spec),
      weight: 1,
    },
  };
}

/**
 * Builds one procedural multi-cell room (`1x2`/`2x2`/`L`/`T`). The whole
 * bounding box is generated as one continuous grid — the seams between glued
 * sub-rooms carry no wall — then sliced into `MULTI_CELL_COUNT[shape]`
 * `RoomSubLayout`s in the same row-major order `compileRoomTemplate` glues them
 * back in.
 */
export function generateMultiCellRoom(
  spec: MultiCellRoomGenSpec,
  params: RoomGenTuning = DEFAULT_ROOM_GEN_TUNING,
): MultiCellRoomTemplate {
  const realCells = spec.cells.map((cell) => ({ col: cell.col, row: cell.row }));
  const gridCols = Math.max(...realCells.map((cell) => cell.col)) + 1;
  const gridRows = Math.max(...realCells.map((cell) => cell.row)) + 1;

  const realKeys = new Set(realCells.map((cell) => `${String(cell.col)},${String(cell.row)}`));
  const voidCells: Cell[] = [];
  for (let cr = 0; cr < gridRows; cr++) {
    for (let cc = 0; cc < gridCols; cc++) {
      if (!realKeys.has(`${String(cc)},${String(cr)}`)) {
        voidCells.push({ col: cc, row: cr });
      }
    }
  }

  const mouths = spec.doors
    .map((door) => {
      const cell = realCells[door.cellIndex];
      return cell === undefined ? null : doorMouth(cell.col, cell.row, door.direction);
    })
    .filter((mouth): mouth is Cell => mouth !== null);

  const cellCount = realCells.length;
  const { layout, found } = layoutGrid(
    spec.rng,
    params,
    gridCols,
    gridRows,
    voidCells,
    mouths,
    cellCount,
  );
  if (!found) {
    warnFallback(spec);
  }

  const candidates = openTiles(layout.grid, layout.distance, mouths, 2);
  const enemies = placeEnemies(spec, candidates, cellCount, params);
  const pickup = spec.rng.chance(params.pickupChance)
    ? pickPickup(spec.rng.shuffle(candidates.slice()), enemies)
    : null;
  const hazards = placeHazards(spec, layout.grid, layout.distance, mouths, cellCount, params);
  const props = placeProps(
    spec,
    layout.grid,
    candidates,
    enemies,
    pickup,
    mouths,
    cellCount,
    params,
  );

  // Row-major order — the same order `compileRoomTemplate` assigns `cells` to
  // the real placement slots.
  const ordered = realCells
    .slice()
    .sort((a, b) => (a.row === b.row ? a.col - b.col : a.row - b.row));
  const cells = ordered.map((cell) =>
    subLayoutFor(layout.grid, cell, enemies, pickup, hazards, props),
  );

  return {
    id: `gen-${spec.floorTag}-${spec.roomId}`,
    cells,
    metadata: {
      floorTags: [spec.floorTag],
      shape: spec.shape,
      difficultyTier: difficultyTierFor(spec),
      weight: 1,
    },
  };
}

function warnFallback(spec: RoomGenContext): void {
  warnOnce(
    `layout:${String(spec.floor)}:${spec.roomId}`,
    `generate-room: no reachable layout for ${spec.roomId} on floor ${String(spec.floor)} — ` +
      `falling back to an empty room.`,
  );
}
