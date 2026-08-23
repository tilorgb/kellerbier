import cellarCrossroads from './cellar.json';
import cellarHall from './cellar-hall.json';
import cellarCorridor from './cellar-corridor.json';
import cellarHallBig from './cellar-hall-big.json';
import cellarNook from './cellar-nook.json';

/**
 * Raw authored files. `validateRoomTemplate` is the typed content boundary.
 *
 * `cellarCorridor`/`cellarHallBig`/`cellarNook` are the `1x2`/`2x2`/`L` shapes
 * the floor generator (#20) needs a real pool to draw from — floor 1 would
 * otherwise have no template to place a multi-cell slot with, and every
 * generation attempt that rolled one would retry forever.
 */
export const ROOM_TEMPLATES = [
  cellarCrossroads,
  cellarHall,
  cellarCorridor,
  cellarHallBig,
  cellarNook,
] as const;

export { cellarCrossroads, cellarHall, cellarCorridor, cellarHallBig, cellarNook };
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
