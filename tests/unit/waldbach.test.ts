import { describe, expect, it } from 'vitest';
import { koenigLudwig } from '../../src/content/characters/koenig-ludwig.js';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import type { DoorDirection, RoomShape } from '../../src/content/rooms/definition.js';
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
import { DEFAULT_ENEMY_TUNING, DEFAULT_MOVEMENT_TUNING } from '../../src/sim/tuning.js';

/**
 * Floor 3's Waldbach (#403): a stream running edge to edge across a room.
 * Walkable but slow for anything on its feet, invisible to shots, and
 * queryable so the Bachforelle (#408) can find the water it lives in.
 */

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

  it('compiles a waldbach hazard into a stream, and nothing else into one', () => {
    const template = {
      id: 'synthetic-waldbach',
      tileGrid: Array.from({ length: 9 }, () => '...............'),
      obstacles: [],
      enemySpawns: [],
      spawnGroups: [],
      pickupSpawns: [],
      hazards: [
        { x: 0, y: 60, width: 240, height: 24, type: 'waldbach' },
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
    expect(room.streamCount).toBe(1);
    expect(room.puddleCount).toBe(1);
    // Kept in the hazards list too, for the editor and the render layer.
    expect(compiled.hazards.map((hazard) => hazard.type)).toContain('waldbach');
    const minX = room.streams[0] ?? 0;
    const maxX = room.streams[2] ?? 0;
    expect(minX).toBe(room.minX);
    expect(maxX).toBe(room.maxX);
    expect(room.isInStream((room.minX + room.maxX) / 2, room.minY + 72)).toBe(true);
    expect(room.isInStream((room.minX + room.maxX) / 2, room.minY + 30)).toBe(false);
  });
});

describe('wading', () => {
  it('slows the player to the tuned fraction of their top speed', () => {
    const dry = emptySim(openRoom());
    const wet = emptySim(floodedRoom());
    // Long enough that both are at their (different) top speeds for most of it.
    const dryDistance = walked(dry, 60);
    const wetDistance = walked(wet, 60);
    expect(wetDistance).toBeLessThan(dryDistance * 0.7);

    // At top speed, one tick of wading covers exactly the capped distance.
    const before = wet.positionX(wet.playerIndex);
    wet.step(held(1, 0));
    expect(wet.positionX(wet.playerIndex) - before).toBeCloseTo(
      DEFAULT_MOVEMENT_TUNING.maxSpeed * DEFAULT_MOVEMENT_TUNING.streamSpeedFactor,
      3,
    );
  });

  it('leaves the player at full speed on dry ground next to the stream', () => {
    const dry = emptySim(openRoom());
    const banked = openRoom();
    // A stream nowhere near the walk.
    banked.addStream(0, 340, 640, 360);
    const beside = emptySim(banked);
    expect(walked(beside, 60)).toBeCloseTo(walked(dry, 60), 5);
  });

  it('does not slow a flying character', () => {
    const dry = emptySim(openRoom(), true);
    const wet = emptySim(floodedRoom(), true);
    expect(walked(wet, 60)).toBeCloseTo(walked(dry, 60), 5);
  });

  it('slows a ground enemy by the enemy stream factor, and only while it wades', () => {
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
    const wet = travel(floodedRoom());
    expect(dry).toBeGreaterThan(0);
    expect(wet / dry).toBeCloseTo(DEFAULT_ENEMY_TUNING.streamSpeedFactor, 2);
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
    for (let seed = 0; seed < 120; seed++) {
      const doors: DoorDirection[] = ['north', 'east', 'south', 'west'];
      const template = generateRoom({
        roomId: `s${String(seed)}`,
        floor: 3,
        floorTag: 'wald',
        doors,
        distanceFromStart: 2,
        bossDistance: 5,
        rng: new Rng(roomGenSeed(31, 3, `s${String(seed)}`, seed)),
      });
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
    // hazardChance 0.2 over 120 rooms — a handful at the very least.
    expect(rolled).toBeGreaterThan(5);
    expect(rolled).toBeLessThan(120);
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
      for (let seed = 0; seed < 40; seed++) {
        const id = `${shape}-${String(seed)}`;
        const template = generateMultiCellRoom({
          roomId: id,
          floor: 3,
          floorTag: 'wald',
          shape,
          cells,
          doors,
          distanceFromStart: 3,
          bossDistance: 6,
          rng: new Rng(roomGenSeed(52, 3, id, seed)),
        });
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
});
