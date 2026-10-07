import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import waldGrove from '../../src/content/rooms/wald-grove.json';
import { ENEMY_DEFINITIONS, borkenkaefer } from '../../src/content/enemies/index.js';
import { ROOM_TILE_UNITS, type RoomShape } from '../../src/content/rooms/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { CollisionLayer } from '../../src/sim/collision/layers.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import {
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import {
  BLOCK_MATERIAL_WOOD,
  CLEAR_IGNORE_DESTRUCTIBLE,
  CLEAR_IGNORE_PITS,
  MAX_ROOM_PITS,
  PIT_SIZE,
  RoomGeometry,
} from '../../src/sim/room/geometry.js';
import { PATH_CELL, nextWaypoint } from '../../src/sim/room/pathfind.js';
import { type RoomPlacement, doorCentre } from '../../src/sim/room/template.js';
import { type EnemyEatMarkInfo, enemyEatMark } from '../../src/sim/systems/enemy.js';
import { moveBody } from '../../src/sim/systems/motion.js';

/**
 * Borkenkäfer (#410): a bark-beetle swarm that eats wood — wooden cover
 * first, then the floor planks of a wooden floor, each one into a pit that
 * nothing walking can cross. Shots fly over a pit, a flyer flies over it, and
 * no pit ever cuts the room off: the fuzz at the bottom is the proof.
 */

const IDLE = createInputFrame();

function spawn(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function place(sim: GameSim, index: number, x: number, y: number): void {
  const t = sim.transform.data;
  t[index * 4] = x;
  t[index * 4 + 1] = y;
  t[index * 4 + 2] = x;
  t[index * 4 + 3] = y;
}

/** A single transform slot to drive `moveBody` with directly. */
function bodyAt(x: number, y: number): Float32Array {
  return new Float32Array([x, y, x, y]);
}

describe('Borkenkäfer (#410)', () => {
  it('compiles as a normal swarm that approaches wood', () => {
    const compiled = new EnemyRegistry(ENEMY_DEFINITIONS).get('borkenkaefer');
    expect(compiled.health).toBe(7);
    expect(compiled.contactDamage).toBe(1);
    expect(compiled.states[0]?.movement.behaviour).toBe('approachWood');
  });

  it('rejects an approachWood without a speed or an eating time', () => {
    const broken = (eat: { obstacle: number; plank: number }, speed = 0.5) =>
      new EnemyRegistry([
        {
          ...borkenkaefer,
          states: [
            {
              name: 'eat',
              behaviours: [{ behaviour: 'approachWood', speed, eatTicks: eat }],
            },
          ],
        },
      ]);
    expect(() => broken({ obstacle: 120, plank: 90 }, 0)).toThrow(/speed/);
    expect(() => broken({ obstacle: 0, plank: 90 })).toThrow(/eatTicks/);
  });
});

describe('pits (#410)', () => {
  it('sit on the floor-tile grid, one tile each', () => {
    expect(PIT_SIZE).toBe(ROOM_TILE_UNITS);
    expect(PATH_CELL * 2).toBe(PIT_SIZE);
    const room = new RoomGeometry(40, 18, 280, 162);
    expect(room.addPit(2, 3)).toBe(true);
    expect(room.addPit(2, 3)).toBe(false);
    expect(room.isPit(40 + 2 * 16 + 1, 18 + 3 * 16 + 1)).toBe(true);
    expect(room.isPit(40 + 3 * 16 + 1, 18 + 3 * 16 + 1)).toBe(false);
    expect(room.pitColumnAt(40 + 2 * 16 + 8)).toBe(2);
    expect(room.pitCentreY(3)).toBe(18 + 3.5 * 16);
  });

  it('stop a walker, and let a flyer cross', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addPit(10, 5); // x 160-176, y 80-96
    const walker = bodyAt(150, 88);
    for (let tick = 0; tick < 20; tick++) {
      moveBody(room, walker, 0, 2, 0, 5);
    }
    expect(walker[0]).toBeLessThanOrEqual(155 + 0.001);

    const flyer = bodyAt(150, 88);
    for (let tick = 0; tick < 20; tick++) {
      moveBody(room, flyer, 0, 2, 0, 5, true);
    }
    expect(flyer[0]).toBeGreaterThan(180);
  });

  it('block the pathfinder, not shots or sight', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    // A wall of pits across the room, top to bottom, at x 160-176.
    for (let row = 0; row < 180 / PIT_SIZE - 1; row++) {
      room.addPit(10, row);
    }
    room.addPit(10, Math.floor(180 / PIT_SIZE) - 1);
    const out = { x: 0, y: 0 };
    expect(nextWaypoint(room, 100, 90, 240, 90, 5, out)).toBe(false);
    expect(room.isClear(168, 90, 3)).toBe(false);
    expect(room.isClear(168, 90, 3, CLEAR_IGNORE_PITS)).toBe(true);
    expect(room.blocksSight(100, 90, 240, 90)).toBe(false);
  });

  it('let a shot fly over', () => {
    const sim = new GameSim({ room: new RoomGeometry(0, 0, 640, 360) });
    const player = sim.playerIndex;
    place(sim, player, 100, 300);
    sim.room.addPit(Math.floor((140 - 0) / PIT_SIZE), Math.floor(300 / PIT_SIZE));
    const fire = createInputFrame();
    fire.aimX = quantiseAxis(1);
    fire.aimY = quantiseAxis(0);
    setActionDown(fire, InputAction.Fire, true);
    sim.step(fire);
    let farthest = 0;
    for (let tick = 0; tick < 30; tick++) {
      sim.step(IDLE);
      sim.projectiles.forEachLive((slot) => {
        farthest = Math.max(farthest, sim.projectiles.x[slot] ?? 0);
      });
    }
    expect(farthest).toBeGreaterThan(200);
  });
});

describe('eating (#410)', () => {
  function grove(floor: number): GameSim {
    return new GameSim({ seed: 3, roomTemplate: waldGrove, floor, population: 'empty' });
  }

  function woodBlocks(room: RoomGeometry): number {
    let count = 0;
    for (let block = 0; block < room.blockCount; block++) {
      if (room.blockOverflyable[block] === 1 && room.blockMaterial[block] === BLOCK_MATERIAL_WOOD) {
        count += 1;
      }
    }
    return count;
  }

  it('eats the wooden cover before it touches a plank', () => {
    const sim = grove(3);
    expect(sim.floorIsWood).toBe(true);
    const wood = woodBlocks(sim.room);
    expect(wood).toBeGreaterThan(0);
    spawn(sim, 'borkenkaefer', 100, 80);
    let firstPitWithWoodLeft = false;
    for (let tick = 0; tick < 6000 && woodBlocks(sim.room) > 0; tick++) {
      sim.step(IDLE);
      if (sim.room.pitCount > 0 && woodBlocks(sim.room) > 0) {
        firstPitWithWoodLeft = true;
      }
    }
    expect(woodBlocks(sim.room)).toBe(0);
    expect(firstPitWithWoodLeft).toBe(false);
  });

  it('then eats the floor into pits, up to the room cap, and the room visibly gets worse', () => {
    const sim = grove(3);
    spawn(sim, 'borkenkaefer', 100, 80);
    const pitsAt: number[] = [];
    for (let tick = 0; tick < 12000; tick++) {
      sim.step(IDLE);
      if (sim.room.pitCount > pitsAt.length) {
        pitsAt.push(tick);
      }
    }
    expect(sim.room.pitCount).toBe(sim.tuning.pits.maxPerRoom);
    // A redraw is asked for every time.
    expect(sim.pitsChangedTick).toBeGreaterThanOrEqual(pitsAt[pitsAt.length - 1] ?? 0);
  });

  it('telegraphs the plank it is eating', () => {
    const sim = grove(3);
    // No cover left to distract it: planks straight away.
    for (let guard = 0; guard < 16 && sim.breakBlockAt(...firstWood(sim.room)); guard++);
    const beetle = spawn(sim, 'borkenkaefer', 100, 80);
    const mark: EnemyEatMarkInfo = { progress: 0, x: 0, y: 0 };
    let seen = 0;
    let rising = true;
    let last = 0;
    for (let tick = 0; tick < 3000 && sim.room.pitCount === 0; tick++) {
      sim.step(IDLE);
      if (enemyEatMark(sim, beetle, mark)) {
        seen += 1;
        rising &&= mark.progress >= last;
        last = mark.progress;
        expect(sim.room.isPit(mark.x, mark.y)).toBe(false);
      }
    }
    expect(sim.room.pitCount).toBe(1);
    expect(seen).toBeGreaterThan(80);
    expect(rising).toBe(true);
  });

  it('never eats a stone floor', () => {
    const sim = grove(1);
    expect(sim.floorIsWood).toBe(false);
    spawn(sim, 'borkenkaefer', 100, 80);
    for (let tick = 0; tick < 6000; tick++) {
      sim.step(IDLE);
    }
    expect(woodBlocks(sim.room)).toBe(0);
    expect(sim.room.pitCount).toBe(0);
  });

  it('leaves its pits there on a revisit', () => {
    const sim = grove(3);
    const groveId = sim.roomId;
    expect(sim.openPit(3, 3)).toBe(true);
    expect(sim.openPit(4, 3)).toBe(true);
    sim.loadRoom(cellarCrossroads, 3);
    expect(sim.room.pitCount).toBe(0);
    sim.loadRoom(waldGrove, 3);
    expect(sim.roomId).toBe(groveId);
    expect(sim.room.pitCount).toBe(2);
    expect(sim.room.isPitTile(3, 3)).toBe(true);
    expect(sim.room.isPitTile(4, 3)).toBe(true);
    // A prewarmed build gets them too.
    const fresh = new GameSim({ roomTemplate: waldGrove, floor: 3, population: 'empty' }).room;
    sim.reapplyPits(groveId, fresh);
    expect(fresh.pitCount).toBe(2);
  });

  it('is deterministic', () => {
    const run = (): string => {
      const sim = grove(3);
      spawn(sim, 'borkenkaefer', 100, 80);
      spawn(sim, 'borkenkaefer', 220, 120);
      for (let tick = 0; tick < 5000; tick++) {
        sim.step(IDLE);
      }
      return Array.from(sim.room.pits.subarray(0, sim.room.pitCount * 4)).join(',');
    };
    expect(run()).toBe(run());
  });
});

function firstWood(room: RoomGeometry): [number, number, boolean] {
  for (let block = 0; block < room.blockCount; block++) {
    if (room.blockOverflyable[block] === 1 && room.blockMaterial[block] === BLOCK_MATERIAL_WOOD) {
      const base = block * 4;
      return [
        ((room.blocks[base] ?? 0) + (room.blocks[base + 2] ?? 0)) / 2,
        ((room.blocks[base + 1] ?? 0) + (room.blocks[base + 3] ?? 0)) / 2,
        true,
      ];
    }
  }
  return [-1, -1, true];
}

// ------------------------------------------------------------------ fuzz

/** A placement per shape, with a door on every outer side worth having. */
const PLACEMENTS: Partial<Record<RoomShape, RoomPlacement>> = {
  '1x2': {
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ],
    doors: [
      { cellIndex: 0, direction: 'west' },
      { cellIndex: 0, direction: 'north' },
      { cellIndex: 1, direction: 'south' },
      { cellIndex: 1, direction: 'east' },
    ],
  },
  L: {
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
    ],
    doors: [
      { cellIndex: 0, direction: 'west' },
      { cellIndex: 1, direction: 'east' },
      { cellIndex: 1, direction: 'south' },
      { cellIndex: 2, direction: 'south' },
    ],
  },
};

/**
 * Everything a player must still be able to reach, as points: a step inside
 * every door, every pickup and every pedestal.
 */
function targets(sim: GameSim): { key: string; x: number; y: number }[] {
  const points: { key: string; x: number; y: number }[] = [];
  for (const [index, door] of sim.allRoomDoors.entries()) {
    const centre = doorCentre(sim.room, door);
    const inward = 10;
    points.push({
      key: `door ${String(index)}`,
      x: centre.x + (door.direction === 'west' ? inward : door.direction === 'east' ? -inward : 0),
      y:
        centre.y + (door.direction === 'north' ? inward : door.direction === 'south' ? -inward : 0),
    });
  }
  sim.world.forEach(sim.collidableMask, (index) => {
    if (((sim.collision.data[index * 2] ?? 0) & CollisionLayer.Pickup) !== 0) {
      points.push({
        key: `pickup ${String(index)}`,
        x: sim.positionX(index),
        y: sim.positionY(index),
      });
    }
  });
  for (const [index, pedestal] of sim.activePedestals.entries()) {
    points.push({ key: `pedestal ${String(index)}`, x: pedestal.x, y: pedestal.y });
  }
  return points;
}

/**
 * Which of `points` the player can walk to, flood-filling the room's walk
 * grid by the test's own hand — cover counted as gone, since a bomb can
 * always clear it, pits counted as there.
 */
function reachable(sim: GameSim, points: readonly { x: number; y: number }[]): boolean[] {
  const room = sim.room;
  // A quarter tile: a tile-wide gap has a cell centre down its middle.
  const GRID = 4;
  const player = sim.playerIndex;
  const radius = sim.body.data[player * 2] ?? 0;
  const columns = Math.ceil((room.maxX - room.minX) / GRID);
  const rows = Math.ceil((room.maxY - room.minY) / GRID);
  const centreX = (column: number): number => room.minX + (column + 0.5) * GRID;
  const centreY = (row: number): number => room.minY + (row + 0.5) * GRID;
  const reached = new Uint8Array(columns * rows);
  // Seeded from every walkable cell around the player they can walk to in a
  // straight line, not just theirs: pressed into a corner, their own cell's
  // centre may not fit them.
  const straightWalk = (x0: number, y0: number, x1: number, y1: number): boolean => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      if (
        !room.isClear(
          x0 + (x1 - x0) * t,
          y0 + (y1 - y0) * t,
          radius - 0.5,
          CLEAR_IGNORE_DESTRUCTIBLE,
        )
      ) {
        return false;
      }
    }
    return true;
  };
  const queue: number[] = [];
  const seedReach = radius + GRID * 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (
        Math.hypot(centreX(c) - sim.positionX(player), centreY(r) - sim.positionY(player)) <=
          seedReach &&
        room.isClear(centreX(c), centreY(r), radius, CLEAR_IGNORE_DESTRUCTIBLE) &&
        straightWalk(sim.positionX(player), sim.positionY(player), centreX(c), centreY(r))
      ) {
        reached[r * columns + c] = 1;
        queue.push(r * columns + c);
      }
    }
  }
  while (queue.length > 0) {
    const cell = queue.pop() ?? 0;
    const column = cell % columns;
    const row = Math.floor(cell / columns);
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const c = column + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= columns || r >= rows || reached[r * columns + c] === 1) {
        continue;
      }
      if (!room.isClear(centreX(c), centreY(r), radius, CLEAR_IGNORE_DESTRUCTIBLE)) {
        continue;
      }
      reached[r * columns + c] = 1;
      queue.push(r * columns + c);
    }
  }
  const reach = radius + 8;
  return points.map((point) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if (
          reached[r * columns + c] === 1 &&
          Math.hypot(centreX(c) - point.x, centreY(r) - point.y) <= reach
        ) {
          return true;
        }
      }
    }
    return false;
  });
}

/** Harmless to the player, so a 20k-tick run is never cut short by a death. */
const HARMLESS = ENEMY_DEFINITIONS.map((definition) =>
  definition.id === 'borkenkaefer' ? { ...definition, contactDamage: 0 } : definition,
);

const WALD_ROOMS = ROOM_TEMPLATES.filter((room) =>
  (room as { metadata: { floorTags: string[] } }).metadata.floorTags.includes('wald'),
);

describe('pits never softlock (#410)', () => {
  it('finds the wald rooms', () => {
    expect(WALD_ROOMS.length).toBeGreaterThan(10);
  });

  it.each(WALD_ROOMS.map((room) => [(room as { id: string }).id, room] as const))(
    '%s: two swarms for 20k ticks never cut off a door, a pickup or the player',
    (_id, template) => {
      const shape = (template as { metadata: { shape: RoomShape } }).metadata.shape;
      const sim = new GameSim({
        seed: 41,
        roomTemplate: template,
        ...(PLACEMENTS[shape] === undefined ? {} : { roomPlacement: PLACEMENTS[shape] }),
        floor: 3,
        population: 'empty',
        enemies: HARMLESS,
      });
      // Harsher than the game: every pit storage allows, not the room's twelve.
      sim.tuning.pits.maxPerRoom = MAX_ROOM_PITS;
      const room = sim.room;
      const width = room.maxX - room.minX;
      const height = room.maxY - room.minY;
      // Two swarms and a handful of pickups, on clear floor.
      let state = 12345;
      const random = (): number => {
        state = (Math.imul(state, 1103515245) + 12345) >>> 0;
        return state / 4294967296;
      };
      const clearSpot = (radius: number): { x: number; y: number } => {
        for (let attempt = 0; attempt < 500; attempt++) {
          const x = room.minX + radius + random() * (width - radius * 2);
          const y = room.minY + radius + random() * (height - radius * 2);
          if (room.isClear(x, y, radius) && !room.isInStream(x, y)) {
            return { x, y };
          }
        }
        return { x: room.minX + width / 2, y: room.minY + height / 2 };
      };
      for (let swarm = 0; swarm < 2; swarm++) {
        const at = clearSpot(8);
        spawn(sim, 'borkenkaefer', at.x, at.y);
      }
      for (let drop = 0; drop < 3; drop++) {
        const at = clearSpot(6);
        sim.spawnPickup('biermarke-1', at.x, at.y, undefined, false);
      }
      sim.world.flush();

      // A pickup may be collected meanwhile; whatever is still there and
      // could be reached at the start must still be reachable.
      const start = targets(sim);
      const startReach = reachable(sim, start);
      const before = new Set(start.filter((_, i) => startReach[i] === true).map((t) => t.key));
      expect(before.size).toBeGreaterThan(0);

      let pits = room.pitCount;
      const walk = createInputFrame();
      for (let tick = 0; tick < 20000; tick++) {
        // The player wanders, so the guard is asked from all over the room.
        if (tick % 40 === 0) {
          walk.moveX = quantiseAxis(random() * 2 - 1);
          walk.moveY = quantiseAxis(random() * 2 - 1);
        }
        sim.step(walk);
        if (sim.room.pitCount !== pits) {
          pits = sim.room.pitCount;
          const points = targets(sim);
          const now = reachable(sim, points);
          for (const [i, point] of points.entries()) {
            if (before.has(point.key)) {
              expect(now[i], `${point.key} cut off at tick ${String(tick)}`).toBe(true);
            }
          }
        }
      }
      // The swarms did their worst: the test is not vacuous.
      expect(sim.room.pitCount).toBeGreaterThan(0);
      expect(sim.world.states[sim.playerIndex]).toBe(World.ALIVE);
    },
    60000,
  );
});
