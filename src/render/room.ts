import { Container, Graphics } from 'pixi.js';
import { BLOCK_STRIDE, type RoomGeometry } from '../sim/room/geometry.js';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../sim/room/playground.js';

/** Placeholder cellar palette. Real tilesets arrive with the art pipeline in #34. */
const FLOOR_COLOUR = 0x241d2b;
const WALL_COLOUR = 0x3a2f45;
const WALL_EDGE_COLOUR = 0x54445f;
const BLOCK_COLOUR = 0x4a3a2c;
const BLOCK_EDGE_COLOUR = 0x6d5540;

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
