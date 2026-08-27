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
 * Every authored file in this directory, raw. `validateRoomTemplate` is the
 * typed content boundary, not this list — a glob rather than a hand-maintained
 * array of imports so a room the editor (#24) saves straight into this folder
 * shows up here, and in the shipped game's pool, without a manual edit.
 *
 * The 13 named exports below are still direct static imports, not read out of
 * this glob: `tests/content/rooms.test.ts` and others import at least one of
 * them by name, and a static import is also how each of those specific files
 * stays reachable by name in the first place. Vite's module cache means a file
 * imported both ways here is still only ever one module.
 */
const globbedRooms = import.meta.glob('./*.json', { eager: true, import: 'default' });

export const ROOM_TEMPLATES: readonly unknown[] = Object.values(globbedRooms);

/**
 * Staircase content (#112's generator-placement follow-up) lives in its own
 * subfolder and its own glob, never `./*.json` above — a staircase is not a
 * `RoomTemplate` (`docs/DECISIONS.md` #11/#12), so it must never reach
 * `validateRoomTemplate`. Validated instead by `sim/room/staircase.ts`'s
 * `validateStaircaseTemplate`.
 */
const globbedStaircases = import.meta.glob('./staircases/*.json', {
  eager: true,
  import: 'default',
});

export const STAIRCASE_TEMPLATES: readonly unknown[] = Object.values(globbedStaircases);

/**
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
 *
 * `cellarBoss`/`cellarTreasure(Locked)`/`cellarShop(Vorrat)`/`cellarSecret`/
 * `cellarSupersecret` are floor 1's special-room content (#23) — one per
 * `RoomSpecialRole`, with two variants each for treasure and shop so
 * `generateFloor`'s weighted pick actually has something to choose between
 * (a locked vs. free treasure, two different shop stock lists). `cellarBoss`
 * now holds Die Große Kellerassel (#36) and floor 2 has its own boss room,
 * `dorf-boss.json` (#38), reached through the glob above rather than a named
 * export — nothing here needs it by name the way the floor-1 specials are.
 */
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
