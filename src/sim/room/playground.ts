import { RoomGeometry } from './geometry.js';

/**
 * The M1 playground room.
 *
 * One room, hand-placed, existing purely so movement, shooting and impact can be
 * tuned against something. It is replaced by the room template format in #18.
 *
 * Its coordinate space is the 320x180 the renderer blows up to its 640x360
 * internal resolution (see `WORLD_ZOOM` in `render/resolution.ts`) — the
 * simulation cannot import that constant, since `sim/` never imports from
 * `render/`, so the two are stated independently and a test pins them together.
 *
 * The room is authored at half the internal resolution rather than at it
 * because that is what sets the player's size against the room. Every distance
 * in here is half what it was when the room was 640x360, so the walls and
 * pillars land on exactly the same screen pixels as before; what changed is
 * that a body of a fixed size now covers twice as much of the room, and crosses
 * it in half the time at the same speed.
 */
export const PLAYFIELD_WIDTH = 320;
export const PLAYFIELD_HEIGHT = 180;

/** Thickness of the wall band drawn around the room. */
export const WALL_THICKNESS = 10;

export function createPlaygroundRoom(): RoomGeometry {
  const room = new RoomGeometry(
    WALL_THICKNESS,
    WALL_THICKNESS,
    PLAYFIELD_WIDTH - WALL_THICKNESS,
    PLAYFIELD_HEIGHT - WALL_THICKNESS,
  );

  // Two pillars, placed to give both a flat wall to slide along and an exposed
  // corner to clip — the two cases wall handling has to get right.
  // Overflyable (#47): the two pillars are furniture, the same as an
  // authored room's obstacles — so the playground answers a flying
  // character the way a real room does.
  room.addBlock(74, 54, 94, 74, true);
  room.addBlock(226, 106, 246, 126, true);

  return room;
}
