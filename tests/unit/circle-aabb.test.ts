import { describe, expect, it } from 'vitest';
import {
  circleOverlapsAabb,
  resolveCircleAabbX,
  resolveCircleAabbY,
} from '../../src/sim/collision/circle-aabb.js';

// A 20x20 box with its top-left corner at (100, 100).
const BOX = { minX: 100, minY: 100, maxX: 120, maxY: 120 } as const;

describe('circleOverlapsAabb', () => {
  it('reports overlap only once the circle actually touches the box', () => {
    expect(circleOverlapsAabb(96, 110, 5, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY)).toBe(true);
    expect(circleOverlapsAabb(95, 110, 5, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY)).toBe(false);
    expect(circleOverlapsAabb(90, 110, 5, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY)).toBe(false);
  });

  it('measures a corner by distance, not by the bounding box of the circle', () => {
    // Diagonally off the corner at exactly 5 units: touching, not overlapping.
    const offset = 5 / Math.SQRT2;
    expect(
      circleOverlapsAabb(
        BOX.minX - offset,
        BOX.minY - offset,
        5,
        BOX.minX,
        BOX.minY,
        BOX.maxX,
        BOX.maxY,
      ),
    ).toBe(false);
    expect(
      circleOverlapsAabb(
        BOX.minX - offset + 0.01,
        BOX.minY - offset + 0.01,
        5,
        BOX.minX,
        BOX.minY,
        BOX.maxX,
        BOX.maxY,
      ),
    ).toBe(true);
  });
});

describe('resolveCircleAabbX', () => {
  it('pushes a body level with the face out by its full radius', () => {
    expect(resolveCircleAabbX(98, 110, 5, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY, true)).toBe(95);
    expect(resolveCircleAabbX(122, 110, 5, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY, false)).toBe(
      125,
    );
  });

  it('pushes a body past the corner out by less, so corners are not padded', () => {
    // Three units above the box's top edge: clearance is sqrt(25 - 9) = 4.
    const resolved = resolveCircleAabbX(98, 97, 5, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY, true);
    expect(resolved).toBeCloseTo(96, 6);
  });

  it('leaves a body alone when it is further from the corner than its radius', () => {
    expect(resolveCircleAabbX(98, 94, 5, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY, true)).toBe(98);
  });
});

describe('resolveCircleAabbY', () => {
  it('mirrors the X resolution on the other axis', () => {
    expect(resolveCircleAabbY(110, 98, 5, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY, true)).toBe(95);
    expect(resolveCircleAabbY(110, 122, 5, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY, false)).toBe(
      125,
    );
    expect(resolveCircleAabbY(97, 98, 5, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY, true)).toBeCloseTo(
      96,
      6,
    );
  });
});
