import { describe, expect, it } from 'vitest';
import { MAX_ROOM_BLOCKS, RoomGeometry, roomFrameSize } from '../../src/sim/room/geometry.js';
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
  STAIR_STEP_OVERLAP,
  compileStaircaseRoom,
  validateStaircaseTemplate,
  type StaircaseRoomTemplate,
} from '../../src/sim/room/staircase.js';
import { resolveAxisX, resolveAxisY } from '../../src/sim/systems/motion.js';
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

/**
 * #112: a diagonal staircase room is a hand-placed set-piece with its own
 * compilation path (`compileStaircaseRoom`), not a `RoomShape` — its
 * interior is a *union* of overlapping per-step rects (`RoomGeometry.stepRects`)
 * rather than a bounding-box-minus-voids. These prove the union is real
 * shared edge area (not a corner touch), that the whole stair is walkable
 * end-to-end with no collision gap at any step, and that the door-direction
 * restriction on the two end steps is enforced.
 */
/** Indexes an array the test already asserted has enough elements, without a non-null assertion. */
function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`expected an element at index ${String(index)}`);
  }
  return value;
}

describe('compileStaircaseRoom (#112)', () => {
  const template: StaircaseRoomTemplate = {
    id: 'synthetic-staircase',
    stepCount: 4,
    direction: 'up-right',
    startDoor: 'south',
    endDoor: 'north',
  };

  it('overlaps each consecutive pair of steps by real edge area, not a corner point', () => {
    const compiled = compileStaircaseRoom(template);
    expect(compiled.geometry.stepRects).toHaveLength(4);

    const steps = compiled.geometry.stepRects;
    for (let index = 0; index + 1 < steps.length; index++) {
      const a = at(steps, index);
      const b = at(steps, index + 1);
      const overlapWidth = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const overlapHeight = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      expect(overlapWidth).toBeCloseTo(SCREEN_WIDTH * STAIR_STEP_OVERLAP);
      expect(overlapHeight).toBeCloseTo(SCREEN_HEIGHT * STAIR_STEP_OVERLAP);
    }
  });

  it('is walkable end-to-end along the stair spine, with no collision gap at any step', () => {
    const compiled = compileStaircaseRoom(template);
    const steps = compiled.geometry.stepRects;
    const first = at(steps, 0);
    const last = at(steps, steps.length - 1);
    const start = { x: (first.minX + first.maxX) / 2, y: (first.minY + first.maxY) / 2 };
    const end = { x: (last.minX + last.maxX) / 2, y: (last.minY + last.maxY) / 2 };

    const samples = 40;
    for (let sample = 0; sample <= samples; sample++) {
      const t = sample / samples;
      const x = start.x + t * (end.x - start.x);
      const y = start.y + t * (end.y - start.y);
      expect(compiled.geometry.isClear(x, y, 8)).toBe(true);
    }
  });

  it('rejects a circle that never fits inside any single step', () => {
    const compiled = compileStaircaseRoom(template);
    const { geometry } = compiled;
    // Inside the overall bounding box, but in the notch neither the first
    // nor the last step's rect reaches.
    expect(geometry.isClear(geometry.maxX - 5, geometry.maxY - 5, 4)).toBe(false);
    // Well outside the bounding box entirely.
    expect(geometry.isClear(geometry.minX - 50, geometry.minY - 50, 4)).toBe(false);
  });

  it('places each end door against its own step, not the room bounding box', () => {
    const compiled = compileStaircaseRoom(template);
    const first = at(compiled.geometry.stepRects, 0);
    const last = at(compiled.geometry.stepRects, compiled.geometry.stepRects.length - 1);

    expect(compiled.startDoor).toEqual({
      direction: 'south',
      x: (first.minX + first.maxX) / 2,
      y: first.maxY,
    });
    expect(compiled.endDoor).toEqual({
      direction: 'north',
      x: (last.minX + last.maxX) / 2,
      y: last.minY,
    });
  });

  it('keeps the equal-margin roomFrameSize invariant the camera clamp relies on', () => {
    const compiled = compileStaircaseRoom(template);
    const frame = roomFrameSize(compiled.geometry);
    expect(frame.width).toBeCloseTo(compiled.geometry.minX + compiled.geometry.maxX);
    expect(frame.height).toBeCloseTo(compiled.geometry.minY + compiled.geometry.maxY);
  });

  it('rejects a door direction the interior overlap would partially consume', () => {
    expect(() => compileStaircaseRoom({ ...template, startDoor: 'north' })).toThrow(
      /startDoor must be/,
    );
    expect(() => compileStaircaseRoom({ ...template, endDoor: 'south' })).toThrow(
      /endDoor must be/,
    );
  });

  it('rejects fewer than two steps', () => {
    expect(() => compileStaircaseRoom({ ...template, stepCount: 1 })).toThrow(/stepCount/);
  });

  it('registers the gap at every seam as a real block, not just the isClear union check', () => {
    // `isClear`'s stepRects union check is what every *other* system queries
    // (spawning, corner nudges, shooting range), but the player/enemy wall
    // resolver (`sim/systems/motion.ts`'s `resolveAxisX`/`resolveAxisY`,
    // shared by `moveBody`) has no idea `stepRects` exists — it only ever
    // consults `blocks`. Without a real block registered at every seam
    // (`seamVoidRects`), nothing stops a body from walking straight through
    // the "slack" between two steps despite `isClear` correctly rejecting it
    // as a query.
    const compiled = compileStaircaseRoom(template);
    const { geometry } = compiled;
    expect(geometry.blockCount).toBe(2 * (template.stepCount - 1));
    expect(geometry.voidRects).toHaveLength(geometry.blockCount);

    const radius = 8;
    for (const voidRect of geometry.voidRects) {
      const centreX = (voidRect.minX + voidRect.maxX) / 2;
      const centreY = (voidRect.minY + voidRect.maxY) / 2;
      // The same two-phase resolution `moveBody` runs: X first, then Y off
      // whatever X already resolved to.
      const resolvedX = resolveAxisX(geometry, centreX, centreY, radius, 1);
      const resolvedY = resolveAxisY(geometry, resolvedX, centreY, radius, 1);
      const clearOfVoidX =
        resolvedX + radius <= voidRect.minX || resolvedX - radius >= voidRect.maxX;
      const clearOfVoidY =
        resolvedY + radius <= voidRect.minY || resolvedY - radius >= voidRect.maxY;
      expect(clearOfVoidX || clearOfVoidY, `void ${JSON.stringify(voidRect)}`).toBe(true);
    }
  });
});

describe('validateStaircaseTemplate (#112)', () => {
  const content = {
    id: 'synthetic-staircase',
    stepCount: 5,
    direction: 'up-right',
    startDoor: 'south',
    endDoor: 'north',
    floorTags: ['cellar'],
    weight: 1,
  };

  it('accepts an even stepCount', () => {
    expect(() => validateStaircaseTemplate({ ...content, stepCount: 4 })).not.toThrow();
  });

  it('rejects an odd stepCount', () => {
    // The floor generator's cell reservation (`floor-plan.ts`'s
    // `placeStaircase`, #118) reserves the real screen-space span exactly,
    // at `STAIR_STEP_OVERLAP` sub-cell granularity — no rounding. Both of a
    // staircase's real doors have to land back on the ordinary integer
    // floor-grid, which only happens when the offset between them
    // (`stepCount * STAIR_STEP_OVERLAP` cells) is a whole number — true iff
    // `stepCount` is even, given `STAIR_STEP_OVERLAP` is `0.5`. An odd
    // `stepCount` would leave one door half a cell off that grid, with no
    // real room there for it to open into.
    expect(() => validateStaircaseTemplate(content)).toThrow(/stepCount/);
  });
});
