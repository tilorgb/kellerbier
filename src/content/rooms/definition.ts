import type { EnemyDefinition } from '../../sim/enemy/definition.js';

export const ROOM_COLUMNS = 15;
export const ROOM_ROWS = 9;
export const ROOM_TILE_UNITS = 16;

export type RoomShape = '1x1' | '1x2' | '2x2' | 'L';

/** The non-`1x1` shapes — every one of them is several sub-rooms glued together (#100). */
export type MultiCellRoomShape = '1x2' | '2x2' | 'L';

/**
 * How many single-screen sub-rooms a multi-cell shape glues together, and how
 * many entries its `cells` array must have.
 *
 * `L` is `2x2` minus one corner (see #20's footprint: `shapeFootprints('L')`
 * drops one of `2x2`'s four cells) — three sub-rooms, not four.
 */
export const MULTI_CELL_COUNT: Readonly<Record<MultiCellRoomShape, number>> = {
  '1x2': 2,
  '2x2': 4,
  L: 3,
};

export type DoorDirection = 'north' | 'east' | 'south' | 'west';

export interface RoomDoorConfiguration {
  readonly north: boolean;
  readonly east: boolean;
  readonly south: boolean;
  readonly west: boolean;
}

export interface RoomObstacle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RoomEnemySpawn {
  readonly x: number;
  readonly y: number;
  readonly group: string;
}

export interface RoomSpawnChoice {
  readonly enemyId: string;
  readonly minFloor: number;
  readonly maxFloor: number;
}

export interface RoomSpawnGroup {
  readonly id: string;
  readonly count: number;
  readonly choices: readonly RoomSpawnChoice[];
}

export interface RoomPickupSpawn {
  readonly x: number;
  readonly y: number;
  readonly type: string;
}

export interface RoomHazard {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly type: string;
}

export interface RoomDecorativeProp {
  readonly x: number;
  readonly y: number;
  readonly type: string;
  readonly rotation?: number;
}

/**
 * One single-screen room's worth of content, in that screen's own local
 * coordinates (same convention a `1x1` template's fields already use).
 *
 * This is what a multi-cell template is built from (#100): a `2x2` room's
 * `cells` is four of these, one per sub-room, glued together with no wall or
 * door between them — only the shape's *outer* edges can have a door, and
 * even those are never authored here. A door is entirely a function of the
 * real floor-grid neighbour on the other side of it
 * (`sim/room/floor-plan.ts`'s `RoomDoor`), resolved when the room loads, not
 * a property of the content — so a sub-layout carries no door metadata at
 * all, and is free to sit at any of its shape's cell positions.
 */
export interface RoomSubLayout {
  readonly tileGrid: readonly string[];
  readonly obstacles: readonly RoomObstacle[];
  readonly enemySpawns: readonly RoomEnemySpawn[];
  readonly spawnGroups: readonly RoomSpawnGroup[];
  readonly pickupSpawns: readonly RoomPickupSpawn[];
  readonly hazards: readonly RoomHazard[];
  readonly decorativeProps: readonly RoomDecorativeProp[];
}

interface RoomTemplateMetadataBase {
  readonly floorTags: readonly string[];
  readonly difficultyTier: number;
  readonly weight: number;
}

/**
 * A `1x1` template: one screen, authored exactly like every one always has
 * been, doors included — a `1x1` room has only the one cell, so "which walls
 * can have a door" is still worth an author's say.
 */
export interface SingleCellRoomTemplate extends RoomSubLayout {
  readonly id: string;
  readonly metadata: RoomTemplateMetadataBase & {
    readonly shape: '1x1';
    readonly doors: RoomDoorConfiguration;
  };
}

/**
 * A `1x2`/`2x2`/`L` template: `MULTI_CELL_COUNT[shape]` single-screen
 * sub-layouts, glued together at load time to match wherever the floor
 * generator actually placed the room's cells (#100) — see
 * `sim/room/template.ts`'s `compileRoomTemplate`. No top-level `tileGrid` or
 * `doors`: there is no one grid spanning every sub-room, and doors are
 * derived, never authored (see `RoomSubLayout`'s doc comment).
 */
export interface MultiCellRoomTemplate {
  readonly id: string;
  readonly cells: readonly RoomSubLayout[];
  readonly metadata: RoomTemplateMetadataBase & {
    readonly shape: MultiCellRoomShape;
  };
}

export type RoomTemplate = SingleCellRoomTemplate | MultiCellRoomTemplate;

/**
 * A named type guard rather than an inline `shape !== '1x1'` check at each
 * call site: TypeScript narrows a union on a discriminant nested this far
 * down (`metadata.shape`) only through an explicit predicate like this one,
 * not automatically from a bare comparison.
 */
export function isMultiCellRoomTemplate(template: RoomTemplate): template is MultiCellRoomTemplate {
  return template.metadata.shape !== '1x1';
}

export type RoomEnemyCatalog = readonly Pick<EnemyDefinition, 'id'>[];
