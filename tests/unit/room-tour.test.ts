import { describe, expect, it } from 'vitest';
import { tourCandidates, trailAfter } from '../../src/app/room-tour.js';
import type { RoomDoor } from '../../src/sim/room/floor-plan.js';

/** A small floor: a corridor A-B-C with a dead end D off B, and the boss E past C. */
const FLOOR: Record<string, string[]> = {
  A: ['B'],
  B: ['A', 'D', 'C'],
  C: ['B', 'E'],
  D: ['B'],
  E: ['C'],
};

function doorsOf(room: string): RoomDoor[] {
  return (FLOOR[room] ?? []).map((neighborRoomId, cellIndex) => ({
    cellIndex,
    direction: 'north',
    neighborRoomId,
  }));
}

describe('the N-key room tour', () => {
  it('reaches every room of a floor with a dead end in it', () => {
    let room = 'A';
    let trail: string[] = [];
    const visited = new Set([room]);
    const order = [room];
    for (let press = 0; press < 20 && visited.size < Object.keys(FLOOR).length; press++) {
      const step = tourCandidates(doorsOf(room), visited, trail)[0];
      if (step === undefined) {
        break;
      }
      trail = trailAfter(trail, room, step);
      room = step.door.neighborRoomId;
      visited.add(room);
      order.push(room);
    }
    // Into the dead end, back out of it, and on to the boss — not D, B, D, B, ...
    expect(order).toEqual(['A', 'B', 'D', 'B', 'C', 'E']);
  });

  it('prefers an unseen door, then the way back, then anything', () => {
    const visited = new Set(['A', 'B', 'D']);
    const kinds = tourCandidates(doorsOf('B'), visited, ['A']).map(
      (step) => `${step.kind}:${step.door.neighborRoomId}`,
    );
    expect(kinds).toEqual(['explore:C', 'backtrack:A', 'wander:D']);
  });

  it('still moves when the trail does not lead here', () => {
    // The player walked to D by hand; the trail knows nothing about it.
    const steps = tourCandidates(doorsOf('D'), new Set(['A', 'B', 'D']), []);
    expect(steps.map((step) => step.kind)).toEqual(['wander']);
    const [only] = steps;
    if (only === undefined) {
      throw new Error('expected one candidate');
    }
    expect(trailAfter(['A'], 'D', only)).toEqual([]);
  });
});
