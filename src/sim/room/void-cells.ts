/**
 * Which grid cells inside a multi-cell shape's own bounding box it doesn't
 * claim — `L`'s one dropped corner (#20's footprint), `T`'s four (#107).
 *
 * Shared between `compileRoomTemplate` (`sim/room/template.ts`, which fills
 * these solid regardless of what real room might occupy that floor-grid
 * cell — see `RoomGeometry.voidRects`) and the minimap
 * (`render/minimap-hud.ts`), so the minimap never reveals a connection the
 * compiled room silently drops. One source of truth for "void" rather than
 * two independent computations that could drift apart — which is exactly
 * how a real bug shipped once: the minimap kept showing a room as adjacent
 * after the compiler had already dropped its door.
 */

/** A grid cell in whatever coordinate space the caller has — floor-absolute or a room's own local placement, the arithmetic is the same either way. */
export interface VoidCellQuery {
  readonly x: number;
  readonly y: number;
}

export function voidCellKey(cell: VoidCellQuery): string {
  return `${String(cell.x)},${String(cell.y)}`;
}

/** Every cell in `cells`' own bounding box that `cells` itself does not claim. */
export function computeVoidCells(cells: readonly VoidCellQuery[]): VoidCellQuery[] {
  if (cells.length === 0) {
    return [];
  }
  const minX = Math.min(...cells.map((cell) => cell.x));
  const maxX = Math.max(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const maxY = Math.max(...cells.map((cell) => cell.y));
  const present = new Set(cells.map(voidCellKey));

  const result: VoidCellQuery[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const candidate = { x, y };
      if (!present.has(voidCellKey(candidate))) {
        result.push(candidate);
      }
    }
  }
  return result;
}
