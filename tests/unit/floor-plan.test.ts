import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS, type FloorConfig } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import {
  ROOM_COLUMNS,
  ROOM_ROWS,
  type RoomShape,
  type RoomTemplate,
} from '../../src/content/rooms/definition.js';
import { generateFloor, validateFloorPlan } from '../../src/sim/room/floor-plan.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';
import { Rng } from '../../src/sim/rng/rng.js';

/** The authored pool, run through the same typed boundary the sim uses. */
const CELLAR_TEMPLATES: readonly RoomTemplate[] = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);

function floorConfig(index: number): FloorConfig {
  const config = FLOOR_CONFIGS[index];
  if (config === undefined) {
    throw new Error(`no floor config at index ${String(index)}`);
  }
  return config;
}

/**
 * A synthetic pool with one template per (shape × floor tag), all doors open.
 *
 * Real content only covers floor 1 and 2's `cellar`/`rural` tags — floors
 * 3–7 are #39–#43, not yet authored. The 10,000-floor test below is about
 * the generator, not the content, so it is given a pool that can never be
 * the reason a floor fails to build: every shape the generator can produce
 * has a template for every floor tag it might need.
 */
function syntheticPool(): RoomTemplate[] {
  const blankRow = '#' + '.'.repeat(ROOM_COLUMNS - 2) + '#';
  const wallRow = '#'.repeat(ROOM_COLUMNS);
  const tileGrid = Array.from({ length: ROOM_ROWS }, (_row, index) =>
    index === 0 || index === ROOM_ROWS - 1 ? wallRow : blankRow,
  );
  const shapes: readonly RoomShape[] = ['1x1', '1x2', '2x2', 'L'];

  const templates: RoomTemplate[] = [];
  for (const config of FLOOR_CONFIGS) {
    for (const shape of shapes) {
      templates.push({
        id: `synthetic-${config.floorTag}-${shape}`,
        tileGrid,
        obstacles: [],
        enemySpawns: [],
        spawnGroups: [],
        pickupSpawns: [],
        hazards: [],
        decorativeProps: [],
        metadata: {
          floorTags: [config.floorTag],
          shape,
          doors: { north: true, east: true, south: true, west: true },
          difficultyTier: 1,
          weight: 1,
        },
      });
    }
  }
  return templates;
}

/** Floors generated across every config, for the stress test below. */
const STRESS_FLOOR_COUNT = 10_000;

describe('floor generation', () => {
  it('produces a byte-identical floor for the same seed', () => {
    const config = floorConfig(0);
    const planA = generateFloor(new Rng(12345), config, CELLAR_TEMPLATES);
    const planB = generateFloor(new Rng(12345), config, CELLAR_TEMPLATES);

    expect(planB).toEqual(planA);
  });

  it('produces a different floor for a different seed', () => {
    const config = floorConfig(0);
    const planA = generateFloor(new Rng(1), config, CELLAR_TEMPLATES);
    const planB = generateFloor(new Rng(2), config, CELLAR_TEMPLATES);

    expect(planB).not.toEqual(planA);
  });

  it('validates a real floor 1 layout against the authored template pool', () => {
    const config = floorConfig(0);
    const plan = generateFloor(new Rng(7), config, CELLAR_TEMPLATES);

    expect(validateFloorPlan(plan, CELLAR_TEMPLATES)).toEqual([]);
    expect(plan.rooms.length).toBeGreaterThanOrEqual(config.minRooms - 1);
    expect(plan.rooms.find((room) => room.id === plan.startRoomId)?.role).toBe('start');
    expect(plan.rooms.find((room) => room.id === plan.bossRoomId)?.role).toBe('boss');
    expect(plan.rooms.find((room) => room.id === plan.treasureRoomId)?.role).toBe('treasure');
    expect(plan.rooms.find((room) => room.id === plan.shopRoomId)?.role).toBe('shop');
    expect(plan.rooms.find((room) => room.id === plan.secretRoomId)?.role).toBe('secret');
  });

  it("places the boss at the floor's maximum walking distance from start", () => {
    const config = floorConfig(0);
    const plan = generateFloor(new Rng(99), config, CELLAR_TEMPLATES);
    const bossRoom = plan.rooms.find((room) => room.id === plan.bossRoomId);
    const maxDistance = Math.max(...plan.rooms.map((room) => room.distanceFromStart));

    expect(bossRoom?.distanceFromStart).toBe(maxDistance);
  });

  it('never places a template whose doors do not cover the slot it fills', () => {
    const pool = syntheticPool();
    for (let seed = 0; seed < 50; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool);
      expect(validateFloorPlan(plan, pool)).toEqual([]);
    }
  });

  it('runs 10,000 floors across all seven floor configs, and every one validates', () => {
    const pool = syntheticPool();
    for (let seed = 0; seed < STRESS_FLOOR_COUNT; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool);
      const problems = validateFloorPlan(plan, pool);
      expect(
        problems,
        `seed ${String(seed)}, floor ${config.name}: ${problems.join('; ')}`,
      ).toEqual([]);
    }
  }, 60_000);

  it('generates one floor in under 20 ms', () => {
    const config = floorConfig(0);
    // One warm-up call so the measured one is not paying JIT compilation.
    generateFloor(new Rng(1), config, CELLAR_TEMPLATES);

    const started = performance.now();
    generateFloor(new Rng(2), config, CELLAR_TEMPLATES);
    const elapsed = performance.now() - started;

    expect(elapsed, `${elapsed.toFixed(3)} ms to generate one floor`).toBeLessThan(20);
  });
});
