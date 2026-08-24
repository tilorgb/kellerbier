import {
  ROOM_COLUMNS,
  ROOM_ROWS,
  ROOM_TILE_UNITS,
  type RoomEnemyCatalog,
  type RoomTemplate,
} from '../../content/rooms/definition.js';
import { RoomGeometry } from './geometry.js';

export const ROOM_FRAME_WIDTH = 320;
export const ROOM_FRAME_HEIGHT = 180;

export interface CompiledRoomTemplate {
  readonly source: RoomTemplate;
  readonly geometry: RoomGeometry;
  readonly enemySpawns: readonly {
    readonly x: number;
    readonly y: number;
    readonly enemyId: string;
  }[];
  readonly enemyIds: readonly string[];
}

export function validateRoomTemplate(
  value: unknown,
  source = 'room template',
  enemyCatalog: RoomEnemyCatalog = [],
): RoomTemplate {
  const template = asRecord(value, source);
  const id = requiredString(template.id, `${source}.id`);
  const tileGrid = requiredStringArray(template.tileGrid, `${source}.tileGrid`);
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

  const obstacles = records(template.obstacles, `${source}.obstacles`).map((item, index) =>
    rectangle(item, `${source}.obstacles[${String(index)}]`),
  );
  const groups = records(template.spawnGroups, `${source}.spawnGroups`).map((item, index) =>
    spawnGroup(item, `${source}.spawnGroups[${String(index)}]`, enemyCatalog),
  );
  const groupIds = new Set<string>();
  for (const group of groups) {
    if (groupIds.has(group.id)) {
      fail(`${source}.spawnGroups`, `declares group "${group.id}" twice`);
    }
    groupIds.add(group.id);
  }
  const enemySpawns = records(template.enemySpawns, `${source}.enemySpawns`).map((item, index) => {
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

  const metadata = asRecord(template.metadata, `${source}.metadata`);
  const shape = requiredString(metadata.shape, `${source}.metadata.shape`);
  if (!['1x1', '1x2', '2x2', 'L'].includes(shape)) {
    fail(`${source}.metadata.shape`, 'must be 1x1, 1x2, 2x2, or L');
  }
  const doors = asRecord(metadata.doors, `${source}.metadata.doors`);
  const doorValues = {
    north: boolean(doors.north, `${source}.metadata.doors.north`),
    east: boolean(doors.east, `${source}.metadata.doors.east`),
    south: boolean(doors.south, `${source}.metadata.doors.south`),
    west: boolean(doors.west, `${source}.metadata.doors.west`),
  };
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

  return {
    id,
    tileGrid,
    obstacles,
    enemySpawns,
    spawnGroups: groups,
    pickupSpawns: pickupSpawns(template.pickupSpawns, `${source}.pickupSpawns`),
    hazards: records(template.hazards, `${source}.hazards`).map((item, index) => ({
      ...rectangle(item, `${source}.hazards[${String(index)}]`),
      type: requiredString(item.type, `${source}.hazards[${String(index)}].type`),
    })),
    decorativeProps: positionsWithType(template.decorativeProps, `${source}.decorativeProps`),
    metadata: {
      floorTags: requiredStringArray(metadata.floorTags, `${source}.metadata.floorTags`),
      shape: shape as RoomTemplate['metadata']['shape'],
      doors: doorValues,
      difficultyTier,
      weight,
      ...(specialRole === undefined ? {} : { specialRole }),
      ...(keyLocked === undefined ? {} : { keyLocked }),
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

export function compileRoomTemplate(
  value: unknown,
  floor: number,
  source = 'room template',
  enemyCatalog: RoomEnemyCatalog = [],
): CompiledRoomTemplate {
  if (!Number.isInteger(floor) || floor < 1) {
    throw new RangeError(`floor must be a positive integer, got ${String(floor)}`);
  }
  const template = validateRoomTemplate(value, source, enemyCatalog);
  const playfieldWidth = ROOM_COLUMNS * ROOM_TILE_UNITS;
  const playfieldHeight = ROOM_ROWS * ROOM_TILE_UNITS;
  const offsetX = (ROOM_FRAME_WIDTH - playfieldWidth) / 2;
  const offsetY = (ROOM_FRAME_HEIGHT - playfieldHeight) / 2;
  const geometry = new RoomGeometry(
    offsetX,
    offsetY,
    offsetX + playfieldWidth,
    offsetY + playfieldHeight,
  );
  for (const obstacle of template.obstacles) {
    geometry.addBlock(
      offsetX + obstacle.x,
      offsetY + obstacle.y,
      offsetX + obstacle.x + obstacle.width,
      offsetY + obstacle.y + obstacle.height,
    );
  }
  const enemySpawns = template.enemySpawns.flatMap((spawn) => {
    const group = template.spawnGroups.find((candidate) => candidate.id === spawn.group);
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
    return Array.from({ length: group.count }, (_, index) => ({
      x: offsetX + spawn.x + (index - (group.count - 1) / 2) * 8,
      y: offsetY + spawn.y,
      enemyId: eligible[index % eligible.length]?.enemyId ?? '',
    }));
  });
  return {
    source: template,
    geometry,
    enemySpawns,
    enemyIds: enemySpawns.map((spawn) => spawn.enemyId),
  };
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
