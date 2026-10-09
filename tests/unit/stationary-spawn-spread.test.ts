import { describe, expect, it } from 'vitest';
import {
  STATIONARY_SPAWN_SPACING,
  spreadStationarySpawns,
} from '../../src/sim/room/spread-stationary.js';

const still = (id: string): boolean => id === 'pilz';
/** An open 240×144 room. */
const open = (x: number, y: number, r: number): boolean =>
  x - r >= 0 && x + r <= 240 && y - r >= 0 && y + r <= 144;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
function at<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) {
    throw new Error(`no spawn ${String(index)}`);
  }
  return item;
}

describe('spreadStationarySpawns', () => {
  it('pulls a group of three stationary bodies apart to the spacing', () => {
    const spawns = [
      { x: 112, y: 72, enemyId: 'pilz' },
      { x: 120, y: 72, enemyId: 'pilz' },
      { x: 128, y: 72, enemyId: 'pilz' },
    ];
    const out = spreadStationarySpawns(spawns, still, open);
    for (let a = 0; a < out.length; a++) {
      for (let b = a + 1; b < out.length; b++) {
        expect(distance(at(out, a), at(out, b))).toBeGreaterThanOrEqual(STATIONARY_SPAWN_SPACING);
      }
    }
    // The first keeps its authored spot.
    expect(out[0]).toEqual(spawns[0]);
  });

  it('leaves walkers alone, even right next to a stationary body', () => {
    const spawns = [
      { x: 120, y: 72, enemyId: 'pilz' },
      { x: 124, y: 72, enemyId: 'rat' },
      { x: 128, y: 72, enemyId: 'rat' },
    ];
    expect(spreadStationarySpawns(spawns, still, open)).toEqual(spawns);
  });

  it('only moves onto ground the body can stand on', () => {
    const spawns = [
      { x: 120, y: 72, enemyId: 'pilz' },
      { x: 128, y: 72, enemyId: 'pilz' },
    ];
    // Only the left half of the room is standable.
    const leftHalf = (x: number, y: number, r: number): boolean => open(x, y, r) && x + r <= 120;
    const out = spreadStationarySpawns(spawns, still, leftHalf);
    expect(at(out, 1).x + 8).toBeLessThanOrEqual(120);
    expect(distance(at(out, 0), at(out, 1))).toBeGreaterThanOrEqual(STATIONARY_SPAWN_SPACING);
  });

  it('keeps the authored point when nothing in reach fits', () => {
    const spawns = [
      { x: 20, y: 20, enemyId: 'pilz' },
      { x: 24, y: 20, enemyId: 'pilz' },
    ];
    const nowhere = (): boolean => false;
    expect(spreadStationarySpawns(spawns, still, nowhere)).toEqual(spawns);
  });

  it('is deterministic', () => {
    const spawns = [
      { x: 100, y: 60, enemyId: 'pilz' },
      { x: 104, y: 64, enemyId: 'pilz' },
      { x: 96, y: 58, enemyId: 'pilz' },
    ];
    expect(spreadStationarySpawns(spawns, still, open)).toEqual(
      spreadStationarySpawns(spawns, still, open),
    );
  });
});
