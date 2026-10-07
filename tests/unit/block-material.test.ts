import { describe, expect, it } from 'vitest';
import {
  BLOCK_MATERIAL_STONE,
  BLOCK_MATERIAL_WOOD,
  RoomGeometry,
} from '../../src/sim/room/geometry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';

/**
 * Block material (#402): floor 3's wooden cover. `blockMaterial` rides
 * alongside `blockOverflyable`, so every swap-with-last removal has to move
 * it too, and a block broken by anything — bomb, Boar, beetle — has to stay
 * broken on a revisit through the same destruction record.
 */

function wald(id: string, material: 'wood' | 'stone' | undefined): unknown {
  const row = (fill: string): string => `#${fill.repeat(13)}#`;
  return {
    id,
    tileGrid: ['#'.repeat(15), ...Array.from({ length: 7 }, () => row('.')), '#'.repeat(15)],
    obstacles: [
      { x: 32, y: 32, width: 16, height: 16, ...(material === undefined ? {} : { material }) },
      { x: 160, y: 80, width: 16, height: 16 },
    ],
    enemySpawns: [],
    spawnGroups: [],
    pickupSpawns: [],
    hazards: [],
    decorativeProps: [],
    metadata: {
      floorTags: ['wald'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
    },
  };
}

describe('RoomGeometry.blockMaterial', () => {
  it('defaults to stone and keeps each block’s material through a swap-with-last removal', () => {
    const room = new RoomGeometry(0, 0, 240, 144);
    room.addBlock(0, 0, 16, 16, true, BLOCK_MATERIAL_WOOD);
    room.addBlock(32, 0, 48, 16, true);
    room.addBlock(64, 0, 80, 16, true, BLOCK_MATERIAL_WOOD);
    expect(room.blockMaterial[1]).toBe(BLOCK_MATERIAL_STONE);

    // Breaking the first block swaps the last (wood) into slot 0.
    const centre: number[] = [];
    expect(room.breakBlockAt(8, 8, centre)).toBe(true);
    expect(centre).toEqual([8, 8]);
    expect(room.blockCount).toBe(2);
    expect(room.isWoodAt(72, 8)).toBe(true);
    expect(room.isWoodAt(40, 8)).toBe(false);
    expect(room.blockMaterial[0]).toBe(BLOCK_MATERIAL_WOOD);
    expect(room.blockMaterial[1]).toBe(BLOCK_MATERIAL_STONE);
  });

  it('never breaks a non-destructible block', () => {
    const room = new RoomGeometry(0, 0, 240, 144);
    room.addBlock(0, 0, 16, 16);
    expect(room.breakBlockAt(8, 8, [])).toBe(false);
    expect(room.blockCount).toBe(1);
  });
});

/** Room-space centre of authored obstacle `index` — obstacles are offset by the room margin at compile time. */
function centreOf(sim: GameSim, index: number): { x: number; y: number } {
  const base = index * 4;
  const b = sim.room.blocks;
  return {
    x: ((b[base] ?? 0) + (b[base + 2] ?? 0)) / 2,
    y: ((b[base + 1] ?? 0) + (b[base + 3] ?? 0)) / 2,
  };
}

describe('authored obstacle material', () => {
  it('compiles wood obstacles as wood and leaves the default stone', () => {
    const sim = new GameSim({ roomTemplate: wald('w', 'wood'), floor: 3, population: 'empty' });
    const wood = centreOf(sim, 0);
    const stone = centreOf(sim, 1);
    expect(sim.room.isWoodAt(wood.x, wood.y)).toBe(true);
    expect(sim.room.isWoodAt(stone.x, stone.y)).toBe(false);
  });

  it('rejects an unknown material loudly', () => {
    expect(() => validateRoomTemplate(wald('w', 'glass' as 'wood'), 'room')).toThrow(/material/u);
  });
});

describe('a destroyed wooden block persists across a room revisit', () => {
  it('stays gone when the room is loaded again', () => {
    const template = wald('revisit-wald', 'wood');
    const sim = new GameSim({ roomTemplate: template, floor: 3, population: 'empty' });
    const wood = centreOf(sim, 0);
    expect(sim.breakBlockAt(wood.x, wood.y, true)).toBe(true);
    expect(sim.room.isWoodAt(wood.x, wood.y)).toBe(false);

    sim.loadRoom(wald('elsewhere', undefined), 3);
    sim.loadRoom(template, 3);

    expect(sim.room.blockCount).toBe(1);
    expect(sim.room.isWoodAt(wood.x, wood.y)).toBe(false);
  });

  it('woodOnly refuses a stone block', () => {
    const sim = new GameSim({ roomTemplate: wald('w', 'wood'), floor: 3, population: 'empty' });
    const stone = centreOf(sim, 1);
    expect(sim.breakBlockAt(stone.x, stone.y, true)).toBe(false);
    expect(sim.breakBlockAt(stone.x, stone.y)).toBe(true);
  });
});

describe('Breaking one cell of a merged block (the Boar)', () => {
  /** The blocks of a geometry as sorted `minX,minY,maxX,maxY:material` strings. */
  function blocksOf(room: RoomGeometry): string[] {
    const out: string[] = [];
    for (let i = 0; i < room.blockCount; i++) {
      const b = Array.from(room.blocks.subarray(i * 4, i * 4 + 4));
      out.push(`${b.join(',')}:${String(room.blockMaterial[i])}`);
    }
    return out.sort();
  }

  it('takes the one cell out of a 3×3 rect and keeps the other eight as cover, same material', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(64, 32, 112, 80, true, BLOCK_MATERIAL_WOOD);
    const out: number[] = [];
    expect(room.breakCellAt(90, 50, 16, out)).toBe(true);
    expect(out).toEqual([88, 56, 16]);
    expect(room.isClear(88, 56, 2)).toBe(true);
    const kept: readonly (readonly [number, number])[] = [
      [72, 40],
      [88, 40],
      [104, 40],
      [72, 56],
      [104, 56],
      [72, 72],
      [88, 72],
      [104, 72],
    ];
    for (const [x, y] of kept) {
      expect(room.isClear(x, y, 1)).toBe(false);
      expect(room.isWoodAt(x, y)).toBe(true);
    }
  });

  it('cuts the hit tile out on the block’s own tiles, not a grid offset from them', () => {
    // A room whose floor starts at x = 40 (not a multiple of 16): its cover
    // tiles run 40-56, 56-72, 72-88. Cutting on the room-wide 16-grid instead
    // cut 48-64 and left two 8-unit slivers — each drawn as a whole trunk,
    // so one hit doubled the tree.
    const room = new RoomGeometry(40, 18, 280, 162);
    room.addBlock(40, 34, 88, 50, true, BLOCK_MATERIAL_WOOD);
    const out: number[] = [];
    expect(room.breakCellAt(60, 42, 16, out)).toBe(true);
    expect(out).toEqual([64, 42, 16]);
    expect(blocksOf(room)).toEqual([
      `40,34,56,50:${String(BLOCK_MATERIAL_WOOD)}`,
      `72,34,88,50:${String(BLOCK_MATERIAL_WOOD)}`,
    ]);
    // Every block left over is whole tiles: nothing for the renderer to draw a sliver of.
    for (let i = 0; i < room.blockCount; i++) {
      const [minX = 0, minY = 0, maxX = 0, maxY = 0] = Array.from(
        room.blocks.subarray(i * 4, i * 4 + 4),
      );
      expect((maxX - minX) % 16).toBe(0);
      expect((maxY - minY) % 16).toBe(0);
    }
  });

  it('removes exactly one whole tile and leaves only whole tiles — every origin, size and hit point', () => {
    const T = 16;
    /** Which tiles of the grid anchored at (ox, oy) are covered, as "col,row". */
    const tilesOf = (room: RoomGeometry, ox: number, oy: number): Set<string> => {
      const tiles = new Set<string>();
      for (let i = 0; i < room.blockCount; i++) {
        const [minX = 0, minY = 0, maxX = 0, maxY = 0] = Array.from(
          room.blocks.subarray(i * 4, i * 4 + 4),
        );
        expect((minX - ox) % T).toBe(0);
        expect((minY - oy) % T).toBe(0);
        expect((maxX - minX) % T).toBe(0);
        expect((maxY - minY) % T).toBe(0);
        for (let y = minY; y < maxY; y += T) {
          for (let x = minX; x < maxX; x += T) {
            tiles.add(`${String((x - ox) / T)},${String((y - oy) / T)}`);
          }
        }
      }
      return tiles;
    };
    for (const ox of [0, 8, 40, 5]) {
      for (const oy of [0, 18, 3]) {
        for (const [w, h] of [
          [1, 1],
          [3, 1],
          [1, 3],
          [3, 3],
          [4, 2],
        ] as const) {
          for (let hx = 0; hx < w * T; hx += 3) {
            for (let hy = 0; hy < h * T; hy += 5) {
              const room = new RoomGeometry(0, 0, 400, 300);
              room.addBlock(ox + T, oy + T, ox + T + w * T, oy + T + h * T, true);
              const before = tilesOf(room, ox, oy);
              room.breakCellAt(ox + T + hx + 0.5, oy + T + hy + 0.5, T, []);
              const after = tilesOf(room, ox, oy);
              const where = `origin ${String(ox)},${String(oy)} ${String(w)}x${String(h)} hit ${String(hx)},${String(hy)}`;
              expect(after.size, where).toBe(before.size - 1);
              const hit = `${String(1 + Math.floor(hx / T))},${String(1 + Math.floor(hy / T))}`;
              expect(after.has(hit), where).toBe(false);
              for (const tile of after) {
                expect(before.has(tile), where).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('replays to the exact same blocks on a fresh geometry (a room revisit)', () => {
    const build = (): RoomGeometry => {
      const room = new RoomGeometry(0, 0, 320, 180);
      room.addBlock(64, 32, 112, 80, true, BLOCK_MATERIAL_WOOD);
      room.addBlock(160, 32, 176, 96, true, BLOCK_MATERIAL_STONE);
      return room;
    };
    const live = build();
    const record: number[] = [];
    live.breakCellAt(90, 50, 16, record);
    live.breakCellAt(70, 75, 16, record);
    live.breakCellAt(170, 90, 16, record);
    const replayed = build();
    for (let i = 0; i + 2 < record.length; i += 3) {
      replayed.clearBoulderAt(record[i] ?? 0, record[i + 1] ?? 0, record[i + 2] ?? 0);
    }
    expect(blocksOf(replayed)).toEqual(blocksOf(live));
  });

  it('a GameSim smash is recorded so a revisit rebuilds the same cover', () => {
    const sim = new GameSim({ seed: 1, room: new RoomGeometry(0, 0, 320, 180) });
    sim.room.addBlock(64, 32, 112, 80, true, BLOCK_MATERIAL_WOOD);
    expect(sim.smashBlockCellAt(90, 50)).toBe(true);
    const fresh = new RoomGeometry(0, 0, 320, 180);
    fresh.addBlock(64, 32, 112, 80, true, BLOCK_MATERIAL_WOOD);
    sim.reapplyDestroyedBoulders(sim.roomId, fresh);
    expect(blocksOf(fresh)).toEqual(blocksOf(sim.room));
  });
});
