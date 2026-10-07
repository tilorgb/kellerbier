import { CollisionLayer } from '../collision/layers.js';
import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';
import {
  CLEAR_IGNORE_DESTRUCTIBLE,
  CLEAR_IGNORE_PITS,
  PIT_SIZE,
  type RoomGeometry,
} from '../room/geometry.js';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../room/template.js';

/**
 * Pits in the floor (#410): which floor plank a Borkenkäfer may eat through,
 * and the softlock guard that decides it.
 *
 * The rule the floor is held to is "a pit never blocks a door and never cuts
 * off any part of the room". The guard enforces the stronger form of that
 * directly: opening a pit may not disconnect *any* floor the player can reach
 * now from where the player stands, and on top of that every door, pickup and
 * pedestal they can reach now must stay in reach. It answers by trying it:
 * flood-fill the walk grid from the player, open the pit, flood again, take
 * the pit back, and compare. Reachability ignores destructible
 * cover (`CLEAR_IGNORE_DESTRUCTIBLE`), so a pit can never seal off a corner
 * a bomb or a Boar would otherwise open.
 *
 * On top of that, a plank is never eaten under a body (the player, an enemy,
 * a pickup), under a pedestal, in the Waldbach, or within
 * `tuning.pits.doorClearance` of any door — hidden ones included.
 *
 * `tests/unit/borkenkaefer.test.ts` holds it to that with a fuzz: two swarms
 * and a wandering player in every authored room a wald floor can draw, 20 000
 * ticks each, with the pit cap lifted to all the storage there is.
 *
 * Not per-tick work: the guard runs when a swarm picks a plank and again as
 * it finishes one. Still allocation-free, with every buffer allocated once
 * here at module load.
 *
 * @hot — called from the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/**
 * The guard's walk-grid cell, in room units: a quarter tile, half the
 * pathfinder's `PATH_CELL`. A tile-wide gap between two pits or blocks is
 * walkable — the player fits with room to spare — but no 8-unit cell centre
 * sits in its middle, so a pathfinder-sized grid reads it as shut, and a
 * corridor that jogs by a tile reads as diagonal-only. At 4 units a cell
 * centre always lands on the line a body walks down.
 */
const FLOOD_CELL = 4;

/** Largest walk grid the guard floods — a `T` room is 180×108 cells. */
const MAX_CELLS = 1 << 15;

/**
 * How near a reached cell has to come to a door, pickup or pedestal for the
 * player to count as reaching it: their own radius and a little — a pickup is
 * collected on touch, a door walked through from a step inside it.
 */
const TARGET_SLACK = 6;
/** How far inside its wall a door's walk-up point sits. */
const DOOR_INSET = 10;

/** Which flood last reached a cell: `floodStamp` for the one before the pit, `+1` for the one after. */
const reachedIn = new Uint32Array(MAX_CELLS);
const reachedAfterIn = new Uint32Array(MAX_CELLS);
const queue = new Int32Array(MAX_CELLS);
/** The current guard's stamp, in a typed array so the loop never boxes it. */
const floodStamp = new Uint32Array(1);

/** Where `relocateOffPit` found clear floor — module scratch, not a returned object. */
export const landing = new Float64Array(2);

/**
 * Whether tile `(column, row)` passes the cheap checks — everything but the
 * reachability flood and what is standing on it: on the room's floor, a whole
 * plank (not already a pit, not under a block, not in the water) and clear of
 * every door. `pitIsSafe` asks this first.
 */
export function plankEligible(sim: GameSim, column: number, row: number): boolean {
  const room = sim.room;
  if (column < 0 || row < 0) {
    return false;
  }
  const centreX = room.pitCentreX(column);
  const centreY = room.pitCentreY(row);
  if (centreX + PIT_SIZE / 2 > room.maxX + 0.001 || centreY + PIT_SIZE / 2 > room.maxY + 0.001) {
    return false;
  }
  if (room.isPitTile(column, row)) {
    return false;
  }
  // The circle inscribed in the tile: every block is tile-aligned, so one that
  // reaches into the tile at all reaches into this.
  if (!room.isClear(centreX, centreY, PIT_SIZE / 2 - 0.5, CLEAR_IGNORE_PITS)) {
    return false;
  }
  if (room.isInStream(centreX, centreY)) {
    return false;
  }
  const clearance = sim.tuning.pits.doorClearance;
  const doors = sim.allRoomDoors;
  for (const door of doors) {
    if (
      tileWithin(room, column, row, doorCentreX(room, door), doorCentreY(room, door), clearance)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * The softlock guard: whether eating tile `(column, row)` into a pit is safe
 * right now. `eater` is the body doing the eating — the one body allowed to be
 * standing on the plank, since it is moved off it as the pit opens
 * (`relocateOffPit`). Leaves the room exactly as it found it.
 */
export function pitIsSafe(sim: GameSim, column: number, row: number, eater: number): boolean {
  const room = sim.room;
  if (room.pitCount >= sim.tuning.pits.maxPerRoom) {
    return false;
  }
  if (!plankEligible(sim, column, row)) {
    return false;
  }
  if (bodyOnTile(sim, column, row, eater)) {
    return false;
  }
  const playerIndex = sim.playerIndex;
  const radius = sim.body.data[playerIndex * 2] ?? 0;
  const pedestals = sim.activePedestals;
  for (const pedestal of pedestals) {
    if (tileWithin(room, column, row, pedestal.x, pedestal.y, radius * 2)) {
      return false;
    }
  }

  const columns = Math.ceil((room.maxX - room.minX) / FLOOD_CELL);
  const rows = Math.ceil((room.maxY - room.minY) / FLOOD_CELL);
  if (columns <= 0 || rows <= 0 || columns * rows > MAX_CELLS) {
    // Too big to prove anything about: refuse, which only ever costs a plank.
    return false;
  }
  const playerX = sim.positionX(playerIndex);
  const playerY = sim.positionY(playerIndex);

  floodStamp[0] = (floodStamp[0] ?? 0) + 1;
  if (floodStamp[0] === 0) {
    reachedIn.fill(0);
    reachedAfterIn.fill(0);
    floodStamp[0] = 1;
  }
  const stamp = floodStamp[0];
  flood(room, columns, rows, playerX, playerY, radius, reachedIn, stamp);
  if (!room.addPit(column, row)) {
    return false;
  }
  flood(room, columns, rows, playerX, playerY, radius, reachedAfterIn, stamp);
  let safe = targetsKept(sim, columns, rows, radius + TARGET_SLACK, stamp);
  const cells = columns * rows;
  for (let cell = 0; safe && cell < cells; cell++) {
    if (reachedIn[cell] !== stamp || reachedAfterIn[cell] === stamp) {
      continue;
    }
    // Reachable before, not after: fine only if the pit itself (or its edge)
    // is what took the cell away.
    if (walkable(room, columns, cell, radius)) {
      safe = false;
      break;
    }
  }
  room.removeLastPit();
  return safe;
}

/**
 * Finds clear floor next to tile `(column, row)` for the body at `index` to
 * step off onto as the plank under it gives way — the nearest of eight points
 * around the tile to where the body stands, written to `landing`. Asked with
 * the pit already open. Returns false when there is none (the caller leaves
 * the plank whole).
 */
export function relocateOffPit(sim: GameSim, index: number, column: number, row: number): boolean {
  const room = sim.room;
  const radius = sim.body.data[index * 2] ?? 0;
  const selfX = sim.positionX(index);
  const selfY = sim.positionY(index);
  const centreX = room.pitCentreX(column);
  const centreY = room.pitCentreY(row);
  const reach = PIT_SIZE / 2 + radius + 0.5;
  let bestSq = Infinity;
  for (let spoke = 0; spoke < 8; spoke++) {
    const angle = (spoke / 8) * Math.PI * 2;
    // Diagonals reach the tile's corner, not its inscribed circle.
    const scale = spoke % 2 === 0 ? 1 : Math.SQRT2;
    const x = centreX + Math.cos(angle) * reach * scale;
    const y = centreY + Math.sin(angle) * reach * scale;
    if (!room.isClear(x, y, radius)) {
      continue;
    }
    const dx = x - selfX;
    const dy = y - selfY;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestSq) {
      bestSq = distSq;
      landing[0] = x;
      landing[1] = y;
    }
  }
  return bestSq < Infinity;
}

/**
 * How far from the player a walk-grid cell may be and still seed the flood.
 * The player is not always standing where a cell's centre test says a body
 * fits — pressed into a corner, squeezed between two pits — so the flood
 * starts from every walkable cell around them instead of from theirs alone.
 * Two cells past their radius reaches clear floor from any corner, and stays
 * short of the far side of a tile-thick block or pit.
 */
const SEED_REACH = 16;
/**
 * How much narrower than the player the straight walk to a seed is tested:
 * the resolver leaves a body exactly touching what it ran into, and a float's
 * worth of overlap must not read as "cannot move at all".
 */
const SEED_SKIN = 0.5;

/**
 * Whether every door, pickup and pedestal the player could reach before the
 * pit (`reachedIn`) is still in reach after it (`reachedAfterIn`). The cell
 * comparison alone misses one case: a pit that narrows the floor around a
 * pickup until no cell next to it fits the player loses no *walkable* cell,
 * yet takes the pickup away.
 */
function targetsKept(
  sim: GameSim,
  columns: number,
  rows: number,
  reach: number,
  stamp: number,
): boolean {
  const room = sim.room;
  for (const door of sim.allRoomDoors) {
    const insetX =
      door.direction === 'west' ? DOOR_INSET : door.direction === 'east' ? -DOOR_INSET : 0;
    const insetY =
      door.direction === 'north' ? DOOR_INSET : door.direction === 'south' ? -DOOR_INSET : 0;
    const x = doorCentreX(room, door) + insetX;
    const y = doorCentreY(room, door) + insetY;
    if (!targetKept(room, columns, rows, x, y, reach, stamp)) {
      return false;
    }
  }
  for (const pedestal of sim.activePedestals) {
    if (!targetKept(room, columns, rows, pedestal.x, pedestal.y, reach, stamp)) {
      return false;
    }
  }
  const world = sim.world;
  const required = sim.collidableMask;
  const collision = sim.collision.data;
  for (let index = 0; index < world.highWater; index++) {
    if (
      world.states[index] !== World.ALIVE ||
      ((world.masks[index] ?? 0) & required) !== required ||
      ((collision[index * 2] ?? 0) & CollisionLayer.Pickup) === 0
    ) {
      continue;
    }
    if (
      !targetKept(room, columns, rows, sim.positionX(index), sim.positionY(index), reach, stamp)
    ) {
      return false;
    }
  }
  return true;
}

function targetKept(
  room: RoomGeometry,
  columns: number,
  rows: number,
  x: number,
  y: number,
  reach: number,
  stamp: number,
): boolean {
  return (
    !nearReached(room, columns, rows, x, y, reach, reachedIn, stamp) ||
    nearReached(room, columns, rows, x, y, reach, reachedAfterIn, stamp)
  );
}

/** True when any cell `reached` stamps lies within `reach` of `(x, y)`. */
function nearReached(
  room: RoomGeometry,
  columns: number,
  rows: number,
  x: number,
  y: number,
  reach: number,
  reached: Uint32Array,
  stamp: number,
): boolean {
  const minColumn = Math.max(0, Math.floor((x - reach - room.minX) / FLOOD_CELL));
  const maxColumn = Math.min(columns - 1, Math.floor((x + reach - room.minX) / FLOOD_CELL));
  const minRow = Math.max(0, Math.floor((y - reach - room.minY) / FLOOD_CELL));
  const maxRow = Math.min(rows - 1, Math.floor((y + reach - room.minY) / FLOOD_CELL));
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      if (reached[row * columns + column] !== stamp) {
        continue;
      }
      const dx = room.minX + (column + 0.5) * FLOOD_CELL - x;
      const dy = room.minY + (row + 0.5) * FLOOD_CELL - y;
      if (dx * dx + dy * dy <= reach * reach) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Breadth-first over `FLOOD_CELL` cells a body of `radius` fits at, from every
 * walkable cell within reach of `(fromX, fromY)`, stamping `reached`. With the
 * player boxed in, no cell seeds and nothing is reached — which is what makes
 * the pit that would box them in fail the comparison.
 */
function flood(
  room: RoomGeometry,
  columns: number,
  rows: number,
  fromX: number,
  fromY: number,
  radius: number,
  reached: Uint32Array,
  stamp: number,
): void {
  let head = 0;
  let tail = 0;
  const reach = radius + SEED_REACH;
  const minColumn = Math.max(0, Math.floor((fromX - reach - room.minX) / FLOOD_CELL));
  const maxColumn = Math.min(columns - 1, Math.floor((fromX + reach - room.minX) / FLOOD_CELL));
  const minRow = Math.max(0, Math.floor((fromY - reach - room.minY) / FLOOD_CELL));
  const maxRow = Math.min(rows - 1, Math.floor((fromY + reach - room.minY) / FLOOD_CELL));
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const cell = row * columns + column;
      const dx = room.minX + (column + 0.5) * FLOOD_CELL - fromX;
      const dy = room.minY + (row + 0.5) * FLOOD_CELL - fromY;
      if (dx * dx + dy * dy > reach * reach || !walkable(room, columns, cell, radius)) {
        continue;
      }
      // Only a cell the player can walk to in a straight line: a cell past a
      // diagonal pinch between two pits is near, but not theirs.
      if (!sweepClear(room, fromX, fromY, fromX + dx, fromY + dy, radius - SEED_SKIN)) {
        continue;
      }
      reached[cell] = stamp;
      queue[tail++] = cell;
    }
  }
  while (head < tail) {
    const cell = queue[head++] ?? 0;
    const column = cell % columns;
    const row = (cell - column) / columns;
    for (let direction = 0; direction < 4; direction++) {
      const nextColumn = column + (direction === 0 ? 1 : direction === 1 ? -1 : 0);
      const nextRow = row + (direction === 2 ? 1 : direction === 3 ? -1 : 0);
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= columns || nextRow >= rows) {
        continue;
      }
      const next = nextRow * columns + nextColumn;
      if (reached[next] === stamp || !walkable(room, columns, next, radius)) {
        continue;
      }
      reached[next] = stamp;
      queue[tail++] = next;
    }
  }
}

/** Whether a body of `radius` fits all along the segment, sampled every room unit. */
function sweepClear(
  room: RoomGeometry,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy)));
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    if (!room.isClear(x0 + dx * t, y0 + dy * t, radius, CLEAR_IGNORE_DESTRUCTIBLE)) {
      return false;
    }
  }
  return true;
}

function walkable(room: RoomGeometry, columns: number, cell: number, radius: number): boolean {
  const column = cell % columns;
  const row = (cell - column) / columns;
  return room.isClear(
    room.minX + (column + 0.5) * FLOOD_CELL,
    room.minY + (row + 0.5) * FLOOD_CELL,
    radius,
    CLEAR_IGNORE_DESTRUCTIBLE,
  );
}

/** True when any live body but `except` overlaps tile `(column, row)`. */
function bodyOnTile(sim: GameSim, column: number, row: number, except: number): boolean {
  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const required = sim.collidableMask;
  const body = sim.body.data;
  const room = sim.room;
  for (let index = 0; index < world.highWater; index++) {
    if (index === except || states[index] !== World.ALIVE) {
      continue;
    }
    if (((masks[index] ?? 0) & required) !== required) {
      continue;
    }
    if (
      tileWithin(
        room,
        column,
        row,
        sim.positionX(index),
        sim.positionY(index),
        body[index * 2] ?? 0,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** True when the point `(x, y)` lies within `distance` of tile `(column, row)`'s rectangle. */
function tileWithin(
  room: RoomGeometry,
  column: number,
  row: number,
  x: number,
  y: number,
  distance: number,
): boolean {
  const minX = room.minX + column * PIT_SIZE;
  const minY = room.minY + row * PIT_SIZE;
  const nearestX = x < minX ? minX : x > minX + PIT_SIZE ? minX + PIT_SIZE : x;
  const nearestY = y < minY ? minY : y > minY + PIT_SIZE ? minY + PIT_SIZE : y;
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < distance * distance;
}

interface DoorLike {
  readonly direction: 'north' | 'south' | 'east' | 'west';
  readonly cellCol: number;
  readonly cellRow: number;
  readonly centre?: { readonly x: number; readonly y: number };
}

/** `sim/room/template.ts`'s `doorCentre`, one axis at a time and without the object it returns. */
function doorCentreX(room: RoomGeometry, door: DoorLike): number {
  if (door.centre !== undefined) {
    return door.centre.x;
  }
  if (door.direction === 'west') {
    return room.minX;
  }
  if (door.direction === 'east') {
    return room.maxX;
  }
  return room.minX + door.cellCol * SCREEN_WIDTH + SCREEN_WIDTH / 2;
}

function doorCentreY(room: RoomGeometry, door: DoorLike): number {
  if (door.centre !== undefined) {
    return door.centre.y;
  }
  if (door.direction === 'north') {
    return room.minY;
  }
  if (door.direction === 'south') {
    return room.maxY;
  }
  return room.minY + door.cellRow * SCREEN_HEIGHT + SCREEN_HEIGHT / 2;
}
