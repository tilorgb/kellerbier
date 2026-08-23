import cellarCrossroads from './cellar.json';
import cellarHall from './cellar-hall.json';

/** Raw authored files. `validateRoomTemplate` is the typed content boundary. */
export const ROOM_TEMPLATES = [cellarCrossroads, cellarHall] as const;

export { cellarCrossroads, cellarHall };
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
