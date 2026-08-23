import cellarCrossroads from './cellar.json';

/** Raw authored files. `validateRoomTemplate` is the typed content boundary. */
export const ROOM_TEMPLATES = [cellarCrossroads] as const;

export { cellarCrossroads };
export type {
  DoorDirection,
  RoomDecorativeProp,
  RoomDoorConfiguration,
  RoomEnemySpawn,
  RoomHazard,
  RoomObstacle,
  RoomPickupSpawn,
  RoomShape,
  RoomSpawnChoice,
  RoomSpawnGroup,
  RoomTemplate,
} from './definition.js';
