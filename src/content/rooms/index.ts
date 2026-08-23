import cellarCrossroads from './cellar.json';
import cellarHall from './cellar-hall.json';
import cellarCorridor from './cellar-corridor.json';
import cellarHallBig from './cellar-hall-big.json';
import cellarNook from './cellar-nook.json';
import cellarPillars from './cellar-pillars.json';

/**
 * Raw authored files. `validateRoomTemplate` is the typed content boundary.
 *
 * `cellarCorridor`/`cellarHallBig`/`cellarNook` are the `1x2`/`2x2`/`L` shapes
 * the floor generator (#20) needs a real pool to draw from — floor 1 would
 * otherwise have no template to place a multi-cell slot with, and every
 * generation attempt that rolled one would retry forever.
 *
 * `cellarPillars` is a third `1x1` — most rooms on a floor are `1x1`, and with
 * only two to pick from, a run of same-template rooms in a row (both authored
 * templates being visually sparse besides) reads as "the generator always
 * shows the same room" even though the pick is genuinely unbiased. A third
 * option does not remove that possibility, but it cuts it a lot further.
 */
export const ROOM_TEMPLATES = [
  cellarCrossroads,
  cellarHall,
  cellarCorridor,
  cellarHallBig,
  cellarNook,
  cellarPillars,
] as const;

export { cellarCrossroads, cellarHall, cellarCorridor, cellarHallBig, cellarNook, cellarPillars };
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
