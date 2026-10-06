import { ROOM_TILE_UNITS } from '../../content/rooms/definition.js';
import { DOOR_SPAN, type RoomGeometry, type RoomRect } from '../../sim/room/geometry.js';
import { type CompiledDoor, doorCentre } from '../../sim/room/template.js';

/**
 * Where the lanterns hang in one of Floor 3's lantern rooms (#424).
 *
 * #404 lit a dark room with a circle that followed the player. That read as a
 * game effect rather than as a place, so the light now belongs to the room:
 * two or three lanterns on its walls, each a warm pool the fight moves in and
 * out of. Placed from a seed, like the canopy's gaps (`world/canopy.ts`), so a
 * room's lanterns are where they were on a revisit and in a replay.
 */

export type LanternWall = 'north' | 'east' | 'south' | 'west';

export interface WallLantern {
  /** Where the lantern hangs, in room units — just inside the wall it is on. */
  readonly x: number;
  readonly z: number;
  readonly wall: LanternWall;
}

/** How many lanterns a room can have: the bulb pool they are lit from (`MAX_ROOM_BULBS`). */
export const MAX_WALL_LANTERNS = 3;
/** How far in from the wall's inner face a lantern hangs. */
export const LANTERN_INSET = 3;
/** How far a lantern's pool of light reaches across the floor — a pool about four tiles wide. */
export const LANTERN_REACH = ROOM_TILE_UNITS * 2;
/** Clear of a doorway by this much past the door's own half-span. */
const DOOR_CLEARANCE = ROOM_TILE_UNITS;
/** And of a corner, where two walls would share the pool. */
const CORNER_CLEARANCE = ROOM_TILE_UNITS * 1.5;

function stream(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function inside(rect: RoomRect, x: number, z: number): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minY && z <= rect.maxY;
}

/**
 * Two or three lanterns for a single-cell room, three for anything bigger,
 * spread around the walls of the room's bounding box. A spot is refused if it
 * is in a doorway, in a corner, too close to a lantern already hung, or on a
 * stretch of the bounding box that is not really a wall of this room (an `L`
 * or `T` room's missing cell). A room too cramped to take them all gets fewer.
 */
export function wallLanternLayout(
  seed: number,
  room: RoomGeometry,
  doors: readonly CompiledDoor[],
): readonly WallLantern[] {
  const next = stream(seed ^ 0x51ed270b);
  const width = room.maxX - room.minX;
  const depth = room.maxY - room.minY;
  const perimeter = (width + depth) * 2;
  const single = width <= 320 && depth <= 180;
  const count = single ? 2 + Math.floor(next() * 2) : MAX_WALL_LANTERNS;
  const separation = perimeter / (count * 2.2);
  const doorways = doors.map((door) => ({
    direction: door.direction,
    centre: doorCentre(room, door),
    half: (door.span ?? DOOR_SPAN) / 2 + DOOR_CLEARANCE,
  }));

  const lanterns: WallLantern[] = [];
  for (let attempt = 0; attempt < 200 && lanterns.length < count; attempt++) {
    // A point along the perimeter, clockwise from the north-west corner.
    const along = next() * perimeter;
    let wall: LanternWall;
    let x: number;
    let z: number;
    let fromCorner: number;
    if (along < width) {
      wall = 'north';
      fromCorner = along;
      x = room.minX + along;
      z = room.minY + LANTERN_INSET;
    } else if (along < width + depth) {
      wall = 'east';
      fromCorner = along - width;
      x = room.maxX - LANTERN_INSET;
      z = room.minY + fromCorner;
    } else if (along < width * 2 + depth) {
      wall = 'south';
      fromCorner = along - width - depth;
      x = room.maxX - fromCorner;
      z = room.maxY - LANTERN_INSET;
    } else {
      wall = 'west';
      fromCorner = along - width * 2 - depth;
      x = room.minX + LANTERN_INSET;
      z = room.maxY - fromCorner;
    }
    const wallLength = wall === 'north' || wall === 'south' ? width : depth;
    if (fromCorner < CORNER_CLEARANCE || fromCorner > wallLength - CORNER_CLEARANCE) {
      continue;
    }
    const alongX = wall === 'north' || wall === 'south';
    const inDoorway = doorways.some(
      (doorway) =>
        doorway.direction === wall &&
        Math.abs(alongX ? doorway.centre.x - x : doorway.centre.y - z) < doorway.half,
    );
    if (inDoorway) {
      continue;
    }
    if (room.voidRects.some((rect) => inside(rect, x, z))) {
      continue;
    }
    if (room.stepRects.length > 0 && !room.stepRects.some((rect) => inside(rect, x, z))) {
      continue;
    }
    if (lanterns.some((other) => Math.hypot(other.x - x, other.z - z) < separation)) {
      continue;
    }
    lanterns.push({ x, z, wall });
  }
  return lanterns;
}
