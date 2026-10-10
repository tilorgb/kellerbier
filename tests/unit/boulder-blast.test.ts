import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

/**
 * #4: a Bierfassl blast clears destructible boulders (`blockOverflyable === 1`)
 * out of its cross — opening a path through cover — and the clearing persists
 * for the run, so the path is still open when the player comes back.
 */

const idle = () => createInputFrame();

function emptySim(room: RoomGeometry): GameSim {
  const sim = new GameSim({ room });
  const player = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (i) => {
    if (i !== player) doomed.push(i);
  });
  for (const i of doomed) sim.world.destroy(sim.world.entityAt(i));
  sim.world.flush();
  return sim;
}

/** Centre of the first destructible boulder in `room`, or null. */
function boulderCentre(room: RoomGeometry): { x: number; y: number } | null {
  for (let b = 0; b < room.blockCount; b++) {
    if ((room.blockOverflyable[b] ?? 0) !== 1) continue;
    return {
      x: ((room.blocks[b * 4] ?? 0) + (room.blocks[b * 4 + 2] ?? 0)) / 2,
      y: ((room.blocks[b * 4 + 1] ?? 0) + (room.blocks[b * 4 + 3] ?? 0)) / 2,
    };
  }
  return null;
}

function detonateAt(sim: GameSim, x: number, y: number): void {
  sim.spawnBierfassl(x, y, 0, 0, false);
  sim.world.flush();
  const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
  for (let tick = 0; tick <= fuseTicks + 1; tick++) sim.step(idle());
}

describe('a Bierfassl blast clears boulders (#4)', () => {
  it('removes a destructible boulder its cross covers, and leaves structural walls alone', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(120, 84, 136, 100, true); // a one-tile boulder
    room.addBlock(0, 0, 16, 180, false); // a structural wall strip
    const sim = emptySim(room);
    expect(sim.room.blockCount).toBe(2);

    detonateAt(sim, 128, 92);

    expect(sim.room.blockCount).toBe(1);
    // The boulder's old footprint is walkable now…
    expect(sim.room.isClear(128, 92, 4)).toBe(true);
    // …and the wall it did not reach is still solid.
    expect(sim.room.isClear(8, 90, 4)).toBe(false);
  });

  it('does not touch a boulder outside the blast cross', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(120, 84, 136, 100, true); // in the blast
    room.addBlock(260, 20, 276, 36, true); // far corner, untouched
    const sim = emptySim(room);

    detonateAt(sim, 128, 92);

    expect(sim.room.blockCount).toBe(1);
    expect(sim.room.isClear(268, 28, 4)).toBe(false);
  });

  it('breaks the cells of a long merged run next to the bomb, not nothing', () => {
    // Generated cover is merged into rectangles (`sliceObstacles`): this is a
    // 6×3 wall of stones whose centre lies far outside the blast cross. A bomb
    // laid against its left edge used to leave it whole.
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(112, 48, 208, 96, true);
    const sim = emptySim(room);

    detonateAt(sim, 100, 72);

    // The cells the horizontal arm reaches are gone…
    expect(sim.room.isClear(120, 72, 2)).toBe(true);
    // …and the far end of the run is still standing.
    expect(sim.room.isClear(200, 72, 2)).toBe(false);
  });

  it('breaks exactly the tiles its snapped cross touches, however off-grid the bomb sits', () => {
    // A 5×5 field of one-tile boulders on the room's tile grid. The bomb is
    // set down at a raw position straddling four tiles; the blast is the one
    // tile-wide cross over the tile the bomb's centre is in — nothing else.
    const room = new RoomGeometry(0, 0, 320, 180);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        room.addBlock(64 + col * 16, 32 + row * 16, 80 + col * 16, 48 + row * 16, true);
      }
    }
    const sim = emptySim(room);

    // Tile (col 2, row 2) spans x 96–112, y 64–80; the bomb sits near its
    // bottom-right corner, 14 units into the tile on both axes.
    detonateAt(sim, 110, 78);

    const standing = (col: number, row: number): boolean =>
      !sim.room.isClear(72 + col * 16, 40 + row * 16, 2);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        // The cross is row 2 and column 2 (arms reach past the field).
        expect(standing(col, row), `tile ${String(col)},${String(row)}`).toBe(
          col !== 2 && row !== 2,
        );
      }
    }
  });

  it('replays a partly broken run exactly on a revisit', () => {
    const sim = new GameSim({ roomTemplate: cellarCrossroads, floor: 1, population: 'empty' });
    const centre = boulderCentre(sim.room);
    expect(centre).not.toBeNull();
    detonateAt(sim, centre?.x ?? 0, centre?.y ?? 0);
    const blocks = Array.from(sim.room.blocks.slice(0, sim.room.blockCount * 4)).sort();

    sim.loadRoom(cellarCrossroads, 1);
    expect(Array.from(sim.room.blocks.slice(0, sim.room.blockCount * 4)).sort()).toEqual(blocks);
  });

  it('keeps the boulder cleared when the room is loaded again this run', () => {
    const sim = new GameSim({ roomTemplate: cellarCrossroads, floor: 1, population: 'empty' });
    const player = sim.playerIndex;
    const doomed: number[] = [];
    sim.world.forEach(sim.collidableMask, (i) => {
      if (i !== player) doomed.push(i);
    });
    for (const i of doomed) sim.world.destroy(sim.world.entityAt(i));
    sim.world.flush();

    const centre = boulderCentre(sim.room);
    expect(centre).not.toBeNull();
    const cx = centre?.x ?? 0;
    const cy = centre?.y ?? 0;
    expect(sim.room.isClear(cx, cy, 2)).toBe(false);

    detonateAt(sim, cx, cy);
    expect(sim.room.isClear(cx, cy, 2)).toBe(true);
    const afterBlast = sim.room.blockCount;

    // Walk out and back — reload the same template.
    sim.loadRoom(cellarCrossroads, 1);
    expect(sim.room.blockCount).toBe(afterBlast);
    expect(sim.room.isClear(cx, cy, 2)).toBe(true);
  });
});
