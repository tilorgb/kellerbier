import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS, HIGHEST_SANDBOX_FLOOR } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
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
/**
 * Floor 3's mobs are exactly what its generator roster lists — no Bierratte,
 * Kuh or Bauer carried over. Read from the roster rather than restated here,
 * so a new Floor 3 mob added only to the authored `wald-*` rooms (the gap
 * that left most of the floor empty) fails below with its own id, pointing
 * at `ROSTERS.wald`.
 */
const FLOOR_3_MOBS = new Set([
  ...(ROSTERS.wald ?? []).map((entry) => entry.id),
  ...(STREAM_DWELLERS.wald ?? []),
]);
/** Floor 4's mobs (#40), read off its roster the same way. */
const FLOOR_4_MOBS = new Set((ROSTERS.alpen ?? []).map((entry) => entry.id));
const reachableFloors = FLOOR_CONFIGS.filter((config) => config.floor <= HIGHEST_SANDBOX_FLOOR);

describe('room generator rosters', () => {
  it('covers at least floors 1 to 4', () => {
    expect(reachableFloors.map((config) => config.floor)).toEqual(
      expect.arrayContaining([1, 2, 3, 4]),
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

  it('has the Floor 3 mobs this was written against', () => {
    for (const id of ['zecke', 'kaninchen', 'fliegenpilz', 'bachforelle', 'boar']) {
      expect(FLOOR_3_MOBS.has(id), id).toBe(true);
    }
    expect(FLOOR_3_MOBS.has('bierratte')).toBe(false);
  });

  it('fills rooms with enemies, and only Floor 3 mobs', () => {
    const seen = new Set(rooms.flatMap(enemiesOf));
    expect(rooms.filter((room) => enemiesOf(room).length > 0).length).toBeGreaterThan(250);
    expect(seen).toEqual(FLOOR_3_MOBS);
  });

  it('puts a Bachforelle only in a room with a Waldbach', () => {
    for (const room of rooms) {
      if (enemiesOf(room).includes('bachforelle')) {
        expect(room.hazards.map((hazard) => hazard.type)).toContain('waldbach');
      }
    }
  });
});

describe('Floor 3 authored rooms', () => {
  interface Template {
    id?: string;
    metadata?: { floorTags?: string[]; specialRole?: string };
    spawnGroups?: { choices: { enemyId: string }[] }[];
    cells?: { spawnGroups?: { choices: { enemyId: string }[] }[] }[];
  }
  const rooms = (ROOM_TEMPLATES as Template[]).filter(
    (room) =>
      room.metadata?.floorTags?.includes('wald') === true &&
      room.metadata.specialRole !== 'boss' &&
      room.metadata.specialRole !== 'miniboss',
  );

  it('finds the wald rooms', () => {
    expect(rooms.length).toBeGreaterThan(5);
  });

  it.each(rooms.map((room) => [room.id ?? '?', room] as const))(
    '%s spawns only Floor 3 mobs',
    (_id, room) => {
      const groups = [
        ...(room.spawnGroups ?? []),
        ...(room.cells ?? []).flatMap((cell) => cell.spawnGroups ?? []),
      ];
      for (const choice of groups.flatMap((group) => group.choices)) {
        // The shared shop rooms' shopkeeper is an NPC, not a mob.
        const allowed = FLOOR_3_MOBS.has(choice.enemyId) || choice.enemyId === 'shopkeeper';
        expect(allowed, `${choice.enemyId} is not in ROSTERS.wald / STREAM_DWELLERS.wald`).toBe(
          true,
        );
      }
    },
  );
});

describe('Floor 4 generated rooms (#40)', () => {
  const config = FLOOR_CONFIGS.find((entry) => entry.floor === 4);
  if (config === undefined) throw new Error('missing Floor 4 config');
  const params = { ...DEFAULT_ROOM_GEN_TUNING, ...ROOM_GEN_FLOOR_OVERRIDES[config.floorTag] };

  const rooms = Array.from({ length: 300 }, (_, seed) =>
    generateRoom(
      {
        roomId: `r${String(seed)}`,
        floor: 4,
        floorTag: config.floorTag,
        doors: ['north', 'south'],
        distanceFromStart: seed % 6,
        bossDistance: 6,
        rng: new Rng(roomGenSeed(7, 4, `r${String(seed)}`, seed)),
      },
      params,
    ),
  );
  const enemiesOf = (room: (typeof rooms)[number]): string[] =>
    room.spawnGroups.flatMap((group) => group.choices.map((choice) => choice.enemyId));

  it('has the Floor 4 mobs this was written against, and none of the Wald’s', () => {
    for (const id of ['murmeltier']) {
      expect(FLOOR_4_MOBS.has(id), id).toBe(true);
    }
    expect(FLOOR_4_MOBS.has('zecke')).toBe(false);
    expect(FLOOR_4_MOBS.has('bierratte')).toBe(false);
  });

  it('fills rooms with enemies, and only Floor 4 mobs', () => {
    const seen = new Set(rooms.flatMap(enemiesOf));
    expect(rooms.filter((room) => enemiesOf(room).length > 0).length).toBeGreaterThan(250);
    expect(seen).toEqual(FLOOR_4_MOBS);
  });
});

describe('Floor 4 authored rooms (#40)', () => {
  interface Template {
    id?: string;
    metadata?: { floorTags?: string[]; specialRole?: string };
    spawnGroups?: { choices: { enemyId: string }[] }[];
    cells?: { spawnGroups?: { choices: { enemyId: string }[] }[] }[];
  }
  const rooms = (ROOM_TEMPLATES as Template[]).filter(
    (room) =>
      room.metadata?.floorTags?.includes('alpen') === true &&
      room.metadata.specialRole !== 'boss' &&
      room.metadata.specialRole !== 'miniboss',
  );

  it('finds the alpen rooms', () => {
    expect(rooms.length).toBeGreaterThan(5);
  });

  it.each(rooms.map((room) => [room.id ?? '?', room] as const))(
    '%s spawns only Floor 4 mobs',
    (_id, room) => {
      const groups = [
        ...(room.spawnGroups ?? []),
        ...(room.cells ?? []).flatMap((cell) => cell.spawnGroups ?? []),
      ];
      for (const choice of groups.flatMap((group) => group.choices)) {
        const allowed = FLOOR_4_MOBS.has(choice.enemyId) || choice.enemyId === 'shopkeeper';
        expect(allowed, `${choice.enemyId} is not in ROSTERS.alpen`).toBe(true);
      }
    },
  );
});
