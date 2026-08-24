import { Container, Graphics } from 'pixi.js';
import type { RoomDirection } from '../sim/game/sim.js';
import { BLOCK_STRIDE, DOOR_SPAN, type RoomGeometry } from '../sim/room/geometry.js';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../sim/room/playground.js';

/** Placeholder cellar palette. Real tilesets arrive with the art pipeline in #34. */
const FLOOR_COLOUR = 0x241d2b;
const WALL_COLOUR = 0x3a2f45;
const WALL_EDGE_COLOUR = 0x54445f;
const BLOCK_COLOUR = 0x4a3a2c;
const BLOCK_EDGE_COLOUR = 0x6d5540;

/** A locked door reads as cold and shut; an open one picks up the floor's amber light. */
const DOOR_LOCKED_COLOUR = 0x5a2a2a;
const DOOR_OPEN_COLOUR = 0xd9a441;

/** A crack in the wall, marking a bombable connection to a secret room. */
const CRACK_COLOUR = 0x8a6a4a;
/** Narrower than `DOOR_SPAN` — a hint, not a doorway. */
const CRACK_SPAN = 10;

/**
 * Draws a room once, into a static container.
 *
 * Room geometry does not change while the room is loaded, so this is built at
 * load and never touched again — nothing here runs per frame.
 */
export function createRoomView(room: RoomGeometry): Container {
  const container = new Container();

  const floor = new Graphics();
  floor.rect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT).fill(WALL_COLOUR);
  floor
    .rect(room.minX, room.minY, room.maxX - room.minX, room.maxY - room.minY)
    .fill(FLOOR_COLOUR)
    .stroke({ width: 1, color: WALL_EDGE_COLOUR, alignment: 0 });
  container.addChild(floor);

  const blocks = new Graphics();
  for (let block = 0; block < room.blockCount; block++) {
    const base = block * BLOCK_STRIDE;
    const minX = room.blocks[base] ?? 0;
    const minY = room.blocks[base + 1] ?? 0;
    const maxX = room.blocks[base + 2] ?? 0;
    const maxY = room.blocks[base + 3] ?? 0;
    blocks
      .rect(minX, minY, maxX - minX, maxY - minY)
      .fill(BLOCK_COLOUR)
      .stroke({ width: 1, color: BLOCK_EDGE_COLOUR, alignment: 0 });
  }
  container.addChild(blocks);

  return container;
}

/**
 * Draws a marker in the wall band for each door the room's metadata declares,
 * coloured by whether it is locked.
 *
 * Kept separate from `createRoomView` because door colour changes the instant
 * the last enemy dies — redrawing four small rects on that is cheap, redrawing
 * the whole room (floor, blocks) every time the lock state flips is not.
 */
export function createDoorView(
  room: RoomGeometry,
  doors: Readonly<Record<RoomDirection, boolean>>,
  locked: boolean,
): Graphics {
  const graphics = new Graphics();
  const colour = locked ? DOOR_LOCKED_COLOUR : DOOR_OPEN_COLOUR;
  const centreX = (room.minX + room.maxX) / 2;
  const centreY = (room.minY + room.maxY) / 2;
  const half = DOOR_SPAN / 2;

  if (doors.north) {
    graphics.rect(centreX - half, 0, DOOR_SPAN, room.minY).fill(colour);
  }
  if (doors.south) {
    graphics.rect(centreX - half, room.maxY, DOOR_SPAN, PLAYFIELD_HEIGHT - room.maxY).fill(colour);
  }
  if (doors.west) {
    graphics.rect(0, centreY - half, room.minX, DOOR_SPAN).fill(colour);
  }
  if (doors.east) {
    graphics.rect(room.maxX, centreY - half, PLAYFIELD_WIDTH - room.maxX, DOOR_SPAN).fill(colour);
  }

  return graphics;
}

/**
 * Draws a crack in each wall direction given — the hint that a secret room
 * sits behind it, `docs/GAME_DESIGN.md` §4's "hinted by cracks in adjacent
 * room tiles." Drawn on the solid wall band itself (a hidden door has no
 * gap — see `GameSim.loadRoom`'s `hiddenDoors`), so a crack never overlaps
 * an actual doorway: a direction is either open (`createDoorView`) or
 * cracked (here), never both.
 *
 * A supersecret room's wall is never passed here — no crack at all is the
 * whole of what "deliberately obnoxious to find" (#23) means for this view.
 */
export function createSecretHintView(
  room: RoomGeometry,
  directions: readonly RoomDirection[],
): Graphics {
  const graphics = new Graphics();
  const centreX = (room.minX + room.maxX) / 2;
  const centreY = (room.minY + room.maxY) / 2;
  const half = CRACK_SPAN / 2;

  for (const direction of directions) {
    if (direction === 'north') {
      drawCrack(graphics, centreX, room.minY, half, true);
    } else if (direction === 'south') {
      drawCrack(graphics, centreX, room.maxY, half, true);
    } else if (direction === 'west') {
      drawCrack(graphics, room.minX, centreY, half, false);
    } else {
      drawCrack(graphics, room.maxX, centreY, half, false);
    }
  }

  return graphics;
}

/** One jagged mark, centred on `(x, y)`, running along the wall it's drawn on. */
function drawCrack(
  graphics: Graphics,
  x: number,
  y: number,
  half: number,
  horizontal: boolean,
): void {
  const zigzag = horizontal
    ? [
        [x - half, y],
        [x - half / 2, y + 3],
        [x, y - 3],
        [x + half / 2, y + 3],
        [x + half, y],
      ]
    : [
        [x, y - half],
        [x + 3, y - half / 2],
        [x - 3, y],
        [x + 3, y + half / 2],
        [x, y + half],
      ];
  const [start, ...rest] = zigzag;
  if (start === undefined) {
    return;
  }
  graphics.moveTo(start[0] ?? 0, start[1] ?? 0);
  for (const point of rest) {
    graphics.lineTo(point[0] ?? 0, point[1] ?? 0);
  }
  graphics.stroke({ width: 1.5, color: CRACK_COLOUR });
}
