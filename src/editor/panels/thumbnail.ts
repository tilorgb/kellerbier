import { ROOM_COLUMNS, ROOM_ROWS, ROOM_TILE_UNITS } from '../../content/rooms/definition.js';
import { MULTI_CELL_LAYOUT } from '../definitions.js';
import { type EditorDraft, fromRoomTemplate } from '../state.js';

/** One tile, in thumbnail pixels — small enough that a whole browse list of these reads as a grid of icons, not a second copy of the real editor. */
const TILE_PX = 3;

const FLOOR_COLOR = '#3a3245';
const WALL_COLOR = '#6a5a78';
const ENEMY_COLOR = '#e2a33d';
const PICKUP_COLOR = '#6fbf73';
const PROP_COLOR = '#6a8fd8';
const HAZARD_COLOR = 'rgba(224, 122, 62, 0.55)';
const BACKGROUND_COLOR = '#14101a';
const ACTIVE_CELL_OUTLINE = '#f0c46a';

export interface DraftThumbnailOptions {
  /** Pixels per room tile — the browse panel's icon-sized default (`TILE_PX`) unless overridden. */
  readonly tilePx?: number;
  /** Outlined in the accent colour, for the "which cell am I editing" overview next to the cell tabs. `undefined` draws no outline. */
  readonly activeCellIndex?: number;
}

/**
 * A small canvas rendering of a room's layout — walls, floor, and a coloured
 * dot per enemy/pickup/prop/hazard — so the room browse panel (#24's
 * follow-up) can be found by what a room actually looks like, not just its
 * filename. Built off `fromRoomTemplate`'s own normalized shape rather than a
 * second reader, so a thumbnail can never disagree with what Load/Duplicate
 * would actually open.
 *
 * A multi-cell room's sub-layouts are laid out via `MULTI_CELL_LAYOUT` — the
 * same "any one legal arrangement" a playtest already stands in for the real
 * floor generator's placement (see that constant's own doc comment) — purely
 * so a browse-list icon reads as one coherent shape instead of a random
 * scatter of cells.
 */
export function renderRoomThumbnail(raw: unknown): HTMLCanvasElement {
  return renderDraftThumbnail(fromRoomTemplate(raw));
}

/**
 * The same rendering as `renderRoomThumbnail`, off the editor's own live
 * `EditorDraft` rather than a round-trip through raw JSON — `main.ts` calls
 * this on every state change to give a multi-cell room's editing view a
 * "whole room" overview next to its per-cell tabs. Without this, a `1x2`/
 * `2x2`/`L`/`T` room's grid only ever shows one cell in isolation, and a
 * prop placed at what looks like "the outer corner" of *that cell's own*
 * 15x9 grid can read as landing somewhere unexpected once the cells are
 * glued together — the overview is what lets an author check that before
 * saving, rather than only after loading a Playtest.
 */
export function renderDraftThumbnail(
  draft: EditorDraft,
  options: DraftThumbnailOptions = {},
): HTMLCanvasElement {
  const tilePx = options.tilePx ?? TILE_PX;
  const positions = draft.shape === '1x1' ? [{ col: 0, row: 0 }] : MULTI_CELL_LAYOUT[draft.shape];

  const gridCols = Math.max(1, ...positions.map((position) => position.col + 1));
  const gridRows = Math.max(1, ...positions.map((position) => position.row + 1));
  const cellWidthPx = ROOM_COLUMNS * tilePx;
  const cellHeightPx = ROOM_ROWS * tilePx;

  const canvas = document.createElement('canvas');
  canvas.width = gridCols * cellWidthPx;
  canvas.height = gridRows * cellHeightPx;
  canvas.className = 'kb-editor-thumbnail';
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    return canvas;
  }
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = tilePx / ROOM_TILE_UNITS;

  draft.cells.forEach((cell, index) => {
    const position = positions[index] ?? { col: 0, row: 0 };
    const originX = position.col * cellWidthPx;
    const originY = position.row * cellHeightPx;

    cell.tileGrid.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        ctx.fillStyle = line[col] === '#' ? WALL_COLOR : FLOOR_COLOR;
        ctx.fillRect(originX + col * tilePx, originY + row * tilePx, tilePx, tilePx);
      }
    });

    for (const hazard of cell.hazards) {
      ctx.fillStyle = HAZARD_COLOR;
      ctx.fillRect(
        originX + hazard.x * scale,
        originY + hazard.y * scale,
        hazard.width * scale,
        hazard.height * scale,
      );
    }
    for (const spawn of cell.enemySpawns) {
      dot(ctx, originX + spawn.x * scale, originY + spawn.y * scale, ENEMY_COLOR, tilePx);
    }
    for (const pickup of cell.pickupSpawns) {
      dot(ctx, originX + pickup.x * scale, originY + pickup.y * scale, PICKUP_COLOR, tilePx);
    }
    for (const prop of cell.decorativeProps) {
      dot(ctx, originX + prop.x * scale, originY + prop.y * scale, PROP_COLOR, tilePx);
    }

    if (index === options.activeCellIndex) {
      ctx.strokeStyle = ACTIVE_CELL_OUTLINE;
      ctx.lineWidth = Math.max(1, tilePx / 2);
      ctx.strokeRect(
        originX + ctx.lineWidth / 2,
        originY + ctx.lineWidth / 2,
        cellWidthPx - ctx.lineWidth,
        cellHeightPx - ctx.lineWidth,
      );
    }
  });

  return canvas;
}

function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  tilePx: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, tilePx / 1.8), 0, Math.PI * 2);
  ctx.fill();
}
