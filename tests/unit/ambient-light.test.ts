import { describe, expect, it } from 'vitest';
import { cloudPlacement, cloudShadowState, lampPlacement } from '../../src/render/ambient-light.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, WORLD_ZOOM } from '../../src/render/resolution.js';
import { TICKS_PER_SECOND } from '../../src/sim/time.js';

const ROOM = { minX: 0, minY: 0, maxX: 320, maxY: 180 };
/** A `2x2` Floor 2 room (`sim/room/geometry.ts`'s `voidRects`) — several screens wider/taller than `ROOM`. */
const MULTI_CELL_ROOM = { minX: 0, minY: 0, maxX: 960, maxY: 540 };

describe('lampPlacement', () => {
  it('centres on the room and grows past its span', () => {
    const placement = lampPlacement(ROOM);
    expect(placement.x).toBe(160);
    expect(placement.y).toBe(90);
    expect(placement.width).toBeGreaterThan(ROOM.maxX - ROOM.minX);
    expect(placement.height).toBeGreaterThan(ROOM.maxY - ROOM.minY);
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
  it('starts fully off the west edge and ends fully off the east edge', () => {
    const start = cloudPlacement(ROOM, 0);
    const end = cloudPlacement(ROOM, 1);
    expect(start.x + start.width / 2).toBeLessThanOrEqual(ROOM.minX);
    expect(end.x - end.width / 2).toBeGreaterThanOrEqual(ROOM.maxX);
  });

  it('sits vertically centred on the room throughout the crossing', () => {
    const placement = cloudPlacement(ROOM, 0.5);
    expect(placement.y).toBe((ROOM.minY + ROOM.maxY) / 2);
  });

  it('never grows past one screen, even in a multi-cell room (#243)', () => {
    const placement = cloudPlacement(MULTI_CELL_ROOM, 0.5);
    expect(placement.width).toBeLessThanOrEqual(INTERNAL_WIDTH / WORLD_ZOOM);
    expect(placement.height).toBeLessThanOrEqual(INTERNAL_HEIGHT / WORLD_ZOOM);
  });

  it('still crosses the full span of a multi-cell room despite the capped size', () => {
    const start = cloudPlacement(MULTI_CELL_ROOM, 0);
    const end = cloudPlacement(MULTI_CELL_ROOM, 1);
    expect(start.x + start.width / 2).toBeLessThanOrEqual(MULTI_CELL_ROOM.minX);
    expect(end.x - end.width / 2).toBeGreaterThanOrEqual(MULTI_CELL_ROOM.maxX);
  });

  it('leaves a single-screen room unaffected by the cap', () => {
    // ROOM's own span is already under one screen, so sizing off the room
    // itself (the pre-#243 formula) and sizing off the cap agree exactly.
    const placement = cloudPlacement(ROOM, 0.5);
    expect(placement.width).toBeCloseTo((ROOM.maxX - ROOM.minX) * 0.85);
    expect(placement.height).toBeCloseTo((ROOM.maxY - ROOM.minY) * 0.6);
  });
});
