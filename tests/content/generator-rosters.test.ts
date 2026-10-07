import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS, HIGHEST_SANDBOX_FLOOR } from '../../src/content/floors/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import {
  DEFAULT_ROOM_GEN_TUNING,
  ROSTERS,
  STREAM_DWELLERS,
  generateRoom,
  roomGenSeed,
} from '../../src/sim/room/generate-room.js';
import { ROOM_GEN_FLOOR_OVERRIDES } from '../../src/content/floors/definition.js';
import { Rng } from '../../src/sim/rng/rng.js';

/**
 * About seven in eight ordinary rooms are generated, not authored
 * (`RoomGenTuning.authoredRoomChance`), and a generated room's enemies come
 * only from `ROSTERS[floorTag]`. Floor 3 shipped its first four enemies into
 * the authored `wald-*` rooms with no `wald` roster, so most of the floor was
 * empty in every `?floor=3` preview — a gap the generator only `console.warn`s
 * about, in dev builds. This is what fails CI instead (`CLAUDE.md`'s
 * "content gap" section): every floor a sandbox run can reach must have a
 * roster that can fill its rooms with a real fight.
 */

const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
const knownIds = new Set(registry.all.map((enemy) => enemy.id));
const waterCreatures = new Set(
  registry.all.filter((enemy) => enemy.zone !== null).map((enemy) => enemy.id),
);
const reachableFloors = FLOOR_CONFIGS.filter((config) => config.floor <= HIGHEST_SANDBOX_FLOOR);

describe('room generator rosters', () => {
  it('covers at least floors 1 to 3', () => {
    expect(reachableFloors.map((config) => config.floor)).toEqual(
      expect.arrayContaining([1, 2, 3]),
    );
  });

  describe.each(reachableFloors.map((config) => [config.floor, config] as const))(
    'floor %i',
    (_floor, config) => {
      const roster = ROSTERS[config.floorTag] ?? [];

      it(`has a roster for its tag "${config.floorTag}"`, () => {
        expect(roster.length).toBeGreaterThan(0);
      });

      it('has a pursuer, so a locked room is a fight (#230)', () => {
        expect(roster.some((entry) => entry.pursues)).toBe(true);
      });

      it('names only real, land-bound enemies', () => {
        for (const entry of roster) {
          expect(knownIds.has(entry.id), entry.id).toBe(true);
          expect(waterCreatures.has(entry.id), `${entry.id} needs water`).toBe(false);
        }
      });

      it('lists only water creatures as stream dwellers', () => {
        for (const id of STREAM_DWELLERS[config.floorTag] ?? []) {
          expect(waterCreatures.has(id), id).toBe(true);
        }
      });
    },
  );
});

describe('Floor 3 generated rooms', () => {
  const config = FLOOR_CONFIGS.find((entry) => entry.floor === 3);
  if (config === undefined) throw new Error('missing Floor 3 config');
  const params = { ...DEFAULT_ROOM_GEN_TUNING, ...ROOM_GEN_FLOOR_OVERRIDES[config.floorTag] };

  const rooms = Array.from({ length: 300 }, (_, seed) =>
    generateRoom(
      {
        roomId: `r${String(seed)}`,
        floor: 3,
        floorTag: config.floorTag,
        doors: ['north', 'south'],
        distanceFromStart: seed % 6,
        bossDistance: 6,
        rng: new Rng(roomGenSeed(7, 3, `r${String(seed)}`, seed)),
      },
      params,
    ),
  );
  const enemiesOf = (room: (typeof rooms)[number]): string[] =>
    room.spawnGroups.flatMap((group) => group.choices.map((choice) => choice.enemyId));

  it('fills rooms with enemies, and never a Bierratte', () => {
    const seen = new Set(rooms.flatMap(enemiesOf));
    expect(rooms.filter((room) => enemiesOf(room).length > 0).length).toBeGreaterThan(250);
    expect(seen).toEqual(new Set(['zecke', 'kaninchen', 'fliegenpilz', 'bachforelle']));
    expect(seen.has('bierratte')).toBe(false);
  });

  it('puts a Bachforelle only in a room with a Waldbach', () => {
    for (const room of rooms) {
      if (enemiesOf(room).includes('bachforelle')) {
        expect(room.hazards.map((hazard) => hazard.type)).toContain('waldbach');
      }
    }
  });
});
