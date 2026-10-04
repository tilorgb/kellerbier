import { describe, expect, it } from 'vitest';
import {
  pixelDisc,
  pixelRuns,
  pixelShapeGeometry,
  plotPixelLine,
} from '../../src/render/world/pixel-shape.js';

/**
 * Silhouettes baked onto a pixel grid (`render/world/pixel-shape.ts`) — what
 * the cellar bulb and the secret-wall crack are drawn from, so they read as
 * pixel art at display resolution instead of as clean geometry.
 */
describe('pixel shapes', () => {
  it('bakes a disc as the classic pixel circle', () => {
    const disc = pixelDisc(8);
    const widths = [];
    for (let row = 0; row < 8; row++) {
      widths.push(disc.subarray(row * 8, row * 8 + 8).reduce((sum, cell) => sum + cell, 0));
    }
    expect(widths).toEqual([4, 6, 8, 8, 8, 8, 6, 4]);
  });

  it('merges each row into runs', () => {
    const filled = new Uint8Array([1, 1, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1]);
    expect(pixelRuns(4, 3, filled)).toEqual([0, 2, 0, 3, 4, 0, 1, 4, 2]);
  });

  it('plots a line through both ends without leaving the grid', () => {
    const filled = new Uint8Array(5 * 3);
    plotPixelLine(filled, 5, 3, 0, 0, 4, 2);
    expect(filled[0]).toBe(1);
    expect(filled[2 * 5 + 4]).toBe(1);
    // One cell per column: a shallow line never doubles up or skips.
    for (let col = 0; col < 5; col++) {
      expect((filled[col] ?? 0) + (filled[5 + col] ?? 0) + (filled[10 + col] ?? 0)).toBe(1);
    }
    expect(() => {
      plotPixelLine(filled, 5, 3, -3, -3, 9, 9);
    }).not.toThrow();
  });

  it('builds two triangles per run, centred on the origin', () => {
    const disc = pixelDisc(8);
    const geometry = pixelShapeGeometry(8, 8, disc, 0.5, 0.5);
    const position = geometry.getAttribute('position');
    expect(position.count).toBe(8 * 6);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.toArray()).toEqual([-2, -2, 0]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([2, 2, 0]);
  });
});
