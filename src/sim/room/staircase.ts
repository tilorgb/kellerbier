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

const STEP_SIGN: Readonly<Record<StaircaseDirection, { readonly x: 1 | -1; readonly y: 1 | -1 }>> =
  {
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

  const geometry = new RoomGeometry(
    ROOM_MARGIN_X,
    ROOM_MARGIN_Y,
    boundMaxX - boundMinX + ROOM_MARGIN_X,
    boundMaxY - boundMinY + ROOM_MARGIN_Y,
    [],
    stepRects,
  );

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
