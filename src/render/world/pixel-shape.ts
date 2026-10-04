import { BufferAttribute, BufferGeometry } from 'three';

/**
 * A silhouette baked onto a pixel grid, as geometry.
 *
 * The room is drawn at the display's resolution (`RENDER_AT_DISPLAY_RESOLUTION`),
 * so a shape that is pure geometry — a sphere, a line — comes out with a clean
 * edge that nothing else in the game has: every sprite and tile is pixel art,
 * each texel a whole block of screen pixels. A shape built here is the same
 * thing for geometry: its outline is decided once, on a grid of `cellWidth` by
 * `cellHeight` cells, and each filled cell is drawn as a flat rectangle. It
 * reads as pixel art at any resolution, with no texture and no alpha test, so
 * its depth is its real outline too.
 */

/**
 * The filled cells of a `width` by `height` grid as horizontal runs, three
 * numbers each: first column, one past the last column, row. `filled` is
 * row-major, row 0 first.
 */
export function pixelRuns(width: number, height: number, filled: Uint8Array): number[] {
  const runs: number[] = [];
  for (let row = 0; row < height; row++) {
    let start = -1;
    for (let col = 0; col <= width; col++) {
      const on = col < width && (filled[row * width + col] ?? 0) !== 0;
      if (on && start < 0) {
        start = col;
      } else if (!on && start >= 0) {
        runs.push(start, col, row);
        start = -1;
      }
    }
  }
  return runs;
}

/**
 * Marks the cells on the line from `(col0, row0)` to `(col1, row1)`, both
 * ends included; cells off the grid are skipped.
 */
export function plotPixelLine(
  filled: Uint8Array,
  width: number,
  height: number,
  col0: number,
  row0: number,
  col1: number,
  row1: number,
): void {
  const stepCol = col0 < col1 ? 1 : -1;
  const stepRow = row0 < row1 ? 1 : -1;
  const deltaCol = Math.abs(col1 - col0);
  const deltaRow = -Math.abs(row1 - row0);
  let error = deltaCol + deltaRow;
  let col = col0;
  let row = row0;
  for (;;) {
    if (col >= 0 && col < width && row >= 0 && row < height) {
      filled[row * width + col] = 1;
    }
    if (col === col1 && row === row1) {
      return;
    }
    const doubled = error * 2;
    if (doubled >= deltaRow) {
      error += deltaRow;
      col += stepCol;
    }
    if (doubled <= deltaCol) {
      error += deltaCol;
      row += stepRow;
    }
  }
}

/** A filled disc `diameter` cells across, row-major — the classic pixel circle. */
export function pixelDisc(diameter: number): Uint8Array {
  const filled = new Uint8Array(diameter * diameter);
  const radius = diameter / 2;
  for (let row = 0; row < diameter; row++) {
    for (let col = 0; col < diameter; col++) {
      const dx = col + 0.5 - radius;
      const dy = row + 0.5 - radius;
      if (dx * dx + dy * dy <= radius * radius) {
        filled[row * diameter + col] = 1;
      }
    }
  }
  return filled;
}

/**
 * The grid as flat geometry in the local XY plane, facing +z, centred on the
 * origin: row 0 is the bottom row.
 */
export function pixelShapeGeometry(
  width: number,
  height: number,
  filled: Uint8Array,
  cellWidth: number,
  cellHeight: number,
): BufferGeometry {
  const runs = pixelRuns(width, height, filled);
  const positions = new Float32Array((runs.length / 3) * 18);
  const left = (-width * cellWidth) / 2;
  const bottom = (-height * cellHeight) / 2;
  let at = 0;
  for (let i = 0; i < runs.length; i += 3) {
    const x0 = left + (runs[i] ?? 0) * cellWidth;
    const x1 = left + (runs[i + 1] ?? 0) * cellWidth;
    const y0 = bottom + (runs[i + 2] ?? 0) * cellHeight;
    const y1 = y0 + cellHeight;
    positions.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0], at);
    at += 18;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
