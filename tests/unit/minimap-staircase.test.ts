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
 * `validateStaircaseTemplate`'s odd-`stepCount` requirement, tested
 * separately in `staircase.test.ts`.
 */
describe('staircaseMinimapRects (#112)', () => {
  const template: StaircaseContentTemplate = {
    id: 'synthetic-staircase',
    stepCount: 5,
    direction: 'up-right',
    startDoor: 'south',
    endDoor: 'north',
    floorTags: ['test'],
    weight: 1,
  };

  /** The same `endCell` `sim/room/floor-plan.ts`'s `placeStaircase` derives for `template`, given `originCell`. */
  function endCellFor(originCell: { x: number; y: number }): { x: number; y: number } {
    const span = Math.ceil(1 + (template.stepCount - 1) * STAIR_STEP_OVERLAP);
    const sign = STEP_SIGN[template.direction];
    return { x: originCell.x + (span - 1) * sign.x, y: originCell.y + (span - 1) * sign.y };
  }

  it('maps the first and last step onto exactly one grid cell each, with no gap to the reserved end cell', () => {
    // An odd `stepCount` (#112, `validateStaircaseTemplate`) makes the real
    // screen-space span exactly a whole number of grid cells, so
    // `placeStaircase`'s reservation and this mapping agree exactly — no
    // snapping or stretching needed to reach the reserved block's own edge.
    const originCell = { x: 5, y: 5 };
    const endCell = endCellFor(originCell);
    const gridSteps = staircaseMinimapRects(originCell, template);

    expect(gridSteps[0]).toEqual({
      minX: originCell.x,
      minY: originCell.y,
      maxX: originCell.x + 1,
      maxY: originCell.y + 1,
    });
    expect(gridSteps[gridSteps.length - 1]).toEqual({
      minX: endCell.x,
      minY: endCell.y,
      maxX: endCell.x + 1,
      maxY: endCell.y + 1,
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
