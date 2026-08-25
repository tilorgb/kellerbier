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
 * `placeStaircase`'s exact, sub-cell-granularity reservation (#118), tested
 * separately in `staircase.test.ts`/`floor-plan.test.ts`.
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

  /** The same `endCell` `sim/room/floor-plan.ts`'s `placeStaircase` derives for `template`, given `originCell` (#118: exact, no rounding). */
  function endCellFor(originCell: { x: number; y: number }): { x: number; y: number } {
    const sign = STEP_SIGN[template.direction];
    return {
      x: originCell.x + template.stepCount * STAIR_STEP_OVERLAP * sign.x,
      y: originCell.y + template.stepCount * STAIR_STEP_OVERLAP * sign.y,
    };
  }

  it('maps the first step onto exactly the origin cell, with no gap to the anchor', () => {
    // The near end is always exactly flush: `originCell` *is* the
    // pre-existing room `placeStaircase` grew from, no approximation
    // involved, whichever corner of the reservation block it turned out to
    // be (#118).
    const originCell = { x: 5, y: 5 };
    const gridSteps = staircaseMinimapRects(originCell, template);

    expect(gridSteps[0]).toEqual({
      minX: originCell.x,
      minY: originCell.y,
      maxX: originCell.x + 1,
      maxY: originCell.y + 1,
    });
  });

  it('leaves exactly STAIR_STEP_OVERLAP between the real last step and the reservation block it grew (#118)', () => {
    // `placeStaircase`'s reservation block's far corner (`endCellFor`, the
    // same math `floor-plan.ts` uses to place `farNeighborCell`) sits
    // `STAIR_STEP_OVERLAP` further out than the real last step's own
    // position mapped here — an even `stepCount` (the only kind
    // `placeStaircase` accepts, #118) can never make those two agree
    // exactly, because `computeAdjacency` finds a staircase's doors with
    // the same whole-cell step every ordinary room's adjacency uses. This
    // is the accepted, cosmetic trade documented on `placeStaircase`'s own
    // doc comment and in `docs/DECISIONS.md` #13 — the real door position
    // (`doorCentres`) is unaffected.
    const originCell = { x: 5, y: 5 };
    const endCell = endCellFor(originCell);
    const gridSteps = staircaseMinimapRects(originCell, template);
    const lastStep = gridSteps[gridSteps.length - 1];
    if (lastStep === undefined) {
      throw new Error('expected a last step');
    }

    expect(Math.abs(endCell.x - lastStep.minX)).toBeCloseTo(STAIR_STEP_OVERLAP);
    expect(Math.abs(endCell.y - lastStep.minY)).toBeCloseTo(STAIR_STEP_OVERLAP);
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
