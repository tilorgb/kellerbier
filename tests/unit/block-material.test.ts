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
