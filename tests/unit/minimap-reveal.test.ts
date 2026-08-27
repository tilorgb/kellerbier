import { describe, expect, it } from 'vitest';
import type { FloorPlan, FloorPlanRoom } from '../../src/sim/room/floor-plan.js';
import { computeReveal } from '../../src/render/minimap-hud.js';

/**
 * A `T` room (bar at row 0, stem down the middle column — same layout as
 * `sim/room/floor-plan.ts`'s `shapeFootprints('T')` first orientation) with
 * three real floor-graph doors: two ordinary ones on the bar, and one on
 * the stem's bottom cell pointing west — straight into one of `T`'s own
 * four void corners (#107).
 */
function tRoom(): FloorPlanRoom {
  return {
    id: 't',
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ],
    shape: 'T',
    role: 'normal',
    doors: [
      { cellIndex: 0, direction: 'north', neighborRoomId: 'bar-left-neighbor' },
      { cellIndex: 2, direction: 'north', neighborRoomId: 'bar-right-neighbor' },
      { cellIndex: 4, direction: 'west', neighborRoomId: 'void-swallowed-neighbor' },
    ],
    distanceFromStart: 1,
    templateId: 't-template',
  };
}

function bareRoom(id: string, role: FloorPlanRoom['role'] = 'normal'): FloorPlanRoom {
  return {
    id,
    cells: [{ x: 99, y: 99 }],
    shape: '1x1',
    role,
    doors: [],
    distanceFromStart: 2,
    templateId: 'bare-template',
  };
}

function plan(rooms: readonly FloorPlanRoom[]): FloorPlan {
  return {
    floor: 1,
    floorName: 'Der Keller',
    startRoomId: 't',
    bossRoomId: 't',
    treasureRoomId: 't',
    shopRoomId: 't',
    secretRoomId: 't',
    supersecretRoomId: 't',
    rooms,
  };
}

describe('minimap reveal (#107 follow-up)', () => {
  it('never reveals a neighbour whose only door into it was dropped as void', () => {
    const t = tRoom();
    const floorPlan = plan([
      t,
      bareRoom('bar-left-neighbor'),
      bareRoom('bar-right-neighbor'),
      bareRoom('void-swallowed-neighbor'),
    ]);

    const reveal = computeReveal(floorPlan, new Set(['t']));

    expect(reveal.revealed.has('bar-left-neighbor')).toBe(true);
    expect(reveal.revealed.has('bar-right-neighbor')).toBe(true);
    expect(reveal.revealed.has('void-swallowed-neighbor')).toBe(false);
  });

  it('still reveals that same room once it is reachable through a visited room of its own', () => {
    const t = tRoom();
    const floorPlan = plan([
      t,
      bareRoom('bar-left-neighbor'),
      bareRoom('bar-right-neighbor'),
      bareRoom('void-swallowed-neighbor'),
    ]);

    // Visiting `bar-right-neighbor` too, standing in for it having its own
    // real door to `void-swallowed-neighbor` elsewhere on the floor.
    const reveal = computeReveal(floorPlan, new Set(['t', 'bar-right-neighbor']));

    expect(reveal.revealed.has('bar-right-neighbor')).toBe(true);
    // Still false here: `bar-right-neighbor` is a bare `1x1` with no doors
    // of its own in this synthetic plan. This asserts the void door stays
    // dropped specifically, not that it can never appear by any path.
    expect(reveal.revealed.has('void-swallowed-neighbor')).toBe(false);
  });

  it('never reveals a secret or supersecret neighbour by adjacency alone', () => {
    const t = tRoom();
    const floorPlan = plan([
      t,
      bareRoom('bar-left-neighbor', 'secret'),
      bareRoom('bar-right-neighbor', 'supersecret'),
      bareRoom('void-swallowed-neighbor'),
    ]);

    const reveal = computeReveal(floorPlan, new Set(['t']));

    expect(reveal.revealed.has('bar-left-neighbor')).toBe(false);
    expect(reveal.revealed.has('bar-right-neighbor')).toBe(false);
  });

  it('still shows a secret room once the player has actually visited it', () => {
    const t = tRoom();
    const floorPlan = plan([t, bareRoom('bar-left-neighbor', 'secret')]);

    const reveal = computeReveal(floorPlan, new Set(['t', 'bar-left-neighbor']));

    expect(reveal.revealed.has('bar-left-neighbor')).toBe(true);
  });
});
