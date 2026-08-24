import type { EnemyDefinition } from '../../sim/enemy/definition.js';

export const ROOM_COLUMNS = 15;
export const ROOM_ROWS = 9;
export const ROOM_TILE_UNITS = 16;

export type RoomShape = '1x1' | '1x2' | '2x2' | 'L';
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

export interface RoomTemplate {
  readonly id: string;
  readonly tileGrid: readonly string[];
  readonly obstacles: readonly RoomObstacle[];
  readonly enemySpawns: readonly RoomEnemySpawn[];
  readonly spawnGroups: readonly RoomSpawnGroup[];
  readonly pickupSpawns: readonly RoomPickupSpawn[];
  readonly hazards: readonly RoomHazard[];
  readonly decorativeProps: readonly RoomDecorativeProp[];
  readonly metadata: {
    readonly floorTags: readonly string[];
    readonly shape: RoomShape;
    readonly doors: RoomDoorConfiguration;
    readonly difficultyTier: number;
    readonly weight: number;
    /** See `RoomSpecialRole`. Omitted for an ordinary start/normal room. */
    readonly specialRole?: RoomSpecialRole;
    /** Treasure rooms only: entering spends one Kellerschlüssel, blocked at zero. */
    readonly keyLocked?: boolean;
  };
}

export type RoomEnemyCatalog = readonly Pick<EnemyDefinition, 'id'>[];
