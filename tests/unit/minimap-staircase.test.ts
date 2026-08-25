import { describe, expect, it } from 'vitest';
import { staircaseMinimapRects } from '../../src/sim/room/floor-plan.js';
import {
  STAIR_STEP_OVERLAP,
  STEP_SIGN,
  type StaircaseContentTemplate,
} from '../../src/sim/room/staircase.js';

/**
 * The minimap has to show a staircase's real steps and corners (#112) — a
 * player can run into them — not a straight connecting line or a solid
 * filled block. `staircaseMinimapRects` is what maps the real, compiled
 * geometry (room units) into the same fractional floor-grid space every
 * other room's integer cell coordinates already live in; these prove that
 * mapping is faithful to the real geometry, touches the reserved block's
 * own edges exactly (no gap, no stretched step), and never needs any
 * special-casing of the first/last step to do it — that's the payoff of
 * `placeStaircase`'s exact, sub-cell-granularity reservation, anchoring its
 * two real rooms at their true screen-space positions rather than a rounded
 * or padded-out approximation (#118), tested separately in
 * `staircase.test.ts`/`floor-plan.test.ts`.
 */
describe('staircaseMinimapRects (#112)', () => {
  const template: StaircaseContentTemplate = {
    id: 'synthetic-staircase',
    stepCount: 4,
    direction: 'up-right',
    startDoor: 'south',
    endDoor: 'north',
    floorTags: ['test'],
    weight: 1,
  };

  /**
   * The same `farStepCell` `sim/room/floor-plan.ts`'s `placeStaircase`
   * derives for `template`, given `originCell` — the *real* last step's own
   * position, `(stepCount - 1) * STAIR_STEP_OVERLAP` cells from `originCell`
   * (#118: exact, no rounding, no padding beyond the real step itself).
   */
  function farStepCellFor(originCell: { x: number; y: number }): { x: number; y: number } {
    const sign = STEP_SIGN[template.direction];
    const realFarOffset = template.stepCount - 1;
    return {
      x: originCell.x + realFarOffset * STAIR_STEP_OVERLAP * sign.x,
      y: originCell.y + realFarOffset * STAIR_STEP_OVERLAP * sign.y,
    };
  }

  it('maps the first and last step onto exactly one grid cell each, with no gap to the reserved end cell', () => {
    // Both real rooms — the start step (always `originCell`, the
    // pre-existing anchor) and the end step (`farStepCellFor`) — sit at
    // their true screen-space position, so this mapping and
    // `placeStaircase`'s own reservation agree exactly at both ends, no
    // snapping or stretching needed (#118).
    const originCell = { x: 5, y: 5 };
    const farStepCell = farStepCellFor(originCell);
    const gridSteps = staircaseMinimapRects(originCell, template);

    expect(gridSteps[0]).toEqual({
      minX: originCell.x,
      minY: originCell.y,
      maxX: originCell.x + 1,
      maxY: originCell.y + 1,
    });
    expect(gridSteps[gridSteps.length - 1]).toEqual({
      minX: farStepCell.x,
      minY: farStepCell.y,
      maxX: farStepCell.x + 1,
      maxY: farStepCell.y + 1,
    });
  });

  it('keeps every consecutive pair of steps overlapping by exactly the true fraction, ends included', () => {
    const gridSteps = staircaseMinimapRects({ x: 5, y: 5 }, template);

    for (let index = 0; index + 1 < gridSteps.length; index++) {
      const a = gridSteps[index];
      const b = gridSteps[index + 1];
      if (a === undefined || b === undefined) {
        throw new Error('expected a step at every index');
      }
      const overlapWidth = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const overlapHeight = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      expect(overlapWidth).toBeCloseTo(STAIR_STEP_OVERLAP);
      expect(overlapHeight).toBeCloseTo(STAIR_STEP_OVERLAP);
    }
  });

  it('is anchored independently of where the room happens to sit on the floor grid', () => {
    const originA = { x: 5, y: 5 };
    const originB = { x: -3, y: 12 };
    const stepsA = staircaseMinimapRects(originA, template);
    const stepsB = staircaseMinimapRects(originB, template);

    for (let index = 0; index < stepsA.length; index++) {
      const a = stepsA[index];
      const b = stepsB[index];
      if (a === undefined || b === undefined) {
        throw new Error('expected a step at every index');
      }
      expect(b.minX - a.minX).toBeCloseTo(originB.x - originA.x);
      expect(b.minY - a.minY).toBeCloseTo(originB.y - originA.y);
    }
  });
});
