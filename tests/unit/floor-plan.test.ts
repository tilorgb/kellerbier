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
  type SingleCellRoomTemplate,
} from '../../src/content/rooms/definition.js';
import {
  generateFloor,
  neighborRoomIds,
  validateFloorPlan,
  type FloorPlan,
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

/**
 * `syntheticPool()` plus one extra `1x1` treasure template per floor tag,
 * `keyLocked: true` — everything else about it identical to (and so always
 * competing on weight with) the ordinary treasure template already in the
 * pool. Kept separate from `syntheticPool()` itself rather than folded in:
 * most of that helper's callers don't care about key-locked rooms at all,
 * and adding a second treasure template to every one of them would change
 * how often the *ordinary* treasure template gets picked in tests that are
 * about something else entirely.
 */
function syntheticPoolWithLockedTreasure(): RoomTemplate[] {
  const pool = syntheticPool();
  const treasureTemplates = pool.filter(
    (template): template is SingleCellRoomTemplate =>
      template.metadata.shape === '1x1' && template.metadata.specialRole === 'treasure',
  );
  for (const template of treasureTemplates) {
    pool.push({
      ...template,
      id: `${template.id}-locked`,
      metadata: { ...template.metadata, keyLocked: true },
    });
  }
  return pool;
}

/**
 * `syntheticPool()` plus one `1x1` mini-boss arena per floor tag in `tags`
 * (every floor tag by default) — #274's slot is only ever assigned on a floor
 * whose content can actually fill it, so a pool without one of these is the
 * "floor 3-7 has no mini-boss authored yet" case, and a pool with one is
 * floors 1-2's.
 */
function syntheticPoolWithMiniboss(
  tags: readonly string[] = FLOOR_CONFIGS.map((config) => config.floorTag),
): RoomTemplate[] {
  const pool = syntheticPool();
  const template = pool.find(
    (candidate): candidate is SingleCellRoomTemplate =>
      candidate.metadata.shape === '1x1' && candidate.metadata.specialRole === undefined,
  );
  if (template === undefined) {
    throw new Error('synthetic pool has no 1x1 ordinary template to base a mini-boss arena on');
  }
  for (const tag of tags) {
    pool.push({
      ...template,
      id: `synthetic-${tag}-1x1-miniboss`,
      metadata: { ...template.metadata, floorTags: [tag], specialRole: 'miniboss' },
    });
  }
  return pool;
}

/** Every room reachable from the start room with `removedId` cut out of the floor graph — re-derived here rather than imported, so this tests the rule and not the implementation of it. */
function reachableWithout(plan: FloorPlan, removedId: string): Set<string> {
  const byId = new Map(plan.rooms.map((room) => [room.id, room] as const));
  const visited = new Set<string>([plan.startRoomId]);
  const queue = [plan.startRoomId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    for (const neighborId of neighborRoomIds(byId.get(current ?? '')?.doors ?? [])) {
      if (neighborId === removedId || visited.has(neighborId)) {
        continue;
      }
      visited.add(neighborId);
      queue.push(neighborId);
    }
  }
  return visited;
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

  it('a known-good seed generates a valid floor 1', () => {
    // `npm run dev` no longer boots into a fixed seed (it randomises one on
    // every load, and `?seed=`/the `R` key can pin a specific one instead —
    // see `app/main.ts`), so this seed is no longer "the dev demo's" in
    // particular, just a known-good regression lock: hand-picked to succeed.
    // Content or generator changes can shift which seeds succeed (that's
    // exactly what broke seed 5 once #23's specialRole matching landed, seed
    // 15 once #107's `T` shape and rebalanced `chooseShape` weights landed,
    // and seed 11 once #112's `buildDoorAllowance` started excluding an
    // `L`/`T` room's own void-adjacent directions from `computeAdjacency` —
    // a floor that only "validated" before because a void-doomed door was
    // still counted as a real connection now correctly retries instead), so
    // this exists to catch that class of regression on its own, decoupled
    // from whatever seed a given `npm run dev` session happens to be using.
    const RUN_SEED = 16;
    const config = floorConfig(0);
    const plan = generateFloor(
      createStreamRng(RUN_SEED, RngStream.Floor),
      config,
      CELLAR_TEMPLATES,
    );

    expect(validateFloorPlan(plan, CELLAR_TEMPLATES)).toEqual([]);
  });

  it('rolls every shape somewhere across many floors, without ever rolling more than one big room on the same floor', () => {
    // A big (non-`1x1`) room is a rare, at-most-one-per-floor landmark
    // (#big-rooms) — `chooseShape`'s weights are low and `buildSkeleton`'s
    // `MAX_BIG_ROOMS_PER_FLOOR` backstops them, so no single floor should
    // ever roll two, but every shape should still turn up given enough
    // floors, proving `chooseShape`'s weighted pick still reaches every
    // branch rather than one going quietly dead.
    const config = floorConfig(0);
    const seenShapes = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const plan = generateFloor(new Rng(seed), config, CELLAR_TEMPLATES);
      const bigRoomShapes = plan.rooms
        .map((room) => room.shape)
        .filter((shape) => shape !== '1x1' && shape !== 'staircase');
      expect(bigRoomShapes.length, `seed ${String(seed)}`).toBeLessThanOrEqual(1);
      for (const shape of plan.rooms.map((room) => room.shape)) {
        seenShapes.add(shape);
      }
    }
    expect([...seenShapes].sort()).toEqual([...ROOM_SHAPES].sort());
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

  it('never places a key-locked template anywhere but a dead end', () => {
    // A key-locked treasure room (#196) costs a Kellerschlüssel to enter —
    // if the generator ever placed one on a room needing more than its own
    // one door, that room would sit on the *only* path to whatever is past
    // it (up to and including the boss), stranding a keyless player. The
    // ordinary, unlocked treasure template stays eligible for every slot
    // regardless, so this is never the reason a floor fails to generate.
    const pool = syntheticPoolWithLockedTreasure();
    const templatesById = new Map(pool.map((template) => [template.id, template]));
    let checkedAny = false;
    for (let seed = 0; seed < 2000; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool);
      for (const room of plan.rooms) {
        if (templatesById.get(room.templateId)?.metadata.keyLocked !== true) {
          continue;
        }
        checkedAny = true;
        expect(
          room.doors.length,
          `seed ${String(seed)}, room ${room.id} uses key-locked template "${room.templateId}" with ${String(room.doors.length)} doors`,
        ).toBe(1);
      }
    }
    expect(checkedAny).toBe(true);
  });

  it("never locks floor 1's treasure room behind a key — it is the run's free kickstart item", () => {
    // A first-time player has no reason yet to expect a locked door hides
    // something worth a Kellerschlüssel, and whether they even have one by
    // then is pure chance — gating the very first item behind it turns "free
    // item to get the run started" into "maybe an item, maybe nothing."
    // Every other floor still rolls the locked template normally, which the
    // next assertion below checks for.
    const pool = syntheticPoolWithLockedTreasure();
    const templatesById = new Map(pool.map((template) => [template.id, template]));
    const floor1Config = floorConfig(0);
    expect(floor1Config.floor).toBe(1);
    for (let seed = 0; seed < 500; seed++) {
      const plan = generateFloor(new Rng(seed), floor1Config, pool);
      const treasureRoom = plan.rooms.find((room) => room.id === plan.treasureRoomId);
      expect(
        templatesById.get(treasureRoom?.templateId ?? '')?.metadata.keyLocked,
        `seed ${String(seed)}`,
      ).not.toBe(true);
    }
  });

  it('still rolls the locked treasure template on other floors, at least sometimes', () => {
    // The floor-1 exclusion above must not have accidentally become global —
    // this is what would catch that.
    const pool = syntheticPoolWithLockedTreasure();
    const templatesById = new Map(pool.map((template) => [template.id, template]));
    const floor2Config = floorConfig(1);
    expect(floor2Config.floor).toBe(2);
    let sawLocked = false;
    for (let seed = 0; seed < 500; seed++) {
      const plan = generateFloor(new Rng(seed), floor2Config, pool);
      const treasureRoom = plan.rooms.find((room) => room.id === plan.treasureRoomId);
      if (templatesById.get(treasureRoom?.templateId ?? '')?.metadata.keyLocked === true) {
        sawLocked = true;
        break;
      }
    }
    expect(sawLocked).toBe(true);
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

describe('XL floors (#271)', () => {
  it('rolls extraLarge deterministically for the same seed', () => {
    const config = floorConfig(0);
    const planA = generateFloor(new Rng(42), config, syntheticPool());
    const planB = generateFloor(new Rng(42), config, syntheticPool());
    expect(planB.extraLarge).toBe(planA.extraLarge);
  });

  it('never rolls extraLarge when xlChance is 0', () => {
    const config: FloorConfig = { ...floorConfig(0), xlChance: 0 };
    for (let seed = 0; seed < 200; seed++) {
      const plan = generateFloor(new Rng(seed), config, syntheticPool());
      expect(plan.extraLarge, `seed ${String(seed)}`).toBe(false);
    }
  });

  it('always rolls extraLarge when xlChance is 1, and scales up room count and boss distance', () => {
    const pool = syntheticPool();
    for (const base of FLOOR_CONFIGS) {
      const config: FloorConfig = { ...base, xlChance: 1 };
      for (let seed = 0; seed < 50; seed++) {
        const plan = generateFloor(new Rng(seed), config, pool);
        expect(plan.extraLarge, `floor ${config.name}, seed ${String(seed)}`).toBe(true);
        // `+1` for the secret room removed from `targetCount`'s own roll, and
        // some slack for the supersecret room / a big room's extra cells —
        // the same loose bound `validates a real floor 1 layout` above uses.
        expect(
          plan.rooms.length,
          `floor ${config.name}, seed ${String(seed)}`,
        ).toBeGreaterThanOrEqual(Math.round(base.minRooms * base.xlRoomMultiplier) - 1);
        const bossRoom = plan.rooms.find((room) => room.id === plan.bossRoomId);
        const expectedMinDistance = Math.round(
          base.minBossDistance * Math.sqrt(base.xlRoomMultiplier),
        );
        expect(
          bossRoom?.distanceFromStart,
          `floor ${config.name}, seed ${String(seed)}`,
        ).toBeGreaterThanOrEqual(expectedMinDistance);
      }
    }
  });

  it('never places the boss closer than minBossDistance, across every floor, XL and not', () => {
    const pool = syntheticPool();
    for (const base of FLOOR_CONFIGS) {
      for (const xlChance of [0, 1]) {
        const config: FloorConfig = { ...base, xlChance };
        for (let seed = 0; seed < 100; seed++) {
          const plan = generateFloor(new Rng(seed + 9000), config, pool);
          const bossRoom = plan.rooms.find((room) => room.id === plan.bossRoomId);
          const minBossDistance = plan.extraLarge
            ? Math.round(base.minBossDistance * Math.sqrt(base.xlRoomMultiplier))
            : base.minBossDistance;
          expect(
            bossRoom?.distanceFromStart,
            `floor ${config.name}, xlChance ${String(xlChance)}, seed ${String(seed)}`,
          ).toBeGreaterThanOrEqual(minBossDistance);
        }
      }
    }
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

  it("draws a staircase's minimap steps flush against its real neighbours, with no gap (#118)", () => {
    // The whole point of exact sub-cell reservation: the minimap should
    // show exactly the rooms the player can walk, with no visible gap
    // between a staircase's real steps and the ordinary rooms on either
    // end. `minimapRects`' first/last step and the corresponding
    // neighbour's own cell (found the same way `computeAdjacency` did, off
    // `room.doors`) must share an edge exactly — zero gap, zero overlap.
    const pool = syntheticPool();
    const staircasePool = syntheticStaircasePool();
    let checkedDoors = 0;
    for (let seed = 0; seed < 500; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool, staircasePool);
      const byId = new Map(plan.rooms.map((room) => [room.id, room] as const));
      for (const room of plan.rooms) {
        if (room.staircaseTemplateId === undefined || room.minimapRects === undefined) {
          continue;
        }
        for (const door of room.doors) {
          const doorCell = room.cells[door.cellIndex];
          const neighbor = byId.get(door.neighborRoomId);
          if (doorCell === undefined || neighbor === undefined) {
            continue;
          }
          const offset = DIRECTION_OFFSET[door.direction];
          const expectedNeighborCell = { x: doorCell.x + offset.x, y: doorCell.y + offset.y };
          const neighborHasCell = neighbor.cells.some(
            (cell) => cell.x === expectedNeighborCell.x && cell.y === expectedNeighborCell.y,
          );
          expect(
            neighborHasCell,
            `seed ${String(seed)}, room ${room.id}, door ${JSON.stringify(door)}`,
          ).toBe(true);

          const step = door.cellIndex === 0 ? room.minimapRects[0] : room.minimapRects.at(-1);
          if (step === undefined) {
            continue;
          }
          checkedDoors++;
          const neighborRect = {
            minX: expectedNeighborCell.x,
            maxX: expectedNeighborCell.x + 1,
            minY: expectedNeighborCell.y,
            maxY: expectedNeighborCell.y + 1,
          };
          // Sharing exactly one edge (the door's own wall), zero gap and
          // zero overlap on that axis; fully aligned on the other axis.
          const context = `seed ${String(seed)}, room ${room.id}, door ${JSON.stringify(door)}`;
          switch (door.direction) {
            case 'north':
              expect(step.minY, context).toBeCloseTo(neighborRect.maxY);
              expect(step.minX, context).toBeCloseTo(neighborRect.minX);
              expect(step.maxX, context).toBeCloseTo(neighborRect.maxX);
              break;
            case 'south':
              expect(step.maxY, context).toBeCloseTo(neighborRect.minY);
              expect(step.minX, context).toBeCloseTo(neighborRect.minX);
              expect(step.maxX, context).toBeCloseTo(neighborRect.maxX);
              break;
            case 'east':
              expect(step.maxX, context).toBeCloseTo(neighborRect.minX);
              expect(step.minY, context).toBeCloseTo(neighborRect.minY);
              expect(step.maxY, context).toBeCloseTo(neighborRect.maxY);
              break;
            case 'west':
              expect(step.minX, context).toBeCloseTo(neighborRect.maxX);
              expect(step.minY, context).toBeCloseTo(neighborRect.minY);
              expect(step.maxY, context).toBeCloseTo(neighborRect.maxY);
              break;
          }
        }
      }
    }
    expect(checkedDoors).toBeGreaterThan(0);
  });
});

/**
 * #274's mini-boss gate: one room per floor (two on an XL floor), placed in
 * the last third, never next to the boss and never on the only path to it —
 * because #275 puts the key to the boss door in it, and a gate on the
 * critical path is a gate nobody chooses to take.
 */
describe('mini-boss rooms (#274)', () => {
  it('places one per ordinary floor and two on an XL floor, satisfying rules 1-3, over 10,000 floors', () => {
    const pool = syntheticPoolWithMiniboss();
    let sawExtraLarge = false;
    for (let seed = 0; seed < STRESS_FLOOR_COUNT; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool);
      const context = `seed ${String(seed)}, floor ${config.name}`;
      sawExtraLarge = sawExtraLarge || plan.extraLarge;

      const minibosses = plan.rooms.filter((room) => room.role === 'miniboss');
      expect(minibosses.length, context).toBe(plan.extraLarge ? 2 : 1);
      expect([...plan.minibossRoomIds].sort(), context).toEqual(
        minibosses.map((room) => room.id).sort(),
      );

      const bossRoom = plan.rooms.find((room) => room.id === plan.bossRoomId);
      const bossNeighbors = new Set(neighborRoomIds(bossRoom?.doors ?? []));
      for (const room of minibosses) {
        // Rule 5: `1x1` only, same as the boss slot.
        expect(room.shape, `${context}, room ${room.id}`).toBe('1x1');
        // Rule 1: the last third of the floor, measured against the boss.
        expect(room.distanceFromStart, `${context}, room ${room.id}`).toBeGreaterThanOrEqual(
          0.6 * (bossRoom?.distanceFromStart ?? 0),
        );
        // Rule 2: never in sight of the door its key opens.
        expect(bossNeighbors.has(room.id), `${context}, room ${room.id}`).toBe(false);
        // Rule 3: the point of the role — removing it never cuts the boss off.
        expect(
          reachableWithout(plan, room.id).has(plan.bossRoomId),
          `${context}, room ${room.id}`,
        ).toBe(true);
      }
    }
    // Two mini-bosses is an XL-floor rule, so the sweep has to have actually
    // rolled some XL floors for the assertion above to have meant anything.
    expect(sawExtraLarge).toBe(true);
  }, 120_000);

  it('gives a floor whose content has no mini-boss template no mini-boss slot at all, rather than failing to generate', () => {
    // Floors 3-7 today (#39-#43, parked in M10): room content in place,
    // no mini-boss authored. `CLAUDE.md`'s graceful-degradation rule — a
    // content gap must degrade to "no mini-boss and no lock", never to a
    // floor that throws, and never to a locked boss door with no key.
    const pool = syntheticPool();
    for (let seed = 0; seed < 500; seed++) {
      const config = floorConfig(seed % FLOOR_CONFIGS.length);
      const plan = generateFloor(new Rng(seed), config, pool);
      const context = `seed ${String(seed)}, floor ${config.name}`;
      expect(plan.minibossRoomIds, context).toEqual([]);
      expect(
        plan.rooms.some((room) => room.role === 'miniboss'),
        context,
      ).toBe(false);
      expect(validateFloorPlan(plan, pool), context).toEqual([]);
    }
  });

  it('gives the slot only to floors whose own tag has the template, on a pool where some do and some do not', () => {
    // The real content shape today: floors 1-2 have a mini-boss arena, the
    // rest do not. One floor's gap must never cost another floor its slot.
    const pool = syntheticPoolWithMiniboss(['cellar', 'rural']);
    for (const base of FLOOR_CONFIGS) {
      const expected = base.floorTag === 'cellar' || base.floorTag === 'rural';
      for (let seed = 0; seed < 40; seed++) {
        const plan = generateFloor(new Rng(seed + 4200), base, pool);
        expect(plan.minibossRoomIds.length > 0, `floor ${base.name}, seed ${String(seed)}`).toBe(
          expected,
        );
      }
    }
  });

  it('prefers a dead end, the same fallback shape the treasure and shop slots use', () => {
    const pool = syntheticPoolWithMiniboss();
    const config = floorConfig(0);
    let deadEnds = 0;
    let total = 0;
    for (let seed = 0; seed < 300; seed++) {
      const plan = generateFloor(new Rng(seed + 7700), config, pool);
      for (const id of plan.minibossRoomIds) {
        const room = plan.rooms.find((candidate) => candidate.id === id);
        total += 1;
        if (neighborRoomIds(room?.doors ?? []).length === 1) {
          deadEnds += 1;
        }
      }
    }
    expect(total).toBeGreaterThan(0);
    // Not "always": rules 1-3 can leave a floor with no eligible dead end at
    // all, and the slot then falls back to a through-room rather than the
    // floor retrying forever. The preference should still dominate.
    expect(deadEnds / total).toBeGreaterThan(0.5);
  });

  it('reports a mini-boss room placed against its own rules as a validation problem', () => {
    // `validateFloorPlan` re-derives rules 1-3 rather than trusting
    // `assignRoles` — this is what proves it, by relabelling the room next
    // door to the boss and expecting the complaint.
    const pool = syntheticPoolWithMiniboss();
    const plan = generateFloor(new Rng(31), floorConfig(0), pool);
    const bossRoom = plan.rooms.find((room) => room.id === plan.bossRoomId);
    const neighborId = neighborRoomIds(bossRoom?.doors ?? [])[0];
    if (neighborId === undefined) {
      throw new Error('boss room has no neighbour');
    }
    const tampered: FloorPlan = {
      ...plan,
      minibossRoomIds: [neighborId],
      rooms: plan.rooms.map((room) =>
        room.id === neighborId
          ? { ...room, role: 'miniboss' as const }
          : room.role === 'miniboss'
            ? { ...room, role: 'normal' as const }
            : room,
      ),
    };
    expect(validateFloorPlan(tampered).join('; ')).toContain('adjacent to the boss room');
  });
});
