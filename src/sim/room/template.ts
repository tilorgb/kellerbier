import {
  MULTI_CELL_COUNT,
  ROOM_COLUMNS,
  ROOM_ROWS,
  ROOM_TILE_UNITS,
  isMultiCellRoomTemplate,
  type DoorDirection,
  type MultiCellRoomShape,
  type RoomEnemyCatalog,
  type RoomSubLayout,
  type RoomTemplate,
} from '../../content/rooms/definition.js';
import { RoomGeometry } from './geometry.js';

export const ROOM_FRAME_WIDTH = 320;
export const ROOM_FRAME_HEIGHT = 180;

/** One single-screen sub-room's footprint, in room units. */
export const SCREEN_WIDTH = ROOM_COLUMNS * ROOM_TILE_UNITS;
export const SCREEN_HEIGHT = ROOM_ROWS * ROOM_TILE_UNITS;

/**
 * Fixed wall-band margin around a room's outer edge, on every side.
 *
 * Chosen so a `1x1` room's compiled geometry is unchanged from before #100:
 * `(ROOM_FRAME_WIDTH - SCREEN_WIDTH) / 2` and `(ROOM_FRAME_HEIGHT -
 * SCREEN_HEIGHT) / 2` — 40 and 18 — were previously derived by centring a
 * `1x1` template's tile grid inside the fixed one-screen frame. A multi-cell
 * room's *outer* edge gets exactly the same margin; there is none between two
 * glued sub-rooms, which is what "no wall between them" (#100) means at the
 * geometry level — there was never a margin to remove.
 */
const ROOM_MARGIN_X = (ROOM_FRAME_WIDTH - SCREEN_WIDTH) / 2;
const ROOM_MARGIN_Y = (ROOM_FRAME_HEIGHT - SCREEN_HEIGHT) / 2;

const DIRECTIONS: readonly DoorDirection[] = ['north', 'east', 'south', 'west'];
const DIRECTION_OFFSET: Readonly<Record<DoorDirection, { x: number; y: number }>> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

export interface CompiledDoor {
  readonly direction: DoorDirection;
  /** Which single-screen cell this door's wall segment belongs to, 0-indexed in the room's own local grid. */
  readonly cellCol: number;
  readonly cellRow: number;
}

/**
 * Where `door`'s `DOOR_SPAN` gap is centred, on `room`'s own boundary.
 *
 * Only the cross-axis (`x` for a north/south door, `y` for east/west) needs
 * the door's cell: the along-axis coordinate is always `room`'s own
 * min/max, because a door only ever exists on a cell that is genuinely at
 * that edge of the room — `compileRoomTemplate` never keeps a door whose
 * neighbour is another cell of the *same* room (there is nothing to open a
 * door onto), so a `north` door's cell is always in row 0, a `south` door's
 * always in the last row, and so on.
 */
export function doorCentre(room: RoomGeometry, door: CompiledDoor): { x: number; y: number } {
  const cellCentreX = room.minX + door.cellCol * SCREEN_WIDTH + SCREEN_WIDTH / 2;
  const cellCentreY = room.minY + door.cellRow * SCREEN_HEIGHT + SCREEN_HEIGHT / 2;
  switch (door.direction) {
    case 'north':
      return { x: cellCentreX, y: room.minY };
    case 'south':
      return { x: cellCentreX, y: room.maxY };
    case 'west':
      return { x: room.minX, y: cellCentreY };
    case 'east':
      return { x: room.maxX, y: cellCentreY };
  }
}

/**
 * Where a room's cells actually sit, and which of them have a real door —
 * both derived from the floor plan (#100), not authored in content.
 *
 * `cells[i].col`/`.row` are 0-indexed into the room's own local grid (not the
 * floor's absolute one) — `compileRoomTemplate` only needs relative
 * position. Omit `doors` for a `1x1` room to fall back to its own
 * `metadata.doors` instead, same as before #100.
 */
export interface RoomPlacement {
  readonly cells: readonly { readonly col: number; readonly row: number }[];
  readonly doors?: readonly { readonly cellIndex: number; readonly direction: DoorDirection }[];
}

const SINGLE_CELL_PLACEMENT: RoomPlacement = { cells: [{ col: 0, row: 0 }] };

export interface CompiledRoomTemplate {
  readonly source: RoomTemplate;
  readonly geometry: RoomGeometry;
  readonly doors: readonly CompiledDoor[];
  readonly enemySpawns: readonly {
    readonly x: number;
    readonly y: number;
    readonly enemyId: string;
  }[];
  readonly enemyIds: readonly string[];
  /** `x`/`y` already carry every offset (margin and, for a multi-cell room, cell position) — geometry-space, ready to spawn at directly. */
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

export function validateRoomTemplate(
  value: unknown,
  source = 'room template',
  enemyCatalog: RoomEnemyCatalog = [],
): RoomTemplate {
  const template = asRecord(value, source);
  const id = requiredString(template.id, `${source}.id`);

  const metadata = asRecord(template.metadata, `${source}.metadata`);
  const shape = requiredString(metadata.shape, `${source}.metadata.shape`);
  if (!['1x1', '1x2', '2x2', 'L'].includes(shape)) {
    fail(`${source}.metadata.shape`, 'must be 1x1, 1x2, 2x2, or L');
  }

  const floorTags = requiredStringArray(metadata.floorTags, `${source}.metadata.floorTags`);
  const difficultyTier = number(metadata.difficultyTier, `${source}.metadata.difficultyTier`);
  const weight = number(metadata.weight, `${source}.metadata.weight`);
  if (!Number.isInteger(difficultyTier) || difficultyTier < 1 || difficultyTier > 5) {
    fail(`${source}.metadata.difficultyTier`, 'must be an integer from 1 to 5');
  }
  if (weight <= 0) {
    fail(`${source}.metadata.weight`, 'must be greater than zero');
  }
  const specialRole = optionalSpecialRole(metadata.specialRole, `${source}.metadata.specialRole`);
  const keyLocked =
    metadata.keyLocked === undefined
      ? undefined
      : boolean(metadata.keyLocked, `${source}.metadata.keyLocked`);
  if (keyLocked !== undefined && specialRole !== 'treasure') {
    fail(`${source}.metadata.keyLocked`, 'may only be set on a treasure-role template');
  }
  const specialRoleFields = {
    ...(specialRole === undefined ? {} : { specialRole }),
    ...(keyLocked === undefined ? {} : { keyLocked }),
  };

  if (shape === '1x1') {
    const layout = validateSubLayout(template, source, enemyCatalog);
    const doorsRecord = asRecord(metadata.doors, `${source}.metadata.doors`);
    const doors = {
      north: boolean(doorsRecord.north, `${source}.metadata.doors.north`),
      east: boolean(doorsRecord.east, `${source}.metadata.doors.east`),
      south: boolean(doorsRecord.south, `${source}.metadata.doors.south`),
      west: boolean(doorsRecord.west, `${source}.metadata.doors.west`),
    };
    return {
      id,
      ...layout,
      metadata: { floorTags, shape: '1x1', doors, difficultyTier, weight, ...specialRoleFields },
    };
  }

  const multiCellShape = shape as MultiCellRoomShape;
  const expectedCount = MULTI_CELL_COUNT[multiCellShape];
  if (!Array.isArray(template.cells) || template.cells.length !== expectedCount) {
    fail(
      `${source}.cells`,
      `must be an array of ${String(expectedCount)} sub-rooms for a ${shape} room`,
    );
  }
  const cells = template.cells.map((cell, index) =>
    validateSubLayout(cell, `${source}.cells[${String(index)}]`, enemyCatalog),
  );
  return {
    id,
    cells,
    metadata: {
      floorTags,
      shape: multiCellShape,
      difficultyTier,
      weight,
      ...specialRoleFields,
    },
  };
}

const SPECIAL_ROLES = ['boss', 'treasure', 'shop', 'secret', 'supersecret'] as const;

function optionalSpecialRole(
  value: unknown,
  source: string,
): RoomTemplate['metadata']['specialRole'] {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !(SPECIAL_ROLES as readonly string[]).includes(value)) {
    fail(source, `must be one of ${SPECIAL_ROLES.join(', ')}`);
  }
  return value as RoomTemplate['metadata']['specialRole'];
}

/**
 * One single-screen room's worth of content — everything a `1x1` template
 * authors except its `id`/`metadata`/`doors`. Shared by a `1x1` template
 * itself (read straight off its top level) and by each entry of a multi-cell
 * template's `cells` (#100).
 */
function validateSubLayout(
  value: unknown,
  source: string,
  enemyCatalog: RoomEnemyCatalog,
): RoomSubLayout {
  const record = asRecord(value, source);
  const tileGrid = requiredStringArray(record.tileGrid, `${source}.tileGrid`);
  if (tileGrid.length !== ROOM_ROWS) {
    fail(`${source}.tileGrid`, `must have ${String(ROOM_ROWS)} rows`);
  }
  for (const [row, line] of tileGrid.entries()) {
    if (line.length !== ROOM_COLUMNS) {
      fail(`${source}.tileGrid[${String(row)}]`, `must have ${String(ROOM_COLUMNS)} columns`);
    }
    if (/[^.#]/u.test(line)) {
      fail(`${source}.tileGrid[${String(row)}]`, 'may contain only . and # tiles');
    }
  }

  const obstacles = records(record.obstacles, `${source}.obstacles`).map((item, index) =>
    rectangle(item, `${source}.obstacles[${String(index)}]`),
  );
  const groups = records(record.spawnGroups, `${source}.spawnGroups`).map((item, index) =>
    spawnGroup(item, `${source}.spawnGroups[${String(index)}]`, enemyCatalog),
  );
  const groupIds = new Set<string>();
  for (const group of groups) {
    if (groupIds.has(group.id)) {
      fail(`${source}.spawnGroups`, `declares group "${group.id}" twice`);
    }
    groupIds.add(group.id);
  }
  const enemySpawns = records(record.enemySpawns, `${source}.enemySpawns`).map((item, index) => {
    const where = `${source}.enemySpawns[${String(index)}]`;
    const spawn = {
      x: number(item.x, `${where}.x`),
      y: number(item.y, `${where}.y`),
      group: requiredString(item.group, `${where}.group`),
    };
    if (!groupIds.has(spawn.group)) {
      fail(`${where}.group`, `references unknown spawn group "${spawn.group}"`);
    }
    return spawn;
  });

  return {
    tileGrid,
    obstacles,
    enemySpawns,
    spawnGroups: groups,
    pickupSpawns: pickupSpawns(record.pickupSpawns, `${source}.pickupSpawns`),
    hazards: records(record.hazards, `${source}.hazards`).map((item, index) => ({
      ...rectangle(item, `${source}.hazards[${String(index)}]`),
      type: requiredString(item.type, `${source}.hazards[${String(index)}].type`),
    })),
    decorativeProps: positionsWithType(record.decorativeProps, `${source}.decorativeProps`),
  };
}

/**
 * Builds one room's geometry, doors and enemy spawns from its template and
 * (for a multi-cell room) `placement` — the real floor-grid layout the room
 * ended up with, which is what decides orientation and which walls get a
 * door (#100). Omitting `placement` compiles a `1x1` room exactly as before.
 */
export function compileRoomTemplate(
  value: unknown,
  floor: number,
  source = 'room template',
  enemyCatalog: RoomEnemyCatalog = [],
  placement: RoomPlacement = SINGLE_CELL_PLACEMENT,
): CompiledRoomTemplate {
  if (!Number.isInteger(floor) || floor < 1) {
    throw new RangeError(`floor must be a positive integer, got ${String(floor)}`);
  }
  const template = validateRoomTemplate(value, source, enemyCatalog);
  const subLayouts: readonly RoomSubLayout[] = isMultiCellRoomTemplate(template)
    ? template.cells
    : [template];

  if (subLayouts.length !== placement.cells.length) {
    throw new Error(
      `${source}: placement has ${String(placement.cells.length)} cell(s) but the template has ${String(subLayouts.length)}`,
    );
  }

  const gridCols = Math.max(...placement.cells.map((cell) => cell.col)) + 1;
  const gridRows = Math.max(...placement.cells.map((cell) => cell.row)) + 1;
  const present = new Set(placement.cells.map((cell) => cellKey(cell.col, cell.row)));

  // The one grid slot `L`'s bounding box doesn't claim (#20's footprint:
  // `2x2` minus a corner) — `undefined` for every fully-rectangular shape.
  let voidCell: { readonly col: number; readonly row: number } | undefined;
  for (let row = 0; row < gridRows && voidCell === undefined; row++) {
    for (let col = 0; col < gridCols; col++) {
      if (!present.has(cellKey(col, row))) {
        voidCell = { col, row };
        break;
      }
    }
  }

  const offsetX = ROOM_MARGIN_X;
  const offsetY = ROOM_MARGIN_Y;
  const playfieldWidth = gridCols * SCREEN_WIDTH;
  const playfieldHeight = gridRows * SCREEN_HEIGHT;
  const voidRect =
    voidCell === undefined
      ? null
      : {
          minX: offsetX + voidCell.col * SCREEN_WIDTH,
          minY: offsetY + voidCell.row * SCREEN_HEIGHT,
          maxX: offsetX + (voidCell.col + 1) * SCREEN_WIDTH,
          maxY: offsetY + (voidCell.row + 1) * SCREEN_HEIGHT,
        };
  const geometry = new RoomGeometry(
    offsetX,
    offsetY,
    offsetX + playfieldWidth,
    offsetY + playfieldHeight,
    voidRect,
  );
  if (voidRect !== null) {
    geometry.addBlock(voidRect.minX, voidRect.minY, voidRect.maxX, voidRect.maxY);
  }

  // Sub-layouts carry no orientation of their own (#100) — a multi-cell
  // template's `cells` is just assigned to the room's actual grid slots in
  // row-major order. Which authored layout lands in which corner only has to
  // be deterministic, never meaningful.
  const order = placement.cells
    .map((_cell, index) => index)
    .sort((a, b) => {
      const cellA = placement.cells[a] ?? { col: 0, row: 0 };
      const cellB = placement.cells[b] ?? { col: 0, row: 0 };
      return cellA.row - cellB.row || cellA.col - cellB.col;
    });

  const enemySpawns: { x: number; y: number; enemyId: string }[] = [];
  const pickupSpawns: { x: number; y: number; type: string; price?: number }[] = [];
  const decorativeProps: { x: number; y: number; type: string; rotation?: number }[] = [];
  const hazards: { x: number; y: number; width: number; height: number; type: string }[] = [];
  order.forEach((placementIndex, rank) => {
    const cell = placement.cells[placementIndex];
    const layout = subLayouts[rank];
    if (cell === undefined || layout === undefined) {
      return;
    }
    const cellOffsetX = offsetX + cell.col * SCREEN_WIDTH;
    const cellOffsetY = offsetY + cell.row * SCREEN_HEIGHT;

    for (const obstacle of layout.obstacles) {
      geometry.addBlock(
        cellOffsetX + obstacle.x,
        cellOffsetY + obstacle.y,
        cellOffsetX + obstacle.x + obstacle.width,
        cellOffsetY + obstacle.y + obstacle.height,
      );
    }

    for (const spawn of layout.enemySpawns) {
      const group = layout.spawnGroups.find((candidate) => candidate.id === spawn.group);
      if (group === undefined) {
        throw new Error(
          `${source}.enemySpawns group "${spawn.group}" disappeared during compilation`,
        );
      }
      const eligible = group.choices.filter(
        (choice) => floor >= choice.minFloor && floor <= choice.maxFloor,
      );
      if (eligible.length === 0) {
        throw new Error(
          `${source}.spawnGroups[${group.id}] has no enemy eligible on floor ${String(floor)}`,
        );
      }
      for (let index = 0; index < group.count; index++) {
        enemySpawns.push({
          x: cellOffsetX + spawn.x + (index - (group.count - 1) / 2) * 8,
          y: cellOffsetY + spawn.y,
          enemyId: eligible[index % eligible.length]?.enemyId ?? '',
        });
      }
    }

    for (const pickup of layout.pickupSpawns) {
      pickupSpawns.push({
        x: cellOffsetX + pickup.x,
        y: cellOffsetY + pickup.y,
        type: pickup.type,
        ...(pickup.price === undefined ? {} : { price: pickup.price }),
      });
    }
    for (const prop of layout.decorativeProps) {
      decorativeProps.push({
        x: cellOffsetX + prop.x,
        y: cellOffsetY + prop.y,
        type: prop.type,
        ...(prop.rotation === undefined ? {} : { rotation: prop.rotation }),
      });
    }
    for (const hazard of layout.hazards) {
      hazards.push({
        x: cellOffsetX + hazard.x,
        y: cellOffsetY + hazard.y,
        width: hazard.width,
        height: hazard.height,
        type: hazard.type,
      });
    }
  });

  const doorSource =
    placement.doors ??
    (isMultiCellRoomTemplate(template)
      ? []
      : DIRECTIONS.filter((direction) => template.metadata.doors[direction]).map((direction) => ({
          cellIndex: 0,
          direction,
        })));
  const doors: CompiledDoor[] = [];
  for (const door of doorSource) {
    const cell = placement.cells[door.cellIndex];
    if (cell === undefined) {
      continue;
    }
    // Never a real door into the void slot, even if the floor graph found a
    // neighbour there (see `voidRect`'s doc comment on `RoomGeometry`) — a
    // room later placed in that same floor-grid cell is still reachable
    // through its other doors, just not directly from this one.
    const offset = DIRECTION_OFFSET[door.direction];
    if (
      voidCell !== undefined &&
      cellKey(cell.col + offset.x, cell.row + offset.y) === cellKey(voidCell.col, voidCell.row)
    ) {
      continue;
    }
    doors.push({ direction: door.direction, cellCol: cell.col, cellRow: cell.row });
  }

  return {
    source: template,
    geometry,
    doors,
    enemySpawns,
    enemyIds: enemySpawns.map((spawn) => spawn.enemyId),
    pickupSpawns,
    decorativeProps,
    hazards,
  };
}

function cellKey(col: number, row: number): string {
  return `${String(col)},${String(row)}`;
}

function spawnGroup(
  value: Record<string, unknown>,
  source: string,
  enemyCatalog: RoomEnemyCatalog,
) {
  const id = requiredString(value.id, `${source}.id`);
  const count = number(value.count, `${source}.count`);
  if (!Number.isInteger(count) || count < 1) {
    fail(`${source}.count`, 'must be a positive integer');
  }
  const catalogIds = new Set(enemyCatalog.map((enemy) => enemy.id));
  const choices = records(value.choices, `${source}.choices`).map((item, index) => {
    const where = `${source}.choices[${String(index)}]`;
    const enemyId = requiredString(item.enemyId, `${where}.enemyId`);
    if (enemyCatalog.length > 0 && !catalogIds.has(enemyId)) {
      fail(`${where}.enemyId`, `does not name a registered enemy`);
    }
    const minFloor = number(item.minFloor, `${where}.minFloor`);
    const maxFloor = number(item.maxFloor, `${where}.maxFloor`);
    if (
      !Number.isInteger(minFloor) ||
      minFloor < 1 ||
      !Number.isInteger(maxFloor) ||
      maxFloor < minFloor
    ) {
      fail(where, 'must have a valid positive minFloor and maxFloor');
    }
    return { enemyId, minFloor, maxFloor };
  });
  if (choices.length === 0) {
    fail(`${source}.choices`, 'must not be empty');
  }
  return { id, count, choices };
}

function positionsWithType(value: unknown, source: string) {
  return records(value, source).map((item, index) => {
    const where = `${source}[${String(index)}]`;
    return {
      x: number(item.x, `${where}.x`),
      y: number(item.y, `${where}.y`),
      type: requiredString(item.type, `${where}.type`),
    };
  });
}

function pickupSpawns(value: unknown, source: string) {
  return records(value, source).map((item, index) => {
    const where = `${source}[${String(index)}]`;
    const price = item.price === undefined ? undefined : positive(item.price, `${where}.price`);
    return {
      x: number(item.x, `${where}.x`),
      y: number(item.y, `${where}.y`),
      type: requiredString(item.type, `${where}.type`),
      ...(price === undefined ? {} : { price }),
    };
  });
}

function rectangle(value: Record<string, unknown>, source: string) {
  return {
    x: number(value.x, `${source}.x`),
    y: number(value.y, `${source}.y`),
    width: positive(value.width, `${source}.width`),
    height: positive(value.height, `${source}.height`),
  };
}

function asRecord(value: unknown, source: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${source} must be an object`);
  }
  return value as Record<string, unknown>;
}

function records(value: unknown, source: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`${source} must be an array`);
  }
  return value.map((item, index) => asRecord(item, `${source}[${String(index)}]`));
}

function requiredString(value: unknown, source: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(source, 'must be a non-empty string');
  }
  return value;
}

function requiredStringArray(value: unknown, source: string): string[] {
  if (!Array.isArray(value)) {
    fail(source, 'must be an array of strings');
  }
  const values: unknown[] = value;
  if (values.some((item) => typeof item !== 'string')) {
    fail(source, 'must be an array of strings');
  }
  return values.map((item) => {
    if (typeof item !== 'string') {
      fail(source, 'must be an array of strings');
    }
    return item;
  });
}

function number(value: unknown, source: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(source, 'must be a finite number');
  }
  return value;
}

function positive(value: unknown, source: string): number {
  const result = number(value, source);
  if (result <= 0) {
    fail(source, 'must be greater than zero');
  }
  return result;
}

function boolean(value: unknown, source: string): boolean {
  if (typeof value !== 'boolean') {
    fail(source, 'must be a boolean');
  }
  return value;
}

function fail(source: string, message: string): never {
  throw new Error(`${source}: ${message}`);
}
