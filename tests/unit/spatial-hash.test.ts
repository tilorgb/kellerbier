import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../../src/sim/collision/spatial-hash.js';

function candidates(hash: SpatialHash, x: number, y: number, radius: number): number[] {
  const found: number[] = [];
  hash.query(x, y, radius, (index) => {
    found.push(index);
  });
  return found.sort((a, b) => a - b);
}

function build(bodies: readonly (readonly [number, number, number, number])[]): SpatialHash {
  const hash = new SpatialHash({ width: 640, height: 360, cellSize: 32, capacity: 64 });
  hash.begin();
  for (const [index, x, y, radius] of bodies) {
    hash.insert(index, x, y, radius);
  }
  hash.build();
  return hash;
}

describe('SpatialHash', () => {
  it('finds a body sharing a cell with the query', () => {
    const hash = build([[7, 100, 100, 8]]);
    expect(candidates(hash, 100, 100, 4)).toEqual([7]);
  });

  it('does not report a body several cells away', () => {
    const hash = build([[7, 100, 100, 8]]);
    expect(candidates(hash, 400, 300, 4)).toEqual([]);
  });

  it('finds a body that straddles a cell boundary from either side', () => {
    // Centred exactly on the boundary between two columns.
    const hash = build([[3, 128, 100, 8]]);
    expect(candidates(hash, 120, 100, 2)).toEqual([3]);
    expect(candidates(hash, 136, 100, 2)).toEqual([3]);
  });

  it('reports a body once, however many cells it and the query share', () => {
    // Both straddle the same corner, so they meet in all four cells.
    const hash = build([[1, 128, 128, 12]]);
    const found: number[] = [];
    hash.query(128, 128, 12, (index) => {
      found.push(index);
    });
    expect(found).toEqual([1]);
  });

  it('keeps queries independent, so an old visit does not suppress a new one', () => {
    const hash = build([[1, 100, 100, 8]]);
    expect(candidates(hash, 100, 100, 4)).toEqual([1]);
    expect(candidates(hash, 100, 100, 4)).toEqual([1]);
  });

  it('sweeps the whole path, not just where the move ended', () => {
    const hash = build([[5, 100, 100, 6]]);
    const found: number[] = [];
    // A shot that crosses the body inside one tick and lands well past it.
    hash.querySwept(40, 100, 300, 100, 3, (index) => {
      found.push(index);
    });
    expect(found).toEqual([5]);
  });

  it('clears staged bodies on the next rebuild', () => {
    const hash = build([[1, 100, 100, 8]]);
    hash.begin();
    hash.insert(2, 400, 300, 8);
    hash.build();
    expect(candidates(hash, 100, 100, 4)).toEqual([]);
    expect(candidates(hash, 400, 300, 4)).toEqual([2]);
  });

  it('clamps a body outside the grid to an edge cell rather than losing it', () => {
    const hash = build([[9, -50, -50, 8]]);
    expect(candidates(hash, 4, 4, 4)).toEqual([9]);
  });

  it('reports a body bigger than the grid was sized for', () => {
    const hash = new SpatialHash({
      width: 640,
      height: 360,
      cellSize: 32,
      capacity: 8,
      maxRadius: 16,
    });
    hash.begin();
    hash.insert(1, 300, 200, 64);
    hash.build();
    expect(hash.overflows).toBe(1);
  });

  it('reports bodies beyond its capacity rather than writing past its arrays', () => {
    const hash = new SpatialHash({ width: 640, height: 360, cellSize: 32, capacity: 2 });
    hash.begin();
    hash.insert(1, 10, 10, 4);
    hash.insert(2, 20, 20, 4);
    hash.insert(3, 30, 30, 4);
    hash.build();
    expect(hash.stagedCount).toBe(2);
    expect(hash.overflows).toBe(1);
  });
});
