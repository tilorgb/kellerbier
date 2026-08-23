import { describe, expect, it } from 'vitest';
import { type Cell, cellBounds, roomOutlineSegments } from '../../src/render/room-outline.js';

function segmentKey(segment: { x1: number; y1: number; x2: number; y2: number }): string {
  // Order-independent: a boundary edge is the same edge from either side.
  const a = `${String(segment.x1)},${String(segment.y1)}`;
  const b = `${String(segment.x2)},${String(segment.y2)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

describe('roomOutlineSegments', () => {
  it('draws all four edges of a single 1x1 room', () => {
    const cells: Cell[] = [{ x: 0, y: 0 }];
    const segments = roomOutlineSegments(cells);
    expect(segments).toHaveLength(4);
    expect(new Set(segments.map(segmentKey)).size).toBe(4);
  });

  it('drops the shared interior edge of a 1x2 domino', () => {
    const cells: Cell[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const segments = roomOutlineSegments(cells);
    expect(segments).toHaveLength(6);
    const keys = segments.map(segmentKey);
    expect(new Set(keys).size).toBe(6);
    // The edge between the two cells is never on the boundary.
    expect(keys).not.toContain(segmentKey({ x1: 1, y1: 0, x2: 1, y2: 1 }));
  });

  it('outlines an L-shape as one connected boundary with no interior edges', () => {
    const cells: Cell[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const segments = roomOutlineSegments(cells);
    expect(segments).toHaveLength(8);
    expect(new Set(segments.map(segmentKey)).size).toBe(8);
  });
});

describe('cellBounds', () => {
  it('spans the full extent of a multi-cell room', () => {
    const cells: Cell[] = [
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 4 },
    ];
    expect(cellBounds(cells)).toEqual({ minX: 2, minY: 3, maxX: 4, maxY: 5 });
  });
});
