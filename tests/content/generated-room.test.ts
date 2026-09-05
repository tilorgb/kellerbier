import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { DOOR_DIRECTIONS, type DoorDirection } from '../../src/content/rooms/definition.js';
import type { EnemyBehaviour, EnemyDefinition } from '../../src/sim/enemy/definition.js';
import {
  DEFAULT_ROOM_GEN_TUNING,
  generateMultiCellRoom,
  generateRoom,
  roomGenSeed,
} from '../../src/sim/room/generate-room.js';
import { MAX_ROOM_BLOCKS, type RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  type CompiledDoor,
  compileRoomTemplate,
  doorCentre,
  validateRoomTemplate,
} from '../../src/sim/room/template.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { PLAYER_RADIUS } from '../../src/sim/game/sim.js';

/**
 * The POC procedural room generator (#random-rooms) has no authored content to
 * fall back on for its own correctness — this is the CI guardrail the
 * `docs/DECISIONS.md` #19 / CLAUDE.md "fails loudly in CI" rule asks for: a
 * content gap must degrade gracefully at runtime *and* still fail the build.
 *
 * Each generated room is checked for the invariants a hand-authored room would
 * be reviewed for: it validates, it compiles on its floor, it stays under the
 * block cap, the player never enters it stuck, every door reaches every other,
 * and no enemy is walled off.
 */

const INTERIOR_TILES = 13 * 7;

const FLOORS: readonly { readonly floor: number; readonly tag: string }[] = [
  { floor: 1, tag: 'cellar' },
  { floor: 2, tag: 'rural' },
];

const DOOR_SETS: readonly (readonly DoorDirection[])[] = [
  ['north'],
  ['east'],
  ['north', 'south'],
  ['east', 'west'],
  ['north', 'east'],
  ['north', 'east', 'south'],
  ['north', 'east', 'south', 'west'],
];

function placementFor(doors: readonly DoorDirection[]): {
  cells: { col: number; row: number }[];
  doors: { cellIndex: number; direction: DoorDirection }[];
} {
  return {
    cells: [{ col: 0, row: 0 }],
    doors: doors.map((direction) => ({ cellIndex: 0, direction })),
  };
}

const STEP = 8;
const keyOf = (x: number, y: number): string => `${String(Math.round(x))},${String(Math.round(y))}`;

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Flood the compiled room's free space on an 8px lattice from `(sx, sy)`, with
 * the real player collider radius — deliberately not the generator's own
 * tile-grid flood. Anchored at a tile centre by the callers so the lattice
 * lines up with every other tile centre (16px corridors sampled down the
 * middle, not along an edge). Returns every visited lattice point.
 */
function reachableSet(geometry: RoomGeometry, sx: number, sy: number): Point[] {
  const visited: Point[] = [];
  if (!geometry.isClear(sx, sy, PLAYER_RADIUS)) {
    return visited;
  }
  const seen = new Set<string>([keyOf(sx, sy)]);
  const queue: Point[] = [{ x: sx, y: sy }];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) {
      continue;
    }
    visited.push(node);
    for (const [dx, dy] of [
      [STEP, 0],
      [-STEP, 0],
      [0, STEP],
      [0, -STEP],
    ] as const) {
      const nx = node.x + dx;
      const ny = node.y + dy;
      if (nx < geometry.minX || nx > geometry.maxX || ny < geometry.minY || ny > geometry.maxY) {
        continue;
      }
      const k = keyOf(nx, ny);
      if (seen.has(k) || !geometry.isClear(nx, ny, PLAYER_RADIUS)) {
        continue;
      }
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return visited;
}

function nearVisited(visited: readonly Point[], x: number, y: number): boolean {
  return visited.some((p) => Math.hypot(p.x - x, p.y - y) <= STEP * 1.5);
}

/** Where `GameSim.doorEntryPoint` drops the player entering through this door — in the wall-margin ring. */
function doorSpawnPoint(geometry: RoomGeometry, direction: DoorDirection): Point {
  const centre = doorCentre(geometry, { direction, cellCol: 0, cellRow: 0 });
  switch (direction) {
    case 'north':
      return { x: centre.x, y: geometry.minY + PLAYER_RADIUS + 1 };
    case 'south':
      return { x: centre.x, y: geometry.maxY - PLAYER_RADIUS - 1 };
    case 'west':
      return { x: geometry.minX + PLAYER_RADIUS + 1, y: centre.y };
    case 'east':
      return { x: geometry.maxX - PLAYER_RADIUS - 1, y: centre.y };
  }
}

/** Centre of the interior tile immediately inside this door — on the 8px flood lattice. */
function doorInnerTileCentre(geometry: RoomGeometry, direction: DoorDirection): Point {
  const centre = doorCentre(geometry, { direction, cellCol: 0, cellRow: 0 });
  switch (direction) {
    case 'north':
      return { x: centre.x, y: geometry.minY + 24 };
    case 'south':
      return { x: centre.x, y: geometry.maxY - 24 };
    case 'west':
      return { x: geometry.minX + 24, y: centre.y };
    case 'east':
      return { x: geometry.maxX - 24, y: centre.y };
  }
}

/** Centre of the interior tile immediately inside a compiled door, on the flood lattice. */
function doorTileCentre(geometry: RoomGeometry, door: CompiledDoor): Point {
  const localCol = door.direction === 'east' ? 13 : door.direction === 'west' ? 1 : 7;
  const localRow = door.direction === 'south' ? 7 : door.direction === 'north' ? 1 : 4;
  const bigCol = door.cellCol * 15 + localCol;
  const bigRow = door.cellRow * 9 + localRow;
  return { x: geometry.minX + bigCol * 16 + 8, y: geometry.minY + bigRow * 16 + 8 };
}

/** Every compiled door reachable from the first, on the compiled geometry with the player radius. */
function multiCellDoorsConnect(geometry: RoomGeometry, doors: readonly CompiledDoor[]): boolean {
  const first = doors[0];
  if (first === undefined) {
    return true;
  }
  const start = doorTileCentre(geometry, first);
  const visited = reachableSet(geometry, start.x, start.y);
  if (visited.length === 0) {
    return false;
  }
  return doors.slice(1).every((door) => {
    const target = doorTileCentre(geometry, door);
    return nearVisited(visited, target.x, target.y);
  });
}

/**
 * Rule 1: the player only ever enters a generated room through a door. For
 * every door: the point they land on must be clear, and from just inside that
 * door every other door must be reachable — i.e. the whole walkable area is one
 * region and no door is walled off.
 */
function entryIsSafe(geometry: RoomGeometry, doors: readonly CompiledDoor[]): boolean {
  return doors.every((door) => {
    const spawn = doorSpawnPoint(geometry, door.direction);
    if (!geometry.isClear(spawn.x, spawn.y, PLAYER_RADIUS)) {
      return false;
    }
    const inner = doorInnerTileCentre(geometry, door.direction);
    const visited = reachableSet(geometry, inner.x, inner.y);
    if (visited.length === 0) {
      return false;
    }
    return doors.every((other) => {
      const otherInner = doorInnerTileCentre(geometry, other.direction);
      return nearVisited(visited, otherInner.x, otherInner.y);
    });
  });
}

function coveredTiles(obstacles: readonly { width: number; height: number }[]): number {
  return obstacles.reduce((sum, o) => sum + (o.width * o.height) / (16 * 16), 0);
}

describe('procedural room generator (POC)', () => {
  for (const { floor, tag } of FLOORS) {
    for (const doors of DOOR_SETS) {
      it(`floor ${String(floor)} (${tag}), doors [${doors.join(',')}] — 50 seeds`, () => {
        for (let seed = 0; seed < 50; seed++) {
          const template = generateRoom({
            roomId: `r${String(seed)}`,
            floor,
            floorTag: tag,
            doors,
            distanceFromStart: seed % 7,
            bossDistance: 6,
            rng: new Rng(roomGenSeed(1234, floor, `r${String(seed)}`, seed)),
          });

          const validated = validateRoomTemplate(
            template,
            `generated r${String(seed)}`,
            ENEMY_DEFINITIONS,
          );
          const compiled = compileRoomTemplate(
            validated,
            floor,
            `generated r${String(seed)}`,
            ENEMY_DEFINITIONS,
            placementFor(doors),
          );

          expect(compiled.geometry.blockCount).toBeLessThanOrEqual(MAX_ROOM_BLOCKS);
          expect(compiled.doors.map((door) => door.direction).sort()).toEqual([...doors].sort());
          expect(
            entryIsSafe(compiled.geometry, compiled.doors),
            `seed ${String(seed)}: player enters stuck or a door is walled off`,
          ).toBe(true);

          for (const spawn of compiled.enemySpawns) {
            expect(
              compiled.geometry.isClear(spawn.x, spawn.y, 3),
              `seed ${String(seed)}: enemy "${spawn.enemyId}" spawned inside a wall`,
            ).toBe(true);
          }
        }
      });
    }
  }

  it('coverage lands in the tuned band, with rare sparse and busy rooms', () => {
    // An explicit "moderate" tuning — this test is about the *mechanism*, not
    // the checked-in defaults, which the user owns and tunes by feel.
    const moderate = {
      ...DEFAULT_ROOM_GEN_TUNING,
      minCoverTiles: 8,
      maxCoverTiles: 16,
      sparseChance: 0.1,
      sparseMaxTiles: 3,
      busyChance: 0.1,
      busyMaxCoverTiles: 28,
    };
    let inBand = 0;
    let sparse = 0;
    let busy = 0;
    const total = 240;
    for (let seed = 0; seed < total; seed++) {
      const template = generateRoom(
        {
          roomId: `o${String(seed)}`,
          floor: 1,
          floorTag: 'cellar',
          doors: ['east', 'west'],
          distanceFromStart: 3,
          bossDistance: 6,
          rng: new Rng(roomGenSeed(2024, 1, `o${String(seed)}`, seed)),
        },
        moderate,
      );
      const tiles = coveredTiles(template.obstacles);
      if (tiles <= 4) {
        sparse += 1;
      } else if (tiles >= moderate.minCoverTiles && tiles <= moderate.maxCoverTiles) {
        inBand += 1;
      } else if (tiles > moderate.maxCoverTiles) {
        busy += 1;
      }
    }
    // Most rooms land squarely in the band; sparse and busy are the tails.
    expect(inBand / total).toBeGreaterThan(0.6);
    expect(sparse / total).toBeGreaterThan(0.02);
    expect(sparse / total).toBeLessThan(0.25);
    expect(busy / total).toBeLessThan(0.25);
  });

  it('a denser tuning (a per-floor override) fills rooms more without trapping the player', () => {
    const dense = {
      ...DEFAULT_ROOM_GEN_TUNING,
      minCoverTiles: 24,
      maxCoverTiles: 40,
      sparseChance: 0,
      busyChance: 0,
      maxScatter: 10,
      maxCoverWalls: 4,
    };
    let totalCoverage = 0;
    const total = 60;
    for (let seed = 0; seed < total; seed++) {
      const template = generateRoom(
        {
          roomId: `d${String(seed)}`,
          floor: 3,
          floorTag: 'cellar',
          doors: ['north', 'east', 'south', 'west'],
          distanceFromStart: 4,
          bossDistance: 6,
          rng: new Rng(roomGenSeed(4242, 3, `d${String(seed)}`, seed)),
        },
        dense,
      );
      const compiled = compileRoomTemplate(
        validateRoomTemplate(template, `d${String(seed)}`, ENEMY_DEFINITIONS),
        3,
        `d${String(seed)}`,
        ENEMY_DEFINITIONS,
        placementFor(['north', 'east', 'south', 'west']),
      );
      totalCoverage += coveredTiles(template.obstacles) / INTERIOR_TILES;
      expect(
        entryIsSafe(compiled.geometry, compiled.doors),
        `dense seed ${String(seed)}: player enters stuck`,
      ).toBe(true);
      expect(compiled.geometry.blockCount).toBeLessThanOrEqual(MAX_ROOM_BLOCKS);
    }
    expect(totalCoverage / total).toBeGreaterThan(0.22);
  });

  it('scatters props and the odd hazard as scenery, clear of the routes', () => {
    let sawProp = false;
    let sawHazard = false;
    for (let seed = 0; seed < 120; seed++) {
      const doors: DoorDirection[] = ['east', 'west'];
      const template = generateRoom({
        roomId: `p${String(seed)}`,
        floor: 1,
        floorTag: 'cellar',
        doors,
        distanceFromStart: 3,
        bossDistance: 6,
        rng: new Rng(roomGenSeed(1717, 1, `p${String(seed)}`, seed)),
      });
      if (template.decorativeProps.length > 0) {
        sawProp = true;
      }
      if (template.hazards.length > 0) {
        sawHazard = true;
      }
      const compiled = compileRoomTemplate(
        validateRoomTemplate(template, `p${String(seed)}`, ENEMY_DEFINITIONS),
        1,
        `p${String(seed)}`,
        ENEMY_DEFINITIONS,
        placementFor(doors),
      );
      // Props / hazards never wall a door off (props are route-checked, hazards walk-through).
      expect(entryIsSafe(compiled.geometry, compiled.doors)).toBe(true);
    }
    expect(sawProp).toBe(true);
    expect(sawHazard).toBe(true);
  });

  it('respects maxProps: 0', () => {
    const template = generateRoom(
      {
        roomId: 'noprops',
        floor: 1,
        floorTag: 'cellar',
        doors: ['north', 'south'],
        distanceFromStart: 2,
        bossDistance: 6,
        rng: new Rng(roomGenSeed(1, 1, 'noprops', 0)),
      },
      { ...DEFAULT_ROOM_GEN_TUNING, maxProps: 0, hazardChance: 0 },
    );
    expect(template.decorativeProps).toHaveLength(0);
    expect(template.hazards).toHaveLength(0);
  });

  it('generates every multi-cell shape — validates, compiles, connects, stays under the block cap', () => {
    const shapes: {
      shape: 'L' | 'T' | '1x2' | '2x2';
      cells: { col: number; row: number }[];
      doors: { cellIndex: number; direction: DoorDirection }[];
    }[] = [
      {
        shape: '1x2',
        cells: [
          { col: 0, row: 0 },
          { col: 1, row: 0 },
        ],
        doors: [
          { cellIndex: 0, direction: 'west' },
          { cellIndex: 1, direction: 'east' },
        ],
      },
      {
        shape: '2x2',
        cells: [
          { col: 0, row: 0 },
          { col: 1, row: 0 },
          { col: 0, row: 1 },
          { col: 1, row: 1 },
        ],
        doors: [
          { cellIndex: 0, direction: 'north' },
          { cellIndex: 3, direction: 'south' },
          { cellIndex: 1, direction: 'east' },
        ],
      },
      {
        shape: 'L',
        cells: [
          { col: 0, row: 0 },
          { col: 1, row: 0 },
          { col: 0, row: 1 },
        ],
        doors: [
          { cellIndex: 1, direction: 'east' },
          { cellIndex: 2, direction: 'south' },
        ],
      },
      {
        shape: 'T',
        cells: [
          { col: 1, row: 0 },
          { col: 0, row: 1 },
          { col: 1, row: 1 },
          { col: 2, row: 1 },
          { col: 1, row: 2 },
        ],
        doors: [
          { cellIndex: 0, direction: 'north' },
          { cellIndex: 1, direction: 'west' },
          { cellIndex: 3, direction: 'east' },
          { cellIndex: 4, direction: 'south' },
        ],
      },
    ];

    for (const { shape, cells, doors } of shapes) {
      for (let seed = 0; seed < 24; seed++) {
        const template = generateMultiCellRoom({
          roomId: `${shape}-${String(seed)}`,
          floor: 1,
          floorTag: 'cellar',
          shape,
          cells,
          doors,
          distanceFromStart: 3,
          bossDistance: 6,
          rng: new Rng(roomGenSeed(88, 1, `${shape}-${String(seed)}`, seed)),
        });
        expect(template.cells).toHaveLength(cells.length);
        const validated = validateRoomTemplate(
          template,
          `${shape}-${String(seed)}`,
          ENEMY_DEFINITIONS,
        );
        const compiled = compileRoomTemplate(
          validated,
          1,
          `${shape}-${String(seed)}`,
          ENEMY_DEFINITIONS,
          { cells, doors },
        );
        expect(compiled.geometry.blockCount).toBeLessThanOrEqual(MAX_ROOM_BLOCKS);
        expect(
          multiCellDoorsConnect(compiled.geometry, compiled.doors),
          `${shape} seed ${String(seed)}: a door is walled off`,
        ).toBe(true);
        for (const spawn of compiled.enemySpawns) {
          expect(
            compiled.geometry.isClear(spawn.x, spawn.y, 3),
            `${shape} seed ${String(seed)}: enemy "${spawn.enemyId}" in a wall`,
          ).toBe(true);
        }
      }
    }
  });

  it('an unknown floor tag still produces a valid, enemy-free room', () => {
    const template = generateRoom({
      roomId: 'x',
      floor: 3,
      floorTag: 'no-such-tag',
      doors: ['north', 'south'],
      distanceFromStart: 3,
      bossDistance: 6,
      rng: new Rng(42),
    });
    expect(template.enemySpawns).toHaveLength(0);
    expect(() =>
      compileRoomTemplate(
        validateRoomTemplate(template, 'x', ENEMY_DEFINITIONS),
        3,
        'x',
        ENEMY_DEFINITIONS,
        placementFor(['north', 'south']),
      ),
    ).not.toThrow();
  });

  it('is deterministic in its seed', () => {
    const make = (): unknown =>
      generateRoom({
        roomId: 'r7',
        floor: 2,
        floorTag: 'rural',
        doors: ['north', 'east', 'west'],
        distanceFromStart: 4,
        bossDistance: 6,
        rng: new Rng(roomGenSeed(555, 2, 'r7', 3)),
      });
    expect(JSON.stringify(make())).toEqual(JSON.stringify(make()));
  });

  it('reruns the same room to a different result when the salt changes', () => {
    const resultFor = (salt: number): string =>
      JSON.stringify(
        generateRoom({
          roomId: 'r1',
          floor: 1,
          floorTag: 'cellar',
          doors: ['north', 'east', 'south', 'west'],
          distanceFromStart: 3,
          bossDistance: 6,
          rng: new Rng(roomGenSeed(1, 1, 'r1', salt)),
        }),
      );
    const seen = new Set<string>();
    for (let salt = 0; salt < 8; salt++) {
      seen.add(resultFor(salt));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('keeps every DoorDirection representable', () => {
    for (const direction of DOOR_DIRECTIONS) {
      const template = generateRoom({
        roomId: `d-${direction}`,
        floor: 1,
        floorTag: 'cellar',
        doors: [direction],
        distanceFromStart: 1,
        bossDistance: 6,
        rng: new Rng(roomGenSeed(7, 1, direction, 0)),
      });
      const compiled = compileRoomTemplate(
        validateRoomTemplate(template, direction, ENEMY_DEFINITIONS),
        1,
        direction,
        ENEMY_DEFINITIONS,
        placementFor([direction]),
      );
      expect(compiled.doors).toHaveLength(1);
      expect(compiled.doors[0]?.direction).toBe(direction);
    }
  });

  /**
   * #230: a locked room (`GameSim.doorsLocked` — any room with a live enemy)
   * whose whole roster stands still, bounces a fixed axis, or otherwise never
   * closes distance on the player is not a fight. "Pursues" is derived from
   * each enemy's own state machine — a `walkTowardPlayer`/`chargeAtPlayer`
   * movement primitive in any state — rather than trusted from the
   * generator's own roster tags, so a roster entry silently drifting out of
   * sync with its enemy's real behaviour would fail this, not just a
   * hand-review.
   */
  function hasPursuingState(definition: EnemyDefinition): boolean {
    return definition.states.some((state) =>
      state.behaviours.some(
        (behaviour: EnemyBehaviour) =>
          behaviour.behaviour === 'walkTowardPlayer' || behaviour.behaviour === 'chargeAtPlayer',
      ),
    );
  }
  const pursuingEnemyIds = new Set(
    ENEMY_DEFINITIONS.filter(hasPursuingState).map((definition) => definition.id),
  );

  /** Live bodies a generated room actually spawns — `RoomSpawnGroup.count`, not one per `enemySpawns` entry (a `groupSize` roster entry spawns several from a single group). */
  function bodyCount(template: {
    enemySpawns: readonly { group: string }[];
    spawnGroups: readonly { id: string; count: number }[];
  }): number {
    return template.enemySpawns.reduce((total, spawn) => {
      const group = template.spawnGroups.find((candidate) => candidate.id === spawn.group);
      return total + (group?.count ?? 1);
    }, 0);
  }

  it('never locks a room on a roster with no pursuing enemy, and keeps single-enemy rooms rare', () => {
    const meanEnemiesByFloor = new Map<number, number>();
    for (const { floor, tag } of FLOORS) {
      let rooms = 0;
      let totalBodies = 0;
      let singleEnemy = 0;
      for (let seed = 0; seed < 300; seed++) {
        const roomId = `pursuer-${String(seed)}`;
        const template = generateRoom({
          roomId,
          floor,
          floorTag: tag,
          doors: ['north', 'south'],
          distanceFromStart: seed % 7,
          bossDistance: 6,
          rng: new Rng(roomGenSeed(918273, floor, roomId, seed)),
        });
        rooms += 1;
        const count = bodyCount(template);
        totalBodies += count;
        if (count === 1) {
          singleEnemy += 1;
        }
        if (count === 0) {
          continue; // an empty room never locks its doors — nothing to guarantee
        }
        const hasPursuer = template.enemySpawns.some((spawn) => {
          const group = template.spawnGroups.find((candidate) => candidate.id === spawn.group);
          return group?.choices.some((choice) => pursuingEnemyIds.has(choice.enemyId)) ?? false;
        });
        expect(
          hasPursuer,
          `floor ${String(floor)} seed ${String(seed)}: locked room's roster has no pursuing enemy`,
        ).toBe(true);
      }
      const mean = totalBodies / rooms;
      expect(mean, `floor ${String(floor)} mean enemies per room`).toBeGreaterThanOrEqual(4);
      expect(singleEnemy / rooms, `floor ${String(floor)} single-enemy room rate`).toBeLessThan(
        0.05,
      );
      meanEnemiesByFloor.set(floor, mean);
    }
    const floor1Mean = meanEnemiesByFloor.get(1);
    const floor2Mean = meanEnemiesByFloor.get(2);
    if (floor1Mean !== undefined && floor2Mean !== undefined) {
      expect(floor2Mean, 'floor 2 mean enemies per room should rise over floor 1').toBeGreaterThan(
        floor1Mean,
      );
    }
  });

  /**
   * #272: the threat budget reads *fractional* depth (`distanceFromStart /
   * bossDistance`) rather than a raw door count, specifically so it does not
   * saturate against `maxEnemies` a few doors in and then sit flat for the
   * rest of a long floor. Two things follow, both checked here on a real
   * 7-door floor: a genuine ramp from the start room to the boss door (not
   * an early plateau), and a near-boss room that stays equally nasty
   * whether the floor is short or long — the whole point of dividing by
   * `bossDistance` instead of adding a flat per-door term.
   */
  function meanBodiesAt(
    floor: number,
    floorTag: string,
    bossDistance: number,
    distanceFromStart: number,
    seedBase: number,
  ): number {
    const samples = 300;
    let total = 0;
    for (let seed = 0; seed < samples; seed++) {
      const roomId = `ramp-${String(seedBase)}-${String(bossDistance)}-${String(distanceFromStart)}-${String(seed)}`;
      const template = generateRoom({
        roomId,
        floor,
        floorTag,
        doors: ['north', 'south'],
        distanceFromStart,
        bossDistance,
        rng: new Rng(roomGenSeed(seedBase, floor, roomId, seed)),
      });
      total += bodyCount(template);
    }
    return total / samples;
  }

  it('shows a real ramp across a 7-door floor, not an early plateau', () => {
    for (const { floor, tag } of FLOORS) {
      const bossDistance = 6;
      const early = meanBodiesAt(floor, tag, bossDistance, 1, 5001);
      const mid = meanBodiesAt(floor, tag, bossDistance, 3, 5001);
      const late = meanBodiesAt(floor, tag, bossDistance, 6, 5001);
      expect(
        mid,
        `floor ${String(floor)}: mid-floor room (d=3 of 6) should be harder than the start room`,
      ).toBeGreaterThan(early);
      expect(
        late,
        `floor ${String(floor)}: the room at the boss door (d=6 of 6) should be harder than mid-floor`,
      ).toBeGreaterThan(mid);
    }
  });

  it('keeps the room before the boss equally nasty on a short floor and a long one', () => {
    for (const { floor, tag } of FLOORS) {
      const nearBossByLength = [3, 6, 9, 12].map((bossDistance) =>
        meanBodiesAt(floor, tag, bossDistance, bossDistance, 6001),
      );
      const min = Math.min(...nearBossByLength);
      const max = Math.max(...nearBossByLength);
      // Same fractional depth (1.0, right at the boss door) should land in
      // the same ballpark regardless of how many doors it took to get
      // there — a wide band (maxEnemies caps this at 6-7 bodies either
      // way) rather than an exact match, since each point is its own
      // Monte-Carlo draw.
      expect(
        max - min,
        `floor ${String(floor)}: near-boss body count varies too much across floor lengths ${JSON.stringify(nearBossByLength)}`,
      ).toBeLessThan(2);
    }
  });
});
