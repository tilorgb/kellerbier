/**
 * Boundary-edge geometry for a floor-plan room's cell union.
 *
 * `FloorPlanRoom.cells` (`src/sim/room/floor-plan.ts`) is a flat list of grid
 * cells — a 1x2/2x2/L room is several cells, not one. The minimap draws a
 * multi-cell room as a single connected shape (acceptance criterion on #21),
 * which means filling every cell with no stroke and separately stroking only
 * the edges that sit on the union's outer boundary — an edge between two
 * cells of the *same* room is never a boundary edge and is left undrawn.
 *
 * Kept out of `floor-plan.ts`: this is render geometry, not floor
 * generation, and has no bearing on layout validity.
 */

export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** A unit-length edge of the cell grid, in cell-grid coordinates. */
export interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

function cellKey(cell: Cell): string {
  return `${String(cell.x)},${String(cell.y)}`;
}

/**
 * The boundary edges of the union of `cells`, unsorted and with no shared
 * geometry between adjacent same-room cells.
 */
export function roomOutlineSegments(cells: readonly Cell[]): Segment[] {
  const occupied = new Set(cells.map(cellKey));
  const segments: Segment[] = [];

  for (const cell of cells) {
    if (!occupied.has(cellKey({ x: cell.x, y: cell.y - 1 }))) {
      segments.push({ x1: cell.x, y1: cell.y, x2: cell.x + 1, y2: cell.y });
    }
    if (!occupied.has(cellKey({ x: cell.x, y: cell.y + 1 }))) {
      segments.push({ x1: cell.x, y1: cell.y + 1, x2: cell.x + 1, y2: cell.y + 1 });
    }
    if (!occupied.has(cellKey({ x: cell.x - 1, y: cell.y }))) {
      segments.push({ x1: cell.x, y1: cell.y, x2: cell.x, y2: cell.y + 1 });
    }
    if (!occupied.has(cellKey({ x: cell.x + 1, y: cell.y }))) {
      segments.push({ x1: cell.x + 1, y1: cell.y, x2: cell.x + 1, y2: cell.y + 1 });
    }
  }

  return segments;
}

/** The axis-aligned bounding box of `cells`, in cell-grid coordinates. */
export function cellBounds(cells: readonly Cell[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x + 1);
    maxY = Math.max(maxY, cell.y + 1);
  }
  return { minX, minY, maxX, maxY };
}
