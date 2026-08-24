import type { Rng } from '../rng/rng.js';
import type { FloorConfig } from '../../content/floors/definition.js';
import {
  DIRECTION_OFFSET,
  DOOR_DIRECTIONS,
  isMultiCellRoomTemplate,
  type DoorDirection,
  type RoomShape,
  type RoomTemplate,
} from '../../content/rooms/definition.js';
import {
  STAIR_STEP_OVERLAP,
  STEP_SIGN,
  compileStaircaseRoom,
  type StaircaseContentTemplate,
} from './staircase.js';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './template.js';
import type { RoomRect } from './geometry.js';
import { computeVoidCells } from './void-cells.js';

/**
 * Procedural floor layout: a grid of room slots grown outward from a start
 * room, with roles (boss, treasure, shop, secret) assigned by the rules in
 * `docs/GAME_DESIGN.md` §4, and a concrete room template resolved for each
 * slot from whatever pool the caller hands in.
 *
 * The generator works at two granularities on purpose. `buildSkeleton` grows a
 * *cell* grid — this is where "boss at maximum distance" and "treasure prefers
 * a dead end" have to be computed, and cells are the only granularity fine
 * enough to carve 1×2/2×2/L footprints out of. Everything downstream of it
 * (roles, template choice) operates on *rooms* — a multi-cell room is one slot
 * with one template. Doors are the exception (#100): a multi-cell room is
 * physically several single-screen sub-rooms glued together with no wall
 * between them, so a door is a property of one *cell* of a room, not the room
 * as a whole — `FloorPlanRoom.doors` is a list of `(cell, direction)` pairs,
 * one per real neighbour, not a `{north,east,south,west}` bag.
 */

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export type RoomRole = 'start' | 'boss' | 'treasure' | 'shop' | 'secret' | 'supersecret' | 'normal';

/**
 * One real door: `cellIndex` is into this room's own `cells` (which sub-room
 * the door's wall belongs to — always `0` for a `1x1` room), `direction` is
 * the wall it's on, and `neighborRoomId` is what's on the other side.
 *
 * There is no cap on how many of these a room has — a `2x2` room can have up
 * to two per side (one per sub-cell touching that side), eight in total.
 */
export interface RoomDoor {
  readonly cellIndex: number;
  readonly direction: DoorDirection;
  readonly neighborRoomId: string;
}

export interface FloorPlanRoom {
  readonly id: string;
  readonly cells: readonly Cell[];
  /**
   * `'staircase'` for a diagonal staircase set-piece (#112) — deliberately
   * not a `RoomShape` (`docs/DECISIONS.md` #11/#12): it is never chosen by
   * `chooseShape`/placed by `placeShape`, and its `templateId` resolves
   * through the floor's staircase pool, not `templatePool`. Check
   * `staircaseTemplateId` to tell the two apart, not this field's value.
   */
  readonly shape: RoomShape | 'staircase';
  readonly role: RoomRole;
  readonly doors: readonly RoomDoor[];
  /** Room-graph distance from the start room, in doors walked through. */
  readonly distanceFromStart: number;
  readonly templateId: string;
  /** Set only for a staircase room — see `shape`'s doc comment. */
  readonly staircaseTemplateId?: string;
  /**
   * A staircase's real walkable steps (#112), pre-mapped into this same
   * fractional floor-grid space by `staircaseMinimapRects` at placement
   * time — set only for a staircase room. `render/minimap-hud.ts` draws
   * these instead of `cells` when present; it never needs to know what a
   * staircase is, compile one, or do this arithmetic itself.
   */
  readonly minimapRects?: readonly RoomRect[];
  /**
   * A staircase's two real door pixel centres (#112/#117), computed once by
   * `staircaseDoorCentres` at placement time — set only for a staircase
   * room. `app/main.ts`'s `hiddenDoorsFor`/`crackHintsFor` read this
   * directly instead of compiling the staircase room just to ask it where
   * its doors are, the same "computed once, upstream" shape `minimapRects`
   * already uses.
   */
  readonly doorCentres?: readonly {
    readonly direction: DoorDirection;
    readonly x: number;
    readonly y: number;
  }[];
}

/** Every distinct room `doors` actually connects to — order not meaningful. */
export function neighborRoomIds(doors: readonly RoomDoor[]): readonly string[] {
  return Array.from(new Set(doors.map((door) => door.neighborRoomId)));
}

export interface FloorPlan {
  readonly floor: number;
  readonly floorName: string;
  readonly startRoomId: string;
  readonly bossRoomId: string;
  readonly treasureRoomId: string;
  readonly shopRoomId: string;
  readonly secretRoomId: string;
  readonly supersecretRoomId: string;
  readonly rooms: readonly FloorPlanRoom[];
}

const DIRECTIONS = DOOR_DIRECTIONS;
const OFFSET = DIRECTION_OFFSET;

/**
 * Generation attempts before giving up. `docs/GAME_DESIGN.md` §4: "Generation
 * failures retry, then hard-fail." Each attempt is cheap (a few hundred RNG
 * draws) and a fresh roll of the dice, so this is generous on purpose — the
 * 10,000-floor test in `tests/unit/floor-plan.test.ts` is what proves the
 * ceiling is never actually hit.
 */
const MAX_GENERATION_ATTEMPTS = 200;

/** Guards the frontier walk against spinning forever on a starved grid. */
const MAX_GROWTH_ITERATIONS = 5000;

/**
 * start + boss + treasure + shop + at least one plain room, before the secret
 * and supersecret rooms are added by `placeSecretRoom`/`placeSupersecretRoom`.
 */
const MIN_ROOMS_FOR_ROLES = 5;

function cellKey(cell: Cell): string {
  return `${String(cell.x)},${String(cell.y)}`;
}

function inBounds(cell: Cell, radius: number): boolean {
  return Math.abs(cell.x) <= radius && Math.abs(cell.y) <= radius;
}

function neighborCount(occupied: ReadonlyMap<string, number>, cell: Cell): number {
  let count = 0;
  for (const direction of DIRECTIONS) {
    const offset = OFFSET[direction];
    if (occupied.has(cellKey({ x: cell.x + offset.x, y: cell.y + offset.y }))) {
      count += 1;
    }
  }
  return count;
}

/**
 * Footprints a shape may claim, each relative to an anchor at `{0, 0}` — the
 * cell the generator is placing the room against. `L` is generated from `2x2`
 * by dropping one of its three non-anchor corners, rather than hand-listed,
 * so there is exactly one shape to keep symmetric if the grid ever stops
 * being square.
 */
function shapeFootprints(shape: RoomShape): readonly (readonly Cell[])[] {
  switch (shape) {
    case '1x1':
      return [[{ x: 0, y: 0 }]];
    case '1x2':
      return [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        [
          { x: 0, y: 0 },
          { x: -1, y: 0 },
        ],
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: 0, y: -1 },
        ],
      ];
    case '2x2':
      return [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: -1 },
          { x: 1, y: -1 },
        ],
        [
          { x: 0, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: -1 },
          { x: -1, y: -1 },
        ],
      ];
    case 'L': {
      const variants: Cell[][] = [];
      for (const square of shapeFootprints('2x2')) {
        for (let drop = 1; drop < square.length; drop++) {
          variants.push(square.filter((_cell, index) => index !== drop));
        }
      }
      return variants;
    }
    case 'T': {
      // Four orientations of a 3x3-box "T" (a bar of 3 plus a stem of 2,
      // rotated to each side), each hand-listed in box coordinates rather
      // than derived like `L` — there's no smaller shape a `T` is "minus a
      // cell" from. For each orientation, every one of its 5 cells gets a
      // turn as the anchor (translated to `{0, 0}`), the same guarantee
      // every other shape's variant list gives `placeShape`: whichever cell
      // ends up touching the existing floor, some variant has it at the
      // anchor.
      const orientations: Cell[][] = [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 1, y: 1 },
          { x: 1, y: 2 },
        ],
        [
          { x: 0, y: 2 },
          { x: 1, y: 2 },
          { x: 2, y: 2 },
          { x: 1, y: 1 },
          { x: 1, y: 0 },
        ],
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: 2 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
        [
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 2, y: 2 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      ];
      const variants: Cell[][] = [];
      for (const orientation of orientations) {
        for (const anchor of orientation) {
          variants.push(
            orientation.map((cell) => ({ x: cell.x - anchor.x, y: cell.y - anchor.y })),
          );
        }
      }
      return variants;
    }
  }
}

/**
 * `1x1` always wins by weight — most of a floor is plain rooms, not
 * landmarks. `T` is the rarest: a 3x3 landmark room should read as a genuine
 * find, not a shape a player sees every floor (#107).
 */
function chooseShape(rng: Rng): RoomShape {
  return rng.weightedPick<RoomShape>([
    { value: '1x1', weight: 0.55 },
    { value: '1x2', weight: 0.2 },
    { value: 'L', weight: 0.1 },
    { value: '2x2', weight: 0.1 },
    { value: 'T', weight: 0.05 },
  ]);
}

/**
 * Tries to claim a footprint for `shape` anchored at `anchor`.
 *
 * Only the anchor is allowed to touch an already-placed room — that is what
 * `buildSkeleton`'s frontier walk already checked for a `1x1`, and a bigger
 * shape has to hold to the same rule or it would fuse two branches of the
 * floor together and quietly turn a tree into a knot. `null` means "try a
 * smaller shape here instead", not "generation failed".
 */
function placeShape(
  rng: Rng,
  occupied: ReadonlyMap<string, number>,
  anchor: Cell,
  shape: RoomShape,
  radius: number,
): readonly Cell[] | null {
  if (shape === '1x1') {
    return [anchor];
  }
  const variants = rng.shuffle(shapeFootprints(shape).slice());
  for (const variant of variants) {
    const cells = variant.map((offset) => ({ x: anchor.x + offset.x, y: anchor.y + offset.y }));
    if (!cells.every((cell) => inBounds(cell, radius))) {
      continue;
    }
    if (cells.some((cell) => occupied.has(cellKey(cell)))) {
      continue;
    }
    const extraCellsAreClean = cells
      .filter((cell) => cell.x !== anchor.x || cell.y !== anchor.y)
      .every((cell) => neighborCount(occupied, cell) === 0);
    if (extraCellsAreClean) {
      return cells;
    }
  }
  return null;
}

interface PlacedRoom {
  readonly id: string;
  readonly cells: readonly Cell[];
  readonly shape: RoomShape | 'staircase';
  /** Set only for a staircase room (#112) — see `FloorPlanRoom`'s doc comment. */
  readonly staircaseTemplateId?: string;
  /**
   * The only `(cellIndex, direction)` pairs a staircase room is ever allowed
   * a door on — `computeAdjacency` consults this instead of treating every
   * geometric touch as a door. `undefined` for an ordinary room, which keeps
   * today's "every touch is a door" behaviour exactly as before.
   */
  readonly doorCells?: readonly { readonly cellIndex: number; readonly direction: DoorDirection }[];
  /** Set only for a staircase room — see `FloorPlanRoom.minimapRects`'s doc comment. */
  readonly minimapRects?: readonly RoomRect[];
  /** Set only for a staircase room — see `FloorPlanRoom.doorCentres`'s doc comment. */
  readonly doorCentres?: readonly {
    readonly direction: DoorDirection;
    readonly x: number;
    readonly y: number;
  }[];
}

interface Skeleton {
  readonly rooms: PlacedRoom[];
  readonly occupied: Map<string, number>;
}

interface StaircasePlacement {
  readonly cells: readonly Cell[];
  readonly doorCells: readonly { readonly cellIndex: number; readonly direction: DoorDirection }[];
  readonly minimapRects: readonly RoomRect[];
  readonly doorCentres: readonly {
    readonly direction: DoorDirection;
    readonly x: number;
    readonly y: number;
  }[];
  /**
   * The cell just past the staircase's *far* door — the one `anchor` isn't
   * on. The near end already has a real neighbour by construction (that's
   * what `anchor` touched to grow from); this is guaranteed a real room too
   * (`buildSkeleton`'s caller places one here immediately), because a
   * staircase is the floor's single biggest room by walking time, and
   * reaching the far door to find nothing there would feel like wasted
   * effort rather than an arrival.
   */
  readonly farNeighborCell: Cell;
}

/**
 * A staircase's real, compiled `stepRects` (room units), mapped into the
 * same fractional floor-grid space every other room's integer cell
 * coordinates already live in — one grid cell is exactly one `SCREEN_WIDTH`
 * × `SCREEN_HEIGHT`, and `originCell` is exactly the same corner
 * `stepRects[0]`'s own `minX`/`minY` is, because this function's own caller
 * (`placeStaircase`) reserves the floor-grid block with the identical
 * `STEP_SIGN` convention `compileStaircaseRoom` used to lay the steps out in
 * room-unit space — the two are built from the same signed offset, just at
 * different scales, so they can never drift apart.
 *
 * Computed once, here, at placement time, and carried on `FloorPlanRoom` as
 * plain rectangles (`minimapRects`) — nothing downstream (`render/minimap-
 * hud.ts` included) needs to know a staircase is a staircase, compile one,
 * or do this arithmetic itself; it only ever draws whatever rects a room
 * happens to carry.
 *
 * No snapping or edge-stretching here — both were tried and both drew a
 * staircase that didn't match its own real shape (a whole rect snapped to
 * its reserved cell detached from its neighbour step; stretching just one
 * edge drew that step visibly longer than the rest). The real fix is
 * `validateStaircaseTemplate`'s odd-`stepCount` requirement: it makes
 * `placeStaircase`'s cell reservation and this function's real geometry
 * agree exactly, so the *true*, undistorted shape mapped here already
 * reaches the reserved block's own edges — nothing to correct after the
 * fact.
 */
export function staircaseMinimapRects(
  originCell: Cell,
  template: StaircaseContentTemplate,
): readonly RoomRect[] {
  const stepRects = compileStaircaseRoom(template).geometry.stepRects;
  const firstStep = stepRects[0];
  if (firstStep === undefined) {
    return [];
  }
  const originPixelX = firstStep.minX;
  const originPixelY = firstStep.minY;
  return stepRects.map((step) => ({
    minX: originCell.x + (step.minX - originPixelX) / SCREEN_WIDTH,
    maxX: originCell.x + (step.maxX - originPixelX) / SCREEN_WIDTH,
    minY: originCell.y + (step.minY - originPixelY) / SCREEN_HEIGHT,
    maxY: originCell.y + (step.maxY - originPixelY) / SCREEN_HEIGHT,
  }));
}

/**
 * A staircase's two real door pixel centres, computed once, here, at
 * placement time, and carried on `FloorPlanRoom` as plain data
 * (`doorCentres`) — the same "computed once, upstream" shape
 * `staircaseMinimapRects` above already uses, applied to the sibling
 * consumer that needs a staircase's doors instead of its walkable shape
 * (#117: `app/main.ts`'s `hiddenDoorsFor`/`crackHintsFor` used to import
 * `compileStaircaseRoom` themselves just to read these two points).
 *
 * Unlike `staircaseMinimapRects`, this needs no `originCell`: a door's
 * pixel centre is entirely local to the compiled room's own geometry
 * (`ROOM_MARGIN_X`/`ROOM_MARGIN_Y` plus the template's steps), never a
 * function of where the room ends up on the floor grid.
 */
function staircaseDoorCentres(
  template: StaircaseContentTemplate,
): readonly { readonly direction: DoorDirection; readonly x: number; readonly y: number }[] {
  const compiled = compileStaircaseRoom(template);
  return [
    { direction: compiled.startDoor.direction, x: compiled.startDoor.x, y: compiled.startDoor.y },
    { direction: compiled.endDoor.direction, x: compiled.endDoor.x, y: compiled.endDoor.y },
  ];
}

/**
 * Chance, per growth iteration, that the generator attempts a staircase
 * instead of an ordinary `RoomShape` — small and content-gated (#112): only
 * ever rolled when `staircasePool` actually has a template eligible for this
 * floor's `floorTag`, so a floor with no staircase content generates exactly
 * as it did before this existed.
 */
const STAIRCASE_CHANCE = 0.05;

/**
 * Tries to reserve `template`'s real screen-space footprint as floor-grid
 * cells, anchored so one of its two ends lands on `anchor`.
 *
 * The footprint is a *square block* of `span` × `span` cells, not just the
 * `stepCount` cells the steps themselves sit on — `span` is
 * `1 + (stepCount - 1) * STAIR_STEP_OVERLAP` cells across (the true screen-
 * space bounding box, in cell units), rounded **up**. A staircase's steps
 * overlap by a fraction of a screen (`STAIR_STEP_OVERLAP`), not a whole one,
 * so that span is very rarely a whole number of cells — rounding up over-
 * reserves rather than under, which is the safe side to be wrong on: any
 * other room placed in a cell this block doesn't strictly touch is merely a
 * missed opportunity, but placing one in a cell the real geometry *does*
 * touch would be a room the player can plainly see is impossible (#112).
 * The first step always sits at one corner of this block and the last step
 * at the diagonally opposite corner, regardless of `span` — only those two
 * corner cells ever get a door; every other cell in the block, corner or
 * interior, gets none (`doorCells`, consumed by `computeAdjacency`'s
 * `buildDoorAllowance`).
 *
 * `anchor` must have exactly one occupied neighbour (the same rule the
 * growth loop already enforces before calling this) — that neighbour's
 * direction has to match either `template.startDoor` or `template.endDoor`,
 * or there would be no door back to the room that grew this frontier cell in
 * the first place. Every other cell in the block must land in-bounds,
 * unoccupied, and (mirroring `placeShape`'s `extraCellsAreClean`) touch
 * nothing already placed. The cell just past the *far* door — see
 * `StaircasePlacement.farNeighborCell` — must also land in-bounds and
 * unoccupied, so the caller can guarantee a real room there: rejecting the
 * whole placement here, with the ordinary shape-placement fallback right
 * behind it in the growth loop, is cheaper than only discovering a
 * dead-end staircase once the whole floor fails `validateFloorPlan` and
 * the generator has to retry from scratch.
 */
function placeStaircase(
  occupied: ReadonlyMap<string, number>,
  anchor: Cell,
  template: StaircaseContentTemplate,
  radius: number,
): StaircasePlacement | null {
  const requiredDirection = DIRECTIONS.find((direction) => {
    const offset = OFFSET[direction];
    return occupied.has(cellKey({ x: anchor.x + offset.x, y: anchor.y + offset.y }));
  });
  if (requiredDirection === undefined) {
    return null;
  }

  const span = Math.max(1, Math.ceil(1 + (template.stepCount - 1) * STAIR_STEP_OVERLAP));
  const lastIndex = span - 1;
  const anchorCorner =
    template.startDoor === requiredDirection
      ? 0
      : template.endDoor === requiredDirection
        ? lastIndex
        : null;
  if (anchorCorner === null) {
    return null;
  }

  const sign = STEP_SIGN[template.direction];
  const originCell: Cell = {
    x: anchor.x - anchorCorner * sign.x,
    y: anchor.y - anchorCorner * sign.y,
  };
  const cells: Cell[] = [];
  for (let row = 0; row < span; row++) {
    for (let col = 0; col < span; col++) {
      cells.push({ x: originCell.x + col * sign.x, y: originCell.y + row * sign.y });
    }
  }
  // Row-major, so the start corner (row 0, col 0) is always index 0 and the
  // end corner (row `lastIndex`, col `lastIndex`) is always the last index —
  // true whichever corner `anchor` itself landed on.
  const startCellIndex = 0;
  const endCellIndex = cells.length - 1;
  const anchorCellIndex = anchorCorner === 0 ? startCellIndex : endCellIndex;

  if (!cells.every((cell) => inBounds(cell, radius))) {
    return null;
  }
  if (cells.some((cell) => occupied.has(cellKey(cell)))) {
    return null;
  }
  const extraCellsAreClean = cells
    .filter((_cell, index) => index !== anchorCellIndex)
    .every((cell) => neighborCount(occupied, cell) === 0);
  if (!extraCellsAreClean) {
    return null;
  }

  const farCellIndex = anchorCellIndex === startCellIndex ? endCellIndex : startCellIndex;
  const farDoor = anchorCellIndex === startCellIndex ? template.endDoor : template.startDoor;
  const farCell = cells[farCellIndex];
  if (farCell === undefined) {
    return null;
  }
  const farOffset = OFFSET[farDoor];
  const farNeighborCell: Cell = { x: farCell.x + farOffset.x, y: farCell.y + farOffset.y };
  if (!inBounds(farNeighborCell, radius) || occupied.has(cellKey(farNeighborCell))) {
    return null;
  }

  return {
    cells,
    doorCells: [
      { cellIndex: startCellIndex, direction: template.startDoor },
      { cellIndex: endCellIndex, direction: template.endDoor },
    ],
    minimapRects: staircaseMinimapRects(originCell, template),
    doorCentres: staircaseDoorCentres(template),
    farNeighborCell,
  };
}

/**
 * Grows the floor outward from `{0, 0}` one room at a time.
 *
 * A frontier of open cells (adjacent to something already placed) is drawn
 * from at random; a cell already occupied, out of bounds, or bordering more
 * than one existing room is dropped rather than retried, which is what keeps
 * a floor a branching shape instead of a blob — see the acceptance criterion
 * on #20 that a floor has "a recognisable shape rather than always sprawling
 * into a blob".
 */
function buildSkeleton(
  rng: Rng,
  config: FloorConfig,
  targetCount: number,
  staircasePool: readonly StaircaseContentTemplate[],
): Skeleton | null {
  const occupied = new Map<string, number>();
  const rooms: PlacedRoom[] = [];
  const frontier: Cell[] = [];

  const eligibleStaircases = staircasePool.filter((template) =>
    template.floorTags.includes(config.floorTag),
  );

  const place = (
    cells: readonly Cell[],
    shape: RoomShape | 'staircase',
    staircase?: {
      readonly templateId: string;
      readonly doorCells: StaircasePlacement['doorCells'];
      readonly minimapRects: StaircasePlacement['minimapRects'];
      readonly doorCentres: StaircasePlacement['doorCentres'];
    },
  ): void => {
    const index = rooms.length;
    rooms.push({
      id: `r${String(index)}`,
      cells,
      shape,
      ...(staircase === undefined
        ? {}
        : {
            staircaseTemplateId: staircase.templateId,
            doorCells: staircase.doorCells,
            minimapRects: staircase.minimapRects,
            doorCentres: staircase.doorCentres,
          }),
    });
    for (const cell of cells) {
      occupied.set(cellKey(cell), index);
    }
    for (const cell of cells) {
      for (const direction of DIRECTIONS) {
        const offset = OFFSET[direction];
        const neighbor = { x: cell.x + offset.x, y: cell.y + offset.y };
        if (!occupied.has(cellKey(neighbor))) {
          frontier.push(neighbor);
        }
      }
    }
  };

  place([{ x: 0, y: 0 }], '1x1');

  let iterations = 0;
  while (rooms.length < targetCount && frontier.length > 0 && iterations < MAX_GROWTH_ITERATIONS) {
    iterations += 1;
    const drawIndex = rng.nextInt(0, frontier.length);
    const anchor = frontier[drawIndex];
    const last = frontier.pop();
    if (anchor === undefined) {
      continue;
    }
    if (last !== undefined && drawIndex < frontier.length) {
      frontier[drawIndex] = last;
    }

    if (occupied.has(cellKey(anchor)) || !inBounds(anchor, config.gridRadius)) {
      continue;
    }
    if (neighborCount(occupied, anchor) > 1) {
      continue;
    }

    let placedStaircase = false;
    if (eligibleStaircases.length > 0 && rng.chance(STAIRCASE_CHANCE)) {
      const template = rng.weightedPick(
        eligibleStaircases.map((candidate) => ({ value: candidate, weight: candidate.weight })),
      );
      const staircasePlacement = placeStaircase(occupied, anchor, template, config.gridRadius);
      if (staircasePlacement !== null) {
        place(staircasePlacement.cells, 'staircase', {
          templateId: template.id,
          doorCells: staircasePlacement.doorCells,
          minimapRects: staircasePlacement.minimapRects,
          doorCentres: staircasePlacement.doorCentres,
        });
        // The near end already has a real neighbour — that's `anchor`,
        // where this staircase grew from. Guarantee one at the far end too
        // (`placeStaircase` already checked the cell is free and in
        // bounds), rather than leaving it to whatever the rest of growth
        // happens to do — see `StaircasePlacement.farNeighborCell`.
        place([staircasePlacement.farNeighborCell], '1x1');
        placedStaircase = true;
      }
    }
    if (placedStaircase) {
      continue;
    }

    const shape = chooseShape(rng);
    const footprint = placeShape(rng, occupied, anchor, shape, config.gridRadius);
    if (footprint !== null) {
      place(footprint, shape);
    } else {
      place([anchor], '1x1');
    }
  }

  return rooms.length >= MIN_ROOMS_FOR_ROLES ? { rooms, occupied } : null;
}

/** Every open cell adjacent to something placed, and how many distinct rooms it touches. */
function openCellTouchCounts(
  rooms: readonly PlacedRoom[],
  occupied: ReadonlyMap<string, number>,
  radius: number,
): { cell: Cell; touching: number }[] {
  const results: { cell: Cell; touching: number }[] = [];
  const seen = new Set<string>();

  for (const room of rooms) {
    for (const cell of room.cells) {
      for (const direction of DIRECTIONS) {
        const offset = OFFSET[direction];
        const candidate = { x: cell.x + offset.x, y: cell.y + offset.y };
        const key = cellKey(candidate);
        if (occupied.has(key) || seen.has(key) || !inBounds(candidate, radius)) {
          continue;
        }
        seen.add(key);

        const touchingRooms = new Set<number>();
        for (const scanDirection of DIRECTIONS) {
          const scanOffset = OFFSET[scanDirection];
          const owner = occupied.get(
            cellKey({ x: candidate.x + scanOffset.x, y: candidate.y + scanOffset.y }),
          );
          if (owner !== undefined) {
            touchingRooms.add(owner);
          }
        }
        results.push({ cell: candidate, touching: touchingRooms.size });
      }
    }
  }

  return results;
}

/**
 * Minimum distinct rooms a secret room's cell must touch. `docs/GAME_DESIGN.md`
 * §4 wants secret rooms "adjacent to as many rooms as possible"; the floor's
 * acceptance criteria on #23 sharpen that to a hard floor of two, so a secret
 * room is never a simple dead-end off a single corridor.
 */
const MIN_SECRET_ROOM_TOUCHING = 2;

/**
 * Finds the free cell touching the most distinct rooms — at least
 * `MIN_SECRET_ROOM_TOUCHING`, or generation retries — and claims it as the
 * secret room. Connected via a bombable wall rather than a normal door; see
 * `GameSim`'s `bombableWalls` (`sim/game/sim.ts`) for the reveal mechanic
 * this placement feeds.
 */
function placeSecretRoom(
  rooms: PlacedRoom[],
  occupied: Map<string, number>,
  radius: number,
): string | null {
  let best: { cell: Cell; touching: number } | null = null;
  for (const candidate of openCellTouchCounts(rooms, occupied, radius)) {
    if (best === null || candidate.touching > best.touching) {
      best = candidate;
    }
  }

  if (best === null || best.touching < MIN_SECRET_ROOM_TOUCHING) {
    return null;
  }
  const index = rooms.length;
  const id = `r${String(index)}`;
  rooms.push({ id, cells: [best.cell], shape: '1x1' });
  occupied.set(cellKey(best.cell), index);
  return id;
}

/**
 * Finds the free cell touching the *fewest* distinct rooms — a plain dead
 * end, ideally touching only one — and claims it as the supersecret room.
 * "Deliberately obnoxious to find" (#23) is exactly the mirror of
 * `placeSecretRoom`'s "as many rooms as possible": the least-connected spot
 * on the floor, so it never sits somewhere a player stumbles into it while
 * exploring normally. Excludes cells adjacent to the already-placed secret
 * room's own cell, so the two special rooms don't stack next to each other.
 */
function placeSupersecretRoom(
  rooms: PlacedRoom[],
  occupied: Map<string, number>,
  radius: number,
  secretCell: Cell | null,
): string | null {
  const excluded = new Set<string>();
  if (secretCell !== null) {
    excluded.add(cellKey(secretCell));
    for (const direction of DIRECTIONS) {
      const offset = OFFSET[direction];
      excluded.add(cellKey({ x: secretCell.x + offset.x, y: secretCell.y + offset.y }));
    }
  }

  let best: { cell: Cell; touching: number } | null = null;
  for (const candidate of openCellTouchCounts(rooms, occupied, radius)) {
    if (excluded.has(cellKey(candidate.cell))) {
      continue;
    }
    if (best === null || candidate.touching < best.touching) {
      best = candidate;
    }
  }

  if (best === null) {
    return null;
  }
  const index = rooms.length;
  const id = `r${String(index)}`;
  rooms.push({ id, cells: [best.cell], shape: '1x1' });
  occupied.set(cellKey(best.cell), index);
  return id;
}

const OPPOSITE_DIRECTION: Readonly<Record<DoorDirection, DoorDirection>> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

/**
 * Which directions a cell is allowed a door on.
 *
 * A staircase's cells (#112) get an explicit, near-empty set built from
 * their `doorCells`: only its start and end step, only the one fixed
 * direction each was authored with — every other step, and every other
 * direction on those two, allows none.
 *
 * Every other room gets every direction *except* one that points into that
 * room's own void cell (`L`'s dropped corner, `T`'s four, #107) —
 * `compileRoomTemplate` drops any door there unconditionally (see
 * `template.ts`'s own comment on that), so registering one here would be a
 * graph edge the compiled room can never actually open: `crossDoor`
 * (`app/main.ts`) would still walk the player through it — the *source*
 * room's own door is real, only the destination's isn't — landing them at
 * an `entryCell` on a wall that was never really there, with no way back.
 * This is the same rule the minimap already re-derives independently
 * (`render/minimap-hud.ts`'s `doorSurvivesCompile`) to avoid *revealing*
 * such a connection; this is what stops the floor plan from ever offering
 * one to walk through in the first place, `computeVoidCells` being the one
 * shared source of "void" both now agree with (see that function's own
 * comment — this exact class of bug, graph and compiled reality drifting
 * apart, already shipped once via the minimap alone).
 */
function buildDoorAllowance(rooms: readonly PlacedRoom[]): Map<string, ReadonlySet<DoorDirection>> {
  const allowance = new Map<string, ReadonlySet<DoorDirection>>();
  for (const room of rooms) {
    if (room.doorCells !== undefined) {
      room.cells.forEach((cell, cellIndex) => {
        const allowed = new Set<DoorDirection>(
          room.doorCells
            ?.filter((door) => door.cellIndex === cellIndex)
            .map((door) => door.direction) ?? [],
        );
        allowance.set(cellKey(cell), allowed);
      });
      continue;
    }
    const voidKeys = new Set(computeVoidCells(room.cells).map(cellKey));
    for (const cell of room.cells) {
      const allowed = new Set<DoorDirection>(
        DIRECTIONS.filter((direction) => {
          const offset = OFFSET[direction];
          return !voidKeys.has(cellKey({ x: cell.x + offset.x, y: cell.y + offset.y }));
        }),
      );
      allowance.set(cellKey(cell), allowed);
    }
  }
  return allowance;
}

/**
 * Doors, derived from cell adjacency rather than tracked during growth — a
 * room's connections can grow after it is placed (the secret room attaches to
 * whatever it lands next to, and a later branch can end up beside an earlier
 * one), so this is computed once, after the grid is final, rather than kept
 * incrementally correct through every mutation.
 *
 * One entry per `(cell, direction)` pair that actually borders a different
 * room *and* that both sides allow (`buildDoorAllowance`) — a multi-cell
 * room's own cells never produce one against each other, since they share
 * `room.id` and are filtered out below, which is exactly what "no wall
 * between glued sub-rooms" falls out of: there was never a door there to
 * draw in the first place. A staircase's interior steps, and every direction
 * but one on its start/end steps, are the other way a pair can touch without
 * a door: both cells are real, occupied, and adjacent, but the allowance map
 * says no — that reads as an ordinary solid wall (`render/room.ts` only ever
 * draws a door where one is compiled, never assumes one from geometry alone).
 */
function computeAdjacency(rooms: readonly PlacedRoom[]): Map<string, RoomDoor[]> {
  const owner = new Map<string, string>();
  for (const room of rooms) {
    for (const cell of room.cells) {
      owner.set(cellKey(cell), room.id);
    }
  }
  const allowance = buildDoorAllowance(rooms);
  const isAllowed = (cell: Cell, direction: DoorDirection): boolean =>
    allowance.get(cellKey(cell))?.has(direction) ?? true;

  const info = new Map<string, RoomDoor[]>();
  for (const room of rooms) {
    const doors: RoomDoor[] = [];
    room.cells.forEach((cell, cellIndex) => {
      for (const direction of DIRECTIONS) {
        if (!isAllowed(cell, direction)) {
          continue;
        }
        const offset = OFFSET[direction];
        const neighbor = { x: cell.x + offset.x, y: cell.y + offset.y };
        const neighborRoomId = owner.get(cellKey(neighbor));
        if (
          neighborRoomId !== undefined &&
          neighborRoomId !== room.id &&
          isAllowed(neighbor, OPPOSITE_DIRECTION[direction])
        ) {
          doors.push({ cellIndex, direction, neighborRoomId });
        }
      }
    });
    info.set(room.id, doors);
  }
  return info;
}

function bfsDistances(
  startId: string,
  adjacency: ReadonlyMap<string, readonly RoomDoor[]>,
): Map<string, number> {
  const distances = new Map<string, number>([[startId, 0]]);
  const queue = [startId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) {
      continue;
    }
    const currentDistance = distances.get(current);
    const doors = adjacency.get(current);
    if (doors === undefined || currentDistance === undefined) {
      continue;
    }
    for (const neighborId of neighborRoomIds(doors)) {
      if (!distances.has(neighborId)) {
        distances.set(neighborId, currentDistance + 1);
        queue.push(neighborId);
      }
    }
  }
  return distances;
}

function distinctNeighborCount(doors: readonly RoomDoor[] | undefined): number {
  return doors === undefined ? 0 : neighborRoomIds(doors).length;
}

/**
 * Assigns roles by the rules in `docs/GAME_DESIGN.md` §4: boss at maximum
 * distance, treasure and shop preferring dead ends. Returns `null` when the
 * skeleton is too thin to hold every required role — `tryGenerateFloor`
 * reads that as "retry", not as a bug.
 *
 * `secretId`/`supersecretId` are always already placed by the time this runs
 * (`placeSecretRoom`/`placeSupersecretRoom`, called earlier in
 * `tryGenerateFloor`) — a floor with nowhere to put either is itself a retry,
 * not something this function papers over by relabelling an ordinary room.
 */
function assignRoles(
  rooms: readonly PlacedRoom[],
  adjacency: ReadonlyMap<string, readonly RoomDoor[]>,
  distances: ReadonlyMap<string, number>,
  startId: string,
  secretId: string,
  supersecretId: string,
): Map<string, RoomRole> | null {
  const roles = new Map<string, RoomRole>([
    [startId, 'start'],
    [secretId, 'secret'],
    [supersecretId, 'supersecret'],
  ]);

  const distanceOf = (id: string): number => distances.get(id) ?? 0;
  const degreeOf = (id: string): number => distinctNeighborCount(adjacency.get(id));
  const byFarthestFirst = (a: PlacedRoom, b: PlacedRoom): number =>
    distanceOf(b.id) - distanceOf(a.id);

  const candidates = rooms.filter(
    (room) =>
      room.id !== startId &&
      room.id !== secretId &&
      room.id !== supersecretId &&
      // A staircase (#112) carries no room content and only two, direction-
      // fixed doors — it can never stand in for a boss/treasure/shop slot,
      // which `eligibleTemplates` would need a matching authored template for.
      room.staircaseTemplateId === undefined,
  );
  const deadEnds = candidates.filter((room) => degreeOf(room.id) === 1);

  const bossPool = (deadEnds.length > 0 ? deadEnds : candidates).slice().sort(byFarthestFirst);
  const boss = bossPool[0];
  if (boss === undefined) {
    return null;
  }
  roles.set(boss.id, 'boss');

  const remaining = candidates.filter((room) => room.id !== boss.id);
  const remainingDeadEnds = remaining
    .filter((room) => degreeOf(room.id) === 1)
    .sort(byFarthestFirst);
  const remainingRest = remaining.filter((room) => degreeOf(room.id) !== 1).sort(byFarthestFirst);
  const specialPool = [...remainingDeadEnds, ...remainingRest];

  const treasure = specialPool[0];
  const shop = specialPool[1];
  if (treasure === undefined || shop === undefined) {
    return null;
  }
  roles.set(treasure.id, 'treasure');
  roles.set(shop.id, 'shop');

  for (const room of rooms) {
    if (!roles.has(room.id)) {
      roles.set(room.id, 'normal');
    }
  }
  return roles;
}

/** The template `specialRole` a room's `role` requires — `undefined` for a generic template. */
function requiredSpecialRole(role: RoomRole): RoomTemplate['metadata']['specialRole'] {
  return role === 'boss' ||
    role === 'treasure' ||
    role === 'shop' ||
    role === 'secret' ||
    role === 'supersecret'
    ? role
    : undefined;
}

/**
 * Templates that fit a slot: right shape, right floor tag, right special
 * role, and — `1x1` only — a door wherever the slot's single cell needs one.
 *
 * A multi-cell template carries no door metadata to check against: its doors
 * are derived entirely from the real floor-grid adjacency at load time
 * (#100), never authored, so shape, floor tag and special role are the whole
 * test.
 */
function eligibleTemplates(
  pool: readonly RoomTemplate[],
  shape: RoomShape,
  floorTag: string,
  doors: readonly RoomDoor[],
  role: RoomRole,
): RoomTemplate[] {
  const specialRole = requiredSpecialRole(role);
  const neededDirections = new Set(doors.map((door) => door.direction));
  return pool.filter((template) => {
    if (
      template.metadata.shape !== shape ||
      !template.metadata.floorTags.includes(floorTag) ||
      template.metadata.specialRole !== specialRole
    ) {
      return false;
    }
    if (isMultiCellRoomTemplate(template)) {
      return true;
    }
    return DIRECTIONS.every(
      (direction) => !neededDirections.has(direction) || template.metadata.doors[direction],
    );
  });
}

function tryGenerateFloor(
  rng: Rng,
  config: FloorConfig,
  templatePool: readonly RoomTemplate[],
  staircasePool: readonly StaircaseContentTemplate[],
): FloorPlan | null {
  const targetCount = rng.nextInt(config.minRooms, config.maxRooms + 1) - 1;
  const skeleton = buildSkeleton(
    rng,
    config,
    Math.max(targetCount, MIN_ROOMS_FOR_ROLES),
    staircasePool,
  );
  if (skeleton === null) {
    return null;
  }
  const { rooms, occupied } = skeleton;

  const secretId = placeSecretRoom(rooms, occupied, config.gridRadius);
  if (secretId === null) {
    return null;
  }
  const secretCell = rooms.find((room) => room.id === secretId)?.cells[0] ?? null;
  const supersecretId = placeSupersecretRoom(rooms, occupied, config.gridRadius, secretCell);
  if (supersecretId === null) {
    return null;
  }

  const adjacency = computeAdjacency(rooms);
  const startId = rooms[0]?.id;
  if (startId === undefined) {
    return null;
  }

  const distances = bfsDistances(startId, adjacency);
  if (distances.size !== rooms.length) {
    return null;
  }

  const roles = assignRoles(rooms, adjacency, distances, startId, secretId, supersecretId);
  if (roles === null) {
    return null;
  }

  const planRooms: FloorPlanRoom[] = [];
  for (const room of rooms) {
    const doors = adjacency.get(room.id);
    const role = roles.get(room.id);
    if (doors === undefined || role === undefined) {
      return null;
    }
    // A staircase's template was already resolved at placement time
    // (`buildSkeleton`'s `place` call) — it draws from `staircasePool`, not
    // `templatePool`, and has no shape/door metadata `eligibleTemplates`
    // could match against.
    let templateId: string;
    if (room.staircaseTemplateId !== undefined) {
      templateId = room.staircaseTemplateId;
    } else {
      const eligible = eligibleTemplates(
        templatePool,
        room.shape as RoomShape,
        config.floorTag,
        doors,
        role,
      );
      if (eligible.length === 0) {
        return null;
      }
      templateId = rng.weightedPick(
        eligible.map((template) => ({ value: template.id, weight: template.metadata.weight })),
      );
    }
    planRooms.push({
      id: room.id,
      cells: room.cells,
      shape: room.shape,
      role,
      doors,
      distanceFromStart: distances.get(room.id) ?? 0,
      templateId,
      ...(room.staircaseTemplateId === undefined
        ? {}
        : {
            staircaseTemplateId: room.staircaseTemplateId,
            minimapRects: room.minimapRects,
            doorCentres: room.doorCentres,
          }),
    });
  }

  const findRole = (role: RoomRole): string | undefined =>
    planRooms.find((room) => room.role === role)?.id;
  const bossRoomId = findRole('boss');
  const treasureRoomId = findRole('treasure');
  const shopRoomId = findRole('shop');
  const secretRoomId = findRole('secret');
  const supersecretRoomId = findRole('supersecret');
  if (
    bossRoomId === undefined ||
    treasureRoomId === undefined ||
    shopRoomId === undefined ||
    secretRoomId === undefined ||
    supersecretRoomId === undefined
  ) {
    return null;
  }

  const plan: FloorPlan = {
    floor: config.floor,
    floorName: config.name,
    startRoomId: startId,
    bossRoomId,
    treasureRoomId,
    shopRoomId,
    secretRoomId,
    supersecretRoomId,
    rooms: planRooms,
  };

  return validateFloorPlan(plan).length === 0 ? plan : null;
}

/**
 * Generates a floor from `config`, retrying on the same `rng` until a layout
 * passes `validateFloorPlan`, or throwing once `MAX_GENERATION_ATTEMPTS` is
 * spent.
 *
 * `rng` should be the run's `RngStream.Floor` stream (see
 * `src/sim/rng/streams.ts`) — a system draws from its own stream only, and a
 * run generates all seven floors off the same one, in order, across the run.
 */
export function generateFloor(
  rng: Rng,
  config: FloorConfig,
  templatePool: readonly RoomTemplate[],
  staircasePool: readonly StaircaseContentTemplate[] = [],
): FloorPlan {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const plan = tryGenerateFloor(rng, config, templatePool, staircasePool);
    if (plan !== null) {
      return plan;
    }
  }
  throw new Error(
    `floor ${String(config.floor)} (${config.name}) failed to generate a valid layout ` +
      `after ${String(MAX_GENERATION_ATTEMPTS)} attempts`,
  );
}

/**
 * Re-derives every invariant a generated floor must hold, independently of
 * how it was built. Returns the list of violations — empty means valid.
 *
 * Passing `templatePool` additionally checks that every room's chosen
 * template actually fits its slot (shape and door superset) — the
 * acceptance criterion on #20 that "no template [is] placed in a slot whose
 * doors it does not match".
 */
export function validateFloorPlan(
  plan: FloorPlan,
  templatePool?: readonly RoomTemplate[],
): string[] {
  const problems: string[] = [];
  const byId = new Map(plan.rooms.map((room) => [room.id, room] as const));

  const cellOwners = new Map<string, string>();
  for (const room of plan.rooms) {
    for (const cell of room.cells) {
      const key = cellKey(cell);
      const existing = cellOwners.get(key);
      if (existing !== undefined) {
        problems.push(`cell ${key} is claimed by both ${existing} and ${room.id}`);
      }
      cellOwners.set(key, room.id);
    }
  }

  const visited = new Set<string>([plan.startRoomId]);
  const queue = [plan.startRoomId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) {
      continue;
    }
    const room = byId.get(current);
    if (room === undefined) {
      continue;
    }
    for (const neighborId of neighborRoomIds(room.doors)) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
  }
  for (const room of plan.rooms) {
    if (!visited.has(room.id)) {
      problems.push(`room ${room.id} is not reachable from the start room`);
    }
  }

  const bossRoom = byId.get(plan.bossRoomId);
  const maxDistance = plan.rooms.reduce((max, room) => Math.max(max, room.distanceFromStart), 0);
  if (bossRoom?.distanceFromStart !== maxDistance) {
    problems.push("boss room is not at the floor's maximum walking distance from start");
  }

  const roleCounts = new Map<RoomRole, number>();
  for (const room of plan.rooms) {
    roleCounts.set(room.role, (roleCounts.get(room.role) ?? 0) + 1);
  }
  for (const role of ['start', 'boss', 'treasure', 'shop', 'secret', 'supersecret'] as const) {
    if ((roleCounts.get(role) ?? 0) !== 1) {
      problems.push(
        `floor must have exactly one ${role} room, has ${String(roleCounts.get(role) ?? 0)}`,
      );
    }
  }

  const secretRoom = byId.get(plan.secretRoomId);
  const secretTouching = neighborRoomIds(secretRoom?.doors ?? []).length;
  if (secretTouching < MIN_SECRET_ROOM_TOUCHING) {
    problems.push(
      `secret room ${plan.secretRoomId} touches only ${String(secretTouching)} room(s), ` +
        `needs at least ${String(MIN_SECRET_ROOM_TOUCHING)}`,
    );
  }

  if (templatePool !== undefined) {
    const templatesById = new Map(templatePool.map((template) => [template.id, template] as const));
    for (const room of plan.rooms) {
      // A staircase room's template lives in the caller's staircase pool, not
      // `templatePool` — nothing to cross-check here (`docs/DECISIONS.md` #12).
      if (room.staircaseTemplateId !== undefined) {
        continue;
      }
      const template = templatesById.get(room.templateId);
      if (template === undefined) {
        problems.push(`room ${room.id} references unknown template "${room.templateId}"`);
        continue;
      }
      if (template.metadata.shape !== room.shape) {
        problems.push(
          `room ${room.id} is shape ${room.shape} but its template "${room.templateId}" is ${template.metadata.shape}`,
        );
      }
      if (template.metadata.specialRole !== requiredSpecialRole(room.role)) {
        problems.push(
          `room ${room.id} has role ${room.role} but its template "${room.templateId}" ` +
            `declares specialRole ${String(template.metadata.specialRole)}`,
        );
      }
      // Only a `1x1` template authors doors at all (#100) — a multi-cell
      // room's doors are derived from the real floor-grid adjacency, so they
      // always match by construction and there is nothing to check here.
      if (template.metadata.shape === '1x1') {
        const neededDirections = new Set(room.doors.map((door) => door.direction));
        for (const direction of DIRECTIONS) {
          if (neededDirections.has(direction) && !template.metadata.doors[direction]) {
            problems.push(
              `room ${room.id} needs a ${direction} door but template "${room.templateId}" does not have one`,
            );
          }
        }
      }
    }
  }

  return problems;
}
