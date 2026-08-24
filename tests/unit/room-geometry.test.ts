import { describe, expect, it } from 'vitest';
import { MAX_ROOM_BLOCKS, RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  createPlaygroundRoom,
} from '../../src/sim/room/playground.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, WORLD_ZOOM } from '../../src/render/resolution.js';
import {
  ROOM_FRAME_HEIGHT,
  ROOM_FRAME_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  compileRoomTemplate,
} from '../../src/sim/room/template.js';
import {
  MULTI_CELL_COUNT,
  ROOM_COLUMNS,
  ROOM_ROWS,
  type MultiCellRoomShape,
  type RoomSubLayout,
} from '../../src/content/rooms/definition.js';

describe('RoomGeometry', () => {
  it('reports a circle clear only when it is inside the bounds and off every block', () => {
    const room = new RoomGeometry(0, 0, 100, 100);
    room.addBlock(40, 40, 60, 60);

    expect(room.isClear(20, 20, 5)).toBe(true);
    expect(room.isClear(50, 50, 5)).toBe(false);
    expect(room.isClear(36, 50, 5)).toBe(false);
    expect(room.isClear(35, 50, 5)).toBe(true);
    expect(room.isClear(4, 50, 5)).toBe(false);
    expect(room.isClear(5, 50, 5)).toBe(true);
  });

  it('refuses to grow past its fixed block storage', () => {
    const room = new RoomGeometry(0, 0, 100, 100);
    for (let block = 0; block < MAX_ROOM_BLOCKS; block++) {
      room.addBlock(0, 0, 1, 1);
    }
    expect(room.blockCount).toBe(MAX_ROOM_BLOCKS);
    expect(() => {
      room.addBlock(0, 0, 1, 1);
    }).toThrow(/at most/);
  });
});

describe('the playground room', () => {
  it('fills the internal resolution exactly at the zoom it is drawn at', () => {
    // `sim/` cannot import `render/`, so the two constants are declared
    // independently. This is the seam where a drift between them would show up:
    // a room that does not divide the screen by a whole number either leaves a
    // strip of it empty or spills off the edge.
    expect(PLAYFIELD_WIDTH * WORLD_ZOOM).toBe(INTERNAL_WIDTH);
    expect(PLAYFIELD_HEIGHT * WORLD_ZOOM).toBe(INTERNAL_HEIGHT);
    expect(Number.isInteger(WORLD_ZOOM)).toBe(true);
  });

  it('leaves the centre of the room open for the player to spawn into', () => {
    const room = createPlaygroundRoom();
    expect(room.isClear((room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2, 8)).toBe(true);
  });
});

/** `(ROOM_FRAME_WIDTH - SCREEN_WIDTH) / 2` / `(ROOM_FRAME_HEIGHT - SCREEN_HEIGHT) / 2`, re-derived from exports rather than importing `template.ts`'s private `ROOM_MARGIN_X`/`ROOM_MARGIN_Y`. */
const MARGIN_X = (ROOM_FRAME_WIDTH - SCREEN_WIDTH) / 2;
const MARGIN_Y = (ROOM_FRAME_HEIGHT - SCREEN_HEIGHT) / 2;

function blankSubLayout(): RoomSubLayout {
  const blankRow = '#' + '.'.repeat(ROOM_COLUMNS - 2) + '#';
  const wallRow = '#'.repeat(ROOM_COLUMNS);
  const tileGrid = Array.from({ length: ROOM_ROWS }, (_row, index) =>
    index === 0 || index === ROOM_ROWS - 1 ? wallRow : blankRow,
  );
  return {
    tileGrid,
    obstacles: [],
    enemySpawns: [],
    spawnGroups: [],
    pickupSpawns: [],
    hazards: [],
    decorativeProps: [],
  };
}

function multiCellTemplate(shape: MultiCellRoomShape) {
  return {
    id: `synthetic-${shape}`,
    cells: Array.from({ length: MULTI_CELL_COUNT[shape] }, () => blankSubLayout()),
    metadata: { floorTags: ['test'], shape, difficultyTier: 1, weight: 1 },
  };
}

/**
 * #107: `RoomGeometry.voidRect` (singular, `L`-only) generalized to
 * `voidRects` (a list) so `compileRoomTemplate` can carve `T`'s four dropped
 * 3x3 corners, not just `L`'s one. These prove the generalization is a pure
 * refactor for `L` and correct for `T`.
 */
describe('compileRoomTemplate void rects (#107)', () => {
  it('gives an L room exactly one void rect, at its dropped corner', () => {
    const placement = {
      cells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 0, row: 1 },
      ],
    };
    const compiled = compileRoomTemplate(multiCellTemplate('L'), 1, 'synthetic-L', [], placement);

    const expectedVoidRect = {
      minX: MARGIN_X + SCREEN_WIDTH,
      minY: MARGIN_Y + SCREEN_HEIGHT,
      maxX: MARGIN_X + 2 * SCREEN_WIDTH,
      maxY: MARGIN_Y + 2 * SCREEN_HEIGHT,
    };
    expect(compiled.geometry.voidRects).toEqual([expectedVoidRect]);
    expect(
      compiled.geometry.isClear(
        (expectedVoidRect.minX + expectedVoidRect.maxX) / 2,
        (expectedVoidRect.minY + expectedVoidRect.maxY) / 2,
        4,
      ),
    ).toBe(false);
    expect(
      compiled.geometry.isClear(MARGIN_X + SCREEN_WIDTH / 2, MARGIN_Y + SCREEN_HEIGHT / 2, 4),
    ).toBe(true);
  });

  it('gives a T room four void rects, one per dropped 3x3 corner', () => {
    const placement = {
      cells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 2, row: 0 },
        { col: 1, row: 1 },
        { col: 1, row: 2 },
      ],
    };
    const compiled = compileRoomTemplate(multiCellTemplate('T'), 1, 'synthetic-T', [], placement);

    expect(compiled.geometry.voidRects).toHaveLength(4);
    const voidCells = [
      { col: 0, row: 1 },
      { col: 2, row: 1 },
      { col: 0, row: 2 },
      { col: 2, row: 2 },
    ];
    for (const cell of voidCells) {
      const minX = MARGIN_X + cell.col * SCREEN_WIDTH;
      const minY = MARGIN_Y + cell.row * SCREEN_HEIGHT;
      expect(compiled.geometry.voidRects).toContainEqual({
        minX,
        minY,
        maxX: minX + SCREEN_WIDTH,
        maxY: minY + SCREEN_HEIGHT,
      });
      expect(compiled.geometry.isClear(minX + SCREEN_WIDTH / 2, minY + SCREEN_HEIGHT / 2, 4)).toBe(
        false,
      );
    }
    // The bar (row 0) and the stem's far end (row 2, middle column) stay open.
    expect(
      compiled.geometry.isClear(MARGIN_X + SCREEN_WIDTH / 2, MARGIN_Y + SCREEN_HEIGHT / 2, 4),
    ).toBe(true);
    expect(
      compiled.geometry.isClear(
        MARGIN_X + SCREEN_WIDTH + SCREEN_WIDTH / 2,
        MARGIN_Y + 2 * SCREEN_HEIGHT + SCREEN_HEIGHT / 2,
        4,
      ),
    ).toBe(true);
  });
});
