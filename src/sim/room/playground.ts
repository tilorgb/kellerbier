import { RoomGeometry } from './geometry.js';

/**
 * The M1 playground room.
 *
 * One room, hand-placed, existing purely so movement, shooting and impact can be
 * tuned against something. It is replaced by the room template format in #18.
 *
 * Its coordinate space is the same 640x360 space the renderer draws at (see
 * `render/resolution.ts`) — the simulation cannot import that constant, since
 * `sim/` never imports from `render/`, so the two are stated independently and
 * a test pins them together.
 */
export const PLAYFIELD_WIDTH = 640;
export const PLAYFIELD_HEIGHT = 360;

/** Thickness of the wall band drawn around the room. */
export const WALL_THICKNESS = 20;

export function createPlaygroundRoom(): RoomGeometry {
  const room = new RoomGeometry(
    WALL_THICKNESS,
    WALL_THICKNESS,
    PLAYFIELD_WIDTH - WALL_THICKNESS,
    PLAYFIELD_HEIGHT - WALL_THICKNESS,
  );

  // Two pillars, placed to give both a flat wall to slide along and an exposed
  // corner to clip — the two cases wall handling has to get right.
  room.addBlock(148, 108, 188, 148);
  room.addBlock(452, 212, 492, 252);

  return room;
}
