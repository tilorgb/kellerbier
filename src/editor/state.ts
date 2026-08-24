import {
  ROOM_COLUMNS,
  ROOM_ROWS,
  ROOM_SHAPES,
  ROOM_TILE_UNITS,
  type RoomDecorativeProp,
  type RoomDoorConfiguration,
  type RoomEnemySpawn,
  type RoomHazard,
  type RoomObstacle,
  type RoomPickupSpawn,
  type RoomShape,
  type RoomSpawnGroup,
  type RoomSpecialRole,
} from '../content/rooms/definition.js';
import { shapeCellCount } from './definitions.js';

/** One single-screen sub-room's worth of content, mutable, for the editor to bind form controls to. */
export interface EditorCell {
  tileGrid: string[];
  obstacles: RoomObstacle[];
  enemySpawns: RoomEnemySpawn[];
  spawnGroups: RoomSpawnGroup[];
  pickupSpawns: RoomPickupSpawn[];
  hazards: RoomHazard[];
  decorativeProps: RoomDecorativeProp[];
}

/**
 * The editor's own in-memory shape of a room, normalized to always carry a
 * `cells` array (length 1 for a `1x1`) so the grid/panel code never has to
 * branch on shape to find "the content" — only `toTemplateJSON` cares which
 * shape maps to which authored JSON shape.
 */
export interface EditorDraft {
  id: string;
  shape: RoomShape;
  cells: EditorCell[];
  doors: RoomDoorConfiguration;
  floorTags: string[];
  difficultyTier: number;
  weight: number;
  specialRole?: RoomSpecialRole;
  keyLocked?: boolean;
}

export function blankTileGrid(): string[] {
  const rows: string[] = [];
  for (let row = 0; row < ROOM_ROWS; row++) {
    const isEdgeRow = row === 0 || row === ROOM_ROWS - 1;
    let line = '';
    for (let col = 0; col < ROOM_COLUMNS; col++) {
      const isEdgeCol = col === 0 || col === ROOM_COLUMNS - 1;
      line += isEdgeRow || isEdgeCol ? '#' : '.';
    }
    rows.push(line);
  }
  return rows;
}

export function blankCell(): EditorCell {
  return {
    tileGrid: blankTileGrid(),
    obstacles: [],
    enemySpawns: [],
    spawnGroups: [],
    pickupSpawns: [],
    hazards: [],
    decorativeProps: [],
  };
}

/**
 * Recomputes a cell's `tileGrid` from its `obstacles` — the only thing that
 * ever draws a `#` besides the fixed outer wall. Called after every obstacle
 * edit so the two never drift apart, since nothing downstream of authoring
 * ever reads `tileGrid` back out (`src/sim/room/template.ts`'s
 * `compileRoomTemplate` only reads `obstacles`).
 */
export function recomputeTileGrid(cell: EditorCell): void {
  const grid = blankTileGrid();
  for (const obstacle of cell.obstacles) {
    const startCol = Math.max(0, Math.floor(obstacle.x / ROOM_TILE_UNITS));
    const startRow = Math.max(0, Math.floor(obstacle.y / ROOM_TILE_UNITS));
    const endCol = Math.min(
      ROOM_COLUMNS,
      Math.ceil((obstacle.x + obstacle.width) / ROOM_TILE_UNITS),
    );
    const endRow = Math.min(ROOM_ROWS, Math.ceil((obstacle.y + obstacle.height) / ROOM_TILE_UNITS));
    for (let row = startRow; row < endRow; row++) {
      const line = grid[row];
      if (line === undefined) {
        continue;
      }
      grid[row] = line
        .split('')
        .map((char, col) => (col >= startCol && col < endCol ? '#' : char))
        .join('');
    }
  }
  cell.tileGrid = grid;
}

export function createBlankDraft(shape: RoomShape, id = ''): EditorDraft {
  return {
    id,
    shape,
    cells: Array.from({ length: shapeCellCount(shape) }, () => blankCell()),
    doors: { north: false, east: false, south: false, west: false },
    floorTags: ['cellar'],
    difficultyTier: 1,
    weight: 1,
  };
}

/**
 * Reads an arbitrary, not-yet-validated JSON value (an existing authored file
 * loaded for editing, or a duplicate of one) into the editor's normalized
 * shape. Deliberately tolerant of a malformed field — `validation.ts` is
 * where an author finds out something is wrong, not this loader — so a
 * missing or wrong-typed field just falls back to a blank value rather than
 * throwing partway through a load.
 */
export function fromRoomTemplate(value: unknown, newId?: string): EditorDraft {
  const record = isRecord(value) ? value : {};
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  const shape = isRoomShape(metadata.shape) ? metadata.shape : '1x1';

  const rawCells = shape === '1x1' ? [record] : Array.isArray(record.cells) ? record.cells : [];
  const cells = rawCells.map((cell) => readCell(cell));
  while (cells.length < shapeCellCount(shape)) {
    cells.push(blankCell());
  }

  const doorsRecord = isRecord(metadata.doors) ? metadata.doors : {};
  const specialRole = isSpecialRole(metadata.specialRole) ? metadata.specialRole : undefined;
  const keyLocked = typeof metadata.keyLocked === 'boolean' ? metadata.keyLocked : undefined;

  return {
    id: newId ?? (typeof record.id === 'string' ? record.id : ''),
    shape,
    cells,
    doors: {
      north: doorsRecord.north === true,
      east: doorsRecord.east === true,
      south: doorsRecord.south === true,
      west: doorsRecord.west === true,
    },
    floorTags: Array.isArray(metadata.floorTags)
      ? metadata.floorTags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    difficultyTier: typeof metadata.difficultyTier === 'number' ? metadata.difficultyTier : 1,
    weight: typeof metadata.weight === 'number' ? metadata.weight : 1,
    ...(specialRole === undefined ? {} : { specialRole }),
    ...(keyLocked === undefined ? {} : { keyLocked }),
  };
}

function readCell(value: unknown): EditorCell {
  const record = isRecord(value) ? value : {};
  const tileGrid = Array.isArray(record.tileGrid)
    ? record.tileGrid.filter((row): row is string => typeof row === 'string')
    : blankTileGrid();
  return {
    tileGrid: tileGrid.length === ROOM_ROWS ? tileGrid : blankTileGrid(),
    obstacles: isArray<RoomObstacle>(record.obstacles) ? record.obstacles : [],
    enemySpawns: isArray<RoomEnemySpawn>(record.enemySpawns) ? record.enemySpawns : [],
    spawnGroups: isArray<RoomSpawnGroup>(record.spawnGroups) ? record.spawnGroups : [],
    pickupSpawns: isArray<RoomPickupSpawn>(record.pickupSpawns) ? record.pickupSpawns : [],
    hazards: isArray<RoomHazard>(record.hazards) ? record.hazards : [],
    decorativeProps: isArray<RoomDecorativeProp>(record.decorativeProps)
      ? record.decorativeProps
      : [],
  };
}

/**
 * Converts the editor's normalized draft back into the raw JSON shape
 * `validateRoomTemplate` and every authored file already use — a `1x1`'s
 * single cell inlined at the top level with `doors`, or a multi-cell
 * template's `cells` array with none.
 */
export function toTemplateJSON(draft: EditorDraft): unknown {
  const metadata = {
    floorTags: draft.floorTags,
    difficultyTier: draft.difficultyTier,
    weight: draft.weight,
    ...(draft.specialRole === undefined ? {} : { specialRole: draft.specialRole }),
    ...(draft.keyLocked === undefined ? {} : { keyLocked: draft.keyLocked }),
  };

  if (draft.shape === '1x1') {
    const cell = draft.cells[0] ?? blankCell();
    return {
      id: draft.id,
      ...cellJSON(cell),
      metadata: { ...metadata, shape: '1x1', doors: { ...draft.doors } },
    };
  }

  return {
    id: draft.id,
    cells: draft.cells.map((cell) => cellJSON(cell)),
    metadata: { ...metadata, shape: draft.shape },
  };
}

function cellJSON(cell: EditorCell): EditorCell {
  return {
    tileGrid: cell.tileGrid,
    obstacles: cell.obstacles,
    enemySpawns: cell.enemySpawns,
    spawnGroups: cell.spawnGroups,
    pickupSpawns: cell.pickupSpawns,
    hazards: cell.hazards,
    decorativeProps: cell.decorativeProps,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

function isRoomShape(value: unknown): value is RoomShape {
  return (ROOM_SHAPES as readonly unknown[]).includes(value);
}

function isSpecialRole(value: unknown): value is RoomSpecialRole {
  return (
    value === 'boss' ||
    value === 'treasure' ||
    value === 'shop' ||
    value === 'secret' ||
    value === 'supersecret'
  );
}

type Listener = () => void;

/**
 * The editor's whole mutable state: one draft, plus a dirty flag and a
 * change-notification list every panel subscribes to. There is deliberately
 * one of these per boot, not per panel — the grid, metadata form, spawn-group
 * list and validation panel all read and write the same draft, and a change
 * from any one of them has to be visible to all the others on the next paint.
 */
export class EditorState {
  draft: EditorDraft;
  dirty = false;
  /** Which of `draft.cells` the grid and spawn-group panels are both showing right now. */
  activeCellIndex = 0;
  private readonly listeners = new Set<Listener>();

  constructor(draft: EditorDraft) {
    this.draft = draft;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Call after any mutation to `draft` — marks it dirty and repaints every subscriber. */
  notify(): void {
    this.dirty = true;
    for (const listener of this.listeners) {
      listener();
    }
  }

  setActiveCellIndex(index: number): void {
    this.activeCellIndex = index;
    for (const listener of this.listeners) {
      listener();
    }
  }

  load(draft: EditorDraft): void {
    this.draft = draft;
    this.dirty = false;
    this.activeCellIndex = 0;
    for (const listener of this.listeners) {
      listener();
    }
  }

  markClean(): void {
    this.dirty = false;
  }
}
