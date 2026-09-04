import { describe, expect, it } from 'vitest';
import {
  cloudPlacement,
  cloudShadowState,
  lampPlacement,
  roomCellCentres,
} from '../../src/render/ambient-light.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, WORLD_ZOOM } from '../../src/render/resolution.js';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../src/sim/room/template.js';
import { TICKS_PER_SECOND } from '../../src/sim/time.js';

const CELL = { x: 160, y: 90 };
/** A `1x1` Floor 1/2 room — its own interior is exactly one screen-cell. */
const ROOM = { minX: 0, minY: 0, maxX: SCREEN_WIDTH, maxY: SCREEN_HEIGHT };
/** A `2x2` room (`sim/room/geometry.ts`'s `voidRects` shapes) — four glued screen-cells. */
const MULTI_CELL_ROOM = { minX: 0, minY: 0, maxX: SCREEN_WIDTH * 2, maxY: SCREEN_HEIGHT * 2 };

describe('roomCellCentres', () => {
  it('returns exactly the room centre for a 1x1 room', () => {
    const cells = roomCellCentres(ROOM);
    expect(cells).toEqual([{ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 }]);
  });

  it('tiles a 2x2 room into four cell centres, row-major, one per screen', () => {
    const cells = roomCellCentres(MULTI_CELL_ROOM);
    expect(cells).toEqual([
      { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 },
      { x: SCREEN_WIDTH * 1.5, y: SCREEN_HEIGHT / 2 },
      { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT * 1.5 },
      { x: SCREEN_WIDTH * 1.5, y: SCREEN_HEIGHT * 1.5 },
    ]);
  });
});

describe('lampPlacement', () => {
  it('centres on the cell and grows past a screen-cell span (#243)', () => {
    const placement = lampPlacement(CELL);
    expect(placement.x).toBe(CELL.x);
    expect(placement.y).toBe(CELL.y);
    expect(placement.width).toBeGreaterThan(SCREEN_WIDTH);
    expect(placement.height).toBeGreaterThan(SCREEN_HEIGHT);
  });

  it('never grows past one screen of coverage, regardless of which cell it sits on (#243)', () => {
    const placement = lampPlacement(roomCellCentres(MULTI_CELL_ROOM)[3] ?? CELL);
    expect(placement.width).toBeLessThanOrEqual((INTERNAL_WIDTH / WORLD_ZOOM) * 1.3);
    expect(placement.height).toBeLessThanOrEqual((INTERNAL_HEIGHT / WORLD_ZOOM) * 1.3);
  });

  it('tiles one pool per cell across a multi-cell room, with no gap between neighbours (#260)', () => {
    // Adjacent cell centres sit SCREEN_WIDTH/_HEIGHT apart; each pool reaches
    // half its own width/height from that centre, so two neighbours' pools
    // together cover the gap between them (and, since they overlap, blend at
    // the seam) as long as each half-reach is at least half that spacing —
    // exactly what used to leave a room's far cells unlit under one
    // room-centred sprite (#260).
    const cells = roomCellCentres(MULTI_CELL_ROOM);
    expect(cells).toHaveLength(4);
    const placement = lampPlacement(cells[0] ?? CELL);
    expect(placement.width / 2).toBeGreaterThanOrEqual(SCREEN_WIDTH / 2);
    expect(placement.height / 2).toBeGreaterThanOrEqual(SCREEN_HEIGHT / 2);
  });
});

describe('cloudShadowState', () => {
  it('is invisible most of the cycle', () => {
    // A crossing is a small fraction of the full cycle by design ("occasional").
    const state = cloudShadowState(TICKS_PER_SECOND * 45);
    expect(state.visible).toBe(false);
    expect(state.alpha).toBe(0);
  });

  it('fades in from zero at the start of a crossing', () => {
    const state = cloudShadowState(0);
    expect(state.progress).toBe(0);
    expect(state.alpha).toBe(0);
  });

  it('reaches full alpha in the middle of a crossing and fades out symmetrically', () => {
    const start = cloudShadowState(TICKS_PER_SECOND * 0.5);
    const middle = cloudShadowState(TICKS_PER_SECOND * 8);
    const end = cloudShadowState(TICKS_PER_SECOND * 15.5);
    expect(middle.alpha).toBeGreaterThan(start.alpha);
    expect(middle.alpha).toBeGreaterThan(end.alpha);
    expect(middle.visible).toBe(true);
  });

  it('is a pure function of tick — same tick always gives the same state (replay determinism)', () => {
    const tick = TICKS_PER_SECOND * 3;
    expect(cloudShadowState(tick)).toEqual(cloudShadowState(tick));
  });

  it('repeats identically every cycle', () => {
    const cycleTicks = 50 * TICKS_PER_SECOND; // matches CLOUD_CYCLE_TICKS
    const tick = TICKS_PER_SECOND * 5;
    expect(cloudShadowState(tick)).toEqual(cloudShadowState(tick + cycleTicks));
  });
});

describe('cloudPlacement', () => {
  it('starts fully off the west edge and ends fully off the east edge of its cell', () => {
    const start = cloudPlacement(CELL, 0);
    const end = cloudPlacement(CELL, 1);
    expect(start.x + start.width / 2).toBeLessThanOrEqual(CELL.x - SCREEN_WIDTH / 2);
    expect(end.x - end.width / 2).toBeGreaterThanOrEqual(CELL.x + SCREEN_WIDTH / 2);
  });

  it('sits vertically centred on the cell throughout the crossing', () => {
    const placement = cloudPlacement(CELL, 0.5);
    expect(placement.y).toBe(CELL.y);
  });

  it('never grows past one screen, regardless of which cell it sits on (#243)', () => {
    const placement = cloudPlacement(roomCellCentres(MULTI_CELL_ROOM)[2] ?? CELL, 0.5);
    expect(placement.width).toBeLessThanOrEqual(INTERNAL_WIDTH / WORLD_ZOOM);
    expect(placement.height).toBeLessThanOrEqual(INTERNAL_HEIGHT / WORLD_ZOOM);
  });

  it('crosses every cell of a multi-cell room, one drift per cell, in lockstep (#260)', () => {
    const cells = roomCellCentres(MULTI_CELL_ROOM);
    for (const cell of cells) {
      const start = cloudPlacement(cell, 0);
      const end = cloudPlacement(cell, 1);
      expect(start.x + start.width / 2).toBeLessThanOrEqual(cell.x - SCREEN_WIDTH / 2);
      expect(end.x - end.width / 2).toBeGreaterThanOrEqual(cell.x + SCREEN_WIDTH / 2);
    }
  });
});
