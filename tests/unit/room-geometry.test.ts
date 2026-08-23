import { describe, expect, it } from 'vitest';
import { MAX_ROOM_BLOCKS, RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  createPlaygroundRoom,
} from '../../src/sim/room/playground.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, WORLD_ZOOM } from '../../src/render/resolution.js';

describe('RoomGeometry', () => {
  it('reports a circle clear only when it is inside the bounds and off every block', () => {
    const room = new RoomGeometry(0, 0, 100, 100);
    room.addBlock(40, 40, 60, 60);

    expect(room.isClear(20, 20, 5)).toBe(true);
    expect(room.isClear(50, 50, 5)).toBe(false);
    expect(room.isClear(36, 50, 5)).toBe(false);
    expect(room.isClear(35, 50, 5)).toBe(true);
    expect(room.isClear(4, 50, 5)).toBe(false);
    expect(room.isClear(5, 50, 5)).toBe(true);
  });

  it('refuses to grow past its fixed block storage', () => {
    const room = new RoomGeometry(0, 0, 100, 100);
    for (let block = 0; block < MAX_ROOM_BLOCKS; block++) {
      room.addBlock(0, 0, 1, 1);
    }
    expect(room.blockCount).toBe(MAX_ROOM_BLOCKS);
    expect(() => {
      room.addBlock(0, 0, 1, 1);
    }).toThrow(/at most/);
  });
});

describe('the playground room', () => {
  it('fills the internal resolution exactly at the zoom it is drawn at', () => {
    // `sim/` cannot import `render/`, so the two constants are declared
    // independently. This is the seam where a drift between them would show up:
    // a room that does not divide the screen by a whole number either leaves a
    // strip of it empty or spills off the edge.
    expect(PLAYFIELD_WIDTH * WORLD_ZOOM).toBe(INTERNAL_WIDTH);
    expect(PLAYFIELD_HEIGHT * WORLD_ZOOM).toBe(INTERNAL_HEIGHT);
    expect(Number.isInteger(WORLD_ZOOM)).toBe(true);
  });

  it('leaves the centre of the room open for the player to spawn into', () => {
    const room = createPlaygroundRoom();
    expect(room.isClear((room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2, 8)).toBe(true);
  });
});
