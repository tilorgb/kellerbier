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
  };
}

export type RoomEnemyCatalog = readonly Pick<EnemyDefinition, 'id'>[];
