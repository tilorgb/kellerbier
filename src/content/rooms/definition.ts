import type { EnemyDefinition } from '../../sim/enemy/definition.js';

export const ROOM_COLUMNS = 15;
export const ROOM_ROWS = 9;
export const ROOM_TILE_UNITS = 16;

export type RoomShape = '1x1' | '1x2' | '2x2' | 'L' | 'T';

/**
 * Every `RoomShape`, once — the enumerated counterpart to the type above.
 * Anything that needs "all shapes" (validation, dev-seed sweeps, tests)
 * reads this instead of hand-listing the five strings again, so adding a
 * shape is one line here rather than an audit of every call site
 * (`editor/state.ts`'s `isRoomShape` used to be exactly this kind of
 * hand-listed copy, and had silently gone stale missing `'T'` until this
 * list replaced it).
 */
export const ROOM_SHAPES: readonly RoomShape[] = ['1x1', '1x2', '2x2', 'L', 'T'];

/** The non-`1x1` shapes — every one of them is several sub-rooms glued together (#100). */
export type MultiCellRoomShape = '1x2' | '2x2' | 'L' | 'T';

/**
 * How many single-screen sub-rooms a multi-cell shape glues together, and how
 * many entries its `cells` array must have.
 *
 * `L` is `2x2` minus one corner (see #20's footprint: `shapeFootprints('L')`
 * drops one of `2x2`'s four cells) — three sub-rooms, not four. `T` is a 3x3
 * bounding box minus its four corners (#107) — five sub-rooms.
 */
export const MULTI_CELL_COUNT: Readonly<Record<MultiCellRoomShape, number>> = {
  '1x2': 2,
  '2x2': 4,
  L: 3,
  T: 5,
};

export type DoorDirection = 'north' | 'east' | 'south' | 'west';

/** Every `DoorDirection`, once — see `ROOM_SHAPES`'s doc comment for why this exists. */
export const DOOR_DIRECTIONS: readonly DoorDirection[] = ['north', 'east', 'south', 'west'];

/**
 * Cell offset each compass direction moves by, on any of this codebase's
 * grids (the floor's room grid, a multi-cell room's local sub-cell grid).
 * Hand-written independently in four places before this (`sim/room/floor-plan.ts`'s
 * `OFFSET`, `sim/room/template.ts`'s `DIRECTION_OFFSET`, `render/minimap-hud.ts`'s
 * `DOOR_OFFSET`, `app/main.ts`'s `DIRECTION_OFFSET`) — a typo in any one of
 * those would have made only part of the system disagree about which way is
 * which, exactly the class of bug `sim/room/void-cells.ts`'s doc comment
 * warns about (#117).
 */
export const DIRECTION_OFFSET: Readonly<
  Record<DoorDirection, { readonly x: number; readonly y: number }>
> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

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
  /** Biermarken cost. Omitted (or absent) means free — see `sim/systems/pickup.ts`'s price gate. */
  readonly price?: number;
}

/**
 * The role a room's slot must have for this template to be eligible for it —
 * see `RoomRole` in `sim/room/floor-plan.ts`. Omitted means the template is
 * generic: only placed in a `'start'` or `'normal'` slot, never a special one.
 */
export type RoomSpecialRole = 'boss' | 'treasure' | 'shop' | 'secret' | 'supersecret';

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
  /** See `RoomSpecialRole`. Omitted for an ordinary start/normal room. */
  readonly specialRole?: RoomSpecialRole;
  /** Treasure rooms only: entering spends one Kellerschlüssel, blocked at zero. */
  readonly keyLocked?: boolean;
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
