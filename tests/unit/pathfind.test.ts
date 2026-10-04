import { describe, expect, it } from 'vitest';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { nextWaypoint } from '../../src/sim/room/pathfind.js';

describe('nextWaypoint', () => {
  it('heads straight for a target in clear view', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    const out = { x: 0, y: 0 };
    expect(nextWaypoint(room, 40, 60, 280, 60, 6, out)).toBe(true);
    expect(out).toEqual({ x: 280, y: 60 });
  });

  it('routes through the gap below a wall instead of into it', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(150, 0, 170, 140);
    const out = { x: 0, y: 0 };
    expect(nextWaypoint(room, 40, 60, 280, 60, 6, out)).toBe(true);
    // Not the target behind the wall: a point this side of it, reachable in a
    // straight line, on the way to the gap.
    expect(out.x).toBeLessThan(150);
    expect(out.y).toBeGreaterThan(60);
    expect(room.isClear(out.x, out.y, 6)).toBe(true);
  });

  it('reports no way through a wall that seals the room', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(150, 0, 170, 180);
    expect(nextWaypoint(room, 40, 60, 280, 60, 6, { x: 0, y: 0 })).toBe(false);
  });
});
