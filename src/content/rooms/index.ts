import cellarCrossroads from './cellar.json';
import cellarHall from './cellar-hall.json';
import cellarCorridor from './cellar-corridor.json';
import cellarHallBig from './cellar-hall-big.json';
import cellarNook from './cellar-nook.json';
import cellarPillars from './cellar-pillars.json';
import cellarBoss from './cellar-boss.json';
import cellarTreasure from './cellar-treasure.json';
import cellarTreasureLocked from './cellar-treasure-locked.json';
import cellarShop from './cellar-shop.json';
import cellarShopVorrat from './cellar-shop-vorrat.json';
import cellarSecret from './cellar-secret.json';
import cellarSupersecret from './cellar-supersecret.json';

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
/**
 * `cellarBoss`/`cellarTreasure(Locked)`/`cellarShop(Vorrat)`/`cellarSecret`/
 * `cellarSupersecret` are floor 1's special-room content (#23) — one per
 * `RoomSpecialRole`, with two variants each for treasure and shop so
 * `generateFloor`'s weighted pick actually has something to choose between
 * (a locked vs. free treasure, two different shop stock lists). The boss
 * encounter spawns a small pack of already-authored enemies rather than a
 * real boss — no boss is authored yet (that's M6, `docs/ROADMAP.md`) — so
 * `npm run dev` has a real, doors-sealed, reward-dropping boss room to show
 * today, swapped for authored content later without any generator change.
 */
export const ROOM_TEMPLATES = [
  cellarCrossroads,
  cellarHall,
  cellarCorridor,
  cellarHallBig,
  cellarNook,
  cellarPillars,
  cellarBoss,
  cellarTreasure,
  cellarTreasureLocked,
  cellarShop,
  cellarShopVorrat,
  cellarSecret,
  cellarSupersecret,
] as const;

export {
  cellarCrossroads,
  cellarHall,
  cellarCorridor,
  cellarHallBig,
  cellarNook,
  cellarPillars,
  cellarBoss,
  cellarTreasure,
  cellarTreasureLocked,
  cellarShop,
  cellarShopVorrat,
  cellarSecret,
  cellarSupersecret,
};
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
  RoomSpecialRole,
  RoomTemplate,
} from './definition.js';
