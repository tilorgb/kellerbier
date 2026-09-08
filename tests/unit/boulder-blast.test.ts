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
    const before = sim.room.blockCount;

    detonateAt(sim, centre?.x ?? 0, centre?.y ?? 0);
    expect(sim.room.blockCount).toBeLessThan(before);
    const afterBlast = sim.room.blockCount;

    // Walk out and back — reload the same template.
    sim.loadRoom(cellarCrossroads, 1);
    expect(sim.room.blockCount).toBe(afterBlast);
    expect(boulderCentre(sim.room)).toBeNull();
  });
});
