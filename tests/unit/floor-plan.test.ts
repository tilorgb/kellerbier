import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS, type FloorConfig } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import {
  DIRECTION_OFFSET,
  MULTI_CELL_COUNT,
  ROOM_COLUMNS,
  ROOM_ROWS,
  ROOM_SHAPES,
  type RoomSpecialRole,
  type RoomSubLayout,
  type RoomTemplate,
} from '../../src/content/rooms/definition.js';
import {
  generateFloor,
  neighborRoomIds,
  validateFloorPlan,
} from '../../src/sim/room/floor-plan.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';
import type { StaircaseContentTemplate } from '../../src/sim/room/staircase.js';
import { computeVoidCells, voidCellKey } from '../../src/sim/room/void-cells.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { RngStream, createStreamRng } from '../../src/sim/rng/streams.js';

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
 * A synthetic pool with one template per (shape × floor tag × special role),
 * all doors open.
 *
 * Real content only covers floor 1 and 2's `cellar`/`rural` tags — floors
 * 3–7 are #39–#43, not yet authored. The 10,000-floor test below is about
 * the generator, not the content, so it is given a pool that can never be
 * the reason a floor fails to build: every shape the generator can produce
 * has a template for every floor tag it might need, for every role a slot
 * might be — role assignment (`assignRoles`, floor-plan.ts) does not
 * constrain a special room's shape, so e.g. a boss room can land on any of
 * the four shapes and needs a matching `specialRole: 'boss'` template there.
 */
function syntheticPool(): RoomTemplate[] {
  const blankRow = '#' + '.'.repeat(ROOM_COLUMNS - 2) + '#';
  const wallRow = '#'.repeat(ROOM_COLUMNS);
  const tileGrid = Array.from({ length: ROOM_ROWS }, (_row, index) =>
    index === 0 || index === ROOM_ROWS - 1 ? wallRow : blankRow,
  );
  const subLayout: RoomSubLayout = {
    tileGrid,
    obstacles: [],
    enemySpawns: [],
    spawnGroups: [],
    pickupSpawns: [],
    hazards: [],
    decorativeProps: [],
  };
  const shapes = ROOM_SHAPES;
  const specialRoles: readonly (RoomSpecialRole | undefined)[] = [
    undefined,
    'boss',
    'treasure',
    'shop',
    'secret',
    'supersecret',
  ];

  const templates: RoomTemplate[] = [];
  for (const config of FLOOR_CONFIGS) {
    for (const shape of shapes) {
      for (const specialRole of specialRoles) {
        const id = `synthetic-${config.floorTag}-${shape}-${specialRole ?? 'normal'}`;
        const specialRoleFields = specialRole === undefined ? {} : { specialRole };
        if (shape === '1x1') {
          templates.push({
            id,
            ...subLayout,
            metadata: {
              floorTags: [config.floorTag],
              shape: '1x1',
              doors: { north: true, east: true, south: true, west: true },
              difficultyTier: 1,
              weight: 1,
              ...specialRoleFields,
            },
          });
          continue;
        }
        templates.push({
          id,
          cells: Array.from({ length: MULTI_CELL_COUNT[shape] }, () => subLayout),
          metadata: {
            floorTags: [config.floorTag],
            shape,
            difficultyTier: 1,
            weight: 1,
            ...specialRoleFields,
          },
        });
      }
    }
  }
  return templates;
}

/** One staircase template per floor tag — enough for the generator to have something to place (#112). */
function syntheticStaircasePool(): StaircaseContentTemplate[] {
  return FLOOR_CONFIGS.map((config) => ({
    id: `synthetic-staircase-${config.floorTag}`,
    stepCount: 4,
    direction: 'up-right',
    startDoor: 'south',
    endDoor: 'north',
    floorTags: [config.floorTag],
    weight: 1,
  }));
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

  it('a known-good seed generates a valid floor 1 that rolls every shape', () => {
    // `npm run dev` no longer boots into a fixed seed (it randomises one on
    // every load, and `?seed=`/the `R` key can pin a specific one instead —
    // see `app/main.ts`), so this seed is no longer "the dev demo's" in
    // particular, just a known-good regression lock: hand-picked to succeed
    // and to roll every shape (1x1/1x2/2x2/L/T) on floor 1. Content or
    // generator changes can shift which seeds succeed (that's exactly what
    // broke seed 5 once #23's specialRole matching landed, seed 15 once
    // #107's `T` shape and rebalanced `chooseShape` weights landed, and
    // seed 11 once #112's `buildDoorAllowance` started excluding an `L`/`T`
    // room's own void-adjacent directions from `computeAdjacency` — a floor
    // that only "validated" before because a void-doomed door was still
    // counted as a real connection now correctly retries instead), so this
    // exists to catch that class of regression on its own, decoupled from
    // whatever seed a given `npm run dev` session happens to be using.
    const RUN_SEED = 16;
    const config = floorConfig(0);
    const plan = generateFloor(
      createStreamRng(RUN_SEED, RngStream.Floor),
      config,
      CELLAR_TEMPLATES,
    );

    expect(validateFloorPlan(plan, CELLAR_TEMPLATES)).toEqual([]);
    const shapes = new Set(plan.rooms.map((room) => room.shape));
    expect([...shapes].sort()).toEqual([...ROOM_SHAPES].sort());
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
    expect(plan.rooms.find((room) => room.id === plan.supersecretRoomId)?.role).toBe('supersecret');
  });

  it('never places a secret room touching fewer than two other rooms', () => {
    for (let seed = 0; seed < 200; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, syntheticPool());
      const secretRoom = plan.rooms.find((room) => room.id === plan.secretRoomId);
      const touching = neighborRoomIds(secretRoom?.doors ?? []).length;
      expect(touching, `seed ${String(seed)}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('only ever places a special-role template in its matching slot', () => {
    for (let seed = 0; seed < 100; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed + 5000), config, syntheticPool());
      expect(validateFloorPlan(plan, syntheticPool())).toEqual([]);
    }
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

  it('never gives an L/T room a door that points into its own void cell', () => {
    // `compileRoomTemplate` drops any door pointing into a shape's own void
    // cell (`L`'s dropped corner, `T`'s four, #107) unconditionally — a real
    // instance of the abstract floor-plan graph disagreeing with that once
    // sent the minimap in reveal a connection the compiled room could never
    // actually open. `computeAdjacency`'s `buildDoorAllowance` is where that
    // agreement is enforced now, for every room, not just re-derived by
    // whichever downstream consumer happens to remember to check.
    const pool = syntheticPool();
    let checkedAny = false;
    for (let seed = 0; seed < 500; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool);
      for (const room of plan.rooms) {
        if (room.shape !== 'L' && room.shape !== 'T') {
          continue;
        }
        checkedAny = true;
        const voidKeys = new Set(computeVoidCells(room.cells).map(voidCellKey));
        for (const door of room.doors) {
          const cell = room.cells[door.cellIndex];
          if (cell === undefined) {
            continue;
          }
          const offset = DIRECTION_OFFSET[door.direction];
          const neighborKey = voidCellKey({ x: cell.x + offset.x, y: cell.y + offset.y });
          expect(
            voidKeys.has(neighborKey),
            `seed ${String(seed)}, room ${room.id} (${room.shape}), door ${JSON.stringify(door)}`,
          ).toBe(false);
        }
      }
    }
    expect(checkedAny).toBe(true);
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

describe('floor generation with a staircase pool (#112)', () => {
  it('omitting staircasePool leaves generation exactly as before it existed', () => {
    // The regression this whole feature must never cause: every existing
    // caller (including this file's own tests above) doesn't pass a 4th
    // argument at all, and `generateFloor` must produce byte-identical
    // output to before `staircasePool` existed for the same seed.
    const config = floorConfig(0);
    const withoutArg = generateFloor(new Rng(7), config, CELLAR_TEMPLATES);
    const withEmptyPool = generateFloor(new Rng(7), config, CELLAR_TEMPLATES, []);
    expect(withEmptyPool).toEqual(withoutArg);
  });

  it('places a staircase without colliding with any other room, and keeps every room reachable', () => {
    // `validateFloorPlan` already checks both of these generically (cell
    // ownership uniqueness, and BFS reachability from the start room) — the
    // only thing specific to this test is giving the generator a staircase
    // pool with a real chance of firing, across enough seeds that at least
    // one actually rolls one, so those generic checks are exercised on a
    // floor that actually has one.
    const pool = syntheticPool();
    const staircasePool = syntheticStaircasePool();
    let sawStaircase = false;
    for (let seed = 0; seed < 500; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool, staircasePool);
      expect(validateFloorPlan(plan, pool), `seed ${String(seed)}`).toEqual([]);
      if (plan.rooms.some((room) => room.staircaseTemplateId !== undefined)) {
        sawStaircase = true;
      }
    }
    expect(sawStaircase).toBe(true);
  });

  it('never gives a staircase room a door anywhere but its own two ends', () => {
    const pool = syntheticPool();
    const staircasePool = syntheticStaircasePool();
    let checkedAny = false;
    for (let seed = 0; seed < 500; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool, staircasePool);
      for (const room of plan.rooms) {
        if (room.staircaseTemplateId === undefined) {
          continue;
        }
        checkedAny = true;
        const lastIndex = room.cells.length - 1;
        for (const door of room.doors) {
          expect([0, lastIndex], `seed ${String(seed)}, room ${room.id}`).toContain(door.cellIndex);
        }
      }
    }
    expect(checkedAny).toBe(true);
  });

  it('always has a real room on both ends, not just the one it grew from', () => {
    // A staircase is the floor's single biggest room by walking time —
    // reaching its far door only to find nothing there would read as
    // wasted effort, not an arrival. The near end always has a room by
    // construction (that's where it grew from); this is the guarantee for
    // the far one (`floor-plan.ts`'s `placeStaircase`/`farNeighborCell`).
    const pool = syntheticPool();
    const staircasePool = syntheticStaircasePool();
    let checkedAny = false;
    for (let seed = 0; seed < 500; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool, staircasePool);
      for (const room of plan.rooms) {
        if (room.staircaseTemplateId === undefined) {
          continue;
        }
        checkedAny = true;
        expect(room.doors, `seed ${String(seed)}, room ${room.id}`).toHaveLength(2);
        const cellIndices = new Set(room.doors.map((door) => door.cellIndex));
        expect(cellIndices, `seed ${String(seed)}, room ${room.id}`).toEqual(
          new Set([0, room.cells.length - 1]),
        );
      }
    }
    expect(checkedAny).toBe(true);
  });

  it('carries a real pixel centre for both of its doors, precomputed at placement time (#117)', () => {
    // `app/main.ts`'s `hiddenDoorsFor`/`crackHintsFor` read `doorCentres`
    // directly rather than compiling the staircase room themselves — this
    // is the regression that guard would miss: `doorCentres` has to
    // actually be there, with one entry per real door, matching the
    // direction that door was placed on.
    const pool = syntheticPool();
    const staircasePool = syntheticStaircasePool();
    let checkedAny = false;
    for (let seed = 0; seed < 500; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool, staircasePool);
      for (const room of plan.rooms) {
        if (room.staircaseTemplateId === undefined) {
          continue;
        }
        checkedAny = true;
        const centres = room.doorCentres ?? [];
        expect(centres, `seed ${String(seed)}, room ${room.id}`).toHaveLength(2);
        for (const centre of centres) {
          expect(Number.isFinite(centre.x), `seed ${String(seed)}, room ${room.id}`).toBe(true);
          expect(Number.isFinite(centre.y), `seed ${String(seed)}, room ${room.id}`).toBe(true);
        }
        expect(
          new Set(centres.map((centre) => centre.direction)),
          `seed ${String(seed)}, room ${room.id}`,
        ).toEqual(new Set(room.doors.map((door) => door.direction)));
      }
    }
    expect(checkedAny).toBe(true);
  });
});
