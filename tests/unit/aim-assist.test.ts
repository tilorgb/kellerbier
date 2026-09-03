import { describe, expect, it } from 'vitest';
import { applyAimAssist } from '../../src/app/input/aim-assist.js';

/**
 * #53's aim assist: a pure, allocation-free nudge on an analog aim
 * direction toward the nearest enemy inside a narrow cone. Tested purely —
 * `visitTargets` is a plain callback here, no `GameSim` needed.
 */

function targets(points: readonly { x: number; y: number }[]) {
  return (visit: (x: number, y: number) => void): void => {
    for (const point of points) {
      visit(point.x, point.y);
    }
  };
}

describe('applyAimAssist', () => {
  it('leaves the raw direction untouched with no input at all', () => {
    const result = applyAimAssist(0, 0, 0, 0, 1, targets([{ x: 10, y: 0 }]));
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('leaves the raw direction untouched at strength 0', () => {
    const result = applyAimAssist(1, 0, 0, 0, 0, targets([{ x: 0, y: 10 }]));
    expect(result).toEqual({ x: 1, y: 0 });
  });

  it('leaves the raw direction untouched with no targets at all', () => {
    const result = applyAimAssist(1, 0, 0, 0, 1, targets([]));
    expect(result).toEqual({ x: 1, y: 0 });
  });

  it('leaves the raw direction untouched when every target is outside the cone', () => {
    // Aiming straight right (+x); a target straight up is 90° away, well outside a 20° cone.
    const result = applyAimAssist(1, 0, 0, 0, 1, targets([{ x: 0, y: 100 }]));
    expect(result).toEqual({ x: 1, y: 0 });
  });

  it('leaves the raw direction untouched when the only target is out of range', () => {
    const result = applyAimAssist(1, 0, 0, 0, 1, targets([{ x: 10000, y: 0 }]));
    expect(result).toEqual({ x: 1, y: 0 });
  });

  it('pulls the aim toward a target nearly ahead of it, at full strength', () => {
    // Aiming along +x; the target is slightly off-axis but inside the cone.
    const result = applyAimAssist(1, 0, 0, 0, 1, targets([{ x: 100, y: 10 }]));
    const angle = Math.atan2(result.y, result.x);
    const targetAngle = Math.atan2(10, 100);
    expect(angle).toBeCloseTo(targetAngle, 5);
  });

  it('only partially pulls the aim at a fractional strength', () => {
    // `applyAimAssist` returns a shared scratch object (its own doc comment:
    // "allocation-free per call") — read each angle out to a plain number
    // immediately, before the next call overwrites it.
    const rawResult = applyAimAssist(1, 0, 0, 0, 0, targets([{ x: 100, y: 10 }]));
    const rawAngle = Math.atan2(rawResult.y, rawResult.x);
    const fullResult = applyAimAssist(1, 0, 0, 0, 1, targets([{ x: 100, y: 10 }]));
    const fullAngle = Math.atan2(fullResult.y, fullResult.x);
    const halfResult = applyAimAssist(1, 0, 0, 0, 0.5, targets([{ x: 100, y: 10 }]));
    const halfAngle = Math.atan2(halfResult.y, halfResult.x);
    expect(halfAngle).toBeGreaterThan(rawAngle);
    expect(halfAngle).toBeLessThan(fullAngle);
  });

  it('preserves the raw input magnitude — assist changes direction, never how far the stick is pushed', () => {
    const rawMagnitude = Math.hypot(0.6, 0);
    const result = applyAimAssist(0.6, 0, 0, 0, 1, targets([{ x: 100, y: 5 }]));
    expect(Math.hypot(result.x, result.y)).toBeCloseTo(rawMagnitude, 5);
  });

  it('picks the closest qualifying target among several', () => {
    // Copy each result to a plain object immediately — see the shared
    // scratch note above.
    const { x: bothX, y: bothY } = applyAimAssist(
      1,
      0,
      0,
      0,
      1,
      targets([
        { x: 200, y: 5 }, // farther, smaller angle
        { x: 50, y: 5 }, // closer
      ]),
    );
    const { x: closeOnlyX, y: closeOnlyY } = applyAimAssist(
      1,
      0,
      0,
      0,
      1,
      targets([{ x: 50, y: 5 }]),
    );
    expect({ x: bothX, y: bothY }).toEqual({ x: closeOnlyX, y: closeOnlyY });
  });

  it('ignores a target sitting exactly on the player', () => {
    expect(() => applyAimAssist(1, 0, 0, 0, 1, targets([{ x: 0, y: 0 }]))).not.toThrow();
    const result = applyAimAssist(1, 0, 0, 0, 1, targets([{ x: 0, y: 0 }]));
    expect(result).toEqual({ x: 1, y: 0 });
  });
});
