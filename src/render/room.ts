import { Container, Graphics } from 'pixi.js';
import { BLOCK_STRIDE, DOOR_SPAN, roomFrameSize, type RoomGeometry } from '../sim/room/geometry.js';
import { doorCentre, type CompiledDoor } from '../sim/room/template.js';

/** Placeholder cellar palette. Real tilesets arrive with the art pipeline in #34. */
const FLOOR_COLOUR = 0x241d2b;
const WALL_COLOUR = 0x3a2f45;
const WALL_EDGE_COLOUR = 0x54445f;
const BLOCK_COLOUR = 0x4a3a2c;
const BLOCK_EDGE_COLOUR = 0x6d5540;

/** A locked door reads as cold and shut; an open one picks up the floor's amber light. */
const DOOR_LOCKED_COLOUR = 0x5a2a2a;
const DOOR_OPEN_COLOUR = 0xd9a441;

/**
 * Draws a room once, into a static container.
 *
 * Room geometry does not change while the room is loaded, so this is built at
 * load and never touched again — nothing here runs per frame.
 */
export function createRoomView(room: RoomGeometry): Container {
  const container = new Container();

  const frame = roomFrameSize(room);
  const floor = new Graphics();
  floor.rect(0, 0, frame.width, frame.height).fill(WALL_COLOUR);
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

  // An `L` room's dropped corner (#100/#20) is a real `blocks` entry too (for
  // collision), but drawn over in the wall's own colour rather than left as
  // an obstacle — it reads as the rest of the room's boundary, not as some
  // pillar the size of an entire sub-room sitting in the middle of it.
  if (room.voidRect !== null) {
    const voidRect = room.voidRect;
    container
      .addChild(new Graphics())
      .rect(
        voidRect.minX,
        voidRect.minY,
        voidRect.maxX - voidRect.minX,
        voidRect.maxY - voidRect.minY,
      )
      .fill(WALL_COLOUR)
      .stroke({ width: 1, color: WALL_EDGE_COLOUR, alignment: 0 });
  }

  return container;
}

/**
 * Draws a marker in the wall band for each of the room's real doors (#100:
 * up to eight for a `2x2` room, one per `(cell, wall)` pair with a real
 * neighbour), coloured by whether it is locked.
 *
 * Kept separate from `createRoomView` because door colour changes the instant
 * the last enemy dies — redrawing a handful of small rects on that is cheap,
 * redrawing the whole room (floor, blocks) every time the lock state flips is
 * not.
 */
export function createDoorView(
  room: RoomGeometry,
  doors: readonly CompiledDoor[],
  locked: boolean,
): Graphics {
  const graphics = new Graphics();
  const colour = locked ? DOOR_LOCKED_COLOUR : DOOR_OPEN_COLOUR;
  const frame = roomFrameSize(room);
  const half = DOOR_SPAN / 2;

  for (const door of doors) {
    const centre = doorCentre(room, door);
    switch (door.direction) {
      case 'north':
        graphics.rect(centre.x - half, 0, DOOR_SPAN, room.minY).fill(colour);
        break;
      case 'south':
        graphics.rect(centre.x - half, room.maxY, DOOR_SPAN, frame.height - room.maxY).fill(colour);
        break;
      case 'west':
        graphics.rect(0, centre.y - half, room.minX, DOOR_SPAN).fill(colour);
        break;
      case 'east':
        graphics.rect(room.maxX, centre.y - half, frame.width - room.maxX, DOOR_SPAN).fill(colour);
        break;
    }
  }

  return graphics;
}
