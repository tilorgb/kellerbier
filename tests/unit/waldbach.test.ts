import { describe, expect, it } from 'vitest';
import { koenigLudwig } from '../../src/content/characters/koenig-ludwig.js';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { ROOM_GEN_FLOOR_OVERRIDES } from '../../src/content/floors/definition.js';
import {
  type DoorDirection,
  ROOM_TILE_UNITS,
  type RoomShape,
} from '../../src/content/rooms/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import {
  generateMultiCellRoom,
  generateRoom,
  roomGenSeed,
} from '../../src/sim/room/generate-room.js';
import { BLOCK_STRIDE, MAX_ROOM_STREAMS, RoomGeometry } from '../../src/sim/room/geometry.js';
import { compileRoomTemplate, validateRoomTemplate } from '../../src/sim/room/template.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { bendStream, meanderStream, STREAM_REACH_TILES } from '../../src/sim/room/stream-course.js';
import { DEFAULT_ROOM_GEN_TUNING } from '../../src/sim/tuning.js';

/**
 * Floor 3's Waldbach (#403, #424): a stream meandering wall to wall across a
 * room. Slick underfoot exactly as a puddle is, invisible to shots, and
 * queryable so the Bachforelle (#408) can find the water it lives in.
 */

/** Floor 3's generation numbers — the stream is only rolled where the floor turns it on. */
const WALD = { ...DEFAULT_ROOM_GEN_TUNING, ...ROOM_GEN_FLOOR_OVERRIDES.wald };

const IDLE = createInputFrame();

function held(moveX: number, moveY: number): InputFrame {
  const frame = createInputFrame();
  frame.moveX = quantiseAxis(moveX);
  frame.moveY = quantiseAxis(moveY);
  return frame;
}

function openRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 640, 360);
}

/** A room that is all water, so the whole walk happens in the stream. */
function floodedRoom(): RoomGeometry {
  const room = openRoom();
  room.addStream(0, 0, 640, 360);
  return room;
}

function emptySim(room: RoomGeometry, flier = false): GameSim {
  return new GameSim({
    seed: 11,
    room,
    population: 'empty',
    ...(flier ? { character: koenigLudwig.traits } : {}),
  });
}

/** Distance the player covers walking right for `ticks` ticks from a standstill. */
function walked(sim: GameSim, ticks: number): number {
  const startX = sim.positionX(sim.playerIndex);
  const input = held(1, 0);
  for (let tick = 0; tick < ticks; tick++) {
    sim.step(input);
  }
  return sim.positionX(sim.playerIndex) - startX;
}

describe('RoomGeometry streams', () => {
  it('reports a point in the stream only inside a stream rect', () => {
    const room = new RoomGeometry(0, 0, 240, 144);
    room.addStream(0, 60, 240, 84);

    expect(room.streamCount).toBe(1);
    expect(room.isInStream(120, 72)).toBe(true);
    expect(room.isInStream(0, 60)).toBe(true);
    expect(room.isInStream(240, 84)).toBe(true);
    expect(room.isInStream(120, 40)).toBe(false);
    expect(room.isInStream(120, 100)).toBe(false);
  });

  it('exposes its rects for whatever needs to find the water', () => {
    const room = new RoomGeometry(0, 0, 240, 144);
    room.addStream(0, 64, 128, 80);
    room.addStream(112, 64, 128, 128);
    expect(room.streamCount).toBe(2);
    expect(Array.from(room.streams.subarray(BLOCK_STRIDE, 2 * BLOCK_STRIDE))).toEqual([
      112, 64, 128, 128,
    ]);
  });

  it('refuses to grow past its fixed stream storage', () => {
    const room = new RoomGeometry(0, 0, 100, 100);
    for (let stream = 0; stream < MAX_ROOM_STREAMS; stream++) {
      room.addStream(0, 0, 1, 1);
    }
    expect(room.streamCount).toBe(MAX_ROOM_STREAMS);
    expect(() => {
      room.addStream(0, 0, 1, 1);
    }).toThrow(/at most/);
  });

  it('compiles a waldbach hazard into a stream that still runs wall to wall, and nothing else into one', () => {
    const template = {
      id: 'synthetic-waldbach',
      tileGrid: Array.from({ length: 9 }, () => '...............'),
      obstacles: [],
      enemySpawns: [],
      spawnGroups: [],
      pickupSpawns: [],
      hazards: [
        { x: 0, y: 64, width: 240, height: 16, type: 'waldbach' },
        { x: 16, y: 16, width: 32, height: 32, type: 'puddle' },
      ],
      decorativeProps: [],
      metadata: {
        floorTags: ['wald'],
        shape: '1x1',
        doors: { north: false, east: false, south: false, west: false },
        difficultyTier: 1,
        weight: 1,
      },
    };
    const compiled = compileRoomTemplate(template, 3, 'synthetic-waldbach');
    const room = compiled.geometry;
    // One slice per tile the lane crosses, and the one puddle left a puddle.
    expect(room.streamCount).toBe(15);
    expect(room.puddleCount).toBe(1);
    expect(room.streamCourses).toHaveLength(1);
    // The lane is kept in the hazards list, for the editor.
    expect(compiled.hazards.map((hazard) => hazard.type)).toContain('waldbach');
    // It meets both walls where the lane does.
    expect(room.isInStream(room.minX + 1, room.minY + 72)).toBe(true);
    expect(room.isInStream(room.maxX - 1, room.minY + 72)).toBe(true);
    // And every column of the room has water somewhere in it.
    for (let x = room.minX + 8; x < room.maxX; x += 16) {
      let wet = false;
      for (let y = room.minY + 1; y < room.maxY; y += 4) {
        wet = wet || room.isInStream(x, y);
      }
      expect(wet, `column at ${String(x)}`).toBe(true);
    }
  });
});

describe('the course of a stream', () => {
  const bounds = { minX: 0, minY: 0, maxX: 240, maxY: 144 };
  const lane = { minX: 0, minY: 64, maxX: 240, maxY: 80 };
  const never = (): boolean => false;

  it('wanders off its lane, a tile at a time, and stays a tile clear of the walls it runs along', () => {
    let wandered = 0;
    for (let seed = 0; seed < 60; seed++) {
      const { rects } = meanderStream(lane, bounds, seed * 7919, never);
      expect(rects).toHaveLength(15);
      let previous = lane.minY;
      for (const rect of rects) {
        expect(rect.minY, `seed ${String(seed)}`).toBeGreaterThanOrEqual(ROOM_TILE_UNITS);
        expect(rect.maxY, `seed ${String(seed)}`).toBeLessThanOrEqual(144 - ROOM_TILE_UNITS);
        const width = (rect.maxY - rect.minY) / ROOM_TILE_UNITS;
        expect(width === 1 || width === 2, `seed ${String(seed)}: width`).toBe(true);
        // Each slice shares an edge with the last, so the water is one piece.
        expect(Math.abs(rect.minY - previous)).toBeLessThanOrEqual(ROOM_TILE_UNITS);
        expect(Math.abs(rect.minY - lane.minY)).toBeLessThanOrEqual(
          STREAM_REACH_TILES * ROOM_TILE_UNITS,
        );
        previous = rect.minY;
      }
      if (rects.some((rect) => rect.minY !== lane.minY)) {
        wandered += 1;
      }
    }
    // A straight stream is what this replaced.
    expect(wandered).toBeGreaterThan(50);
  });

  it('starts and ends on its lane, so it meets a wall or its next piece where the lane does', () => {
    for (let seed = 0; seed < 60; seed++) {
      const { rects, course } = meanderStream(lane, bounds, seed * 104729, never);
      expect(rects[0]).toEqual({ minX: 0, minY: 64, maxX: 16, maxY: 80 });
      expect(rects.at(-1)).toEqual({ minX: 224, minY: 64, maxX: 240, maxY: 80 });
      expect(course.points[0]).toEqual({ x: 0, y: 72, halfWidth: 8 });
      expect(course.points.at(-1)).toEqual({ x: 240, y: 72, halfWidth: 8 });
    }
  });

  it('is the same course for the same seed, and runs down a lane that runs down', () => {
    expect(meanderStream(lane, bounds, 5, never)).toEqual(meanderStream(lane, bounds, 5, never));
    const down = meanderStream({ minX: 96, minY: 0, maxX: 128, maxY: 144 }, bounds, 5, never);
    expect(down.course.points[0]?.y).toBe(0);
    expect(down.course.points.at(-1)?.y).toBe(144);
    expect(down.rects).toHaveLength(9);
    expect(down.rects[0]?.minY).toBe(0);
    expect(down.rects.at(-1)?.maxY).toBe(144);
  });

  it('steps back to its lane rather than run under cover', () => {
    // Everything off the lane is blocked: the course has nowhere to go but the lane.
    const offLane = (rect: { minY: number; maxY: number }): boolean =>
      rect.minY < lane.minY || rect.maxY > lane.maxY;
    for (let seed = 0; seed < 30; seed++) {
      for (const rect of meanderStream(lane, bounds, seed, offLane).rects) {
        expect(rect.minY).toBe(lane.minY);
        expect(rect.maxY).toBe(lane.maxY);
      }
    }
  });
});

describe('a stream authored as a bend', () => {
  const bounds = { minX: 0, minY: 0, maxX: 240, maxY: 144 };
  const origin = { x: 0, y: 0 };
  // wald-grove's stream: in from the west, a turn south, out to the east.
  const lanes = [
    { minX: 0, minY: 64, maxX: 128, maxY: 80 },
    { minX: 112, minY: 64, maxX: 128, maxY: 128 },
    { minX: 112, minY: 112, maxX: 240, maxY: 128 },
  ];
  const never = (): boolean => false;

  it('is one course from wall to wall, whatever order its lanes come in', () => {
    for (const order of [lanes, [lanes[2], lanes[0], lanes[1]]]) {
      const bend = bendStream(order as typeof lanes, bounds, origin, 9, never);
      expect(bend).not.toBeNull();
      const points = bend?.course.points ?? [];
      const ends = [points[0], points.at(-1)].map(
        (point) => `${String(point?.x)},${String(point?.y)}`,
      );
      expect(ends.sort()).toEqual(['0,72', '240,120']);
    }
  });

  it('rounds the corners: no two steps of the course turn a right angle between them', () => {
    const points = bendStream(lanes, bounds, origin, 9, never)?.course.points ?? [];
    expect(points.length).toBeGreaterThan(20);
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1];
      const b = points[i];
      const c = points[i + 1];
      if (a === undefined || b === undefined || c === undefined) {
        continue;
      }
      const turn = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
      expect(Math.min(turn, Math.PI * 2 - turn), `step ${String(i)}`).toBeLessThan(Math.PI / 3);
    }
  });

  it('gives footing on whole tiles, in one connected piece, within the stream storage', () => {
    const rects = bendStream(lanes, bounds, origin, 9, never)?.rects ?? [];
    expect(rects.length).toBeGreaterThan(0);
    expect(rects.length).toBeLessThanOrEqual(MAX_ROOM_STREAMS);
    for (const rect of rects) {
      for (const value of [rect.minX, rect.minY, rect.maxX, rect.maxY]) {
        expect(value % ROOM_TILE_UNITS).toBe(0);
      }
    }
    // Flood from the first rect across shared edges; every rect is reached.
    const reached = new Set([0]);
    const queue = [0];
    while (queue.length > 0) {
      const from = rects[queue.pop() ?? 0];
      rects.forEach((rect, index) => {
        if (
          from !== undefined &&
          !reached.has(index) &&
          rect.minX <= from.maxX &&
          rect.maxX >= from.minX &&
          rect.minY <= from.maxY &&
          rect.maxY >= from.minY
        ) {
          reached.add(index);
          queue.push(index);
        }
      });
    }
    expect(reached.size).toBe(rects.length);
  });

  it('is not attempted for lanes that do not make one chain', () => {
    expect(bendStream([lanes[0], lanes[2]] as typeof lanes, bounds, origin, 9, never)).toBeNull();
  });

  it('compiles wald-grove into one stream, clear of its cover', () => {
    const grove = ROOM_TEMPLATES.find((room) => (room as { id?: string }).id === 'wald-grove');
    expect(grove).toBeDefined();
    const room = compileRoomTemplate(grove, 3, 'wald-grove', ENEMY_DEFINITIONS).geometry;
    expect(room.streamCourses).toHaveLength(1);
    expect(room.isInStream(room.minX + 1, room.minY + 72)).toBe(true);
    expect(room.isInStream(room.maxX - 1, room.minY + 120)).toBe(true);
    for (let i = 0; i < room.streamCount; i++) {
      for (let block = 0; block < room.blockCount; block++) {
        const s = i * BLOCK_STRIDE;
        const b = block * BLOCK_STRIDE;
        const overlaps =
          (room.blocks[b] ?? 0) < (room.streams[s + 2] ?? 0) &&
          (room.blocks[b + 2] ?? 0) > (room.streams[s] ?? 0) &&
          (room.blocks[b + 1] ?? 0) < (room.streams[s + 3] ?? 0) &&
          (room.blocks[b + 3] ?? 0) > (room.streams[s + 1] ?? 0);
        expect(overlaps, 'cover in the stream').toBe(false);
      }
    }
  });
});

describe('footing in the stream', () => {
  /** How far the player slides on after letting go at a run. */
  const slide = (room: RoomGeometry, flier = false): number => {
    const sim = emptySim(room, flier);
    walked(sim, 40);
    const from = sim.positionX(sim.playerIndex);
    for (let tick = 0; tick < 60; tick++) {
      sim.step(IDLE);
    }
    return sim.positionX(sim.playerIndex) - from;
  };
  /** A room that is all puddle, to hold the stream against. */
  const puddledRoom = (): RoomGeometry => {
    const room = openRoom();
    room.addPuddle(0, 0, 640, 360);
    return room;
  };

  it('is slick: the player slides further than on dry ground, and no slower at a run', () => {
    expect(slide(floodedRoom())).toBeGreaterThan(slide(openRoom()) * 1.5);
    // #403's speed cap is gone — top speed in the water is top speed.
    const dry = emptySim(openRoom());
    const wet = emptySim(floodedRoom());
    walked(dry, 120);
    walked(wet, 120);
    const step = (sim: GameSim): number => {
      const before = sim.positionX(sim.playerIndex);
      sim.step(held(1, 0));
      return sim.positionX(sim.playerIndex) - before;
    };
    expect(step(wet)).toBeCloseTo(step(dry), 3);
  });

  it('is exactly the footing of a puddle', () => {
    expect(slide(floodedRoom())).toBeCloseTo(slide(puddledRoom()), 5);
    const inStream = emptySim(floodedRoom());
    const inPuddle = emptySim(puddledRoom());
    expect(walked(inStream, 30)).toBeCloseTo(walked(inPuddle, 30), 5);
  });

  it('leaves the player alone on dry ground next to the stream', () => {
    const dry = emptySim(openRoom());
    const banked = openRoom();
    // A stream nowhere near the walk.
    banked.addStream(0, 340, 640, 360);
    const beside = emptySim(banked);
    expect(walked(beside, 60)).toBeCloseTo(walked(dry, 60), 5);
  });

  it('does not touch a flying character', () => {
    expect(slide(floodedRoom(), true)).toBeCloseTo(slide(openRoom(), true), 5);
  });

  it('does not slow an enemy: water is footing for the player, not for them', () => {
    const travel = (room: RoomGeometry): number => {
      const sim = emptySim(room);
      const index = entityIndex(sim.spawnEnemyKind(sim.enemies.indexOf('kellerassel'), 100, 180));
      sim.world.flush();
      const player = sim.playerIndex * 4;
      // Far to the right, so the walk is a long straight line.
      sim.transform.data[player] = 560;
      sim.transform.data[player + 2] = 560;
      sim.transform.data[player + 1] = 180;
      sim.transform.data[player + 3] = 180;
      const startX = sim.positionX(index);
      for (let tick = 0; tick < 40; tick++) {
        sim.step(IDLE);
      }
      return sim.positionX(index) - startX;
    };
    const dry = travel(openRoom());
    expect(dry).toBeGreaterThan(0);
    expect(travel(floodedRoom())).toBeCloseTo(dry, 5);
  });

  it('lets every shot fly over the stream unaffected', () => {
    const shotPositions = (room: RoomGeometry): number[] => {
      const sim = emptySim(room);
      const frame = createInputFrame();
      frame.aimX = quantiseAxis(1);
      setActionDown(frame, InputAction.Fire, true);
      for (let tick = 0; tick < 30; tick++) {
        sim.step(frame);
      }
      const xs: number[] = [];
      sim.projectiles.forEachLive((slot) => {
        xs.push(sim.projectiles.x[slot] ?? 0, sim.projectiles.y[slot] ?? 0);
      });
      return xs;
    };
    const dry = shotPositions(openRoom());
    expect(dry.length).toBeGreaterThan(0);
    expect(shotPositions(floodedRoom())).toEqual(dry);
  });
});

describe('authored and generated Waldbach rooms', () => {
  it('at least three authored wald rooms carry a Waldbach', () => {
    const withStream = ROOM_TEMPLATES.map((room, index) =>
      validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
    ).filter((template) => {
      if (!template.metadata.floorTags.includes('wald')) {
        return false;
      }
      const layouts = 'cells' in template ? template.cells : [template];
      return layouts.some((layout) => layout.hazards.some((hazard) => hazard.type === 'waldbach'));
    });
    expect(withStream.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * True when the point is outside the walkable room — beyond its bounds, or
   * inside a void cell a shaped room never claimed. Either is a room edge.
   */
  function beyondEdge(room: RoomGeometry, x: number, y: number): boolean {
    if (x < room.minX || x > room.maxX || y < room.minY || y > room.maxY) {
      return true;
    }
    return room.voidRects.some(
      (rect) => x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY,
    );
  }

  /** Every stream rect in `room`, as objects. */
  function streamRects(
    room: RoomGeometry,
  ): { minX: number; minY: number; maxX: number; maxY: number }[] {
    const rects = [];
    for (let i = 0; i < room.streamCount; i++) {
      const base = i * BLOCK_STRIDE;
      rects.push({
        minX: room.streams[base] ?? 0,
        minY: room.streams[base + 1] ?? 0,
        maxX: room.streams[base + 2] ?? 0,
        maxY: room.streams[base + 3] ?? 0,
      });
    }
    return rects;
  }

  /** The band's union touches two opposite room edges, and nothing solid is left standing in it. */
  function expectEdgeToEdge(room: RoomGeometry, label: string): void {
    const rects = streamRects(room);
    const minX = Math.min(...rects.map((rect) => rect.minX));
    const maxX = Math.max(...rects.map((rect) => rect.maxX));
    const minY = Math.min(...rects.map((rect) => rect.minY));
    const maxY = Math.max(...rects.map((rect) => rect.maxY));
    const horizontal = maxX - minX > maxY - minY;
    const midY = (minY + maxY) / 2;
    const midX = (minX + maxX) / 2;
    if (horizontal) {
      expect(beyondEdge(room, minX - 1, midY), `${label}: west end`).toBe(true);
      expect(beyondEdge(room, maxX + 1, midY), `${label}: east end`).toBe(true);
    } else {
      expect(beyondEdge(room, midX, minY - 1), `${label}: north end`).toBe(true);
      expect(beyondEdge(room, midX, maxY + 1), `${label}: south end`).toBe(true);
    }
  }

  it('generated 1x1 wald rooms roll a stream that crosses the room edge to edge', () => {
    let rolled = 0;
    for (let seed = 0; seed < 240; seed++) {
      const doors: DoorDirection[] = ['north', 'east', 'south', 'west'];
      const template = generateRoom(
        {
          roomId: `s${String(seed)}`,
          floor: 3,
          floorTag: 'wald',
          doors,
          distanceFromStart: 2,
          bossDistance: 5,
          rng: new Rng(roomGenSeed(31, 3, `s${String(seed)}`, seed)),
        },
        WALD,
      );
      const compiled = compileRoomTemplate(
        validateRoomTemplate(template, `s${String(seed)}`, ENEMY_DEFINITIONS),
        3,
        `s${String(seed)}`,
        ENEMY_DEFINITIONS,
        {
          cells: [{ col: 0, row: 0 }],
          doors: doors.map((direction) => ({ cellIndex: 0, direction })),
        },
      );
      if (compiled.geometry.streamCount === 0) {
        continue;
      }
      rolled += 1;
      expectEdgeToEdge(compiled.geometry, `seed ${String(seed)}`);
      // No cover block left standing in the water.
      for (const rect of streamRects(compiled.geometry)) {
        for (let block = 0; block < compiled.geometry.blockCount; block++) {
          const base = block * BLOCK_STRIDE;
          const blocks = compiled.geometry.blocks;
          const overlaps =
            (blocks[base] ?? 0) < rect.maxX &&
            (blocks[base + 2] ?? 0) > rect.minX &&
            (blocks[base + 1] ?? 0) < rect.maxY &&
            (blocks[base + 3] ?? 0) > rect.minY;
          expect(overlaps, `seed ${String(seed)}: cover in the stream`).toBe(false);
        }
      }
      // Props stay on the banks.
      for (const prop of compiled.decorativeProps) {
        expect(compiled.geometry.isInStream(prop.x, prop.y), `seed ${String(seed)}: prop`).toBe(
          false,
        );
      }
    }
    // streamChance 0.15 over 240 rooms — a handful at the very least, and never most.
    expect(rolled).toBeGreaterThan(10);
    expect(rolled).toBeLessThan(80);
  });

  it('generated multi-cell wald rooms run the stream across every cell it crosses', () => {
    const shapes: {
      shape: Exclude<RoomShape, '1x1'>;
      cells: { col: number; row: number }[];
      doors: { cellIndex: number; direction: DoorDirection }[];
    }[] = [
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
        ],
      },
      {
        shape: 'L',
        cells: [
          { col: 0, row: 0 },
          { col: 0, row: 1 },
          { col: 1, row: 1 },
        ],
        doors: [
          { cellIndex: 0, direction: 'north' },
          { cellIndex: 2, direction: 'east' },
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
          { cellIndex: 4, direction: 'south' },
        ],
      },
    ];
    let rolled = 0;
    for (const { shape, cells, doors } of shapes) {
      for (let seed = 0; seed < 80; seed++) {
        const id = `${shape}-${String(seed)}`;
        const template = generateMultiCellRoom(
          {
            roomId: id,
            floor: 3,
            floorTag: 'wald',
            shape,
            cells,
            doors,
            distanceFromStart: 3,
            bossDistance: 6,
            rng: new Rng(roomGenSeed(52, 3, id, seed)),
          },
          WALD,
        );
        const compiled = compileRoomTemplate(
          validateRoomTemplate(template, id, ENEMY_DEFINITIONS),
          3,
          id,
          ENEMY_DEFINITIONS,
          { cells, doors },
        );
        if (compiled.geometry.streamCount === 0) {
          continue;
        }
        rolled += 1;
        expectEdgeToEdge(compiled.geometry, id);
      }
    }
    expect(rolled).toBeGreaterThan(5);
  });

  it('places no prop in the water on Floor 3, and leaves Floors 1 and 2 as they were', () => {
    const room = (floorTag: string): Record<string, unknown> => ({
      id: 'synthetic-wet-props',
      tileGrid: Array.from({ length: 9 }, () => '...............'),
      obstacles: [],
      enemySpawns: [],
      spawnGroups: [],
      pickupSpawns: [],
      hazards: [{ x: 32, y: 32, width: 32, height: 32, type: 'puddle' }],
      decorativeProps: [
        { x: 48, y: 48, type: 'fern' },
        { x: 200, y: 120, type: 'fern' },
      ],
      metadata: {
        floorTags: [floorTag],
        shape: '1x1',
        doors: { north: false, east: false, south: false, west: false },
        difficultyTier: 1,
        weight: 1,
      },
    });
    const wald = compileRoomTemplate(room('wald'), 3, 'wet-props');
    expect(wald.decorativeProps).toHaveLength(1);
    expect(wald.decorativeProps[0]?.x).toBe(wald.geometry.minX + 200);
    expect(compileRoomTemplate(room('cellar'), 1, 'wet-props').decorativeProps).toHaveLength(2);

    // Every authored wald room, compiled: nothing left in a stream or a puddle.
    for (const template of ROOM_TEMPLATES) {
      const { metadata } = validateRoomTemplate(template, 'room', ENEMY_DEFINITIONS);
      if (!metadata.floorTags.includes('wald') || metadata.shape !== '1x1') {
        continue;
      }
      const compiled = compileRoomTemplate(template, 3, 'room', ENEMY_DEFINITIONS);
      for (const prop of compiled.decorativeProps) {
        expect(compiled.geometry.isInStream(prop.x, prop.y)).toBe(false);
        expect(compiled.geometry.isOnPuddle(prop.x, prop.y)).toBe(false);
      }
    }
  });

  it('never generates a stream on another floor', () => {
    for (const floorTag of ['cellar', 'rural']) {
      for (let seed = 0; seed < 40; seed++) {
        const template = generateRoom({
          roomId: `x${String(seed)}`,
          floor: 1,
          floorTag,
          doors: ['north', 'south'],
          distanceFromStart: 2,
          bossDistance: 5,
          rng: new Rng(seed),
        });
        expect(template.hazards.some((hazard) => hazard.type === 'waldbach')).toBe(false);
      }
    }
  });

  it('gives a wald room puddles or a stream, never both', () => {
    let puddled = 0;
    for (let seed = 0; seed < 240; seed++) {
      const template = generateRoom(
        {
          roomId: `p${String(seed)}`,
          floor: 3,
          floorTag: 'wald',
          doors: ['north', 'south'],
          distanceFromStart: 2,
          bossDistance: 5,
          rng: new Rng(roomGenSeed(77, 3, `p${String(seed)}`, seed)),
        },
        WALD,
      );
      const puddles = template.hazards.some((hazard) => hazard.type === 'puddle');
      const stream = template.hazards.some((hazard) => hazard.type === 'waldbach');
      expect(puddles && stream, `seed ${String(seed)}`).toBe(false);
      puddled += puddles ? 1 : 0;
    }
    // hazardChance 0.2 of the rooms that rolled no stream.
    expect(puddled).toBeGreaterThan(15);
    expect(puddled).toBeLessThan(90);
  });
});
