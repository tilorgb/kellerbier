/**
 * A diagonal staircase room (#112): a hand-placed set-piece room, not a
 * `RoomShape`. See `docs/DECISIONS.md` #11 for the full reasoning; the short
 * version:
 *
 * - It is never chosen or placed by the floor generator (`sim/room/floor-plan.ts`'s
 *   `chooseShape`/`placeShape`/`computeAdjacency` never see it) — every part of
 *   that system assumes axis-aligned floor-grid-cell adjacency, which a
 *   diagonal run of screens does not have.
 * - Its interior is the *union* of overlapping per-step screen rects, not a
 *   bounding box minus voids — see `RoomGeometry.stepRects`. Consecutive
 *   steps overlap by half a screen on each axis, which is real shared edge
 *   area (unlike two floor-grid cells touching corner-to-corner) and needs no
 *   `voidRects`/blocks to carve an exclusion out of a bounding box, so it
 *   never touches `MAX_ROOM_BLOCKS`.
 * - Doors exist only on the first and last step, each restricted to the two
 *   wall edges of that step which the interior overlap never reaches — see
 *   `START_FREE_DOORS`/`END_FREE_DOORS`.
 */

import type { DoorDirection } from '../../content/rooms/definition.js';
import { ROOM_MARGIN_X, ROOM_MARGIN_Y, SCREEN_HEIGHT, SCREEN_WIDTH } from './template.js';
import { RoomGeometry, type RoomRect } from './geometry.js';

/**
 * Which way each step moves from the previous one. `up`/`down` are screen
 * space (`down` is positive `y`), matching every other room-geometry
 * coordinate in this codebase.
 */
export type StaircaseDirection = 'up-right' | 'up-left' | 'down-right' | 'down-left';

/** Overlap between consecutive steps, as a fraction of a screen on each axis. */
export const STAIR_STEP_OVERLAP = 0.5;

/**
 * Which way each step moves from the previous one, as a unit cell offset.
 * Exported so the floor generator (`sim/room/floor-plan.ts`) can lay a
 * staircase's cells out along the same diagonal its own screen geometry
 * uses, without duplicating the four directions' signs.
 */
export const STEP_SIGN: Readonly<
  Record<StaircaseDirection, { readonly x: 1 | -1; readonly y: 1 | -1 }>
> = {
  'up-right': { x: 1, y: -1 },
  'up-left': { x: -1, y: -1 },
  'down-right': { x: 1, y: 1 },
  'down-left': { x: -1, y: 1 },
};

/**
 * The two wall edges of the *first* step that the interior overlap never
 * touches, per direction — the only edges safe for `startDoor`. The other
 * two edges are partially consumed by the seam to the second step: a door's
 * fixed `DOOR_SPAN` gap centred on the edge has no way to dodge that, so
 * `compileStaircaseRoom` rejects it outright rather than authoring a door
 * that opens onto still-interior floor on one side.
 */
const START_FREE_DOORS: Readonly<Record<StaircaseDirection, readonly DoorDirection[]>> = {
  'up-right': ['west', 'south'],
  'up-left': ['east', 'south'],
  'down-right': ['west', 'north'],
  'down-left': ['east', 'north'],
};

/** Same as `START_FREE_DOORS`, mirrored for the *last* step. */
const END_FREE_DOORS: Readonly<Record<StaircaseDirection, readonly DoorDirection[]>> = {
  'up-right': ['east', 'north'],
  'up-left': ['west', 'north'],
  'down-right': ['east', 'south'],
  'down-left': ['west', 'south'],
};

export interface StaircaseRoomTemplate {
  readonly id: string;
  /** Number of screens the stair spans. Two is the minimum that has a seam at all. */
  readonly stepCount: number;
  readonly direction: StaircaseDirection;
  /** Door on the first step — must be one of `START_FREE_DOORS[direction]`. */
  readonly startDoor: DoorDirection;
  /** Door on the last step — must be one of `END_FREE_DOORS[direction]`. */
  readonly endDoor: DoorDirection;
}

/**
 * The content-authoring format for a staircase (#112's generator-placement
 * follow-up): everything `StaircaseRoomTemplate` needs to compile, plus the
 * same `floorTags`/`weight` metadata `RoomTemplate.metadata` carries — the
 * floor generator (`sim/room/floor-plan.ts`) needs both to pick a staircase
 * for a given floor's `floorTag` the same way it already picks a `RoomShape`
 * template.
 */
export interface StaircaseContentTemplate extends StaircaseRoomTemplate {
  readonly floorTags: readonly string[];
  readonly weight: number;
}

/**
 * Validates raw JSON content into a `StaircaseContentTemplate`. Mirrors
 * `template.ts`'s `validateRoomTemplate` for the metadata fields every
 * authored room shares (`id`/`floorTags`/`weight`); the staircase-specific
 * fields (`stepCount`/`direction`/`startDoor`/`endDoor`) are validated by
 * `compileStaircaseRoom` itself, called once here so there is exactly one
 * place those rules live rather than a second copy — except `stepCount`'s
 * parity, which only matters *here*, for the generator-placement path (see
 * below), not for a hand-placed staircase compiled directly.
 *
 * `stepCount` must be **even** (#118). `floor-plan.ts`'s `placeStaircase`
 * reserves the real, exact fractional footprint now — no rounding — as a
 * grid of `STAIR_STEP_OVERLAP`-sized reservation sub-cells, with the
 * staircase's two real doors sitting `stepCount * STAIR_STEP_OVERLAP` cells
 * apart. Both doors have to land back on the ordinary integer cell grid —
 * they are real rooms, bordering a real neighbour — which only happens when
 * that offset is a whole number of cells, true iff `stepCount` is even,
 * given `STAIR_STEP_OVERLAP` is `0.5`. Get that wrong and one of the two
 * doors would sit half a cell off the grid, with no real room there for it
 * to open into.
 */
export function validateStaircaseTemplate(
  value: unknown,
  source = 'staircase template',
): StaircaseContentTemplate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${source} must be an object`);
  }
  const record = value as Record<string, unknown>;

  const id = record.id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`${source}.id must be a non-empty string`);
  }

  if (typeof record.stepCount === 'number' && record.stepCount % 2 !== 0) {
    throw new Error(
      `${source}.stepCount must be even (got ${String(record.stepCount)}) — an odd stepCount ` +
        `leaves one of the staircase's two doors half a cell off the ordinary floor-grid, ` +
        `with no real room there for it to open into`,
    );
  }

  const floorTags = record.floorTags;
  if (
    !Array.isArray(floorTags) ||
    floorTags.length === 0 ||
    floorTags.some((tag) => typeof tag !== 'string')
  ) {
    throw new Error(`${source}.floorTags must be a non-empty array of strings`);
  }

  const weight = record.weight;
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    throw new Error(`${source}.weight must be a finite number greater than zero`);
  }

  const template: StaircaseRoomTemplate = {
    id,
    stepCount: record.stepCount as number,
    direction: record.direction as StaircaseDirection,
    startDoor: record.startDoor as DoorDirection,
    endDoor: record.endDoor as DoorDirection,
  };
  // Throws with a descriptive message on anything wrong with the
  // staircase-specific fields — the one source of truth for those rules.
  compileStaircaseRoom(template);

  return { ...template, floorTags: floorTags as readonly string[], weight };
}

export interface CompiledStaircaseDoor {
  readonly direction: DoorDirection;
  readonly x: number;
  readonly y: number;
}

export interface CompiledStaircaseRoom {
  readonly source: StaircaseRoomTemplate;
  readonly geometry: RoomGeometry;
  readonly startDoor: CompiledStaircaseDoor;
  readonly endDoor: CompiledStaircaseDoor;
  /**
   * Always empty for now — no staircase content has been authored with any
   * of this yet (#112's own scope note). Present purely so `GameSim.loadRoom`
   * can iterate a staircase's compiled room the same way it iterates a
   * `CompiledRoomTemplate`'s, without a separate code path for "has no
   * content."
   */
  readonly enemySpawns: readonly {
    readonly x: number;
    readonly y: number;
    readonly enemyId: string;
  }[];
  readonly pickupSpawns: readonly {
    readonly x: number;
    readonly y: number;
    readonly type: string;
    readonly price?: number;
  }[];
  readonly decorativeProps: readonly {
    readonly x: number;
    readonly y: number;
    readonly type: string;
    readonly rotation?: number;
  }[];
  readonly hazards: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly type: string;
  }[];
}

/**
 * The two rectangles that are inside `a` and `b`'s combined bounding box but
 * outside *both* rects — real wall, not floor, even though `isClear`'s own
 * union check (below) already treats them as such.
 *
 * These are what `sim/systems/motion.ts`'s primary wall resolver
 * (`resolveAxisX`/`resolveAxisY`) actually needs: unlike every other system
 * that calls `RoomGeometry.isClear`, the player and enemy movement resolver
 * only ever consults `minX`/`maxX`/`minY`/`maxY` and `blocks` — it has no
 * idea `stepRects` exists, so without these two rects registered as real
 * blocks (`geometry.addBlock`, below), nothing stops a body from walking
 * straight through the "slack" between two steps despite `isClear` correctly
 * rejecting it as a query.
 *
 * Because consecutive steps are the same size and offset by a constant
 * diagonal step, the two gaps are always exactly the rectangle spanned
 * between the rects' near corners and the rectangle spanned between their
 * far corners — which pair of corners ("min/min + max/max" vs. "min/max +
 * max/min") depends on whether the step direction moves both axes the same
 * way or opposite ways, so this derives it from the rects themselves rather
 * than switching on `StaircaseDirection`.
 */
function seamVoidRects(a: RoomRect, b: RoomRect): RoomRect[] {
  const bboxMinX = Math.min(a.minX, b.minX);
  const bboxMaxX = Math.max(a.maxX, b.maxX);
  const bboxMinY = Math.min(a.minY, b.minY);
  const bboxMaxY = Math.max(a.maxY, b.maxY);

  const slices: readonly [minX: number, maxX: number, owner: RoomRect][] = [
    [bboxMinX, Math.max(a.minX, b.minX), a.minX < b.minX ? a : b],
    [Math.min(a.maxX, b.maxX), bboxMaxX, a.maxX > b.maxX ? a : b],
  ];

  const voids: RoomRect[] = [];
  for (const [minX, maxX, owner] of slices) {
    if (maxX <= minX) {
      continue;
    }
    if (owner.minY > bboxMinY) {
      voids.push({ minX, maxX, minY: bboxMinY, maxY: owner.minY });
    }
    if (owner.maxY < bboxMaxY) {
      voids.push({ minX, maxX, minY: owner.maxY, maxY: bboxMaxY });
    }
  }
  return voids;
}

export function compileStaircaseRoom(template: StaircaseRoomTemplate): CompiledStaircaseRoom {
  if (!Number.isInteger(template.stepCount) || template.stepCount < 2) {
    throw new Error(`staircase room ${template.id}: stepCount must be an integer >= 2`);
  }

  const allowedStart = START_FREE_DOORS[template.direction];
  if (!allowedStart.includes(template.startDoor)) {
    throw new Error(
      `staircase room ${template.id}: startDoor must be ${allowedStart.join(' or ')} for direction ${template.direction}`,
    );
  }
  const allowedEnd = END_FREE_DOORS[template.direction];
  if (!allowedEnd.includes(template.endDoor)) {
    throw new Error(
      `staircase room ${template.id}: endDoor must be ${allowedEnd.join(' or ')} for direction ${template.direction}`,
    );
  }

  const sign = STEP_SIGN[template.direction];
  const stepDeltaX = sign.x * SCREEN_WIDTH * STAIR_STEP_OVERLAP;
  const stepDeltaY = sign.y * SCREEN_HEIGHT * STAIR_STEP_OVERLAP;

  const rawSteps: RoomRect[] = [];
  for (let step = 0; step < template.stepCount; step++) {
    const stepMinX = step * stepDeltaX;
    const stepMinY = step * stepDeltaY;
    rawSteps.push({
      minX: stepMinX,
      minY: stepMinY,
      maxX: stepMinX + SCREEN_WIDTH,
      maxY: stepMinY + SCREEN_HEIGHT,
    });
  }

  // Shift so the bounding box of every step starts at the room's own margin
  // — the same convention `compileRoomTemplate` uses for its playfield.
  const boundMinX = Math.min(...rawSteps.map((rect) => rect.minX));
  const boundMinY = Math.min(...rawSteps.map((rect) => rect.minY));
  const boundMaxX = Math.max(...rawSteps.map((rect) => rect.maxX));
  const boundMaxY = Math.max(...rawSteps.map((rect) => rect.maxY));
  const shiftX = ROOM_MARGIN_X - boundMinX;
  const shiftY = ROOM_MARGIN_Y - boundMinY;
  const stepRects: RoomRect[] = rawSteps.map((rect) => ({
    minX: rect.minX + shiftX,
    minY: rect.minY + shiftY,
    maxX: rect.maxX + shiftX,
    maxY: rect.maxY + shiftY,
  }));

  const voidRects: RoomRect[] = [];
  for (let step = 0; step < stepRects.length - 1; step++) {
    const current = stepRects[step];
    const next = stepRects[step + 1];
    if (current !== undefined && next !== undefined) {
      voidRects.push(...seamVoidRects(current, next));
    }
  }

  const geometry = new RoomGeometry(
    ROOM_MARGIN_X,
    ROOM_MARGIN_Y,
    boundMaxX - boundMinX + ROOM_MARGIN_X,
    boundMaxY - boundMinY + ROOM_MARGIN_Y,
    voidRects,
    stepRects,
  );
  for (const voidRect of voidRects) {
    geometry.addBlock(voidRect.minX, voidRect.minY, voidRect.maxX, voidRect.maxY);
  }

  const firstStep = stepRects[0];
  const lastStep = stepRects[stepRects.length - 1];
  if (firstStep === undefined || lastStep === undefined) {
    throw new Error(`staircase room ${template.id}: no steps compiled`);
  }

  return {
    source: template,
    geometry,
    startDoor: { direction: template.startDoor, ...stepDoorCentre(firstStep, template.startDoor) },
    endDoor: { direction: template.endDoor, ...stepDoorCentre(lastStep, template.endDoor) },
    enemySpawns: [],
    pickupSpawns: [],
    decorativeProps: [],
    hazards: [],
  };
}

/**
 * Where a door's `DOOR_SPAN` gap is centred on one step's own edge — unlike
 * `template.ts`'s `doorCentre`, which reads the *whole room's* outer bound
 * because every multi-cell shape's door cell always sits on that bound. A
 * staircase's end steps don't: the room's bounding box is bigger than any
 * one step, so the door has to be placed against that step's own rect.
 */
function stepDoorCentre(step: RoomRect, direction: DoorDirection): { x: number; y: number } {
  const centreX = (step.minX + step.maxX) / 2;
  const centreY = (step.minY + step.maxY) / 2;
  switch (direction) {
    case 'north':
      return { x: centreX, y: step.minY };
    case 'south':
      return { x: centreX, y: step.maxY };
    case 'west':
      return { x: step.minX, y: centreY };
    case 'east':
      return { x: step.maxX, y: centreY };
  }
}
